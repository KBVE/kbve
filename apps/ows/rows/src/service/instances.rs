use super::OWSService;
use crate::error::RowsError;
use crate::models::*;
use crate::mq::SpinUpMessage;
use crate::repo::InstanceRepo;
use uuid::Uuid;

impl OWSService {
    pub async fn get_server_to_connect_to(
        &self,
        customer_guid: Uuid,
        char_name: &str,
        zone_name: &str,
    ) -> Result<JoinMapResult, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        let result = repo
            .join_map_by_char_name(customer_guid, char_name, zone_name)
            .await?;

        if result.need_to_startup_map {
            if let Some(ref mq) = self.state.mq {
                let msg = SpinUpMessage {
                    customer_guid: customer_guid.to_string(),
                    world_server_id: result.world_server_id,
                    zone_instance_id: result.map_instance_id,
                    map_name: result.map_name_to_start.clone(),
                    port: result.port,
                };
                if let Err(e) = mq.publish_spin_up(result.world_server_id, &msg).await {
                    tracing::error!(error = %e, "Failed to publish spin-up message");
                }
            }
        }

        Ok(result)
    }

    pub async fn get_zone_instances(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.get_zone_instances(customer_guid, world_server_id)
            .await
    }

    pub async fn set_zone_status(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        status: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.set_zone_status(customer_guid, zone_instance_id, status)
            .await
    }

    pub async fn update_number_of_players(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        number_of_players: i32,
    ) -> Result<(), RowsError> {
        let repo = InstanceRepo(&self.state.db);
        repo.update_number_of_players(customer_guid, zone_instance_id, number_of_players)
            .await
    }
}
