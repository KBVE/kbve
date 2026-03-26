use super::OWSService;
use crate::error::RowsError;
use crate::models::*;
use crate::mq::SpinUpMessage;
use crate::repo::{CharsRepo, InstanceRepo};
use uuid::Uuid;

/// Max time to wait for a server to become ready after Agones allocation
const SPINUP_TIMEOUT_SECS: u64 = 30;
/// How often to poll the DB for instance status during spinup
const SPINUP_POLL_INTERVAL_MS: u64 = 2000;

impl OWSService {
    pub async fn get_server_to_connect_to(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Resolve GETLASTZONENAME: look up the character's last zone from the DB
        let resolved_zone = if zone_name.is_empty() || zone_name == "GETLASTZONENAME" {
            let chars_repo = CharsRepo(&self.state.db);
            let character = chars_repo
                .get_by_name(customer_guid, char_name)
                .await?
                .ok_or_else(|| RowsError::NotFound(format!("Character not found: {char_name}")))?;
            character.map_name.unwrap_or_default()
        } else {
            zone_name.to_string()
        };

        if resolved_zone.is_empty() {
            return Err(RowsError::BadRequest(
                "ZoneName is empty. Make sure the character is assigned to a Zone!".into(),
            ));
        }

        let repo = InstanceRepo(&self.state.db);
        let result = repo
            .join_map_by_char_name(customer_guid, char_name, &resolved_zone)
            .await?;

        // If there's a ready instance, return it immediately
        if !result.need_to_startup_map
            && result.map_instance_id > 0
            && result.map_instance_status == 2
        {
            return Ok(result);
        }

        // No ready instance — need to spin up a server
        let lock_key = format!("{customer_guid}:{resolved_zone}");
        if !self.state.zone_spinup_locks.contains_key(&lock_key) {
            self.state.zone_spinup_locks.insert(lock_key.clone(), true);

            // Try Agones direct allocation first (fastest path)
            if let Some(ref agones) = self.state.agones {
                tracing::info!(zone = %resolved_zone, "Allocating GameServer via Agones");

                match agones.allocate(&resolved_zone, 0).await {
                    Ok(alloc) => {
                        tracing::info!(
                            gs = %alloc.game_server_name,
                            addr = %alloc.address,
                            port = alloc.port,
                            "GameServer allocated — creating mapinstance"
                        );

                        // Ensure world server exists for this allocation
                        // zoneserverguid column is UUID type
                        let launcher_uuid = Uuid::new_v4();
                        let world_server_id = match repo
                            .register_launcher(
                                customer_guid,
                                &launcher_uuid.to_string(),
                                &alloc.address,
                                10,
                                &alloc.address,
                                alloc.port,
                            )
                            .await
                        {
                            Ok(id) => {
                                tracing::info!(world_server_id = id, "World server registered");
                                id
                            }
                            Err(e) => {
                                tracing::error!(error = %e, "Failed to register world server");
                                0
                            }
                        };

                        if world_server_id > 0 {
                            if let Err(e) = repo
                                .spin_up_server_instance(
                                    customer_guid,
                                    world_server_id,
                                    0,
                                    &resolved_zone,
                                    alloc.port,
                                )
                                .await
                            {
                                tracing::error!(error = %e, "Failed to create mapinstance after allocation");
                            }
                        }

                        // Track the GameServer name for cleanup/deallocation
                        if let Ok(fresh) = repo
                            .join_map_by_char_name(customer_guid, char_name, &resolved_zone)
                            .await
                        {
                            if fresh.map_instance_id > 0 {
                                self.state
                                    .zone_servers
                                    .insert(fresh.map_instance_id, alloc.game_server_name);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!(error = %e, zone = %resolved_zone, "Agones allocation failed");
                        self.state.zone_spinup_locks.remove(&lock_key);
                    }
                }
            } else if let Some(ref mq) = self.state.mq {
                // Fallback: publish to RabbitMQ for async allocation
                tracing::info!(zone = %resolved_zone, "Agones unavailable, publishing spin-up via MQ");
                let msg = SpinUpMessage {
                    customer_guid: customer_guid.to_string(),
                    world_server_id: result.world_server_id,
                    zone_instance_id: result.map_instance_id,
                    map_name: result.map_name_to_start.clone(),
                    port: result.port,
                };
                if let Err(e) = mq.publish_spin_up(result.world_server_id, &msg).await {
                    tracing::error!(error = %e, "Failed to publish spin-up message");
                    self.state.zone_spinup_locks.remove(&lock_key);
                }
            } else {
                self.state.zone_spinup_locks.remove(&lock_key);
                tracing::error!("No Agones or MQ available for server allocation");
            }
        }

        // Poll DB until the instance is ready or timeout
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(SPINUP_TIMEOUT_SECS);

        while start.elapsed() < timeout {
            tokio::time::sleep(std::time::Duration::from_millis(SPINUP_POLL_INTERVAL_MS)).await;

            let poll_result = repo
                .join_map_by_char_name(customer_guid, char_name, &resolved_zone)
                .await?;

            if poll_result.map_instance_id > 0 && !poll_result.server_ip.is_empty() {
                tracing::info!(
                    ip = %poll_result.server_ip,
                    port = poll_result.port,
                    "Server ready for zone {resolved_zone}"
                );
                self.state.zone_spinup_locks.remove(&lock_key);
                return Ok(poll_result);
            }
        }

        // Timeout — return whatever we have
        self.state.zone_spinup_locks.remove(&lock_key);
        let final_result = repo
            .join_map_by_char_name(customer_guid, char_name, &resolved_zone)
            .await?;
        Ok(final_result)
    }

    pub async fn get_zone_instances(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.get_zone_instances(customer_guid, world_server_id)
            .await
    }

    pub async fn set_zone_status(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        status: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.set_zone_status(customer_guid, zone_instance_id, status)
            .await
    }

    pub async fn update_number_of_players(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        number_of_players: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.update_number_of_players(customer_guid, zone_instance_id, number_of_players)
            .await
    }

    pub async fn spin_up_server_instance(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        zone_instance_id: i32,
        zone_name: &str,
        port: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.spin_up_server_instance(
            customer_guid,
            world_server_id,
            zone_instance_id,
            zone_name,
            port,
        )
        .await
    }

    pub async fn shut_down_server_instance(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.shut_down_server_instance(customer_guid, zone_instance_id)
            .await
    }

    pub async fn shut_down_launcher(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.shut_down_launcher(customer_guid, world_server_id)
            .await
    }

    pub async fn get_zone_instances_for_zone(
        &self,
        customer_guid: Uuid,
        zone_name: &str,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.get_zone_instances_for_zone(customer_guid, zone_name)
            .await
    }

    pub async fn get_current_world_time(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<i64, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.get_current_world_time(customer_guid, world_server_id)
            .await
    }
}
