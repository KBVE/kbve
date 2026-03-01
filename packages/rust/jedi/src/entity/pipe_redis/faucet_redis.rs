use fred::{clients::SubscriberClient, prelude::*, types::Message as RedisMessage};
use std::sync::Arc;
use tokio::sync::{broadcast::Sender as BroadcastSender, mpsc::UnboundedReceiver};
use tokio::task::JoinHandle;

use crate::envelope::{EnvelopePipeline, EnvelopeWorkItem, try_unwrap_payload, wrap_hybrid};
use crate::error::JediError;
use crate::pipe_redis::KeyValueInput;
use crate::proto::jedi::{JediEnvelope, MessageKind, PayloadFormat};
use crate::temple::TempleState;

pub async fn create_pubsub_connection_fred(
    config: Config,
) -> Result<(SubscriberClient, UnboundedReceiver<JediEnvelope>), JediError> {
    let subscriber = Builder::from_config(config)
        .build_subscriber_client()
        .map_err(|e| JediError::Internal(format!("Failed to build subscriber: {e}").into()))?;

    subscriber
        .init()
        .await
        .map_err(|e| JediError::Internal(format!("Failed to init subscriber: {e}").into()))?;

    #[allow(clippy::let_underscore_future)]
    let _ = subscriber.manage_subscriptions();

    let mut redis_rx = subscriber.message_rx();
    let (app_tx, app_rx) = tokio::sync::mpsc::unbounded_channel();

    tokio::spawn(async move {
        while let Ok(msg) = redis_rx.recv().await {
            if let Some(env) = parse_pubsub_message_to_envelope(&msg) {
                let _ = app_tx.send(env);
            }
        }
    });

    Ok((subscriber, app_rx))
}

fn parse_pubsub_message_to_envelope(msg: &RedisMessage) -> Option<JediEnvelope> {
    let channel = format!("{}", msg.channel);
    let payload: String = msg.value.clone().convert().ok()?;
    let key = channel.strip_prefix("key:")?.to_owned();

    let env = wrap_hybrid(
        MessageKind::ConfigUpdate,
        PayloadFormat::Json,
        &serde_json::json!({
          "key": key,
          "value": payload,
          "timestamp": chrono::Utc::now().timestamp_millis(),
        }),
        None,
    );

    Some(env)
}

pub fn spawn_pubsub_listener_task(
    mut rx: UnboundedReceiver<JediEnvelope>,
    event_tx: BroadcastSender<JediEnvelope>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(env) = rx.recv().await {
            let kind = env.kind;
            if MessageKind::try_from_valid(kind) {
                tracing::debug!("[Redis] PubSub event received: kind={} (valid)", kind);
            } else {
                tracing::warn!("[Redis] PubSub event received: kind={} (invalid)", kind);
            }

            if let Err(e) = event_tx.send(env.clone()) {
                tracing::warn!("[Redis] Failed to broadcast pubsub event: {}", e);
            }
        }

        tracing::warn!("[Redis] PubSub listener exited");
    })
}

pub fn spawn_watch_event_listener(
    mut rx: UnboundedReceiver<JediEnvelope>,
    client: SubscriberClient,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(env) = rx.recv().await {
            let kind = env.kind;

            if !MessageKind::try_from_valid(kind) {
                tracing::warn!("[Redis] Received invalid MessageKind: {}", kind);
                continue;
            }

            if MessageKind::watch(kind) || MessageKind::unwatch(kind) {
                let payload = try_unwrap_payload::<KeyValueInput>(&env);

                let key = match payload {
                    Ok(kv) => kv.key,
                    Err(e) => {
                        tracing::warn!("[Redis] Failed to parse watch/unwatch payload: {}", e);
                        continue;
                    }
                };

                let channel = format!("key:{}", key);
                let result = if MessageKind::watch(kind) {
                    tracing::info!("[Redis] Subscribing to {}", channel);
                    client.subscribe(channel).await
                } else {
                    tracing::info!("[Redis] Unsubscribing from {}", channel);
                    client.unsubscribe(channel).await
                };

                if let Err(e) = result {
                    tracing::warn!("[Redis] Failed to process watch/unwatch: {}", e);
                }
            } else {
                tracing::debug!(
                    "[Redis] Ignored non-watch envelope in watch listener: kind={:?}",
                    kind
                );
            }
        }

        tracing::warn!("[Redis] WatchEvent listener exiting");
    })
}

pub fn spawn_redis_worker(
    ctx: Arc<TempleState>,
    mut rx: tokio::sync::mpsc::Receiver<EnvelopeWorkItem>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("[RedisWorker] Spawned");

        while let Some(EnvelopeWorkItem {
            envelope,
            response_tx,
        }) = rx.recv().await
        {
            let result = envelope.process(&ctx).await;

            if let Some(tx) = response_tx {
                let _ = tx.send(match result {
                    Ok(env) => env,
                    Err(e) => JediEnvelope::error("RedisWorker", &e.to_string()),
                });
            }
        }

        tracing::warn!("[RedisWorker] Redis worker exiting");
    })
}
