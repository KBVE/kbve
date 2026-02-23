use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

pub type EntityId = Ulid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transform {
    pub q: i32,
    pub r: i32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntityStats {
    pub hp: f32,
    pub max_hp: f32,
    pub attack: f32,
    pub defense: f32,
    pub speed: f32,
}

pub struct EntityStore {
    transforms: DashMap<EntityId, Transform>,
    stats: DashMap<EntityId, EntityStats>,
    states: DashMap<EntityId, u32>,
}

impl EntityStore {
    pub fn new() -> Self {
        Self {
            transforms: DashMap::new(),
            stats: DashMap::new(),
            states: DashMap::new(),
        }
    }

    pub fn spawn(&self, transform: Transform, stats: EntityStats) -> EntityId {
        let id = Ulid::new();
        self.transforms.insert(id, transform);
        self.stats.insert(id, stats);
        self.states.insert(id, 0);
        id
    }

    pub fn despawn(&self, id: &EntityId) {
        self.transforms.remove(id);
        self.stats.remove(id);
        self.states.remove(id);
    }

    pub fn get_transform(&self, id: &EntityId) -> Option<Transform> {
        self.transforms.get(id).map(|r| r.value().clone())
    }

    pub fn get_stats(&self, id: &EntityId) -> Option<EntityStats> {
        self.stats.get(id).map(|r| r.value().clone())
    }

    pub fn update_transform(&self, id: &EntityId, transform: Transform) {
        self.transforms.insert(*id, transform);
    }

    pub fn update_stats(&self, id: &EntityId, stats: EntityStats) {
        self.stats.insert(*id, stats);
    }

    pub fn set_state(&self, id: &EntityId, state: u32) {
        self.states.insert(*id, state);
    }

    pub fn get_state(&self, id: &EntityId) -> Option<u32> {
        self.states.get(id).map(|r| *r.value())
    }

    pub fn entity_count(&self) -> usize {
        self.transforms.len()
    }

    pub fn entities_in_range(&self, center: (i32, i32), radius: i32) -> Vec<EntityId> {
        self.transforms
            .iter()
            .filter(|entry| {
                let t = entry.value();
                let dq = (t.q - center.0).abs();
                let dr = (t.r - center.1).abs();
                dq <= radius && dr <= radius
            })
            .map(|entry| *entry.key())
            .collect()
    }
}
