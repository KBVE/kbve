use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use uuid::Uuid;

/// Instance management repository — zone lifecycle.
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
            "UPDATE mapinstances
             SET numberofreportedplayers = $3, lastupdatefromserver = NOW()
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .bind(number_of_players)
        .execute(self.0)
        .await?;
        Ok(())
    }

    /// Core zone join logic — finds or creates a map instance for a character.
    /// Returns server connection info. This is the heart of GetServerToConnectTo.
    pub async fn join_map_by_char_name(
        &self,
        customer_guid: Uuid,
        _char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        // Try to find an existing ready instance for this zone
        let existing: Option<JoinMapResult> = sqlx::query_as(
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
        .await?;

        if let Some(result) = existing {
            return Ok(result);
        }

        // No ready instance — need to spin one up
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

    /// Register or update a world server launcher. Uses UPSERT on the stable
    /// ZoneServerGUID to prevent duplicate rows on launcher restart.
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
             WHERE mi.customerguid = $1 AND mi.status = 0",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await?;
        Ok(zones)
    }

    pub async fn get_active_world_servers_by_load(
        &self,
        customer_guid: Uuid,
    ) -> Result<Vec<(i32, String, i32)>, RowsError> {
        let servers: Vec<(i32, String, i32)> = sqlx::query_as(
            "SELECT ws.worldserverid, ws.serverip,
                    COALESCE((SELECT COUNT(*) FROM mapinstances mi WHERE mi.worldserverid = ws.worldserverid AND mi.customerguid = ws.customerguid), 0)::int AS instance_count
             FROM worldservers ws
             WHERE ws.customerguid = $1 AND ws.serverstatus = 1
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

    /// Create a map instance with status=2 (ready) for Agones-allocated servers.
    /// Unlike spin_up_server_instance (status=1), Agones servers are already running.
    pub async fn spin_up_server_instance_ready(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        zone_name: &str,
        port: i32,
    ) -> Result<i32, RowsError> {
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

    /// Delete a map instance by ID. Used during GameServer shutdown cleanup.
    pub async fn delete_map_instance(
        &self,
        customer_guid: Uuid,
        instance_id: i32,
    ) -> Result<(), RowsError> {
        // First clean up char_on_map_instance references
        sqlx::query(
            "DELETE FROM charonmapinstance
             WHERE mapinstanceid = $1 AND customerguid = $2",
        )
        .bind(instance_id)
        .bind(customer_guid)
        .execute(self.0)
        .await?;

        // Then delete the instance itself
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

    /// Deactivate the world server associated with a map instance.
    /// Sets serverstatus=0 for the world server that owns this instance.
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

    /// Delete all map instances for a customer. Used during fleet restart.
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

    /// Deactivate all world servers for a customer. Used during fleet restart.
    pub async fn deactivate_all_world_servers(&self, customer_guid: Uuid) -> Result<(), RowsError> {
        sqlx::query("UPDATE worldservers SET serverstatus = 0 WHERE customerguid = $1")
            .bind(customer_guid)
            .execute(self.0)
            .await?;

        Ok(())
    }

    /// Get zone instance info by ID (for shutdown routing).
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

    /// Get zone assignment for a world server (Iris integration).
    /// Returns the first active mapinstance assigned to this world server.
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
}
