use super::OWSService;
use crate::error::RowsError;
use crate::models::{AbilityBar, AbilityBarAbility, CharacterAbility};
use crate::repo::AbilitiesRepo;
use uuid::Uuid;

impl OWSService {
    pub async fn get_character_abilities(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<CharacterAbility>, RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.get_character_abilities(customer_guid, char_name).await
    }

    pub async fn add_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
        ability_level: i32,
    ) -> Result<(), RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.add_ability(customer_guid, char_name, ability_name, ability_level)
            .await
    }

    pub async fn remove_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
    ) -> Result<(), RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.remove_ability(customer_guid, char_name, ability_name)
            .await
    }

    pub async fn update_ability(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
        ability_level: i32,
    ) -> Result<(), RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.update_ability(customer_guid, char_name, ability_name, ability_level)
            .await
    }

    pub async fn get_ability_bars(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<AbilityBar>, RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.get_ability_bars(customer_guid, char_name).await
    }

    pub async fn get_ability_bars_and_abilities(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Vec<AbilityBarAbility>, RowsError> {
        let repo = AbilitiesRepo(&self.state.db);
        repo.get_ability_bars_and_abilities(customer_guid, char_name)
            .await
    }
}
