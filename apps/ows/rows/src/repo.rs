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
        // OWS stores bcrypt/argon2 hashed passwords
        let row: Option<(Uuid, Uuid, String)> = sqlx::query_as(
            "SELECT c.customerguid, u.userguid, u.passwordhash
             FROM users u
             JOIN customers c ON c.customerguid = u.customerguid
             WHERE u.email = $1",
        )
        .bind(email)
        .fetch_optional(self.0)
        .await?;

        let Some((customer_guid, user_guid, hash)) = row else {
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
