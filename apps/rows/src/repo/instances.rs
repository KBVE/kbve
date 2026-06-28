use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use tracing::warn;
use uuid::Uuid;

/// True for Postgres SQLSTATE 42703 (undefined_column). Used to detect the deployment window where
/// the rows image rolled out ahead of the `gameservername` column migration so the allocation
/// INSERT can degrade gracefully instead of failing player-facing.
fn is_undefined_column(e: &sqlx::Error) -> bool {
    matches!(e, sqlx::Error::Database(db) if db.code().as_deref() == Some("42703"))
}

/// True for Postgres SQLSTATE 42P01 (undefined_table). Lets the per-tenant `reaperconfig` read
/// degrade to "no override" during the window where the rows image rolled out ahead of the
/// `reaperconfig` migration, instead of erroring every reaper cycle.
fn is_undefined_table(e: &sqlx::Error) -> bool {
    matches!(e, sqlx::Error::Database(db) if db.code().as_deref() == Some("42P01"))
}

/// Conservative `empty-shutdown-minutes` annotation value used only when the per-map timeout
/// lookup fails with a *DB error* (not "map not found"). The annotation is consumed UE-side to
/// self-shutdown, and the reaper's `min_empty_secs` floor does NOT protect it — so collapsing a
/// transient DB blip to the aggressive `1`-minute default would self-shutdown a populated server
/// prematurely. A larger fallback only delays UE self-shutdown on a rare blip; the reaper still
/// reaps at the real per-map timeout (it reads the column live at reap time, not the annotation).
pub const FALLBACK_EMPTY_SHUTDOWN_MINUTES_ON_DB_ERROR: i32 = 30;

/// Pure new-join selection policy. Returns the ordering key for an existing `status=2` instance, or
/// `None` if it must never receive a new join. Lower key is preferred:
///   tier 0 = healthy (not draining); tier 1 = acceptable `when_able` drain (state=1, not asap, not
///   drop). Within a tier, fewer players wins (matches the legacy `ORDER BY numberofreportedplayers`).
/// Excluded (`None`): `asap` (urgency=1), `draindropplayers=true` (will disconnect after save), or
/// `saving` (state=2, shutting down). NULL `drainstate` is the only "not draining" value (the
/// migration `CHECK` forbids 0). Kept pure (no DB) so the player-path decision is unit-testable.
pub fn join_candidate_key(
    drain_state: Option<i16>,
    drain_urgency: Option<i16>,
    drain_drop_players: Option<bool>,
    player_count: i32,
) -> Option<(u8, i32)> {
    match drain_state {
        None => Some((0, player_count)), // healthy -> preferred tier
        Some(2) => None,                 // saving -> excluded
        Some(_) => {
            let asap = drain_urgency.unwrap_or(0) == 1;
            let will_drop = drain_drop_players.unwrap_or(false);
            if asap || will_drop {
                None // asap / drop -> excluded
            } else {
                Some((1, player_count)) // when_able, non-drop -> eligible but below healthy
            }
        }
    }
}

/// Domain-validates a drain request before it reaches the DB. `state ∈ {1,2}` (1=draining,
/// 2=saving) and `urgency ∈ {0,1}` (0=when_able, 1=asap) mirror the migration's
/// `CHECK (DrainState IN (1,2))`. Without this, an out-of-domain `state` surfaces as a generic
/// `Database` 500 from the CHECK violation; rejecting here gives the caller a clean `BadRequest`
/// (and catches a bad `urgency`, which the DB has no constraint for at all).
pub fn validate_drain_request(state: i16, urgency: i16) -> Result<(), RowsError> {
    if !matches!(state, 1 | 2) {
        return Err(RowsError::BadRequest(format!(
            "invalid drain state {state} (expected 1=draining or 2=saving)"
        )));
    }
    if !matches!(urgency, 0 | 1) {
        return Err(RowsError::BadRequest(format!(
            "invalid drain urgency {urgency} (expected 0=when_able or 1=asap)"
        )));
    }
    Ok(())
}

/// Composite drain "severity" for the monotonic (escalate-only) guard in [`InstanceRepo::set_drain_state`].
/// Higher = more aggressive drain. `state` dominates (2=saving outranks 1=draining), then `urgency`
/// (asap > when_able), then `drop_players`. A not-draining row (`NULL` state) is the lowest. This
/// closes the hole where guarding on `urgency` alone let an equal-urgency request *downgrade*
/// `saving → draining` (re-admitting joins). The SQL guard recomputes the stored row's severity with
/// the SAME weights inline — keep the two formulas in lockstep.
pub fn drain_severity(
    drain_state: Option<i16>,
    drain_urgency: Option<i16>,
    drain_drop_players: Option<bool>,
) -> i32 {
    match drain_state {
        None => -1, // not draining -> lowest
        Some(s) => {
            (s as i32) * 100
                + (drain_urgency.unwrap_or(0) as i32) * 10
                + i32::from(drain_drop_players.unwrap_or(false))
        }
    }
}

pub struct InstanceRepo<'a>(pub &'a DbPool);

impl<'a> InstanceRepo<'a> {
    pub async fn get_zone_instances(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let zones = sqlx::query_as::<_, ZoneInstance>(
            "SELECT mi.*, m.mapname AS map_name, m.mapmode AS map_mode,
                    m.softplayercap AS soft_player_cap,
                    m.hardplayercap AS hard_player_cap,
                    m.minutestoshutdownafterempty AS minutes_to_shutdown_after_empty
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.worldserverid = $2",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .fetch_all(self.0)
        .await?;

        Ok(zones)
    }

    pub async fn set_zone_status(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        status: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE mapinstances SET status = $3
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .bind(status)
        .execute(self.0)
        .await?;

        Ok(())
    }

    pub async fn update_number_of_players(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        number_of_players: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            // GREATEST($3, 0): a bogus negative count must not be stored, nor start the empty
            // timer and make a live server look reap-eligible. Only an exact 0 (genuine empty)
            // stamps the marker; a negative is treated as a glitch and leaves it untouched.
            "UPDATE mapinstances
             SET numberofreportedplayers = GREATEST($3, 0),
                 lastupdatefromserver = NOW(),
                 lastserveremptydate = CASE
                     WHEN $3 > 0 THEN NULL
                     WHEN $3 < 0 THEN lastserveremptydate
                     WHEN lastserveremptydate IS NULL THEN NOW()
                     ELSE lastserveremptydate
                 END
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .bind(number_of_players)
        .execute(self.0)
        .await?;
        Ok(())
    }

    /// Core of `GetServerToConnectTo`: returns the connection info for an existing ready instance,
    /// or a pending placeholder telling the caller to spin one up.
    pub async fn join_map_by_char_name(
        &self,
        customer_guid: Uuid,
        _char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Fetch the ready candidates for the zone and pick the winner with the pure, unit-tested
        // `join_candidate_key` — drain eligibility/ranking lives in Rust, not SQL, so it can't
        // silently mis-rank. Bounded by `ORDER BY … LIMIT` so a pathological zone (a spin-up storm
        // leaving hundreds of `status=2` rows) can't make this hot path transfer/allocate unbounded
        // rows. The ORDER mirrors `join_candidate_key`'s tiers — healthy first (`drainstate IS NULL`
        // sorts before NOT NULL), then fewest players — so truncation only ever drops rows Rust
        // would also rank last. The explicit drain columns make this read migration-gated (see the
        // drain migration); that ordering is the operator procedure.
        let candidates: Result<Vec<JoinCandidateRow>, sqlx::Error> = sqlx::query_as(
            "SELECT ws.serverip AS server_ip,
                    ws.internalserverip AS world_server_ip,
                    ws.port AS world_server_port,
                    mi.port,
                    mi.mapinstanceid AS map_instance_id,
                    m.mapname AS map_name_to_start,
                    ws.worldserverid AS world_server_id,
                    mi.status AS map_instance_status,
                    false AS need_to_startup_map,
                    false AS enable_auto_loopback,
                    c.noportforwarding AS no_port_forwarding,
                    true AS success,
                    '' AS error_message,
                    mi.drainstate AS drain_state,
                    mi.drainurgency AS drain_urgency,
                    mi.draindropplayers AS drain_drop_players,
                    mi.numberofreportedplayers AS player_count
             FROM maps m
             JOIN mapinstances mi ON mi.mapid = m.mapid AND mi.customerguid = m.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             JOIN customers c ON c.customerguid = m.customerguid
             WHERE m.customerguid = $1 AND m.zonename = $2 AND mi.status = 2
             ORDER BY (mi.drainstate IS NOT NULL), mi.numberofreportedplayers ASC
             LIMIT 128",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_all(self.0)
        .await;

        let existing: Option<JoinMapResult> = match candidates {
            Ok(rows) => rows
                .into_iter()
                .filter_map(|c| {
                    join_candidate_key(
                        c.drain_state,
                        c.drain_urgency,
                        c.drain_drop_players,
                        c.player_count,
                    )
                    .map(|key| (key, c))
                })
                .min_by_key(|(key, _)| *key)
                .map(|(_, c)| c.into_result()),
            // Migration-vs-image ordering guard (mirrors `spin_up_server_instance_ready`): the dbmate
            // runner is decoupled from the rows image rollout, so a rows image can ship before the
            // drain-column migration lands. The drain-aware SELECT above then fails with SQLSTATE
            // 42703 (undefined_column) and EVERY join would error player-facing. Degrade to the
            // pre-drain query (no drain columns; until the migration lands every instance is
            // "healthy") so routing still reuses the least-loaded ready instance.
            Err(e) if is_undefined_column(&e) => {
                warn!(
                    zone = zone_name,
                    "mapinstances drain columns missing (migration not yet applied) — routing via \
                     pre-drain query; apply the dbmate migration to enable drain-aware join ranking"
                );
                sqlx::query_as(
                    "SELECT ws.serverip AS server_ip,
                            ws.internalserverip AS world_server_ip,
                            ws.port AS world_server_port,
                            mi.port,
                            mi.mapinstanceid AS map_instance_id,
                            m.mapname AS map_name_to_start,
                            ws.worldserverid AS world_server_id,
                            mi.status AS map_instance_status,
                            false AS need_to_startup_map,
                            false AS enable_auto_loopback,
                            c.noportforwarding AS no_port_forwarding,
                            true AS success,
                            '' AS error_message
                     FROM maps m
                     JOIN mapinstances mi ON mi.mapid = m.mapid AND mi.customerguid = m.customerguid
                     JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
                     JOIN customers c ON c.customerguid = m.customerguid
                     WHERE m.customerguid = $1 AND m.zonename = $2 AND mi.status = 2
                     ORDER BY mi.numberofreportedplayers ASC
                     LIMIT 1",
                )
                .bind(customer_guid)
                .bind(zone_name)
                .fetch_optional(self.0)
                .await?
            }
            Err(e) => return Err(e.into()),
        };

        if let Some(result) = existing {
            return Ok(result);
        }

        let pending: Option<JoinMapResult> = sqlx::query_as(
            "SELECT ws.serverip AS server_ip,
                    ws.internalserverip AS world_server_ip,
                    ws.port AS world_server_port,
                    0 AS port,
                    0 AS map_instance_id,
                    m.mapname AS map_name_to_start,
                    ws.worldserverid AS world_server_id,
                    0 AS map_instance_status,
                    true AS need_to_startup_map,
                    false AS enable_auto_loopback,
                    c.noportforwarding AS no_port_forwarding,
                    true AS success,
                    '' AS error_message
             FROM maps m
             JOIN worldservers ws ON ws.customerguid = m.customerguid AND ws.serverstatus = 1
             JOIN customers c ON c.customerguid = m.customerguid
             WHERE m.customerguid = $1 AND m.zonename = $2
             LIMIT 1",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_optional(self.0)
        .await?;

        match pending {
            Some(result) => Ok(result),
            None => Ok(JoinMapResult {
                server_ip: String::new(),
                world_server_ip: String::new(),
                world_server_port: 0,
                port: 0,
                map_instance_id: 0,
                map_name_to_start: String::new(),
                world_server_id: 0,
                map_instance_status: 0,
                need_to_startup_map: false,
                enable_auto_loopback: false,
                no_port_forwarding: false,
                success: false,
                error_message: format!("No zone found: {zone_name}"),
            }),
        }
    }

    /// UPSERT keyed on the stable `ZoneServerGUID` so a launcher restart doesn't dupe rows.
    pub async fn register_launcher(
        &self,
        customer_guid: Uuid,
        launcher_guid: &str,
        server_ip: &str,
        max_instances: i32,
        internal_ip: &str,
        starting_port: i32,
    ) -> Result<i32, RowsError> {
        let row: Option<(i32,)> = sqlx::query_as(
            "INSERT INTO worldservers (customerguid, serverip, maxnumberofinstances,
                 internalserverip, startingmapinstanceport, zoneserverguid, serverstatus)
             VALUES ($1, $2, $3, $4, $5, $6::uuid, 1)
             ON CONFLICT (customerguid, zoneserverguid)
             DO UPDATE SET serverip = EXCLUDED.serverip,
                           maxnumberofinstances = EXCLUDED.maxnumberofinstances,
                           internalserverip = EXCLUDED.internalserverip,
                           startingmapinstanceport = EXCLUDED.startingmapinstanceport,
                           serverstatus = 1
             RETURNING worldserverid",
        )
        .bind(customer_guid)
        .bind(server_ip)
        .bind(max_instances)
        .bind(internal_ip)
        .bind(starting_port)
        .bind(launcher_guid)
        .fetch_optional(self.0)
        .await?;

        Ok(row.map(|r| r.0).unwrap_or(-1))
    }

    pub async fn shut_down_launcher(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE worldservers SET serverstatus = 0
             WHERE customerguid = $1 AND worldserverid = $2",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn get_zone_name(
        &self,
        customer_guid: Uuid,
        map_id: i32,
    ) -> Result<Option<String>, RowsError> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT zonename FROM maps WHERE customerguid = $1 AND mapid = $2")
                .bind(customer_guid)
                .bind(map_id)
                .fetch_optional(self.0)
                .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn get_world_server(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Option<(i32, String, String, i32, i16)>, RowsError> {
        let row = sqlx::query_as::<_, (i32, String, String, i32, i16)>(
            "SELECT worldserverid, serverip, COALESCE(internalserverip, '') AS internal_ip,
                    port, serverstatus
             FROM worldservers WHERE customerguid = $1 AND worldserverid = $2",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .fetch_optional(self.0)
        .await?;
        Ok(row)
    }

    pub async fn get_ports_in_use(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Vec<i32>, RowsError> {
        let ports: Vec<(i32,)> = sqlx::query_as(
            "SELECT port FROM mapinstances WHERE customerguid = $1 AND worldserverid = $2 AND status > 0",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .fetch_all(self.0)
        .await?;
        Ok(ports.into_iter().map(|r| r.0).collect())
    }

    pub async fn get_map_instances_by_ip_and_port(
        &self,
        customer_guid: Uuid,
        server_ip: &str,
        port: i32,
    ) -> Result<Option<ServerInstanceInfo>, RowsError> {
        let info = sqlx::query_as::<_, ServerInstanceInfo>(
            "SELECT m.mapname AS map_name, m.zonename AS zone_name,
                    m.worldcompcontainsfilter AS world_comp_contains_filter,
                    m.worldcomplistfilter AS world_comp_list_filter,
                    mi.mapinstanceid AS map_instance_id, mi.status,
                    ws.maxnumberofinstances AS max_number_of_instances,
                    ws.activestarttime AS active_start_time,
                    ws.serverstatus AS server_status,
                    ws.internalserverip AS internal_server_ip
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND ws.serverip = $2 AND mi.port = $3",
        )
        .bind(customer_guid)
        .bind(server_ip)
        .bind(port)
        .fetch_optional(self.0)
        .await?;
        Ok(info)
    }

    pub async fn remove_all_map_instances_for_world_server(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<u64, RowsError> {
        let result =
            sqlx::query("DELETE FROM mapinstances WHERE customerguid = $1 AND worldserverid = $2")
                .bind(customer_guid)
                .bind(world_server_id)
                .execute(self.0)
                .await?;
        Ok(result.rows_affected())
    }

    pub async fn remove_characters_from_inactive_instances(
        &self,
        customer_guid: Uuid,
    ) -> Result<u64, RowsError> {
        let result = sqlx::query(
            "DELETE FROM charonmapinstance
             WHERE customerguid = $1
               AND mapinstanceid IN (SELECT mapinstanceid FROM mapinstances WHERE customerguid = $1 AND status = 0)",
        )
        .bind(customer_guid)
        .execute(self.0)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn get_all_inactive_map_instances(
        &self,
        customer_guid: Uuid,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let zones = sqlx::query_as::<_, ZoneInstance>(
            "SELECT mi.*, m.mapname AS map_name, m.mapmode AS map_mode,
                    m.softplayercap AS soft_player_cap,
                    m.hardplayercap AS hard_player_cap,
                    m.minutestoshutdownafterempty AS minutes_to_shutdown_after_empty
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.status = 0
             ORDER BY mi.mapinstanceid
             LIMIT 500",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await?;
        Ok(zones)
    }

    /// Active (`status > 0`) instances — the reaper's candidate set. Returns the slim
    /// [`ReapRow`] projection (only the columns `reap_decision` reads) rather than a full
    /// `SELECT mi.*` into `ZoneInstance`, so the scan allocates no per-row `String`s
    /// (`map_name`/`gameservername`) for up to 500 rows every cycle. Still joins `maps` for the
    /// per-map `minutestoshutdownafterempty`. Capped at 500; the caller logs when the cap is hit
    /// (possible under-reaping).
    ///
    /// Ordered by each row's *own* reap clock, oldest first: `COALESCE(lastserveremptydate,
    /// createdate)`. An Empty candidate's clock is its `lastserveremptydate`; a never-reported
    /// candidate has a NULL empty-date and its clock is `createdate` (boot grace). A plain
    /// `lastserveremptydate ASC NULLS LAST` would bury every never-reported row *after* all empty
    /// rows, starving the never-reported backstop out of the cap in a backlog > 500; COALESCE
    /// interleaves both by reap-worthiness. The partial index `idx_mapinstances_active` still serves
    /// the `customerguid = $1 AND status > 0` predicate; the ≤500-row sort is in-memory and cheap.
    /// `mapinstanceid` breaks ties deterministically.
    ///
    /// LEFT (not INNER) JOIN on `maps`: an INNER JOIN would silently drop any active instance whose
    /// `maps` row was deleted (orphan), making it unreapable forever. With LEFT JOIN it stays a
    /// candidate; `COALESCE(m.minutestoshutdownafterempty, 1)` mirrors the column's own `DEFAULT 1`
    /// for the orphan (and the `min_empty_secs` floor still applies in `reap_decision`).
    pub async fn get_active_reap_candidates(
        &self,
        customer_guid: Uuid,
    ) -> Result<Vec<ReapRow>, RowsError> {
        let rows = sqlx::query_as::<_, ReapRow>(
            "SELECT mi.mapinstanceid, mi.numberofreportedplayers,
                    mi.lastupdatefromserver, mi.lastserveremptydate, mi.createdate,
                    COALESCE(m.minutestoshutdownafterempty, 1) AS minutestoshutdownafterempty,
                    mi.drainstate, mi.draindeadline
             FROM mapinstances mi
             LEFT JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.status > 0
             ORDER BY COALESCE(mi.lastserveremptydate, mi.createdate) ASC, mi.mapinstanceid
             LIMIT 500",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await;
        match rows {
            Ok(rows) => Ok(rows),
            // Migration-vs-image ordering guard (mirrors `spin_up_server_instance_ready`): if the
            // rows image ships before the drain-column migration, this SELECT fails with SQLSTATE
            // 42703 (undefined_column) and the reaper would stall EVERY cycle, leaking empty/stale
            // GameServers. Degrade to the pre-drain SELECT; `ReapRow`'s drain fields are `#[sqlx(
            // default)]` so they map to `None` -> `is_draining = false` -> the pre-drain reap policy
            // runs unchanged until the migration lands.
            Err(e) if is_undefined_column(&e) => {
                warn!(
                    "mapinstances drain columns missing (migration not yet applied) — reaping via \
                     pre-drain query; apply the dbmate migration to enable drain backstops"
                );
                let rows = sqlx::query_as::<_, ReapRow>(
                    "SELECT mi.mapinstanceid, mi.numberofreportedplayers,
                            mi.lastupdatefromserver, mi.lastserveremptydate, mi.createdate,
                            COALESCE(m.minutestoshutdownafterempty, 1) AS minutestoshutdownafterempty
                     FROM mapinstances mi
                     LEFT JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
                     WHERE mi.customerguid = $1 AND mi.status > 0
                     ORDER BY COALESCE(mi.lastserveremptydate, mi.createdate) ASC, mi.mapinstanceid
                     LIMIT 500",
                )
                .bind(customer_guid)
                .fetch_all(self.0)
                .await?;
                Ok(rows)
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Marks an instance draining. Orthogonal to `status` — a draining instance stays `status=2`
    /// (ready) so existing players keep playing; routing (`join_candidate_key`) and the reaper
    /// (`reap_decision`) consult `drainstate`.
    ///
    /// **Monotonic (escalate-only):** the WHERE guard refuses to *downgrade* an in-flight drain. It
    /// compares the stored row's composite [`drain_severity`] (state ≫ urgency ≫ drop) against the
    /// request's, so neither a late `when_able` can relax an active `asap` NOR an equal-urgency
    /// request can walk `saving` back to `draining`. `rows_affected == 0` therefore means either the
    /// instance is gone OR the guard rejected a downgrade — callers distinguish via a prior read.
    ///
    /// Rejects an out-of-domain `state`/`urgency` as `BadRequest` up front (see
    /// [`validate_drain_request`]) instead of letting the DB CHECK surface a 500.
    ///
    /// **UTC contract:** `deadline` is a naive `TIMESTAMP` compared against `Utc::now().naive_utc()`
    /// in `reap_decision`, so callers MUST pass a UTC-naive value. A `NaiveDateTime` carries no
    /// offset, so this can't be asserted at runtime — it is an invariant of the call site.
    #[allow(clippy::too_many_arguments)]
    pub async fn set_drain_state(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
        state: i16,
        urgency: i16,
        drop_players: bool,
        reason: &str,
        request_id: Uuid,
        deadline: Option<chrono::NaiveDateTime>,
    ) -> Result<u64, RowsError> {
        validate_drain_request(state, urgency)?;
        let new_severity = drain_severity(Some(state), Some(urgency), Some(drop_players));
        let result = sqlx::query(
            "UPDATE mapinstances
             SET drainstate = $3, drainurgency = $4, draindropplayers = $5,
                 drainreason = $6, drainrequestid = $7, draindeadline = $8
             WHERE customerguid = $1 AND mapinstanceid = $2
               AND COALESCE(
                     drainstate * 100 + COALESCE(drainurgency, 0) * 10
                       + COALESCE(draindropplayers::int, 0),
                     -1
                   ) <= $9",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .bind(state)
        .bind(urgency)
        .bind(drop_players)
        .bind(reason)
        .bind(request_id)
        .bind(deadline)
        .bind(new_severity)
        .execute(self.0)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clears the drain marker (drain aborted / never happened). Restores the instance to a plain
    /// routable/reapable state. `request_id = Some(id)` clears ONLY that request's drain (so one
    /// request can't wipe a stricter drain set by another); `None` is an explicit operator
    /// force-clear. Returns `rows_affected`.
    pub async fn clear_drain_state(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
        request_id: Option<Uuid>,
    ) -> Result<u64, RowsError> {
        let result = sqlx::query(
            "UPDATE mapinstances
             SET drainstate = NULL, drainurgency = NULL, draindropplayers = NULL,
                 drainreason = NULL, drainrequestid = NULL, draindeadline = NULL
             WHERE customerguid = $1 AND mapinstanceid = $2
               AND ($3::uuid IS NULL OR drainrequestid = $3)",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .bind(request_id)
        .execute(self.0)
        .await?;
        Ok(result.rows_affected())
    }

    /// Per-tenant reaper overrides from `ows.reaperconfig`. Returns the all-`None` default when no
    /// row exists for the tenant (use env defaults) AND when the table doesn't exist yet (migration
    /// not applied) — so a rows image that ships ahead of the migration cleanly runs on env config
    /// instead of erroring every cycle. Other DB errors propagate so the caller can fall back loudly.
    pub async fn get_reaper_config_override(
        &self,
        customer_guid: Uuid,
    ) -> Result<crate::config::ReaperConfigOverride, RowsError> {
        let result = sqlx::query_as::<_, crate::config::ReaperConfigOverride>(
            "SELECT enabled, neverreported, requireheartbeat,
                    bootgracesecs, buffersecs, stalesecs, minemptysecs, emptyfreshsecs
             FROM reaperconfig WHERE customerguid = $1",
        )
        .bind(customer_guid)
        .fetch_optional(self.0)
        .await;

        match result {
            Ok(ov) => Ok(ov.unwrap_or_default()),
            Err(e) if is_undefined_table(&e) => Ok(crate::config::ReaperConfigOverride::default()),
            Err(e) => Err(e.into()),
        }
    }

    /// Whether this tenant has *ever* received a heartbeat (any instance with a non-NULL
    /// `lastupdatefromserver`). Drives the `require_heartbeat` auto-gate: if no heartbeat has ever
    /// arrived, UE isn't configured to report, so the never-reported path must stay suppressed.
    pub async fn tenant_has_observed_heartbeat(
        &self,
        customer_guid: Uuid,
    ) -> Result<bool, RowsError> {
        let seen: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM mapinstances
             WHERE customerguid = $1 AND lastupdatefromserver IS NOT NULL)",
        )
        .bind(customer_guid)
        .fetch_one(self.0)
        .await?;
        Ok(seen)
    }

    /// Label-independent teardown fallback: resolve the persisted `gameservername` for a batch of
    /// instances the in-memory `zone_servers` map couldn't (e.g. `reconcile_allocations` couldn't
    /// rehydrate them because the `zone-instance` label was `0`/missing). One `ANY($2)` query
    /// instead of a per-instance round-trip, so a post-restart reap cycle doesn't fan out to
    /// hundreds of sequential lookups. Rows with a NULL `gameservername` are still returned (with
    /// `None`) so the caller can give them the no-name terminal treatment.
    pub async fn get_gameserver_names(
        &self,
        customer_guid: Uuid,
        map_instance_ids: &[i32],
    ) -> Result<Vec<(i32, Option<String>)>, RowsError> {
        let rows: Vec<(i32, Option<String>)> = sqlx::query_as(
            "SELECT mapinstanceid, gameservername FROM mapinstances
             WHERE customerguid = $1 AND mapinstanceid = ANY($2)",
        )
        .bind(customer_guid)
        .bind(map_instance_ids)
        .fetch_all(self.0)
        .await?;
        Ok(rows)
    }

    /// LEFT JOIN + GROUP BY instead of the previous correlated subquery (N+1 fix); returns
    /// `(world_server_id, server_ip, instance_count)` sorted least-loaded first.
    pub async fn get_active_world_servers_by_load(
        &self,
        customer_guid: Uuid,
    ) -> Result<Vec<(i32, String, i32)>, RowsError> {
        let servers: Vec<(i32, String, i32)> = sqlx::query_as(
            "SELECT ws.worldserverid, ws.serverip,
                    COALESCE(COUNT(mi.mapinstanceid), 0)::int AS instance_count
             FROM worldservers ws
             LEFT JOIN mapinstances mi
                    ON mi.worldserverid = ws.worldserverid
                   AND mi.customerguid = ws.customerguid
             WHERE ws.customerguid = $1 AND ws.serverstatus = 1
             GROUP BY ws.worldserverid, ws.serverip
             ORDER BY instance_count ASC",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await?;
        Ok(servers)
    }

    pub async fn update_user_last_access(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE users SET lastaccess = NOW() WHERE customerguid = $1 AND userguid = $2",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn spin_up_server_instance(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        _zone_instance_id: i32,
        zone_name: &str,
        port: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO mapinstances (customerguid, worldserverid, mapid, port, status)
             SELECT $1, $2, m.mapid, $4, 1
             FROM maps m WHERE m.customerguid = $1 AND m.zonename = $3
             ON CONFLICT DO NOTHING",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .bind(zone_name)
        .bind(port)
        .execute(self.0)
        .await?;
        Ok(())
    }

    /// Inserts with `status=2` (ready) because Agones-allocated servers are already running;
    /// contrast `spin_up_server_instance` which leaves the row at `status=1`.
    pub async fn spin_up_server_instance_ready(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        zone_name: &str,
        port: i32,
        game_server_name: &str,
    ) -> Result<i32, RowsError> {
        let full = sqlx::query_as::<_, (i32,)>(
            "INSERT INTO mapinstances (customerguid, worldserverid, mapid, port, status, gameservername)
             SELECT $1, $2, m.mapid, $4, 2, $5
             FROM maps m WHERE m.customerguid = $1 AND m.zonename = $3
             ON CONFLICT DO NOTHING
             RETURNING mapinstanceid",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .bind(zone_name)
        .bind(port)
        .bind(game_server_name)
        .fetch_optional(self.0)
        .await;

        match full {
            Ok(row) => Ok(row.map(|r| r.0).unwrap_or(0)),
            // Migration-vs-image ordering guard: migrations apply via the dbmate runner job,
            // decoupled from the rows image rollout. If a rows image ships before the
            // `gameservername` column migration lands, the INSERT above fails with SQLSTATE 42703
            // (undefined_column) and every scale-from-0 allocation would error player-facing.
            // Degrade to a column-less INSERT so allocation still succeeds; the reaper's DB-name
            // fallback that reads this column ships gated OFF, so a transiently-absent value is
            // harmless until the migration runs and later allocations persist it again.
            Err(e) if is_undefined_column(&e) => {
                warn!(
                    zone = zone_name,
                    "mapinstances.gameservername missing (migration not yet applied) — inserting \
                     without it; apply the dbmate migration to restore restart-safe teardown"
                );
                let row: Option<(i32,)> = sqlx::query_as(
                    "INSERT INTO mapinstances (customerguid, worldserverid, mapid, port, status)
                     SELECT $1, $2, m.mapid, $4, 2
                     FROM maps m WHERE m.customerguid = $1 AND m.zonename = $3
                     ON CONFLICT DO NOTHING
                     RETURNING mapinstanceid",
                )
                .bind(customer_guid)
                .bind(world_server_id)
                .bind(zone_name)
                .bind(port)
                .fetch_optional(self.0)
                .await?;
                Ok(row.map(|r| r.0).unwrap_or(0))
            }
            Err(e) => Err(e.into()),
        }
    }

    pub async fn shut_down_server_instance(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE mapinstances SET status = 0 WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .execute(self.0)
        .await?;
        Ok(())
    }

    /// Per-map empty timeout straight from `maps` (not via `mapinstances`). Used to stamp the
    /// `empty-shutdown-minutes` annotation at allocation time — which is *before* the instance
    /// row exists for the first (scale-from-0) server of a zone, so a `mapinstances`-joined
    /// lookup would return nothing and fall back to the default. Returns `Ok(1)` when the zone
    /// has no `maps` row (mirrors the column's own `DEFAULT 1`); a DB error propagates as `Err`
    /// so callers can distinguish "map not found" (safe to use 1) from a transient blip (which
    /// must use a conservative fallback — see `FALLBACK_EMPTY_SHUTDOWN_MINUTES_ON_DB_ERROR`).
    pub async fn get_map_minutes_to_shutdown_after_empty(
        &self,
        customer_guid: Uuid,
        zone_name: &str,
    ) -> Result<i32, RowsError> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT minutestoshutdownafterempty FROM maps
             WHERE customerguid = $1 AND zonename = $2",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_optional(self.0)
        .await?;
        Ok(row.map(|r| r.0).unwrap_or(1))
    }

    pub async fn get_zone_instances_for_zone(
        &self,
        customer_guid: Uuid,
        zone_name: &str,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let zones = sqlx::query_as::<_, ZoneInstance>(
            "SELECT mi.*, m.mapname AS map_name, m.mapmode AS map_mode,
                    m.softplayercap AS soft_player_cap,
                    m.hardplayercap AS hard_player_cap,
                    m.minutestoshutdownafterempty AS minutes_to_shutdown_after_empty
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND m.zonename = $2",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_all(self.0)
        .await?;
        Ok(zones)
    }

    pub async fn get_current_world_time(
        &self,
        _customer_guid: Uuid,
        _world_server_id: i32,
    ) -> Result<i64, RowsError> {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT EXTRACT(EPOCH FROM NOW())::bigint AS current_world_time")
                .fetch_optional(self.0)
                .await?;
        Ok(row.map(|r| r.0).unwrap_or(0))
    }

    pub async fn get_zone_instance(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
    ) -> Result<Option<ServerInstanceInfo>, RowsError> {
        let info = sqlx::query_as::<_, ServerInstanceInfo>(
            "SELECT m.mapname AS map_name, m.zonename AS zone_name,
                    m.worldcompcontainsfilter AS world_comp_contains_filter,
                    m.worldcomplistfilter AS world_comp_list_filter,
                    mi.mapinstanceid AS map_instance_id, mi.status,
                    ws.maxnumberofinstances AS max_number_of_instances,
                    ws.activestarttime AS active_start_time,
                    ws.serverstatus AS server_status,
                    ws.internalserverip AS internal_server_ip
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .fetch_optional(self.0)
        .await?;
        Ok(info)
    }

    pub async fn get_server_instance_from_port(
        &self,
        customer_guid: Uuid,
        port: i32,
    ) -> Result<Option<ServerInstanceInfo>, RowsError> {
        let info = sqlx::query_as::<_, ServerInstanceInfo>(
            "SELECT m.mapname AS map_name, m.zonename AS zone_name,
                    m.worldcompcontainsfilter AS world_comp_contains_filter,
                    m.worldcomplistfilter AS world_comp_list_filter,
                    mi.mapinstanceid AS map_instance_id, mi.status,
                    ws.maxnumberofinstances AS max_number_of_instances,
                    ws.activestarttime AS active_start_time,
                    ws.serverstatus AS server_status,
                    ws.internalserverip AS internal_server_ip
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.port = $2",
        )
        .bind(customer_guid)
        .bind(port)
        .fetch_optional(self.0)
        .await?;
        Ok(info)
    }

    pub async fn delete_map_instance(
        &self,
        customer_guid: Uuid,
        instance_id: i32,
    ) -> Result<(), RowsError> {
        // FK from charonmapinstance → mapinstances forces this two-step delete.
        sqlx::query(
            "DELETE FROM charonmapinstance
             WHERE mapinstanceid = $1 AND customerguid = $2",
        )
        .bind(instance_id)
        .bind(customer_guid)
        .execute(self.0)
        .await?;

        sqlx::query(
            "DELETE FROM mapinstances
             WHERE mapinstanceid = $1 AND customerguid = $2",
        )
        .bind(instance_id)
        .bind(customer_guid)
        .execute(self.0)
        .await?;

        Ok(())
    }

    pub async fn deactivate_world_server_by_instance(
        &self,
        customer_guid: Uuid,
        instance_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE worldservers SET serverstatus = 0
             WHERE customerguid = $1
               AND worldserverid = (
                   SELECT worldserverid FROM mapinstances
                   WHERE mapinstanceid = $2 AND customerguid = $1
               )",
        )
        .bind(customer_guid)
        .bind(instance_id)
        .execute(self.0)
        .await?;

        Ok(())
    }

    /// Deactivate the `worldservers` row backing `instance_id`, but ONLY when no *other* active
    /// (`status > 0`) instance still shares that worldserver. The Agones allocation path
    /// mints a fresh `worldservers` row per GameServer (`register_world_server` uses a new
    /// `Uuid::new_v4()` each time, so the `ON CONFLICT (customerguid, zoneserverguid)` never fires),
    /// i.e. 1:1 — and `reap_one` deletes the GameServer + flips the instance `status=0` but never
    /// cleared that row, leaking a `serverstatus=1` launcher row forever. This bounds that leak.
    /// The `NOT EXISTS` guard makes it safe for the 1:N launcher case too (a shared launcher hosting
    /// other live instances is left alone). Returns the count of worldserver rows deactivated —
    /// either zero or one — so the caller can log. Call AFTER the instance's own `status=0` flip; the
    /// `<> $2` guard excludes the just-reaped row regardless, so ordering is not load-bearing.
    pub async fn deactivate_world_server_if_last_instance(
        &self,
        customer_guid: Uuid,
        instance_id: i32,
    ) -> Result<u64, RowsError> {
        let result = sqlx::query(
            "UPDATE worldservers ws SET serverstatus = 0
             WHERE ws.customerguid = $1
               AND ws.worldserverid = (
                   SELECT worldserverid FROM mapinstances
                   WHERE mapinstanceid = $2 AND customerguid = $1
               )
               AND NOT EXISTS (
                   SELECT 1 FROM mapinstances other
                   WHERE other.customerguid = $1
                     AND other.worldserverid = ws.worldserverid
                     AND other.status > 0
                     AND other.mapinstanceid <> $2
               )",
        )
        .bind(customer_guid)
        .bind(instance_id)
        .execute(self.0)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn delete_all_map_instances(&self, customer_guid: Uuid) -> Result<(), RowsError> {
        sqlx::query("DELETE FROM charonmapinstance WHERE customerguid = $1")
            .bind(customer_guid)
            .execute(self.0)
            .await?;

        sqlx::query("DELETE FROM mapinstances WHERE customerguid = $1")
            .bind(customer_guid)
            .execute(self.0)
            .await?;

        Ok(())
    }

    pub async fn deactivate_all_world_servers(&self, customer_guid: Uuid) -> Result<(), RowsError> {
        sqlx::query("UPDATE worldservers SET serverstatus = 0 WHERE customerguid = $1")
            .bind(customer_guid)
            .execute(self.0)
            .await?;

        Ok(())
    }

    pub async fn get_zone_instance_info(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
    ) -> Result<Option<ZoneInstanceInfo>, RowsError> {
        let info: Option<ZoneInstanceInfo> = sqlx::query_as(
            "SELECT mi.mapinstanceid AS map_instance_id,
                    mi.worldserverid AS world_server_id,
                    mi.port,
                    mi.status,
                    m.mapname AS map_name,
                    m.zonename AS zone_name
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .fetch_optional(self.0)
        .await?;

        Ok(info)
    }

    /// Iris uses this to read the mapinstance currently assigned to a world server.
    pub async fn get_zone_assignment(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Option<ZoneAssignment>, RowsError> {
        let assignment: Option<ZoneAssignment> = sqlx::query_as(
            "SELECT mi.mapinstanceid AS zone_instance_id,
                    m.mapname AS map_name,
                    m.zonename AS zone_name,
                    mi.port
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1
               AND mi.worldserverid = $2
               AND mi.status > 0
             ORDER BY mi.mapinstanceid DESC
             LIMIT 1",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .fetch_optional(self.0)
        .await?;

        Ok(assignment)
    }

    pub async fn count_active_instances(&self, customer_guid: Uuid) -> Result<i64, RowsError> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM mapinstances WHERE customerguid = $1 AND status > 0",
        )
        .bind(customer_guid)
        .fetch_one(self.0)
        .await?;

        Ok(row.0)
    }
}

#[cfg(test)]
mod tests {
    use super::{drain_severity, join_candidate_key, validate_drain_request};
    use crate::error::RowsError;

    #[test]
    fn validate_drain_request_accepts_in_domain() {
        for state in [1i16, 2] {
            for urgency in [0i16, 1] {
                assert!(
                    validate_drain_request(state, urgency).is_ok(),
                    "{state}/{urgency}"
                );
            }
        }
    }

    #[test]
    fn validate_drain_request_rejects_out_of_domain() {
        // state 0 (the dead semantic the migration CHECK forbids) and 3 -> BadRequest, not a DB 500
        assert!(matches!(
            validate_drain_request(0, 0),
            Err(RowsError::BadRequest(_))
        ));
        assert!(matches!(
            validate_drain_request(3, 0),
            Err(RowsError::BadRequest(_))
        ));
        // urgency out of {0,1} -> BadRequest (the DB has no CHECK for urgency at all)
        assert!(matches!(
            validate_drain_request(1, 2),
            Err(RowsError::BadRequest(_))
        ));
        assert!(matches!(
            validate_drain_request(1, -1),
            Err(RowsError::BadRequest(_))
        ));
    }

    #[test]
    fn drain_severity_state_dominates_urgency() {
        // The regression that motivated this: saving(2) outranks draining(1) EVEN at higher urgency,
        // so the monotonic guard rejects a saving -> draining walk-back at equal-or-any urgency.
        let saving = drain_severity(Some(2), Some(0), Some(false));
        let draining_asap = drain_severity(Some(1), Some(1), Some(true));
        assert!(
            saving > draining_asap,
            "saving must outrank any draining tier"
        );
        // equal-urgency downgrade saving -> draining is a strict severity DROP (guard would reject)
        assert!(
            drain_severity(Some(2), Some(0), Some(false))
                > drain_severity(Some(1), Some(0), Some(false))
        );
    }

    #[test]
    fn drain_severity_orders_within_state() {
        // not draining is the floor
        assert_eq!(drain_severity(None, None, None), -1);
        // urgency escalates, then drop escalates
        assert!(
            drain_severity(Some(1), Some(0), Some(false))
                < drain_severity(Some(1), Some(0), Some(true))
        );
        assert!(
            drain_severity(Some(1), Some(0), Some(true))
                < drain_severity(Some(1), Some(1), Some(false))
        );
        // NULL urgency/drop default to the lowest within the state (matches the SQL COALESCE weights)
        assert_eq!(
            drain_severity(Some(1), None, None),
            drain_severity(Some(1), Some(0), Some(false))
        );
    }

    #[test]
    fn healthy_is_preferred_and_orders_by_players() {
        assert_eq!(join_candidate_key(None, None, None, 5), Some((0, 5)));
        // healthy always outranks any draining (tier 0 < tier 1) regardless of player count
        assert!(
            join_candidate_key(None, None, None, 99)
                < join_candidate_key(Some(1), Some(0), Some(false), 0)
        );
    }

    #[test]
    fn when_able_nondrop_is_eligible_fallback() {
        assert_eq!(
            join_candidate_key(Some(1), Some(0), Some(false), 3),
            Some((1, 3))
        );
        // among two when_able drains, fewer players wins
        assert!(
            join_candidate_key(Some(1), Some(0), Some(false), 2)
                < join_candidate_key(Some(1), Some(0), Some(false), 8)
        );
    }

    #[test]
    fn asap_drop_saving_are_excluded() {
        assert_eq!(join_candidate_key(Some(1), Some(1), Some(false), 0), None); // asap
        assert_eq!(join_candidate_key(Some(1), Some(0), Some(true), 0), None); // drop_players
        assert_eq!(join_candidate_key(Some(2), Some(0), Some(false), 0), None); // saving
        assert_eq!(join_candidate_key(Some(2), Some(1), Some(true), 0), None); // saving + asap + drop
    }

    #[test]
    fn null_urgency_and_drop_default_to_eligible_when_able() {
        // a state=1 drain with NULL urgency/drop is treated as when_able, non-drop -> eligible fallback
        assert_eq!(join_candidate_key(Some(1), None, None, 4), Some((1, 4)));
    }
}
