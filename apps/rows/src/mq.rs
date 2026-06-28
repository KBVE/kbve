use lapin::{
    Channel, Connection, ConnectionProperties, Consumer, ExchangeKind, options::*,
    types::{AMQPValue, FieldTable},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::service::OWSService;

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
    /// `0` = handcrafted map (no PCG).
    #[serde(default)]
    pub seed: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub biome: Option<String>,
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

/// Non-fatal: returns `None` and logs when RabbitMQ is unreachable.
pub async fn try_connect(url: &str) -> Option<MqProducer> {
    match MqProducer::connect(url).await {
        Ok(p) => Some(p),
        Err(e) => {
            error!("RabbitMQ unavailable (non-fatal): {e}");
            None
        }
    }
}

/// Non-fatal: bails (with a log) when MQ is unreachable.
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

    let spinup_queue = format!("rows.spinup.{world_server_id}");
    let shutdown_queue = format!("rows.shutdown.{world_server_id}");

    // Dead-letter path for spin-up: `consume_spin_up` reject-no-requeues a twice-failed message;
    // without a DLX that silently drops it (the player's join never gets a server). Declare a
    // durable DLX + bounded durable DLQ so those failures are captured instead of lost. Best-effort:
    // a failed declaration just logs and reverts to the prior drop-on-reject behavior. The spin-up
    // queue is exclusive+auto_delete (recreated each connection), so adding `x-dead-letter-exchange`
    // to it below can't conflict with immutable queue args.
    const SPINUP_DLX: &str = "ows.serverspinup.dlx";
    const SPINUP_DLQ: &str = "rows.spinup.dlq";
    if let Err(e) = channel
        .exchange_declare(
            SPINUP_DLX.into(),
            ExchangeKind::Fanout,
            ExchangeDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await
    {
        warn!(error = %e, "Failed to declare spin-up DLX (continuing without dead-lettering)");
    } else {
        // Bounded so a sustained allocation outage can't grow the DLQ without limit.
        let mut dlq_args = FieldTable::default();
        dlq_args.insert("x-max-length".into(), AMQPValue::LongLongInt(10_000));
        if let Err(e) = channel
            .queue_declare(
                SPINUP_DLQ.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                dlq_args,
            )
            .await
        {
            warn!(error = %e, "Failed to declare spin-up DLQ");
        } else if let Err(e) = channel
            .queue_bind(
                SPINUP_DLQ.into(),
                SPINUP_DLX.into(),
                "".into(), // fanout: routing key ignored
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await
        {
            warn!(error = %e, "Failed to bind spin-up DLQ to DLX");
        }
    }

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
        // Only the spin-up queue dead-letters — its reject-no-requeue is the drop the audit flagged.
        let mut queue_args = FieldTable::default();
        if queue == &spinup_queue {
            queue_args.insert(
                "x-dead-letter-exchange".into(),
                AMQPValue::LongString(SPINUP_DLX.into()),
            );
        }
        if let Err(e) = channel
            .queue_declare(
                queue.as_str().into(),
                QueueDeclareOptions {
                    exclusive: true,
                    auto_delete: true,
                    ..Default::default()
                },
                queue_args,
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

fn tenant_matches(msg_guid: &str, tenant: uuid::Uuid) -> bool {
    uuid::Uuid::parse_str(msg_guid)
        .map(|g| g == tenant)
        .unwrap_or(false)
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

        let guid = svc.state().config.customer_guid;
        if !tenant_matches(&msg.customer_guid, guid) {
            warn!(
                msg_guid = %msg.customer_guid,
                tenant_guid = %guid,
                "Dropping spin-up message for a different tenant"
            );
            let _ = delivery.ack(BasicAckOptions::default()).await;
            continue;
        }

        info!(
            map = %msg.map_name,
            zone = msg.zone_instance_id,
            "Processing spin-up message"
        );

        if let Some(ref agones) = svc.state().agones {
            use crate::agones::AllocationPipeline;
            use crate::repo::InstanceRepo;

            // When annotation stamping is on, read the per-map empty timeout to stamp
            // `empty-shutdown-minutes`. When off (default) pass 0 — skips the DB read and omits the
            // annotation. Read `maps` directly (not via `mapinstances`): the first server of a zone
            // is allocated before its `mapinstances` row exists. A DB error falls back to a
            // conservative value (not the 1-min not-found default) so a blip can't self-shutdown a server.
            let empty_shutdown_minutes = if svc.state().config.reaper.stamp_empty_shutdown_annotation
            {
                let m = match InstanceRepo(&svc.state().db)
                    .get_map_minutes_to_shutdown_after_empty(guid, &msg.map_name)
                    .await
                {
                    Ok(m) => m,
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            map = %msg.map_name,
                            "Failed to read empty-shutdown-minutes; using conservative fallback to avoid premature UE self-shutdown"
                        );
                        crate::repo::FALLBACK_EMPTY_SHUTDOWN_MINUTES_ON_DB_ERROR
                    }
                };
                // Floor by `min_empty_secs` so a map's aggressive 1-min default can't self-shutdown
                // a server under a still-loading player.
                m.max(svc.state().config.reaper.empty_shutdown_minutes_floor())
            } else {
                0 // annotation stamping off: no DB read, no annotation (see allocate.rs)
            };

            let pipeline =
                AllocationPipeline::new(guid, &msg.map_name, &svc.state().db, empty_shutdown_minutes);

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

                    // Retry-once policy keyed on `redelivered` (per-MESSAGE), not `delivery_tag`
                    // (a per-CHANNEL counter — `> 2` would drop any failure once the channel warmed
                    // up, and requeue forever on a cold channel). First failure → requeue; a message
                    // that fails again (redelivered) → reject no-requeue, which dead-letters it to
                    // `ows.serverspinup.dlx` → `rows.spinup.dlq` (declared in `spawn_consumer`, audit
                    // L1) for inspection, instead of silently dropping it.
                    if delivery.redelivered {
                        warn!(zone = msg.zone_instance_id, "Dead-lettering spin-up after one retry (→ rows.spinup.dlq)");
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

        let guid = svc.state().config.customer_guid;
        if !tenant_matches(&msg.customer_guid, guid) {
            warn!(
                msg_guid = %msg.customer_guid,
                tenant_guid = %guid,
                "Dropping shutdown message for a different tenant"
            );
            let _ = delivery.ack(BasicAckOptions::default()).await;
            continue;
        }

        info!(zone = msg.zone_instance_id, "Processing shutdown message");

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
