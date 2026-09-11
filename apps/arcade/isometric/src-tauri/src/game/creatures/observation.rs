//! Behavior tree observation adapter for Isometric creatures.
//!
//! Snapshots the creature state the shared `bevy_behavior` built-in leaves
//! need (position, health, nearby entities, tick) into a struct that
//! implements the `Positioned` / `Healthed` / `Aware` / `Ticked` traits.
//!
//! This is the foundation layer — later PRs will build Isometric-specific
//! trees on top and dispatch them alongside (or replacing) the existing
//! `BehaviorNode` enum in `creatures/generic/behavior.rs`.

use bevy::prelude::Vec3;
use bevy_behavior::{Aware, EntitySnapshot, Healthed, Positioned, Ticked};

/// Creature observation snapshot — assembled from `Creature`, `CreatureVitals`,
/// and world queries at decision time. Short-lived (one tree eval per entity
/// per decision tick); do not store.
pub struct CreatureObservation {
    pub position: Vec3,
    pub health: f32,
    pub max_health: f32,
    pub tick: u64,
    pub nearby: Vec<EntitySnapshot>,
}

impl Positioned for CreatureObservation {
    fn position(&self) -> [f64; 3] {
        [
            self.position.x as f64,
            self.position.y as f64,
            self.position.z as f64,
        ]
    }
}

impl Healthed for CreatureObservation {
    fn current_health(&self) -> f32 {
        self.health
    }
    fn max_health(&self) -> f32 {
        self.max_health
    }
}

impl Aware for CreatureObservation {
    fn nearby_entities(&self) -> &[EntitySnapshot] {
        &self.nearby
    }
}

impl Ticked for CreatureObservation {
    fn tick(&self) -> u64 {
        self.tick
    }
}
