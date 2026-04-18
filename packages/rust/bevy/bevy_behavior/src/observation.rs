//! Observation traits — game-agnostic interfaces that built-in behavior
//! nodes query. Each game implements these on its own observation struct
//! (e.g. `NpcObservation` in MC, `MobSnapshot` in Isometric).

use serde::{Deserialize, Serialize};

/// An entity has a 3D position.
pub trait Positioned {
    fn position(&self) -> [f64; 3];
}

/// An entity has a health value.
pub trait Healthed {
    fn current_health(&self) -> f32;
    fn max_health(&self) -> f32;

    /// Health as a 0.0–1.0 fraction.
    fn health_fraction(&self) -> f32 {
        let max = self.max_health();
        if max <= 0.0 {
            return 0.0;
        }
        self.current_health() / max
    }
}

/// An entity is aware of nearby entities.
pub trait Aware {
    fn nearby_entities(&self) -> &[EntitySnapshot];
}

/// A tick-based observation (most game loops have a monotonic tick counter).
pub trait Ticked {
    fn tick(&self) -> u64;
}

/// Minimal snapshot of a nearby entity — enough for built-in leaves to decide
/// whether to flee, attack, or ignore. Games can extend their own snapshot
/// structs with richer data; the built-in nodes only need this.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntitySnapshot {
    pub entity_id: u64,
    pub entity_type: String,
    pub position: [f64; 3],
    pub health: f32,
    pub is_hostile: bool,
}

/// Squared distance between two 3D points (avoids sqrt for comparisons).
pub fn dist_sq(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}
