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

use components::{
    CurrentBlockGrid, DetectedFlowGates, FleeFlowField, FlowFieldRebuildInterval,
    FlowFieldRebuildTick, GlobalCallCooldown, LastPetDogManagedTick, LastPetParrotManagedTick,
    LastPopulationManagedTick, PetDogPopulationConfig, PetParrotPopulationConfig, PlayerFlowFields,
    ServerTick, SkeletonPopulationConfig,
};
use events::{
    IntentBuffer, MapDataBuffer, ObservationBuffer, PlayerObservationBuffer, WorldIntentBuffer,
};
use systems::{
    ingest_map_data, ingest_observations, ingest_player_snapshots, manage_pet_dog_population,
    manage_pet_parrot_population, manage_skeleton_population, plan_behavior, plan_pet_dog_behavior,
    plan_pet_parrot_behavior, rebuild_flow_fields,
};

/// Plugin that registers all AI ECS components, resources, and systems.
pub struct AiBehaviorPlugin;

impl Plugin for AiBehaviorPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ServerTick>()
            .init_resource::<GlobalCallCooldown>()
            .init_resource::<ObservationBuffer>()
            .init_resource::<PlayerObservationBuffer>()
            .init_resource::<MapDataBuffer>()
            .init_resource::<IntentBuffer>()
            .init_resource::<WorldIntentBuffer>()
            // Flow field / pathfinding resources
            .init_resource::<CurrentBlockGrid>()
            .init_resource::<PlayerFlowFields>()
            .init_resource::<FleeFlowField>()
            .init_resource::<DetectedFlowGates>()
            .init_resource::<FlowFieldRebuildTick>()
            .init_resource::<FlowFieldRebuildInterval>()
            .init_resource::<SkeletonPopulationConfig>()
            .init_resource::<LastPopulationManagedTick>()
            .init_resource::<PetDogPopulationConfig>()
            .init_resource::<LastPetDogManagedTick>()
            .init_resource::<PetParrotPopulationConfig>()
            .init_resource::<LastPetParrotManagedTick>()
            .add_systems(
                Update,
                (
                    ingest_player_snapshots,
                    ingest_observations,
                    ingest_map_data,
                    rebuild_flow_fields,
                    plan_behavior,
                    plan_pet_dog_behavior,
                    plan_pet_parrot_behavior,
                    manage_skeleton_population,
                    manage_pet_dog_population,
                    manage_pet_parrot_population,
                )
                    .chain(),
            );
    }
}
