use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use uuid::Uuid;

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
