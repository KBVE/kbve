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
        };

        self.state.sessions.insert(session_guid, cached.clone());
        Ok(cached)
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
