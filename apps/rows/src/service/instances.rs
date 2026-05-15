use super::OWSService;
use crate::agones::AllocationPipeline;
use crate::error::RowsError;
use crate::models::*;
use crate::repo::{CharsRepo, InstanceRepo};
use uuid::Uuid;

// ─── Edge Case Notes ─────────────────────────────────────────
//
// TODO(concurrent-allocation): Two players requesting the same zone simultaneously
//   can both trigger allocation. The spinup lock prevents duplicate Agones allocations
//   but the second request still polls for 60s. Consider:
//   - Returning the in-progress allocation immediately (skip poll, return "pending")
//   - Using a tokio::sync::watch channel to notify waiters when allocation completes
//
// TODO(zone-capacity): Check zone player cap before allocation:
//   - Query mapinstances.numberofreportedplayers for the zone
//   - If above soft_player_cap, try to allocate a new instance instead of joining existing
//   - If above hard_player_cap, return error "Zone is full"
//
// TODO(graceful-travel): Handle client disconnect during GetServerToConnectTo:
//   - Client HTTP timeout (30s) vs server allocation time (up to 60s)
//   - If client disconnects, the allocated server is still created
//   - Consider: allocation should be idempotent per character — same char gets same instance
//
// TODO(cross-zone-travel): Support ServerTravel between zones:
//   - Player on Zone A wants to enter Zone B
//   - Save position on Zone A → allocate on Zone B → return Zone B IP:port
//   - Client does ClientTravel → new server handles the rest
//   - Requires: character position save before zone handoff (partially done in OWS)
//
// ──────────────────────────────────────────────────────────────

impl OWSService {
    /// Get a server for a player to connect to.
    /// Resolves zone name → finds or allocates a GameServer → returns IP + port.
    #[tracing::instrument(skip(self), fields(%customer_guid, char_name, zone_name))]
    pub async fn get_server_to_connect_to(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Step 1: Resolve GETLASTZONENAME
        let resolved_zone = self
            .resolve_zone(customer_guid, char_name, zone_name)
            .await?;

        // Step 2: Try to find an existing ready instance (fast path)
        let pipeline = AllocationPipeline::new(customer_guid, &resolved_zone, &self.state.db);
        match pipeline.find_existing(char_name).await {
            Err(crate::agones::pipeline::FindResult::Found(result)) => return Ok(result),
            Err(crate::agones::pipeline::FindResult::Error(e)) => return Err(e),
            Ok(pipeline) => {
                // Step 3: No ready instance — allocate via Agones or MQ
                self.allocate_and_track(pipeline, customer_guid, char_name, &resolved_zone)
                    .await
            }
        }
    }

    /// Resolve zone name — handles GETLASTZONENAME magic string.
    async fn resolve_zone(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        zone_name: &str,
    ) -> Result<String, RowsError> {
        let resolved = if zone_name.is_empty() || zone_name == "GETLASTZONENAME" {
            let chars_repo = CharsRepo(&self.state.db);
            let character = chars_repo
                .get_by_name(customer_guid, char_name)
                .await?
                .ok_or_else(|| RowsError::NotFound(format!("Character not found: {char_name}")))?;
            character.map_name.unwrap_or_default()
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

    /// Allocate a server and track it — Agones direct (primary) → MQ (fallback).
    async fn allocate_and_track(
        &self,
        pipeline: AllocationPipeline<'_>,
        customer_guid: Uuid,
        char_name: &str,
        zone: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Acquire spin-up lock (skip if already in progress)
        let pipeline = match pipeline.acquire_lock(&self.state.zone_spinup_locks) {
            Ok(p) => p,
            Err(_) => {
                // Another allocation in progress — just poll
                return AllocationPipeline::new(customer_guid, zone, &self.state.db)
                    .poll_until_ready(char_name)
                    .await;
            }
        };

        // Agones pipeline: allocate → register → create → notify MQ → health → track → poll
        if let Some(ref agones) = self.state.agones {
            let mq_ref = self.state.mq.as_ref();
            let instance_log = &self.state.instance_log;
            let result = async {
                let p = pipeline.allocate_via_agones(agones).await?;
                let p = p.register_world_server().await?;
                let p = p.create_instance().await?;
                let p = p.tag_gameserver(agones).await?;

                // Notify server via MQ which map to load (Iris integration)
                if let Some(mq) = mq_ref {
                    let msg = crate::mq::SpinUpMessage {
                        customer_guid: customer_guid.to_string(),
                        world_server_id: p.world_server_id(),
                        zone_instance_id: p.instance_id(),
                        map_name: zone.to_string(),
                        port: p.port().unwrap_or(0),
                        seed: 0,     // TODO(fastnoise): look up seed from maps table
                        biome: None, // TODO(fastnoise): look up biome from maps table
                    };
                    if let Err(e) = mq.publish_spin_up(p.world_server_id(), &msg).await {
                        tracing::warn!(error = %e, "MQ spin-up publish failed (non-fatal)");
                    }
                }

                // Log the allocation event
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
                tracing::error!(error = %e, zone, "Agones pipeline failed — cleaning up");

                // Release spinup lock
                let lock_key = format!("{customer_guid}:{zone}");
                self.state.zone_spinup_locks.remove(&lock_key);

                // Best-effort cleanup: delete any DB entries created during the failed pipeline
                let repo = crate::repo::InstanceRepo(&self.state.db);
                if let Err(cleanup_err) = repo.delete_all_map_instances(customer_guid).await {
                    tracing::warn!(error = %cleanup_err, "Failed to clean up stale mapinstances after pipeline failure");
                }
                if let Err(cleanup_err) = repo.deactivate_all_world_servers(customer_guid).await {
                    tracing::warn!(error = %cleanup_err, "Failed to deactivate world servers after pipeline failure");
                }

                // Log the failure event
                instance_log.push(crate::rest::system::InstanceEvent {
                    timestamp: chrono::Utc::now(),
                    event: "allocation_failed".into(),
                    zone_instance_id: 0,
                    map_name: zone.to_string(),
                    game_server: "unknown".into(),
                    trigger: format!("error: {e}"),
                });
            }
            result
        } else if let Some(ref mq) = self.state.mq {
            // Fallback: MQ → poll
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
                        .remove(&format!("{0}:{zone}", customer_guid));
                    Err(e)
                }
            }
        } else {
            self.state
                .zone_spinup_locks
                .remove(&format!("{0}:{zone}", customer_guid));
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
