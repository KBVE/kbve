use super::{CachedSession, OWSService};
use crate::error::RowsError;
use crate::models::*;
use crate::repo::UsersRepo;
use uuid::Uuid;

impl OWSService {
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResult, RowsError> {
        let repo = UsersRepo(&self.state.db);
        let result = repo.login(email, password).await?;

        // Cache session on successful login
        if result.authenticated {
            if let Some(session_guid) = result.user_session_guid {
                if let Ok(Some(session)) = repo.get_session(session_guid).await {
                    if let Some(user_guid) = session.user_guid {
                        self.state.sessions.insert(
                            session_guid,
                            CachedSession {
                                customer_guid: self.state.config.customer_guid,
                                user_guid,
                                created_at: std::time::Instant::now(),
                            },
                        );
                    }
                }
            }
        }

        Ok(result)
    }

    pub async fn register(
        &self,
        email: &str,
        password_hash: &str,
        first_name: &str,
        last_name: &str,
    ) -> Result<Uuid, RowsError> {
        let repo = UsersRepo(&self.state.db);
        repo.register(
            self.state.config.customer_guid,
            email,
            password_hash,
            first_name,
            last_name,
        )
        .await
    }

    pub async fn logout(&self, session_guid: Uuid) -> Result<(), RowsError> {
        self.state.sessions.remove(&session_guid);
        let repo = UsersRepo(&self.state.db);
        repo.logout(session_guid).await
    }

    pub async fn get_session(&self, session_guid: Uuid) -> Result<UserSession, RowsError> {
        let repo = UsersRepo(&self.state.db);
        repo.get_session(session_guid)
            .await?
            .ok_or_else(|| RowsError::NotFound("Session not found".into()))
    }

    /// Resolve session from cache (DashMap) or DB. Caches on miss.
    pub async fn resolve_session(&self, session_guid: Uuid) -> Result<CachedSession, RowsError> {
        // Fast path: DashMap
        if let Some(cached) = self.state.sessions.get(&session_guid) {
            return Ok(cached.clone());
        }

        // Slow path: DB
        let repo = UsersRepo(&self.state.db);
        let session = repo
            .get_session(session_guid)
            .await?
            .ok_or_else(|| RowsError::NotFound("Session not found".into()))?;

        let user_guid = session
            .user_guid
            .ok_or_else(|| RowsError::NotFound("No user in session".into()))?;

        let cached = CachedSession {
            customer_guid: session.customer_guid,
            user_guid,
            created_at: std::time::Instant::now(),
        };

        self.state.sessions.insert(session_guid, cached.clone());
        Ok(cached)
    }

    /// External login via Supabase JWT — validates token, finds-or-creates OWS user, creates session.
    ///
    /// Flow:
    ///   1. Validate Supabase JWT → extract email
    ///   2. Find existing OWS user by email, or create a new one under customer_guid
    ///   3. Delete old sessions, create new session
    ///   4. Cache session in DashMap
    ///   5. Return LoginResult with session GUID
    pub async fn external_login(&self, access_token: &str) -> Result<LoginResult, RowsError> {
        let validated = crate::supabase::validate_jwt(access_token, &self.state.supabase)
            .map_err(|e| RowsError::BadRequest(format!("Invalid access token: {e}")))?;

        let email = validated
            .email
            .ok_or_else(|| RowsError::BadRequest("No email in token".into()))?;

        let customer_guid = self.state.config.customer_guid;
        let repo = UsersRepo(&self.state.db);

        // Derive display name from email prefix
        let name_part = email.split('@').next().unwrap_or("Player");

        let user_guid = repo
            .find_or_create_by_email(customer_guid, &email, name_part, "")
            .await?;

        let session_guid = repo.create_session(customer_guid, user_guid).await?;

        // Cache session
        self.state.sessions.insert(
            session_guid,
            CachedSession {
                customer_guid,
                user_guid,
                created_at: std::time::Instant::now(),
            },
        );

        tracing::info!(
            email = %email,
            user_guid = %user_guid,
            session_guid = %session_guid,
            "External login succeeded"
        );

        Ok(LoginResult {
            authenticated: true,
            user_session_guid: Some(session_guid),
            error_message: String::new(),
        })
    }

    pub async fn set_selected_character_and_get_session(
        &self,
        session_guid: Uuid,
        char_name: &str,
    ) -> Result<UserSessionWithCharacter, RowsError> {
        let repo = UsersRepo(&self.state.db);
        // First update the selected character
        let _ = repo.set_selected_character(session_guid, char_name).await?;
        // Then fetch session with character data (including position)
        repo.get_session_with_character(session_guid)
            .await?
            .ok_or_else(|| RowsError::NotFound("Session not found".into()))
    }

    pub async fn get_player_groups_character_is_in(
        &self,
        customer_guid: uuid::Uuid,
        char_name: &str,
        player_group_type_id: i32,
    ) -> Result<Vec<crate::models::PlayerGroupMembership>, RowsError> {
        let repo = UsersRepo(&self.state.db);
        repo.get_player_groups_character_is_in(customer_guid, char_name, player_group_type_id)
            .await
    }
}
