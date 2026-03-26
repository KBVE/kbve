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

    pub async fn get_session_with_character(
        &self,
        session_guid: Uuid,
    ) -> Result<Option<crate::models::UserSessionWithCharacter>, RowsError> {
        let session = sqlx::query_as::<_, crate::models::UserSessionWithCharacter>(
            "SELECT us.customerguid, u.userguid, us.usersessionguid,
                    us.selectedcharactername AS selected_character_name,
                    u.email, u.firstname AS first_name, u.lastname AS last_name,
                    u.createdate AS create_date, u.lastaccess AS last_access, u.role,
                    c.characterid, c.charname, c.x, c.y, c.z, c.rx, c.ry, c.rz,
                    c.mapname
             FROM usersessions us
             JOIN users u ON u.userguid = us.userguid AND u.customerguid = us.customerguid
             LEFT JOIN characters c ON c.customerguid = us.customerguid
                AND c.charname = us.selectedcharactername
                AND c.userguid = us.userguid
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

    pub async fn get_session_only(
        &self,
        session_guid: Uuid,
    ) -> Result<Option<(Uuid, Uuid)>, RowsError> {
        let row = sqlx::query_as::<_, (Uuid, Uuid)>(
            "SELECT customerguid, userguid FROM usersessions WHERE usersessionguid = $1",
        )
        .bind(session_guid)
        .fetch_optional(self.0)
        .await?;
        Ok(row)
    }

    pub async fn get_user(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
    ) -> Result<Option<UserInfo>, RowsError> {
        let user = sqlx::query_as::<_, UserInfo>(
            "SELECT userguid AS user_guid, firstname AS first_name, lastname AS last_name,
                    email, role, createdate AS create_date
             FROM users WHERE customerguid = $1 AND userguid = $2",
        )
        .bind(customer_guid)
        .bind(user_guid)
        .fetch_optional(self.0)
        .await?;
        Ok(user)
    }

    pub async fn get_user_from_email(
        &self,
        customer_guid: Uuid,
        email: &str,
    ) -> Result<Option<UserInfo>, RowsError> {
        let user = sqlx::query_as::<_, UserInfo>(
            "SELECT userguid AS user_guid, firstname AS first_name, lastname AS last_name,
                    email, role, createdate AS create_date
             FROM users WHERE customerguid = $1 AND email = $2",
        )
        .bind(customer_guid)
        .bind(email)
        .fetch_optional(self.0)
        .await?;
        Ok(user)
    }

    pub async fn get_player_groups_character_is_in(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        player_group_type_id: i32,
    ) -> Result<Vec<PlayerGroupMembership>, RowsError> {
        let groups = sqlx::query_as::<_, PlayerGroupMembership>(
            "SELECT pg.playergroupid AS player_group_id,
                    pg.customerguid AS customer_guid,
                    pg.playergroupname AS player_group_name,
                    pg.playergrouptypeid AS player_group_type_id,
                    pg.readystate AS ready_state,
                    pg.createdate AS create_date
             FROM playergroupcharacters pgc
             INNER JOIN playergroup pg ON pg.playergroupid = pgc.playergroupid
                 AND pg.customerguid = pgc.customerguid
             INNER JOIN characters c ON c.characterid = pgc.characterid
                 AND c.customerguid = pgc.customerguid
             WHERE pgc.customerguid = $1
               AND c.charname = $2
               AND (pg.playergrouptypeid = $3 OR $3 = 0)",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(player_group_type_id)
        .fetch_all(self.0)
        .await?;
        Ok(groups)
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
