use crate::db::DbPool;
use crate::error::RowsError;
use uuid::Uuid;

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
