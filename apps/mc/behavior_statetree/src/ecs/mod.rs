//! Headless Bevy ECS module for AI entity management.
//!
//! Runs inside the Tokio runtime with `MinimalPlugins` — no rendering,
//! no window, no asset loading. Pure ECS logic for NPC state management
//! and behavior tree evaluation.
//!
//! Uses Resource-based message buffers instead of Events for cross-thread
//! communication with the JNI bridge.

pub mod components;
pub mod events;
pub mod systems;

use bevy::prelude::*;

use components::{GlobalCallCooldown, ServerTick};
use events::{IntentBuffer, ObservationBuffer};
use systems::{ingest_observations, plan_behavior};

/// Plugin that registers all AI ECS components, resources, and systems.
pub struct AiBehaviorPlugin;

impl Plugin for AiBehaviorPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ServerTick>()
            .init_resource::<GlobalCallCooldown>()
            .init_resource::<ObservationBuffer>()
            .init_resource::<IntentBuffer>()
            .add_systems(Update, (ingest_observations, plan_behavior).chain());
    }
}
