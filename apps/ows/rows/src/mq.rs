use lapin::{
    Channel, Connection, ConnectionProperties, Consumer, ExchangeKind, options::*,
    types::FieldTable,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::service::OWSService;

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

/// Try to connect producer; return None if RabbitMQ is unavailable (non-fatal).
pub async fn try_connect(url: &str) -> Option<MqProducer> {
    match MqProducer::connect(url).await {
        Ok(p) => Some(p),
        Err(e) => {
            error!("RabbitMQ unavailable (non-fatal): {e}");
            None
        }
    }
}

// ──────────────────────────────────────────────
// Consumer — listens for spin-up/shutdown messages
// ──────────────────────────────────────────────

/// Spawn a background RabbitMQ consumer that listens for instance lifecycle messages.
/// Runs as a tokio task — non-blocking, non-fatal if MQ is unavailable.
pub async fn spawn_consumer(url: &str, world_server_id: i32, svc: Arc<OWSService>) {
    let conn = match Connection::connect(url, ConnectionProperties::default()).await {
        Ok(c) => c,
        Err(e) => {
            warn!("RabbitMQ consumer unavailable (non-fatal): {e}");
            return;
        }
    };

    let channel = match conn.create_channel().await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to create RabbitMQ consumer channel: {e}");
            return;
        }
    };

    // Declare queues and bind to exchanges
    let spinup_queue = format!("rows.spinup.{world_server_id}");
    let shutdown_queue = format!("rows.shutdown.{world_server_id}");

    for (queue, exchange, routing_key) in [
        (
            &spinup_queue,
            "ows.serverspinup",
            format!("ows.serverspinup.{world_server_id}"),
        ),
        (
            &shutdown_queue,
            "ows.servershutdown",
            format!("ows.servershutdown.{world_server_id}"),
        ),
    ] {
        if let Err(e) = channel
            .queue_declare(
                queue.as_str().into(),
                QueueDeclareOptions {
                    exclusive: true,
                    auto_delete: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
        {
            error!(queue, error = %e, "Failed to declare queue");
            return;
        }

        if let Err(e) = channel
            .queue_bind(
                queue.as_str().into(),
                exchange.into(),
                routing_key.as_str().into(),
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await
        {
            error!(queue, error = %e, "Failed to bind queue");
            return;
        }
    }

    // Spin-up consumer
    let svc_spinup = svc.clone();
    let spinup_consumer = channel
        .basic_consume(
            spinup_queue.as_str().into(),
            "rows-spinup-consumer".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await;

    if let Ok(consumer) = spinup_consumer {
        tokio::spawn(consume_spin_up(consumer, svc_spinup));
        info!(world_server_id, "RabbitMQ spin-up consumer started");
    }

    // Shutdown consumer
    let shutdown_consumer = channel
        .basic_consume(
            shutdown_queue.as_str().into(),
            "rows-shutdown-consumer".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await;

    if let Ok(consumer) = shutdown_consumer {
        tokio::spawn(consume_shut_down(consumer, svc));
        info!(world_server_id, "RabbitMQ shutdown consumer started");
    }
}

async fn consume_spin_up(mut consumer: Consumer, svc: Arc<OWSService>) {
    use futures_lite::StreamExt;

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(d) => d,
            Err(e) => {
                error!(error = %e, "Spin-up consumer delivery error");
                continue;
            }
        };

        let msg: SpinUpMessage = match serde_json::from_slice(&delivery.data) {
            Ok(m) => m,
            Err(e) => {
                warn!(error = %e, "Invalid spin-up message payload");
                let _ = delivery.ack(BasicAckOptions::default()).await;
                continue;
            }
        };

        info!(
            map = %msg.map_name,
            zone = msg.zone_instance_id,
            "Processing spin-up message"
        );

        // Allocate via pipeline (Agones if available)
        let guid = svc.state().config.customer_guid;
        if let Some(ref agones) = svc.state().agones {
            use crate::agones::AllocationPipeline;

            let pipeline = AllocationPipeline::new(guid, &msg.map_name, &svc.state().db);

            match async {
                let p = pipeline.allocate_via_agones(agones).await?;
                let p = p.register_world_server().await?;
                let p = p.create_instance().await?;
                let p = p.verify_health(agones).await?;
                Ok::<_, crate::error::RowsError>(p)
            }
            .await
            {
                Ok(p) => {
                    p.track(&svc.state().zone_servers)
                        .release_lock(&svc.state().zone_spinup_locks);

                    info!(
                        zone = msg.zone_instance_id,
                        map = %msg.map_name,
                        "MQ spin-up: pipeline completed"
                    );
                }
                Err(e) => {
                    error!(error = %e, zone = msg.zone_instance_id, "MQ spin-up: pipeline failed");

                    // DLQ after 3 attempts
                    if delivery.delivery_tag > 2 {
                        warn!(
                            zone = msg.zone_instance_id,
                            "DLQ: rejecting after repeated failures"
                        );
                        let _ = delivery.reject(BasicRejectOptions { requeue: false }).await;
                        continue;
                    }
                    let _ = delivery.reject(BasicRejectOptions { requeue: true }).await;
                    continue;
                }
            }
        }

        let _ = delivery.ack(BasicAckOptions::default()).await;
    }
}

async fn consume_shut_down(mut consumer: Consumer, svc: Arc<OWSService>) {
    use futures_lite::StreamExt;

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(d) => d,
            Err(e) => {
                error!(error = %e, "Shutdown consumer delivery error");
                continue;
            }
        };

        let msg: ShutDownMessage = match serde_json::from_slice(&delivery.data) {
            Ok(m) => m,
            Err(e) => {
                warn!(error = %e, "Invalid shutdown message payload");
                let _ = delivery.ack(BasicAckOptions::default()).await;
                continue;
            }
        };

        info!(zone = msg.zone_instance_id, "Processing shutdown message");

        // Deallocate via Agones if tracked
        if let Some((_, gs_name)) = svc.state().zone_servers.remove(&msg.zone_instance_id) {
            if let Some(ref agones) = svc.state().agones {
                if let Err(e) = agones.deallocate(&gs_name).await {
                    error!(error = %e, gs = %gs_name, "Agones deallocation failed");
                }
            }
        }

        let _ = delivery.ack(BasicAckOptions::default()).await;
    }
}
