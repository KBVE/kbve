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

        // Admission gate (Phase 2): pause *new* joins game-wide or per-tenant. Travel (a character
        // already on an active instance) is meant to bypass the gate; only a genuinely new join is
        // subject to it.
        //
        // NOTE (Phase 2 reality): nothing populates `charonmapinstance` on join yet (#13555), so
        // `is_character_on_active_instance` is currently always false and the travel-bypass is inert
        // — today a freeze blocks ALL new joins. That is safe for now because in-world zone-to-zone
        // travel is not a live client flow yet (#13556); a freeze just means "no new logins". The
        // bypass below is forward-compatible scaffolding that starts working once #13555 lands.
        let repo = InstanceRepo(&self.state.db);
        // Travel detection FAILS OPEN: a read error (or no resolved character) must never strand a
        // moving player. Key on the already-resolved CharacterID (F1).
        let is_travel = match character.as_ref() {
            Some(ch) => repo
                .is_character_on_active_instance(customer_guid, ch.character_id)
                .await
                .unwrap_or(true),
            None => false, // no character row → cannot be a travel → treat as a new join
        };
        if !is_travel {
            // Admission read FAILS OPEN for a new join (F6 — operator sign-off). This read hits the
            // PRIMARY, and the gate exists to run under load — exactly when the primary is stressed
            // and the read may time out. Failing CLOSED here would reject *every* new login game-wide
            // on a transient DB blip even with NO freeze set, while piling the gate's own extra query
            // onto the stressed primary — manufacturing the outage it exists to prevent. So on a read
            // error we fail OPEN (allow the join) and log. Trade-off: during a real freeze a read
            // failure lets a new join slip through — acceptable for a soft load-shed (not a hard
            // security gate). A hard-pause variant and a valkey-cached read that could safely fail
            // CLOSED are both deferred (see plan Holes).
            let open = match repo.get_admission_overrides(customer_guid).await {
                Ok((tenant_ov, global_ov)) => {
                    let allow = crate::config::effective_accept_new_joins(
                        self.state.config.accept_new_joins,
                        &tenant_ov,
                        &global_ov,
                    );
                    if !allow {
                        // An active freeze drops new logins silently otherwise — there is no metric
                        // yet. Emit a server-side signal per blocked join (greppable/alertable) so an
                        // operator can see the gate is doing work, and catch a freeze that was left
                        // set after an incident. `scope` names what closed it: an explicit tenant or
                        // global `false`, or the env baseline (`ROWS_ACCEPT_NEW_JOINS=false`).
                        let scope = if tenant_ov.accept_new_joins == Some(false) {
                            "tenant"
                        } else if global_ov.accept_new_joins == Some(false) {
                            "global"
                        } else {
                            "env-baseline"
                        };
                        tracing::warn!(
                            %customer_guid,
                            scope,
                            "admission gate CLOSED — blocking a new join (operator freeze active)"
                        );
                    }
                    allow
                }
                Err(e) => {
                    tracing::warn!(error = %e, "admission read failed — failing OPEN for this new join (F6)");
                    true
                }
            };
            if !open {
                return Err(crate::error::RowsError::Unavailable(
                    "new joins are paused (maintenance/load); please retry shortly".into(),
                ));
            }
        }

        // When annotation stamping is on, read the per-map empty timeout to stamp
        // `empty-shutdown-minutes`. When off (default) pass 0 — the allocation path then skips this
        // DB read and omits the annotation. Read `maps` directly: the first server of a zone is
        // allocated before its `mapinstances` row exists. A DB error falls back to a conservative
        // value (not the 1-min not-found default) so a blip can't trigger premature self-shutdown.
        let empty_shutdown_minutes = if self.state.config.reaper.stamp_empty_shutdown_annotation {
            let m = match InstanceRepo(&self.state.db)
                .get_map_minutes_to_shutdown_after_empty(customer_guid, &resolved_zone)
                .await
            {
                Ok(m) => m,
                Err(e) => {
                    tracing::warn!(
                        error = %e,
                        zone = %resolved_zone,
                        "Failed to read empty-shutdown-minutes; using conservative fallback to avoid premature UE self-shutdown"
                    );
                    crate::repo::FALLBACK_EMPTY_SHUTDOWN_MINUTES_ON_DB_ERROR
                }
            };
            // Floor by `min_empty_secs` so a map's aggressive 1-min default can't self-shutdown a
            // server under a still-loading player.
            m.max(self.state.config.reaper.empty_shutdown_minutes_floor())
        } else {
            0 // annotation stamping off: no DB read, no annotation (see allocate.rs)
        };

        let pipeline = AllocationPipeline::new(
            customer_guid,
            &resolved_zone,
            &self.state.db,
            empty_shutdown_minutes,
        );
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
                // Re-poll path only waits for an in-flight allocation to finish; it never
                // allocates, so the annotation value is irrelevant here (0).
                return AllocationPipeline::new(customer_guid, zone, &self.state.db, 0)
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
