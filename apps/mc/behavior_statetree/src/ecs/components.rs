//! ECS components for AI-managed entities.

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::tree::node::CooldownState;

/// Marker for entities managed by the AI behavior system.
#[derive(Component, Debug)]
pub struct AiManaged;

/// Marker for AI Skeleton entities specifically. Used by the population
/// manager system to distinguish skeletons from other AI creature types.
#[derive(Component, Debug)]
pub struct AiSkeleton;

/// Marker for online players mirrored from Java's player snapshot.
/// One ECS entity per logged-in player; reconciled each observation tick.
#[derive(Component, Debug)]
pub struct OnlinePlayer {
    pub entity_id: u64,
    pub username: String,
}

/// Position in Minecraft world coordinates.
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct McPosition {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Health component mirroring the Minecraft entity's health.
#[derive(Component, Debug, Clone)]
pub struct McHealth {
    pub current: f32,
    pub max: f32,
}

/// Tracks the monotonic epoch for stale-intent detection.
#[derive(Component, Debug)]
pub struct AiEpoch {
    pub value: u64,
}

impl AiEpoch {
    pub fn next(&mut self) -> u64 {
        self.value += 1;
        self.value
    }
}

/// Cooldown tracker for call-for-help ability.
#[derive(Component, Debug)]
pub struct CallCooldown {
    pub last_call_tick: u64,
    pub cooldown_ticks: u64,
}

impl CallCooldown {
    pub fn new(cooldown_ticks: u64) -> Self {
        Self {
            last_call_tick: 0,
            cooldown_ticks,
        }
    }
}

impl CooldownState for CallCooldown {
    fn can_fire(&self, current_tick: u64) -> bool {
        current_tick.saturating_sub(self.last_call_tick) > self.cooldown_ticks
    }

    fn mark_fired(&mut self, current_tick: u64) {
        self.last_call_tick = current_tick;
    }
}

/// The Minecraft entity ID (mapped from Java side).
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct McEntityId(pub u64);

/// Nearby entity snapshot stored as a component for AI queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NearbyEntity {
    pub entity_id: u64,
    pub entity_type: String,
    pub position: [f64; 3],
    pub health: f32,
    pub is_hostile: bool,
}

/// List of nearby entities visible to this AI entity.
#[derive(Component, Debug, Clone, Default)]
pub struct NearbyEntities {
    pub entities: Vec<NearbyEntity>,
}

/// Current server tick — updated from Java observations.
#[derive(Resource, Debug, Default)]
pub struct ServerTick(pub u64);

/// Global call-for-help cooldown to prevent cascade.
#[derive(Resource, Debug)]
pub struct GlobalCallCooldown {
    pub last_call_tick: u64,
    pub cooldown_ticks: u64,
}

impl Default for GlobalCallCooldown {
    fn default() -> Self {
        Self {
            last_call_tick: 0,
            cooldown_ticks: 400, // 20s
        }
    }
}

impl CooldownState for GlobalCallCooldown {
    fn can_fire(&self, current_tick: u64) -> bool {
        current_tick.saturating_sub(self.last_call_tick) > self.cooldown_ticks
    }

    fn mark_fired(&mut self, current_tick: u64) {
        self.last_call_tick = current_tick;
    }
}

// ---------------------------------------------------------------------------
// Skeleton population config — single source of truth for the spawn/despawn
// policy. Lives in Rust so Java has zero say in "how many skeletons exist".
// ---------------------------------------------------------------------------

/// Tunable parameters for the AI Skeleton population manager system.
#[derive(Resource, Debug)]
pub struct SkeletonPopulationConfig {
    /// Maximum AI Skeletons alive at once (server-wide).
    pub max_skeletons: usize,
    /// Spawn radius around each player (blocks).
    pub spawn_radius: i32,
    /// Skeletons further than this from every player get despawn intents.
    pub despawn_range: f64,
    /// Run the spawn/despawn pass every N ECS ticks (~5s at 100ms ticks).
    pub manage_interval_ticks: u64,
}

impl Default for SkeletonPopulationConfig {
    fn default() -> Self {
        Self {
            max_skeletons: 3,
            spawn_radius: 20,
            despawn_range: 64.0,
            manage_interval_ticks: 50, // 5s at 100ms ECS ticks
        }
    }
}

/// Tracks when the population manager last ran. Resource so the system
/// can self-throttle without an extra timer plugin.
#[derive(Resource, Debug, Default)]
pub struct LastPopulationManagedTick(pub u64);
