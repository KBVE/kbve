use super::OWSService;
use crate::error::RowsError;
use crate::models::*;
use crate::repo::{CharsRepo, UsersRepo};
use uuid::Uuid;

impl OWSService {
    pub async fn get_all_characters(
        &self,
        session_guid: Uuid,
        customer_guid: Uuid,
    ) -> Result<Vec<Character>, RowsError> {
        let session = self.resolve_session(session_guid).await?;
        let repo = UsersRepo(&self.state.db);
        repo.get_all_characters(customer_guid, session.user_guid)
            .await
    }

    pub async fn get_character_by_name(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Character, RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.get_by_name(customer_guid, char_name)
            .await?
            .ok_or_else(|| RowsError::NotFound("Character not found".into()))
    }

    pub async fn create_character(
        &self,
        session_guid: Uuid,
        customer_guid: Uuid,
        char_name: &str,
        class_name: &str,
    ) -> Result<(), RowsError> {
        let session = self.resolve_session(session_guid).await?;
        let repo = CharsRepo(&self.state.db);
        repo.create_character(customer_guid, session.user_guid, char_name, class_name)
            .await
    }

    pub async fn create_character_with_defaults(
        &self,
        session_guid: Uuid,
        customer_guid: Uuid,
        char_name: &str,
        default_set_name: &str,
    ) -> Result<(), RowsError> {
        let session = self.resolve_session(session_guid).await?;
        let repo = CharsRepo(&self.state.db);
        repo.create_character_with_defaults(
            customer_guid,
            session.user_guid,
            char_name,
            default_set_name,
        )
        .await
    }

    pub async fn remove_character(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<(), RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.remove_character(customer_guid, char_name).await
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
        let repo = CharsRepo(&self.state.db);
        repo.update_position(customer_guid, char_name, x, y, z, rx, ry, rz)
            .await
    }

    pub async fn update_stats(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        stats_json: &str,
    ) -> Result<(), RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.update_stats(customer_guid, char_name, stats_json)
            .await
    }

    pub async fn player_logout(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<(), RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.player_logout(customer_guid, char_name).await
    }

    pub async fn get_custom_data(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<CustomCharacterData>, RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.get_custom_data(customer_guid, char_name).await
    }

    pub async fn add_or_update_custom_data(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        field_name: &str,
        field_value: &str,
    ) -> Result<(), RowsError> {
        let repo = CharsRepo(&self.state.db);
        repo.add_or_update_custom_data(customer_guid, char_name, field_name, field_value)
            .await
    }
}
