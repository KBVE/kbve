use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use uuid::Uuid;

/// Users repository — login, register, session management.
/// All methods take `&self` (borrow the pool, no Clone).
pub struct UsersRepo<'a>(pub &'a DbPool);

impl<'a> UsersRepo<'a> {
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResult, RowsError> {
        // Verify password SQL-side using pgcrypto crypt() — compatible with existing
        // bcrypt hashes created by OWS C# (crypt(password, gen_salt('bf'))).
        // Falls back to app-side argon2 for migrated passwords.
        let row: Option<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT c.customerguid, u.userguid
             FROM users u
             JOIN customers c ON c.customerguid = u.customerguid
             WHERE u.email = $1
               AND u.passwordhash = crypt($2, u.passwordhash)",
        )
        .bind(email)
        .bind(password)
        .fetch_optional(self.0)
        .await?;

        // If pgcrypto bcrypt didn't match, try app-side argon2
        let (customer_guid, user_guid) = match row {
            Some(r) => {
                // Auto re-hash to argon2 (Option B migration) — fire-and-forget
                let pool = self.0.clone();
                let pw = password.to_string();
                let email_owned = email.to_string();
                tokio::spawn(async move {
                    use argon2::{
                        Argon2, PasswordHasher,
                        password_hash::{SaltString, rand_core::OsRng},
                    };
                    let salt = SaltString::generate(&mut OsRng);
                    if let Ok(new_hash) = Argon2::default().hash_password(pw.as_bytes(), &salt) {
                        let _ = sqlx::query("UPDATE users SET passwordhash = $1 WHERE email = $2")
                            .bind(new_hash.to_string())
                            .bind(&email_owned)
                            .execute(&pool)
                            .await;
                        tracing::info!(email = %email_owned, "Password migrated from bcrypt to argon2");
                    }
                });
                r
            }
            None => {
                // Fallback: fetch hash and try argon2
                let fallback: Option<(Uuid, Uuid, String)> = sqlx::query_as(
                    "SELECT c.customerguid, u.userguid, u.passwordhash
                     FROM users u
                     JOIN customers c ON c.customerguid = u.customerguid
                     WHERE u.email = $1",
                )
                .bind(email)
                .fetch_optional(self.0)
                .await?;

                let Some((cg, ug, hash)) = fallback else {
                    return Ok(LoginResult {
                        authenticated: false,
                        user_session_guid: None,
                        error_message: "Invalid email or password".into(),
                    });
                };

                let valid = PasswordHash::new(&hash)
                    .ok()
                    .and_then(|ph| {
                        Argon2::default()
                            .verify_password(password.as_bytes(), &ph)
                            .ok()
                    })
                    .is_some();

                if !valid {
                    return Ok(LoginResult {
                        authenticated: false,
                        user_session_guid: None,
                        error_message: "Invalid email or password".into(),
                    });
                }
                (cg, ug)
            }
        };

        // Delete old sessions for this user, then create new
        sqlx::query("DELETE FROM usersessions WHERE userguid = $1")
            .bind(user_guid)
            .execute(self.0)
            .await?;

        let session_guid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO usersessions (customerguid, usersessionguid, userguid, logindate)
             VALUES ($1, $2, $3, NOW())",
        )
        .bind(customer_guid)
        .bind(session_guid)
        .bind(user_guid)
        .execute(self.0)
        .await?;

        Ok(LoginResult {
            authenticated: true,
            user_session_guid: Some(session_guid),
            error_message: String::new(),
        })
    }

    pub async fn get_session(&self, session_guid: Uuid) -> Result<Option<UserSession>, RowsError> {
        let session = sqlx::query_as::<_, UserSession>(
            "SELECT us.customerguid, u.userguid, us.usersessionguid,
                    us.logindate AS login_date,
                    us.selectedcharactername AS selected_character_name,
                    u.firstname AS first_name, u.lastname AS last_name,
                    u.email, u.createdate AS create_date,
                    u.lastaccess AS last_access, u.role
             FROM usersessions us
             JOIN users u ON u.userguid = us.userguid AND u.customerguid = us.customerguid
             WHERE us.usersessionguid = $1",
        )
        .bind(session_guid)
        .fetch_optional(self.0)
        .await?;

        Ok(session)
    }

    pub async fn get_all_characters(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
    ) -> Result<Vec<Character>, RowsError> {
        let chars = sqlx::query_as::<_, Character>(
            "SELECT * FROM characters WHERE customerguid = $1 AND userguid = $2",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .fetch_all(self.0)
        .await?;

        Ok(chars)
    }

    pub async fn set_selected_character(
        &self,
        session_guid: Uuid,
        char_name: &str,
    ) -> Result<Option<UserSession>, RowsError> {
        sqlx::query(
            "UPDATE usersessions SET selectedcharactername = $2 WHERE usersessionguid = $1",
        )
        .bind(session_guid)
        .bind(char_name)
        .execute(self.0)
        .await?;

        self.get_session(session_guid).await
    }

    pub async fn register(
        &self,
        customer_guid: Uuid,
        email: &str,
        password_hash: &str,
        first_name: &str,
        last_name: &str,
    ) -> Result<Uuid, RowsError> {
        let user_guid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (customerguid, userguid, email, passwordhash, firstname, lastname, role, createdate)
             VALUES ($1, $2, $3, $4, $5, $6, 'Player', NOW())",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .bind(email)
        .bind(password_hash)
        .bind(first_name)
        .bind(last_name)
        .execute(self.0)
        .await?;

        Ok(user_guid)
    }

    pub async fn logout(&self, session_guid: Uuid) -> Result<(), RowsError> {
        sqlx::query("DELETE FROM usersessions WHERE usersessionguid = $1")
            .bind(session_guid)
            .execute(self.0)
            .await?;
        Ok(())
    }

    // ─── Management (Admin) ──────────────────────────────────

    pub async fn list_users(&self, customer_guid: Uuid) -> Result<Vec<UserInfo>, RowsError> {
        let users = sqlx::query_as::<_, UserInfo>(
            "SELECT userguid AS user_guid, firstname AS first_name, lastname AS last_name,
                    email, role, createdate AS create_date
             FROM users WHERE customerguid = $1
             ORDER BY createdate DESC LIMIT 100",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await?;
        Ok(users)
    }

    pub async fn create_user_admin(
        &self,
        customer_guid: Uuid,
        first_name: &str,
        last_name: &str,
        email: &str,
        password_hash: &str,
    ) -> Result<Uuid, RowsError> {
        let user_guid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (customerguid, userguid, firstname, lastname, email, passwordhash, role, createdate)
             VALUES ($1, $2, $3, $4, $5, $6, 'Player', NOW())",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .bind(first_name)
        .bind(last_name)
        .bind(email)
        .bind(password_hash)
        .execute(self.0)
        .await?;
        Ok(user_guid)
    }

    pub async fn update_user_admin(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
        first_name: &str,
        last_name: &str,
        email: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE users SET firstname = $3, lastname = $4, email = $5
             WHERE customerguid = $1 AND userguid = $2",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .bind(first_name)
        .bind(last_name)
        .bind(email)
        .execute(self.0)
        .await?;
        Ok(())
    }
}

/// Characters repository — CRUD, position, stats.
pub struct CharsRepo<'a>(pub &'a DbPool);

impl<'a> CharsRepo<'a> {
    pub async fn get_by_name(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Option<Character>, RowsError> {
        let ch = sqlx::query_as::<_, Character>(
            "SELECT * FROM characters WHERE customerguid = $1 AND charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_optional(self.0)
        .await?;

        Ok(ch)
    }

    pub async fn update_position(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        x: f64,
        y: f64,
        z: f64,
        rx: f64,
        ry: f64,
        rz: f64,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE characters SET x=$3, y=$4, z=$5, rx=$6, ry=$7, rz=$8
             WHERE customerguid = $1 AND charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(x)
        .bind(y)
        .bind(z)
        .bind(rx)
        .bind(ry)
        .bind(rz)
        .execute(self.0)
        .await?;

        Ok(())
    }

    pub async fn get_custom_data(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<CustomCharacterData>, RowsError> {
        let data = sqlx::query_as::<_, CustomCharacterData>(
            "SELECT ccd.customfieldname AS custom_field_name, ccd.fieldvalue AS field_value
             FROM customcharacterdata ccd
             JOIN characters c ON c.characterid = ccd.characterid AND c.customerguid = ccd.customerguid
             WHERE ccd.customerguid = $1 AND c.charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_all(self.0)
        .await?;

        Ok(data)
    }

    pub async fn get_character_statuses(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<CharacterStatus>, RowsError> {
        let statuses = sqlx::query_as::<_, CharacterStatus>(
            "SELECT c.charname AS char_name, c.mapname AS map_name,
                    (c.mapname IS NOT NULL) AS is_online
             FROM characters c
             WHERE c.customerguid = $1 AND c.charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_all(self.0)
        .await?;
        Ok(statuses)
    }

    pub async fn get_default_custom_data(
        &self,
        customer_guid: Uuid,
        default_set_name: &str,
    ) -> Result<Vec<CustomCharacterData>, RowsError> {
        let data = sqlx::query_as::<_, CustomCharacterData>(
            "SELECT dcd.customfieldname AS custom_field_name, dcd.fieldvalue AS field_value
             FROM defaultcustomcharacterdata dcd
             JOIN defaultcharactervalues dcv ON dcv.defaultcharactervaluesid = dcd.defaultcharactervaluesid
               AND dcv.customerguid = dcd.customerguid
             WHERE dcd.customerguid = $1 AND dcv.defaultsetname = $2",
        )
        .bind(customer_guid)
        .bind(default_set_name)
        .fetch_all(self.0)
        .await?;
        Ok(data)
    }

    pub async fn create_character(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
        char_name: &str,
        class_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO characters (customerguid, userguid, charname, classname, createdate)
             VALUES ($1, $2, $3, $4, NOW())",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .bind(char_name)
        .bind(class_name)
        .execute(self.0)
        .await?;
        Ok(())
    }

    /// Create character using default values from the DefaultCharacterValues table.
    /// Matches C# CreateCharacterUsingDefaultCharacterValues endpoint.
    pub async fn create_character_with_defaults(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
        char_name: &str,
        default_set_name: &str,
    ) -> Result<(), RowsError> {
        // Insert base character, then copy defaults from DefaultCharacterValues
        sqlx::query(
            "INSERT INTO characters (customerguid, userguid, charname, classname, createdate,
                mapname, x, y, z, rx, ry, rz)
             SELECT $1, $2, $3, dcv.fieldvalue, NOW(),
                    dcv2.fieldvalue, 0, 0, 0, 0, 0, 0
             FROM defaultcharactervalues dcv
             LEFT JOIN defaultcharactervalues dcv2
               ON dcv2.customerguid = dcv.customerguid
               AND dcv2.defaultsetname = dcv.defaultsetname
               AND dcv2.characterfield = 'StartZone'
             WHERE dcv.customerguid = $1
               AND dcv.defaultsetname = $4
               AND dcv.characterfield = 'ClassName'",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .bind(char_name)
        .bind(default_set_name)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn remove_character(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query("DELETE FROM characters WHERE customerguid = $1 AND charname = $2")
            .bind(customer_guid)
            .bind(char_name)
            .execute(self.0)
            .await?;
        Ok(())
    }

    /// Allowlisted stat columns that can be updated via JSON.
    const STAT_COLUMNS: &'static [&'static str] = &[
        "health",
        "maxhealth",
        "healthregenrate",
        "mana",
        "maxmana",
        "manaregenrate",
        "energy",
        "maxenergy",
        "energyregenrate",
        "stamina",
        "maxstamina",
        "staminaregenrate",
        "strength",
        "dexterity",
        "constitution",
        "intellect",
        "wisdom",
        "charisma",
        "agility",
        "baseattack",
        "baseattackbonus",
        "attackpower",
        "attackspeed",
        "critchance",
        "critmultiplier",
        "defense",
        "perception",
        "acrobatics",
        "climb",
        "stealth",
        "spirit",
        "magic",
        "thirst",
        "hunger",
        "gold",
        "silver",
        "copper",
        "score",
        "freecurrency",
        "premiumcurrency",
        "fame",
        "alignment",
        "xp",
        "size",
        "weight",
        "wounds",
        "characterlevel",
        "gender",
        "teamnumber",
        "hitdie",
    ];

    pub async fn update_stats(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        stats_json: &str,
    ) -> Result<(), RowsError> {
        let stats: serde_json::Value = serde_json::from_str(stats_json)
            .map_err(|e| RowsError::BadRequest(format!("Invalid stats JSON: {e}")))?;

        let obj = stats
            .as_object()
            .ok_or_else(|| RowsError::BadRequest("Stats must be a JSON object".into()))?;

        // Build SET clause from allowlisted keys only (SQL injection safe).
        // Pre-allocate with capacity to avoid realloc.
        use std::fmt::Write;
        let mut sql = String::with_capacity(256);
        sql.push_str("UPDATE characters SET ");
        let mut vals: Vec<f64> = Vec::with_capacity(obj.len().min(Self::STAT_COLUMNS.len()));
        let mut idx = 3u32; // $1 = customer_guid, $2 = charname
        let mut first = true;

        for (key, val) in obj {
            let col = key.to_lowercase();
            if Self::STAT_COLUMNS.contains(&col.as_str()) {
                if let Some(n) = val.as_f64() {
                    if !first {
                        sql.push_str(", ");
                    }
                    // write! into pre-allocated String — no extra allocation
                    let _ = write!(sql, "{col} = ${idx}");
                    vals.push(n);
                    idx += 1;
                    first = false;
                }
            }
        }

        if first {
            return Ok(()); // no valid columns
        }

        sql.push_str(" WHERE customerguid = $1 AND charname = $2");

        let mut q = sqlx::query(&sql).bind(customer_guid).bind(char_name);
        for v in &vals {
            q = q.bind(v);
        }
        q.execute(self.0).await?;
        Ok(())
    }

    pub async fn player_logout(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE characters SET mapname = NULL WHERE customerguid = $1 AND charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn add_or_update_custom_data(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        field_name: &str,
        field_value: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO customcharacterdata (customerguid, characterid, customfieldname, fieldvalue)
             SELECT $1, c.characterid, $3, $4
             FROM characters c WHERE c.customerguid = $1 AND c.charname = $2
             ON CONFLICT (customerguid, characterid, customfieldname)
             DO UPDATE SET fieldvalue = EXCLUDED.fieldvalue",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(field_name)
        .bind(field_value)
        .execute(self.0)
        .await?;
        Ok(())
    }
}

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
        char_name: &str,
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
             VALUES ($1, $2, $3, $4, $5, $6, 1)
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

    pub async fn spin_up_server_instance(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        zone_instance_id: i32,
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
        customer_guid: Uuid,
        world_server_id: i32,
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
}

/// Global data repository — key-value world state.
pub struct GlobalDataRepo<'a>(pub &'a DbPool);

impl<'a> GlobalDataRepo<'a> {
    pub async fn get(
        &self,
        customer_guid: Uuid,
        key: &str,
    ) -> Result<Option<GlobalData>, RowsError> {
        let data = sqlx::query_as::<_, GlobalData>(
            "SELECT globaldatakey AS global_data_key, globaldatavalue AS global_data_value
             FROM globaldata
             WHERE customerguid = $1 AND globaldatakey = $2",
        )
        .bind(customer_guid)
        .bind(key)
        .fetch_optional(self.0)
        .await?;

        Ok(data)
    }

    pub async fn set(&self, customer_guid: Uuid, key: &str, value: &str) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO globaldata (customerguid, globaldatakey, globaldatavalue)
             VALUES ($1, $2, $3)
             ON CONFLICT (customerguid, globaldatakey)
             DO UPDATE SET globaldatavalue = EXCLUDED.globaldatavalue",
        )
        .bind(customer_guid)
        .bind(key)
        .bind(value)
        .execute(self.0)
        .await?;

        Ok(())
    }
}

/// Abilities repository — character abilities and ability bars.
pub struct AbilitiesRepo<'a>(pub &'a DbPool);

impl<'a> AbilitiesRepo<'a> {
    pub async fn get_character_abilities(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<CharacterAbility>, RowsError> {
        let abilities = sqlx::query_as::<_, CharacterAbility>(
            "SELECT a.abilityname AS ability_name, cha.abilitylevel AS ability_level,
                    cha.charhasabilitiescustomjson AS custom_json
             FROM charhasabilities cha
             JOIN abilities a ON a.abilityid = cha.abilityid AND a.customerguid = cha.customerguid
             JOIN characters c ON c.characterid = cha.characterid AND c.customerguid = cha.customerguid
             WHERE cha.customerguid = $1 AND c.charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_all(self.0)
        .await?;
        Ok(abilities)
    }

    pub async fn add_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
        ability_level: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO charhasabilities (customerguid, characterid, abilityid, abilitylevel)
             SELECT $1, c.characterid, a.abilityid, $4
             FROM characters c, abilities a
             WHERE c.customerguid = $1 AND c.charname = $2
               AND a.customerguid = $1 AND a.abilityname = $3",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(ability_name)
        .bind(ability_level)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn remove_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "DELETE FROM charhasabilities
             WHERE customerguid = $1
               AND characterid = (SELECT characterid FROM characters WHERE customerguid = $1 AND charname = $2)
               AND abilityid = (SELECT abilityid FROM abilities WHERE customerguid = $1 AND abilityname = $3)",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(ability_name)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn update_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
        ability_level: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE charhasabilities SET abilitylevel = $4
             WHERE customerguid = $1
               AND characterid = (SELECT characterid FROM characters WHERE customerguid = $1 AND charname = $2)
               AND abilityid = (SELECT abilityid FROM abilities WHERE customerguid = $1 AND abilityname = $3)",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(ability_name)
        .bind(ability_level)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn get_ability_bars(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<AbilityBar>, RowsError> {
        let bars = sqlx::query_as::<_, AbilityBar>(
            "SELECT cab.charabilitybarid AS char_ability_bar_id,
                    cab.abilitybarname AS ability_bar_name,
                    cab.maxnumberofslots AS max_number_of_slots,
                    cab.numberofunlockedslots AS number_of_unlocked_slots,
                    cab.charabilitybarscustomjson AS custom_json
             FROM charabilitybar cab
             JOIN characters c ON c.characterid = cab.characterid AND c.customerguid = cab.customerguid
             WHERE cab.customerguid = $1 AND c.charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_all(self.0)
        .await?;
        Ok(bars)
    }

    pub async fn get_ability_bars_and_abilities(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<AbilityBarAbility>, RowsError> {
        let items = sqlx::query_as::<_, AbilityBarAbility>(
            "SELECT cab.charabilitybarid AS char_ability_bar_id,
                    cab.abilitybarname AS ability_bar_name,
                    a.abilityname AS ability_name,
                    cha.abilitylevel AS ability_level,
                    caba.inslotnumber AS in_slot_number,
                    caba.charabilitybarabilitiescustomjson AS custom_json
             FROM charabilitybarability caba
             JOIN charabilitybar cab ON cab.charabilitybarid = caba.charabilitybarid AND cab.customerguid = caba.customerguid
             JOIN charhasabilities cha ON cha.charhasabilitiesid = caba.charhasabilitiesid AND cha.customerguid = caba.customerguid
             JOIN abilities a ON a.abilityid = cha.abilityid AND a.customerguid = cha.customerguid
             JOIN characters c ON c.characterid = cab.characterid AND c.customerguid = cab.customerguid
             WHERE caba.customerguid = $1 AND c.charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_all(self.0)
        .await?;
        Ok(items)
    }
}

/// Zones repository — map zone management.
pub struct ZonesRepo<'a>(pub &'a DbPool);

impl<'a> ZonesRepo<'a> {
    pub async fn add_zone(
        &self,
        customer_guid: Uuid,
        map_name: &str,
        zone_name: &str,
        soft_player_cap: i32,
        hard_player_cap: i32,
        map_mode: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO maps (customerguid, mapname, zonename, softplayercap, hardplayercap, mapmode)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (customerguid, mapname) DO UPDATE
             SET zonename = EXCLUDED.zonename,
                 softplayercap = EXCLUDED.softplayercap,
                 hardplayercap = EXCLUDED.hardplayercap,
                 mapmode = EXCLUDED.mapmode",
        )
        .bind(customer_guid)
        .bind(map_name)
        .bind(zone_name)
        .bind(soft_player_cap)
        .bind(hard_player_cap)
        .bind(map_mode)
        .execute(self.0)
        .await?;
        Ok(())
    }
}
