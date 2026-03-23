use super::OWSService;
use crate::error::RowsError;
use crate::repo::ZonesRepo;
use uuid::Uuid;

impl OWSService {
    pub async fn add_zone(
        &self,
        customer_guid: Uuid,
        map_name: &str,
        zone_name: &str,
        soft_player_cap: i32,
        hard_player_cap: i32,
        map_mode: i32,
    ) -> Result<(), RowsError> {
        let repo = ZonesRepo(&self.state.db);
        repo.add_zone(
            customer_guid,
            map_name,
            zone_name,
            soft_player_cap,
            hard_player_cap,
            map_mode,
        )
        .await
    }
}
