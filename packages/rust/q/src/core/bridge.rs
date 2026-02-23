use std::sync::{Arc, LazyLock};

use crossbeam_channel::{Receiver, Sender, unbounded};
use godot::prelude::*;

use crate::core::actor::Actor;
use crate::core::ecs::EntityStore;
use crate::core::event::{GameEvent, GameRequest};

struct Channels {
    req_tx: Sender<GameRequest>,
    evt_rx: Receiver<GameEvent>,
    entity_store: Arc<EntityStore>,
}

static CHANNELS: LazyLock<Channels> = LazyLock::new(|| {
    let (req_tx, req_rx) = unbounded();
    let (evt_tx, evt_rx) = unbounded();
    let entity_store = Arc::new(EntityStore::new());
    Actor::spawn(entity_store.clone(), req_rx, evt_tx);
    Channels {
        req_tx,
        evt_rx,
        entity_store,
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
        let request = match request_str.as_str() {
            "spawn_entity" => {
                let parts: Vec<&str> = payload_str.split(',').collect();
                if parts.len() == 2 {
                    if let (Ok(x), Ok(y)) = (parts[0].trim().parse(), parts[1].trim().parse()) {
                        GameRequest::SpawnEntity { x, y }
                    } else {
                        GameRequest::Custom(request_str.clone(), payload_str)
                    }
                } else {
                    GameRequest::Custom(request_str.clone(), payload_str)
                }
            }
            "despawn_entity" => GameRequest::DespawnEntity { id: payload_str },
            _ => GameRequest::Custom(request_str, payload_str),
        };
        let _ = CHANNELS.req_tx.send(request);
    }

    #[func]
    pub fn get_entity_count(&self) -> i64 {
        CHANNELS.entity_store.entity_count() as i64
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
