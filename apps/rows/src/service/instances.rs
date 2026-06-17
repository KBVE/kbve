use super::{AuthIdentity, OWSService};
use crate::agones::AllocationPipeline;
use crate::error::RowsError;
use crate::models::*;
use crate::repo::{CharsRepo, InstanceRepo};
use uuid::Uuid;

impl OWSService {
    #[tracing::instrument(skip(self, caller), fields(%customer_guid, char_name, zone_name))]
    pub async fn get_server_to_connect_to(
        &self,
        customer_guid: Uuid,
        caller: AuthIdentity,
        char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Fetch the character row at most once: the owner check (players only) and last-zone
        // resolution (`GETLASTZONENAME`/empty zone) both need it, so load it up front when either
        // path will and reuse the result instead of re-querying.
        let needs_last_zone = zone_name.is_empty() || zone_name == "GETLASTZONENAME";
        let is_player = matches!(caller, AuthIdentity::Player(_));
        let character = if is_player || needs_last_zone {
            CharsRepo(&self.state.db)
                .get_by_name(customer_guid, char_name)
                .await?
        } else {
            None
        };

        if let AuthIdentity::Player(caller_guid) = caller {
            self.verify_character_owner(caller_guid, char_name, character.as_ref())?;
        }

        let resolved_zone = self.resolve_zone(char_name, zone_name, character.as_ref())?;

        let pipeline = AllocationPipeline::new(customer_guid, &resolved_zone, &self.state.db);
        match pipeline.find_existing(char_name).await {
            Err(crate::agones::pipeline::FindResult::Found(result)) => return Ok(result),
            Err(crate::agones::pipeline::FindResult::Error(e)) => return Err(e),
            Ok(pipeline) => {
                self.allocate_and_track(pipeline, customer_guid, char_name, &resolved_zone)
                    .await
            }
        }
    }

    /// Handles the `GETLASTZONENAME` magic string by reading the character's last `map_name`.
    /// Enforces that the authenticated caller owns the character before a world IP is handed out.
    /// Backwards compatibility: a character with no owner (legacy `NULL` `userguid`) is allowed
    /// through with a warning; a missing character is left for the downstream zone lookup to report.
    /// Only a character owned by a different user is rejected.
    fn verify_character_owner(
        &self,
        caller_guid: Uuid,
        char_name: &str,
        character: Option<&Character>,
    ) -> Result<(), RowsError> {
        let Some(character) = character else {
            return Ok(());
        };

        match character.user_guid {
            Some(owner) if owner == caller_guid => Ok(()),
            None => {
                tracing::warn!(
                    char_name,
                    caller = %caller_guid,
                    "Character has no owner — allowing for backwards compatibility"
                );
                Ok(())
            }
            Some(owner) => {
                tracing::warn!(
                    char_name,
                    caller = %caller_guid,
                    owner = %owner,
                    "Rejected world-IP request: character owned by another user"
                );
                Err(RowsError::Forbidden(format!(
                    "Character '{char_name}' does not belong to the authenticated user"
                )))
            }
        }
    }

    fn resolve_zone(
        &self,
        char_name: &str,
        zone_name: &str,
        character: Option<&Character>,
    ) -> Result<String, RowsError> {
        let resolved = if zone_name.is_empty() || zone_name == "GETLASTZONENAME" {
            let character = character
                .ok_or_else(|| RowsError::NotFound(format!("Character not found: {char_name}")))?;
            character.map_name.clone().unwrap_or_default()
        } else {
            zone_name.to_string()
        };

        if resolved.is_empty() {
            return Err(RowsError::BadRequest(
                "ZoneName is empty. Make sure the character is assigned to a Zone!".into(),
            ));
        }

        Ok(resolved)
    }

    /// Primary path: Agones direct; falls back to MQ when Agones is unavailable.
    async fn allocate_and_track(
        &self,
        pipeline: AllocationPipeline<'_>,
        customer_guid: Uuid,
        char_name: &str,
        zone: &str,
    ) -> Result<JoinMapResult, RowsError> {
        let pipeline = match pipeline.acquire_lock(&self.state.zone_spinup_locks) {
            Ok(p) => p,
            Err(_) => {
                return AllocationPipeline::new(customer_guid, zone, &self.state.db)
                    .poll_until_ready(char_name)
                    .await;
            }
        };

        if let Some(ref agones) = self.state.agones {
            let mq_ref = self.state.mq.as_ref();
            let instance_log = &self.state.instance_log;
            let mut created_instance_id: Option<i32> = None;
            let mut allocated_gs: Option<String> = None;
            let result = async {
                let p = pipeline.allocate_via_agones(agones).await?;
                allocated_gs = p.game_server_name().map(|s| s.to_string());
                let p = p.register_world_server().await?;
                let p = p.create_instance().await?;
                created_instance_id = Some(p.instance_id());
                let p = p.tag_gameserver(agones).await?;

                if let Some(mq) = mq_ref {
                    let msg = crate::mq::SpinUpMessage {
                        customer_guid: customer_guid.to_string(),
                        world_server_id: p.world_server_id(),
                        zone_instance_id: p.instance_id(),
                        map_name: zone.to_string(),
                        port: p.port().unwrap_or(0),
                        seed: 0,
                        biome: None,
                    };
                    if let Err(e) = mq.publish_spin_up(p.world_server_id(), &msg).await {
                        tracing::warn!(error = %e, "MQ spin-up publish failed (non-fatal)");
                    }
                }

                instance_log.push(crate::rest::system::InstanceEvent {
                    timestamp: chrono::Utc::now(),
                    event: "allocated".into(),
                    zone_instance_id: p.instance_id(),
                    map_name: zone.to_string(),
                    game_server: p.game_server_name().unwrap_or("unknown").to_string(),
                    trigger: "player_request".into(),
                });

                let p = p.verify_health(agones).await?;
                p.track(&self.state.zone_servers)
                    .release_lock(&self.state.zone_spinup_locks)
                    .poll_until_ready(char_name)
                    .await
            }
            .await;

            if let Err(ref e) = result {
                tracing::error!(error = %e, zone, "Agones pipeline failed — cleaning up this allocation");

                let lock_key = crate::agones::spinup_lock_key(customer_guid, zone);
                self.state.zone_spinup_locks.remove(&lock_key);

                if let Some(instance_id) = created_instance_id {
                    self.state.zone_servers.remove(&instance_id);
                    let repo = crate::repo::InstanceRepo(&self.state.db);
                    if let Err(cleanup_err) =
                        repo.delete_map_instance(customer_guid, instance_id).await
                    {
                        tracing::warn!(error = %cleanup_err, instance_id, "Failed to delete failed mapinstance");
                    }
                }
                if let Some(ref gs) = allocated_gs {
                    if let Err(dealloc_err) = agones.deallocate(gs).await {
                        tracing::warn!(error = %dealloc_err, gs = %gs, "Failed to deallocate orphaned GameServer");
                    }
                }

                instance_log.push(crate::rest::system::InstanceEvent {
                    timestamp: chrono::Utc::now(),
                    event: "allocation_failed".into(),
                    zone_instance_id: created_instance_id.unwrap_or(0),
                    map_name: zone.to_string(),
                    game_server: allocated_gs.clone().unwrap_or_else(|| "unknown".into()),
                    trigger: format!("error: {e}"),
                });
            }
            result
        } else if let Some(ref mq) = self.state.mq {
            match pipeline.publish_via_mq(mq).await {
                Ok(pipeline) => {
                    pipeline
                        .release_lock(&self.state.zone_spinup_locks)
                        .poll_until_ready(char_name)
                        .await
                }
                Err(e) => {
                    self.state
                        .zone_spinup_locks
                        .remove(&crate::agones::spinup_lock_key(customer_guid, zone));
                    Err(e)
                }
            }
        } else {
            self.state
                .zone_spinup_locks
                .remove(&crate::agones::spinup_lock_key(customer_guid, zone));
            Err(RowsError::Internal(
                "No Agones or MQ available for allocation".into(),
            ))
        }
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

    pub async fn register_launcher(
        &self,
        customer_guid: Uuid,
        launcher_guid: &str,
        server_ip: &str,
        max_instances: i32,
        internal_ip: &str,
        starting_port: i32,
    ) -> Result<i32, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.register_launcher(
            customer_guid,
            launcher_guid,
            server_ip,
            max_instances,
            internal_ip,
            starting_port,
        )
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
