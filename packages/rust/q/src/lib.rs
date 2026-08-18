#![allow(dead_code)]

#[cfg(all(feature = "client", feature = "server"))]
compile_error!("q: enable either the `client` or `server` feature, not both.");

#[cfg(feature = "client")]
use godot::prelude::*;

#[cfg(feature = "client")]
mod core;
#[cfg(feature = "client")]
mod data;
#[cfg(feature = "client")]
mod entity;
#[cfg(feature = "client")]
mod extensions;
#[cfg(feature = "client")]
mod fx;
#[cfg(feature = "client")]
mod macros;
#[cfg(feature = "client")]
mod manager;
#[cfg(feature = "client")]
mod threads;
#[cfg(feature = "client")]
mod world;

#[cfg(all(
    feature = "client",
    any(target_os = "macos", target_os = "windows", target_os = "linux")
))]
mod platform;

#[cfg(feature = "client")]
struct Q;

#[cfg(feature = "client")]
#[gdextension]
unsafe impl ExtensionLibrary for Q {
    #[cfg(not(target_family = "wasm"))]
    fn on_stage_init(stage: godot::init::InitStage) {
        use crate::threads::runtime::RuntimeManager;
        if stage == godot::init::InitStage::Scene {
            let mut engine = godot::classes::Engine::singleton();
            engine.register_singleton(RuntimeManager::SINGLETON, &RuntimeManager::new_alloc());
        }
    }

    #[cfg(not(target_family = "wasm"))]
    fn on_stage_deinit(stage: godot::init::InitStage) {
        use crate::threads::runtime::RuntimeManager;
        if stage == godot::init::InitStage::Scene {
            let mut engine = godot::classes::Engine::singleton();
            if let Some(singleton) = engine.get_singleton(RuntimeManager::SINGLETON) {
                engine.unregister_singleton(RuntimeManager::SINGLETON);
                singleton.free();
            } else {
                godot_warn!(
                    "Failed to find & free singleton -> {}",
                    RuntimeManager::SINGLETON
                );
            }
        }
    }
}

#[cfg(feature = "proto-shared")]
pub mod proto;

#[cfg(any(feature = "client", feature = "rapier3d-sim"))]
pub mod worldgen;

/// Sinks, drainage and the ground derived from them.
#[cfg(any(feature = "client", feature = "rapier3d-sim"))]
pub mod region;

/// Ground cover: climate over a lattice of regions.
#[cfg(any(feature = "client", feature = "rapier3d-sim"))]
pub mod biome;

/// Drainage basins, and how much ground drains through a place.
#[cfg(any(feature = "client", feature = "rapier3d-sim"))]
pub mod flow;

#[cfg(any(feature = "client", feature = "rapier3d-sim"))]
pub mod harvest;

/// Gait and stance decisions.
pub mod locomotion;

/// What a body has left: health, mana and energy, simulated apart from what draws it.
pub mod vitals;

/// Closed-chain inverse kinematics.
pub mod ik;

/// Creature steering: waypoints, formation, avoidance, stuck recovery.
pub mod steering;

pub mod routine;

#[cfg(any(
    feature = "rapier2d-client",
    feature = "rapier2d-server",
    feature = "rapier3d-sim"
))]
pub mod rapier;

#[cfg(any(
    feature = "net-client",
    feature = "net-server",
    feature = "net-transport",
    feature = "net-session",
    feature = "net-ws"
))]
pub mod net;

#[cfg(feature = "supabase-auth")]
pub mod auth;
