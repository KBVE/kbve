use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::*;
use uuid::Uuid;

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

    pub async fn get_character_id_by_name(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<Option<i32>, RowsError> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT characterid FROM characters WHERE customerguid = $1 AND charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .fetch_optional(self.0)
        .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn has_custom_character_data_for_field(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        field_name: &str,
    ) -> Result<bool, RowsError> {
        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT COUNT(*) FROM customcharacterdata ccd
             JOIN characters c ON c.characterid = ccd.characterid AND c.customerguid = ccd.customerguid
             WHERE ccd.customerguid = $1 AND c.charname = $2 AND ccd.customfieldname = $3",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(field_name)
        .fetch_optional(self.0)
        .await?;
        Ok(row.map(|r| r.0 > 0).unwrap_or(false))
    }

    pub async fn add_default_custom_character_data(
        &self,
        customer_guid: Uuid,
        default_character_values_id: i32,
        field_name: &str,
        field_value: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO defaultcustomcharacterdata (customerguid, defaultcharactervaluesid, customfieldname, fieldvalue)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(customer_guid)
        .bind(default_character_values_id)
        .bind(field_name)
        .bind(field_value)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn get_character_ability_by_name(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        ability_name: &str,
    ) -> Result<Option<CharacterAbility>, RowsError> {
        let ability = sqlx::query_as::<_, CharacterAbility>(
            "SELECT a.abilityname AS ability_name, cha.abilitylevel AS ability_level,
                    cha.charhasabilitiescustomjson AS custom_json
             FROM charhasabilities cha
             JOIN abilities a ON a.abilityid = cha.abilityid AND a.customerguid = cha.customerguid
             JOIN characters c ON c.characterid = cha.characterid AND c.customerguid = cha.customerguid
             WHERE cha.customerguid = $1 AND c.charname = $2 AND a.abilityname = $3",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(ability_name)
        .fetch_optional(self.0)
        .await?;
        Ok(ability)
    }

    pub async fn update_character_zone(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        zone_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query("UPDATE characters SET mapname = $3 WHERE customerguid = $1 AND charname = $2")
            .bind(customer_guid)
            .bind(char_name)
            .bind(zone_name)
            .execute(self.0)
            .await?;
        Ok(())
    }

    pub async fn remove_character_from_instance(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        map_instance_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "DELETE FROM charonmapinstance
             WHERE customerguid = $1
               AND characterid = (SELECT characterid FROM characters WHERE customerguid = $1 AND charname = $2)
               AND mapinstanceid = $3",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(map_instance_id)
        .execute(self.0)
        .await?;
        Ok(())
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

    /// Default stat columns for character INSERT — all NOT NULL in the DB.
    /// NOT NULL stat columns (excludes x/y/z/rx/ry/rz which are set explicitly).
    const CHAR_DEFAULTS: &'static str = "
        perception, acrobatics, climb, stealth, spirit, magic,
        teamnumber, thirst, hunger, gold, score, characterlevel,
        gender, xp, hitdie, wounds, size, weight,
        maxhealth, health, healthregenrate,
        maxmana, mana, manaregenrate,
        maxenergy, energy, energyregenrate,
        maxfatigue, fatigue, fatigueregenrate,
        maxstamina, stamina, staminaregenrate,
        maxendurance, endurance, enduranceregenrate,
        strength, dexterity, constitution, intellect, wisdom, charisma, agility,
        fortitude, reflex, willpower,
        baseattack, baseattackbonus, attackpower, attackspeed,
        critchance, critmultiplier, haste, spellpower, spellpenetration,
        defense, dodge, parry, avoidance, versatility, multishot,
        initiative, naturalarmor, physicalarmor, bonusarmor, forcearmor, magicarmor,
        resistance, reloadspeed, range, speed,
        silver, copper, freecurrency, premiumcurrency, fame, alignment,
        defaultpawnclasspath, isinternalnetworktestuser, classid,
        lastactivity, isadmin, ismoderator";

    const CHAR_ZEROS: &'static str = "
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 1,
        0, 0, 0, 0, 1, 0,
        100, 100, 0,
        100, 100, 0,
        100, 100, 0,
        100, 100, 0,
        100, 100, 0,
        100, 100, 0,
        0, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        '', false, 0,
        NOW(), false, false";

    pub async fn create_character(
        &self,
        customer_guid: Uuid,
        user_guid: Uuid,
        char_name: &str,
        _class_name: &str,
    ) -> Result<(), RowsError> {
        let sql = format!(
            "INSERT INTO characters (customerguid, userguid, charname, email, createdate,
                x, y, z, rx, ry, rz, {})
             SELECT $1, $2, $3, u.email, NOW(),
                0, 0, 0, 0, 0, 0, {}
             FROM users u
             WHERE u.customerguid = $1 AND u.userguid = $2",
            Self::CHAR_DEFAULTS,
            Self::CHAR_ZEROS
        );
        sqlx::query(&sql)
            .bind(customer_guid)
            .bind(user_guid)
            .bind(char_name)
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
        let sql = format!(
            "INSERT INTO characters (customerguid, userguid, charname, email, createdate,
                mapname, x, y, z, rx, ry, rz, {})
             SELECT $1, $2, $3, u.email, NOW(),
                    dcv.startingmapname, dcv.x, dcv.y, dcv.z, dcv.rx, dcv.ry, dcv.rz, {}
             FROM defaultcharactervalues dcv
             JOIN users u ON u.customerguid = $1 AND u.userguid = $2
             WHERE dcv.customerguid = $1
               AND dcv.defaultsetname = $4",
            Self::CHAR_DEFAULTS,
            Self::CHAR_ZEROS
        );
        sqlx::query(&sql)
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

    pub async fn update_position_and_map(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        map_name: &str,
        x: f64,
        y: f64,
        z: f64,
        rx: f64,
        ry: f64,
        rz: f64,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE characters SET mapname=$3, x=$4, y=$5, z=$6, rx=$7, ry=$8, rz=$9
             WHERE customerguid = $1 AND charname = $2",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(map_name)
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

    pub async fn add_character_to_instance(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        map_instance_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "INSERT INTO charonmapinstance (customerguid, characterid, mapinstanceid)
             SELECT $1, c.characterid, $3
             FROM characters c WHERE c.customerguid = $1 AND c.charname = $2
             ON CONFLICT DO NOTHING",
        )
        .bind(customer_guid)
        .bind(char_name)
        .bind(map_instance_id)
        .execute(self.0)
        .await?;
        Ok(())
    }

    pub async fn remove_character_from_all_instances(
        &self,
        customer_guid: Uuid,
        char_name: &str,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "DELETE FROM charonmapinstance
             WHERE customerguid = $1
               AND characterid = (SELECT characterid FROM characters WHERE customerguid = $1 AND charname = $2)",
        )
        .bind(customer_guid).bind(char_name)
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
