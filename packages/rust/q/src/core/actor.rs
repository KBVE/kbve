use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crossbeam_channel::{Receiver, Sender};

use crate::core::ecs::{EntityId, EntityStats, EntityStore, Transform};
use crate::core::event::{GameEvent, GameRequest};

pub struct Actor {
    entity_store: Arc<EntityStore>,
    request_rx: Receiver<GameRequest>,
    event_tx: Sender<GameEvent>,
}

impl Actor {
    pub fn spawn(
        entity_store: Arc<EntityStore>,
        request_rx: Receiver<GameRequest>,
        event_tx: Sender<GameEvent>,
        shutdown_flag: Arc<AtomicBool>,
    ) -> JoinHandle<()> {
        thread::Builder::new()
            .name("game-actor".into())
            .spawn(move || {
                let actor = Actor {
                    entity_store,
                    request_rx,
                    event_tx,
                };
                while !shutdown_flag.load(Ordering::Relaxed) {
                    if actor.tick() {
                        break;
                    }
                    thread::sleep(Duration::from_millis(16));
                }
            })
            .expect("Failed to spawn actor thread")
    }

    /// Returns true if the actor should shut down.
    fn tick(&self) -> bool {
        while let Ok(request) = self.request_rx.try_recv() {
            if matches!(request, GameRequest::Shutdown) {
                return true;
            }
            self.handle_request(request);
        }
        false
    }

    fn handle_request(&self, request: GameRequest) {
        match request {
            GameRequest::SpawnEntity { x, y } => {
                let transform = Transform { q: 0, r: 0, x, y };
                let stats = EntityStats {
                    hp: 100.0,
                    max_hp: 100.0,
                    attack: 10.0,
                    defense: 5.0,
                    speed: 1.0,
                };
                let id = self.entity_store.spawn(transform, stats);
                let _ = self.event_tx.send(GameEvent::EntitySpawned {
                    id: id.to_string(),
                    x,
                    y,
                });
            }
            GameRequest::DespawnEntity { id } => {
                if let Ok(eid) = id.parse::<EntityId>() {
                    self.entity_store.despawn(&eid);
                    let _ = self.event_tx.send(GameEvent::EntityDespawned { id });
                }
            }
            GameRequest::UpdatePosition { id, x, y } => {
                if let Ok(eid) = id.parse::<EntityId>() {
                    let (q, r) = self
                        .entity_store
                        .get_transform(&eid)
                        .map(|t| (t.q, t.r))
                        .unwrap_or((0, 0));
                    let transform = Transform { q, r, x, y };
                    self.entity_store.update_transform(&eid, transform);
                    let _ = self.event_tx.send(GameEvent::PositionUpdated { id, x, y });
                }
            }
            GameRequest::Custom(event_type, payload) => {
                let _ = self.event_tx.send(GameEvent::Custom(event_type, payload));
            }
            GameRequest::Shutdown => {}
        }
    }
}
