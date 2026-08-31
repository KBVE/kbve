//! Observation traits — game-agnostic interfaces that built-in
//! behavior nodes query. Each game implements these on its own
//! observation struct (e.g. `NpcObservation` in MC, `MobSnapshot` in
//! Isometric).

use serde::{Deserialize, Serialize};

/// An entity has a 3D world-space position.
pub trait Positioned {
    /// Returns the entity's position as `[x, y, z]` world coordinates.
    fn position(&self) -> [f64; 3];
}

/// An entity has a health value.
pub trait Healthed {
    /// Current health. May exceed [`Healthed::max_health`] if the game
    /// supports overheal.
    fn current_health(&self) -> f32;

    /// Maximum health.
    fn max_health(&self) -> f32;

    /// Health as a `0.0`–`1.0` fraction.
    ///
    /// # Returns
    ///
    /// `current_health / max_health`, or `0.0` if `max_health` is zero
    /// or negative (avoiding divide-by-zero on dead / placeholder entities).
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
    /// Snapshot of nearby entities the NPC can perceive this tick.
    fn nearby_entities(&self) -> &[EntitySnapshot];
}

/// A tick-based observation. Most game loops have a monotonic tick
/// counter — leaves use this to derandomize wandering and time-gate
/// reactions.
pub trait Ticked {
    /// Returns the current tick.
    fn tick(&self) -> u64;
}

/// Minimal snapshot of a nearby entity — enough for built-in leaves to
/// decide whether to flee, attack, or ignore.
///
/// Games can extend their own snapshot structs with richer data; the
/// built-in nodes only need this surface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntitySnapshot {
    /// Stable per-entity identifier.
    pub entity_id: u64,
    /// Game-specific type tag (e.g. `"zombie"`, `"player"`).
    pub entity_type: String,
    /// World-space position `[x, y, z]`.
    pub position: [f64; 3],
    /// Current health.
    pub health: f32,
    /// Whether this entity is hostile to the observer.
    pub is_hostile: bool,
}

/// Squared distance between two 3D points. Avoids the `sqrt` that
/// distance comparisons don't need.
///
/// # Arguments
///
/// * `a`, `b` — `[x, y, z]` world-space points.
///
/// # Returns
///
/// `(ax - bx)² + (ay - by)² + (az - bz)²`.
pub fn dist_sq(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}
