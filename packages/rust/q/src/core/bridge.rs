use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};

use crossbeam_channel::{Receiver, Sender, unbounded};
use godot::prelude::*;
use serde_json::Value;

use crate::core::actor::Actor;
use crate::core::ecs::EntityStore;
use crate::core::event::{GameEvent, GameRequest};

struct Channels {
    req_tx: Sender<GameRequest>,
    evt_rx: Receiver<GameEvent>,
    entity_store: Arc<EntityStore>,
    shutdown_flag: Arc<AtomicBool>,
}

static CHANNELS: LazyLock<Channels> = LazyLock::new(|| {
    let (req_tx, req_rx) = unbounded();
    let (evt_tx, evt_rx) = unbounded();
    let entity_store = Arc::new(EntityStore::new());
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    Actor::spawn(entity_store.clone(), req_rx, evt_tx, shutdown_flag.clone());
    Channels {
        req_tx,
        evt_rx,
        entity_store,
        shutdown_flag,
    }
});

#[derive(GodotClass)]
#[class(base = Node)]
pub struct EventBridge {
    base: Base<Node>,
}

#[godot_api]
impl INode for EventBridge {
    fn init(base: Base<Node>) -> Self {
        let _ = &*CHANNELS;
        Self { base }
    }

    fn process(&mut self, _delta: f64) {
        while let Ok(event) = CHANNELS.evt_rx.try_recv() {
            self.emit_event(event);
        }
    }
}

#[godot_api]
impl EventBridge {
    #[signal]
    fn entity_spawned(id: GString, x: f32, y: f32);

    #[signal]
    fn entity_despawned(id: GString);

    #[signal]
    fn position_updated(id: GString, x: f32, y: f32);

    #[signal]
    fn custom_event(event_type: GString, payload: GString);

    #[signal]
    fn error_event(message: GString);

    #[func]
    pub fn send_request(&self, request_type: GString, payload: GString) {
        let request_str = request_type.to_string();
        let payload_str = payload.to_string();
        let request = if let Ok(json) = serde_json::from_str::<Value>(&payload_str) {
            Self::parse_json_request(&request_str, &json, &payload_str)
        } else {
            Self::parse_csv_request(&request_str, &payload_str)
        };
        let _ = CHANNELS.req_tx.send(request);
    }

    fn parse_json_request(request_type: &str, json: &Value, raw: &str) -> GameRequest {
        match request_type {
            "spawn_entity" => {
                let x = json["x"].as_f64().map(|v| v as f32);
                let y = json["y"].as_f64().map(|v| v as f32);
                if let (Some(x), Some(y)) = (x, y) {
                    GameRequest::SpawnEntity { x, y }
                } else {
                    GameRequest::Custom(request_type.to_string(), raw.to_string())
                }
            }
            "despawn_entity" => {
                let id = json["id"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| raw.to_string());
                GameRequest::DespawnEntity { id }
            }
            "update_position" => {
                let id = json["id"].as_str().map(|s| s.to_string());
                let x = json["x"].as_f64().map(|v| v as f32);
                let y = json["y"].as_f64().map(|v| v as f32);
                if let (Some(id), Some(x), Some(y)) = (id, x, y) {
                    GameRequest::UpdatePosition { id, x, y }
                } else {
                    GameRequest::Custom(request_type.to_string(), raw.to_string())
                }
            }
            "shutdown" => GameRequest::Shutdown,
            _ => GameRequest::Custom(request_type.to_string(), raw.to_string()),
        }
    }

    fn parse_csv_request(request_type: &str, payload: &str) -> GameRequest {
        match request_type {
            "spawn_entity" => {
                let parts: Vec<&str> = payload.split(',').collect();
                if parts.len() == 2 {
                    if let (Ok(x), Ok(y)) = (parts[0].trim().parse(), parts[1].trim().parse()) {
                        return GameRequest::SpawnEntity { x, y };
                    }
                }
                GameRequest::Custom(request_type.to_string(), payload.to_string())
            }
            "despawn_entity" => GameRequest::DespawnEntity {
                id: payload.to_string(),
            },
            "update_position" => {
                let parts: Vec<&str> = payload.split(',').collect();
                if parts.len() == 3 {
                    if let (Ok(x), Ok(y)) = (parts[1].trim().parse(), parts[2].trim().parse()) {
                        return GameRequest::UpdatePosition {
                            id: parts[0].trim().to_string(),
                            x,
                            y,
                        };
                    }
                }
                GameRequest::Custom(request_type.to_string(), payload.to_string())
            }
            "shutdown" => GameRequest::Shutdown,
            _ => GameRequest::Custom(request_type.to_string(), payload.to_string()),
        }
    }

    #[func]
    pub fn get_entity_count(&self) -> i64 {
        CHANNELS.entity_store.entity_count() as i64
    }

    #[func]
    pub fn shutdown(&self) {
        CHANNELS.shutdown_flag.store(true, Ordering::Relaxed);
        let _ = CHANNELS.req_tx.send(GameRequest::Shutdown);
    }

    fn emit_event(&mut self, event: GameEvent) {
        match event {
            GameEvent::EntitySpawned { id, x, y } => {
                self.base_mut().emit_signal(
                    "entity_spawned",
                    &[
                        GString::from(&id).to_variant(),
                        x.to_variant(),
                        y.to_variant(),
                    ],
                );
            }
            GameEvent::EntityDespawned { id } => {
                self.base_mut()
                    .emit_signal("entity_despawned", &[GString::from(&id).to_variant()]);
            }
            GameEvent::PositionUpdated { id, x, y } => {
                self.base_mut().emit_signal(
                    "position_updated",
                    &[
                        GString::from(&id).to_variant(),
                        x.to_variant(),
                        y.to_variant(),
                    ],
                );
            }
            GameEvent::Custom(event_type, payload) => {
                self.base_mut().emit_signal(
                    "custom_event",
                    &[
                        GString::from(&event_type).to_variant(),
                        GString::from(&payload).to_variant(),
                    ],
                );
            }
            GameEvent::Error(message) => {
                self.base_mut()
                    .emit_signal("error_event", &[GString::from(&message).to_variant()]);
            }
        }
    }
}
