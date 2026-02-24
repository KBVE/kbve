use dashmap::DashMap;
use serde::{Deserialize, Serialize};

pub type EntityId = u64;

/// Generate a new unique EntityId via a monotonic atomic counter.
/// No external RNG dependency — safe on all platforms including WASM.
fn new_entity_id() -> EntityId {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

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
        let id = new_entity_id();
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

    pub fn all_entity_ids(&self) -> Vec<EntityId> {
        self.transforms.iter().map(|entry| *entry.key()).collect()
    }

    pub fn entities_with_state(&self, mask: u32) -> Vec<EntityId> {
        self.states
            .iter()
            .filter(|entry| *entry.value() & mask != 0)
            .map(|entry| *entry.key())
            .collect()
    }

    pub fn get_all_transforms(&self) -> Vec<(EntityId, Transform)> {
        self.transforms
            .iter()
            .map(|entry| (*entry.key(), entry.value().clone()))
            .collect()
    }

    pub fn despawn_all(&self) {
        self.transforms.clear();
        self.stats.clear();
        self.states.clear();
    }
}

impl Default for EntityStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_transform(x: f32, y: f32) -> Transform {
        Transform { q: 0, r: 0, x, y }
    }

    fn test_stats() -> EntityStats {
        EntityStats {
            hp: 100.0,
            max_hp: 100.0,
            attack: 10.0,
            defense: 5.0,
            speed: 1.0,
        }
    }

    #[test]
    fn spawn_and_count() {
        let store = EntityStore::new();
        assert_eq!(store.entity_count(), 0);

        store.spawn(test_transform(1.0, 2.0), test_stats());
        assert_eq!(store.entity_count(), 1);

        store.spawn(test_transform(3.0, 4.0), test_stats());
        assert_eq!(store.entity_count(), 2);
    }

    #[test]
    fn despawn_removes_all_components() {
        let store = EntityStore::new();
        let id = store.spawn(test_transform(1.0, 2.0), test_stats());
        store.set_state(&id, 42);

        assert!(store.get_transform(&id).is_some());
        assert!(store.get_stats(&id).is_some());
        assert!(store.get_state(&id).is_some());

        store.despawn(&id);

        assert!(store.get_transform(&id).is_none());
        assert!(store.get_stats(&id).is_none());
        assert!(store.get_state(&id).is_none());
        assert_eq!(store.entity_count(), 0);
    }

    #[test]
    fn update_transform_preserves_entity() {
        let store = EntityStore::new();
        let id = store.spawn(test_transform(1.0, 2.0), test_stats());

        let new_transform = Transform {
            q: 5,
            r: 10,
            x: 99.0,
            y: 88.0,
        };
        store.update_transform(&id, new_transform);

        let t = store.get_transform(&id).unwrap();
        assert_eq!(t.q, 5);
        assert_eq!(t.r, 10);
        assert_eq!(t.x, 99.0);
        assert_eq!(t.y, 88.0);
        assert_eq!(store.entity_count(), 1);
    }

    #[test]
    fn update_stats() {
        let store = EntityStore::new();
        let id = store.spawn(test_transform(0.0, 0.0), test_stats());

        let new_stats = EntityStats {
            hp: 50.0,
            max_hp: 200.0,
            attack: 25.0,
            defense: 15.0,
            speed: 3.0,
        };
        store.update_stats(&id, new_stats);

        let s = store.get_stats(&id).unwrap();
        assert_eq!(s.hp, 50.0);
        assert_eq!(s.max_hp, 200.0);
        assert_eq!(s.attack, 25.0);
    }

    #[test]
    fn state_management() {
        let store = EntityStore::new();
        let id = store.spawn(test_transform(0.0, 0.0), test_stats());

        assert_eq!(store.get_state(&id), Some(0));

        store.set_state(&id, 0b00000101);
        assert_eq!(store.get_state(&id), Some(0b00000101));
    }

    #[test]
    fn entities_in_range_filters_correctly() {
        let store = EntityStore::new();

        let t_in = Transform {
            q: 5,
            r: 5,
            x: 0.0,
            y: 0.0,
        };
        let t_out = Transform {
            q: 100,
            r: 100,
            x: 0.0,
            y: 0.0,
        };

        let id_in = store.spawn(t_in, test_stats());
        let _id_out = store.spawn(t_out, test_stats());

        let results = store.entities_in_range((5, 5), 2);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], id_in);
    }

    #[test]
    fn all_entity_ids() {
        let store = EntityStore::new();
        let id1 = store.spawn(test_transform(0.0, 0.0), test_stats());
        let id2 = store.spawn(test_transform(1.0, 1.0), test_stats());

        let ids = store.all_entity_ids();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&id1));
        assert!(ids.contains(&id2));
    }

    #[test]
    fn default_impl() {
        let store = EntityStore::default();
        assert_eq!(store.entity_count(), 0);
    }

    #[test]
    fn transform_serde_roundtrip() {
        let t = Transform {
            q: 3,
            r: 7,
            x: 1.5,
            y: 2.5,
        };
        let json = serde_json::to_string(&t).unwrap();
        let t2: Transform = serde_json::from_str(&json).unwrap();
        assert_eq!(t.q, t2.q);
        assert_eq!(t.r, t2.r);
        assert_eq!(t.x, t2.x);
        assert_eq!(t.y, t2.y);
    }

    #[test]
    fn entities_with_state_filters_by_mask() {
        let store = EntityStore::new();
        let id1 = store.spawn(test_transform(0.0, 0.0), test_stats());
        let id2 = store.spawn(test_transform(1.0, 1.0), test_stats());
        let id3 = store.spawn(test_transform(2.0, 2.0), test_stats());

        store.set_state(&id1, 0b0001);
        store.set_state(&id2, 0b0010);
        store.set_state(&id3, 0b0011);

        let matching = store.entities_with_state(0b0001);
        assert_eq!(matching.len(), 2);
        assert!(matching.contains(&id1));
        assert!(matching.contains(&id3));
    }

    #[test]
    fn get_all_transforms_returns_snapshot() {
        let store = EntityStore::new();
        store.spawn(
            Transform {
                q: 1,
                r: 2,
                x: 3.0,
                y: 4.0,
            },
            test_stats(),
        );
        store.spawn(
            Transform {
                q: 5,
                r: 6,
                x: 7.0,
                y: 8.0,
            },
            test_stats(),
        );

        let all = store.get_all_transforms();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn despawn_all_clears_everything() {
        let store = EntityStore::new();
        let id1 = store.spawn(test_transform(0.0, 0.0), test_stats());
        let id2 = store.spawn(test_transform(1.0, 1.0), test_stats());
        store.set_state(&id1, 42);
        store.set_state(&id2, 99);

        assert_eq!(store.entity_count(), 2);

        store.despawn_all();

        assert_eq!(store.entity_count(), 0);
        assert!(store.get_transform(&id1).is_none());
        assert!(store.get_stats(&id2).is_none());
        assert!(store.get_state(&id1).is_none());
    }

    #[test]
    fn entity_stats_serde_roundtrip() {
        let s = EntityStats {
            hp: 75.0,
            max_hp: 100.0,
            attack: 12.0,
            defense: 8.0,
            speed: 2.5,
        };
        let json = serde_json::to_string(&s).unwrap();
        let s2: EntityStats = serde_json::from_str(&json).unwrap();
        assert_eq!(s.hp, s2.hp);
        assert_eq!(s.speed, s2.speed);
    }
}
