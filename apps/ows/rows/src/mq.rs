use lapin::{
    Channel, Connection, ConnectionProperties, ExchangeKind, options::*, types::FieldTable,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

/// RabbitMQ producer for OWS instance lifecycle messages.
pub struct MqProducer {
    channel: Channel,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpinUpMessage {
    pub customer_guid: String,
    pub world_server_id: i32,
    pub zone_instance_id: i32,
    pub map_name: String,
    pub port: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShutDownMessage {
    pub customer_guid: String,
    pub zone_instance_id: i32,
}

impl MqProducer {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let conn = Connection::connect(url, ConnectionProperties::default()).await?;
        let channel = conn.create_channel().await?;

        channel
            .exchange_declare(
                "ows.serverspinup".into(),
                ExchangeKind::Direct,
                ExchangeDeclareOptions::default(),
                FieldTable::default(),
            )
            .await?;

        channel
            .exchange_declare(
                "ows.servershutdown".into(),
                ExchangeKind::Direct,
                ExchangeDeclareOptions::default(),
                FieldTable::default(),
            )
            .await?;

        info!("RabbitMQ connected and exchanges declared");
        Ok(Self { channel })
    }

    pub async fn publish_spin_up(
        &self,
        world_server_id: i32,
        msg: &SpinUpMessage,
    ) -> anyhow::Result<()> {
        let routing_key = format!("ows.serverspinup.{world_server_id}");
        let payload = serde_json::to_vec(msg)?;

        self.channel
            .basic_publish(
                "ows.serverspinup".into(),
                routing_key.as_str().into(),
                BasicPublishOptions::default(),
                &payload,
                lapin::BasicProperties::default(),
            )
            .await?
            .await?;

        info!(routing_key, "Published spin-up message");
        Ok(())
    }

    pub async fn publish_shut_down(
        &self,
        world_server_id: i32,
        msg: &ShutDownMessage,
    ) -> anyhow::Result<()> {
        let routing_key = format!("ows.servershutdown.{world_server_id}");
        let payload = serde_json::to_vec(msg)?;

        self.channel
            .basic_publish(
                "ows.servershutdown".into(),
                routing_key.as_str().into(),
                BasicPublishOptions::default(),
                &payload,
                lapin::BasicProperties::default(),
            )
            .await?
            .await?;

        info!(routing_key, "Published shut-down message");
        Ok(())
    }
}

/// Try to connect; return None if RabbitMQ is unavailable (non-fatal).
pub async fn try_connect(url: &str) -> Option<MqProducer> {
    match MqProducer::connect(url).await {
        Ok(p) => Some(p),
        Err(e) => {
            error!("RabbitMQ unavailable (non-fatal): {e}");
            None
        }
    }
}
