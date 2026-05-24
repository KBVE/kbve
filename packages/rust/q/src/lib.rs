#![allow(dead_code)]

#[cfg(all(feature = "client", feature = "server"))]
compile_error!("q: enable either the `client` or `server` feature, not both.");

// -----------------------------------------------------------------------------
// Client flavor (Godot GDExtension)
// -----------------------------------------------------------------------------
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
mod macros;
#[cfg(feature = "client")]
mod manager;
#[cfg(feature = "client")]
mod threads;

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
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn on_stage_init(stage: godot::init::InitStage) {
        use crate::threads::runtime::RuntimeManager;
        if stage == godot::init::InitStage::Scene {
            let mut engine = godot::classes::Engine::singleton();
            engine.register_singleton(RuntimeManager::SINGLETON, &RuntimeManager::new_alloc());
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
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

// -----------------------------------------------------------------------------
// Cross-cutting modules — gated by their own features.
// -----------------------------------------------------------------------------
#[cfg(feature = "proto-shared")]
pub mod proto;

#[cfg(any(feature = "rapier2d-client", feature = "rapier2d-server"))]
pub mod rapier;

#[cfg(any(feature = "net-client", feature = "net-server"))]
pub mod net;

#[cfg(feature = "supabase-auth")]
pub mod auth;

#[cfg(feature = "nexus-defense")]
pub mod nexus_defense;

#[cfg(feature = "nexus-defense-server")]
pub mod nexus_defense_server;
