#![cfg_attr(target_arch = "wasm32", feature(thread_local))]

use std::sync::atomic::AtomicUsize;

/// Shared FPS counter — written by desktop runner, readable on all targets.
pub static AVERAGE_FRAME_RATE: AtomicUsize = AtomicUsize::new(0);

// Force wasm-ld to emit __wasm_init_tls for wasm-bindgen threading support.
// The TLS variable must be genuinely used to prevent LLVM from eliminating it.
#[cfg(target_arch = "wasm32")]
#[thread_local]
static TLS_ANCHOR: core::cell::Cell<u32> = core::cell::Cell::new(0);

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn force_tls_anchor() -> u32 {
    TLS_ANCHOR.set(TLS_ANCHOR.get().wrapping_add(1));
    TLS_ANCHOR.get()
}

pub mod commands;
pub mod game;

#[cfg(not(target_arch = "wasm32"))]
pub mod renderer;
#[cfg(not(target_arch = "wasm32"))]
pub mod tauri_plugin;

// ---------------------------------------------------------------------------
// WASM entry point
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

// Re-export worker entry point so wasm-bindgen exposes it in the WASM module.
// Web workers call this after instantiating the shared WASM module.
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use bevy_tasker::worker_count;
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use bevy_tasker::worker_entry_point;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Info).expect("logger");

    // Touch TLS anchor to ensure wasm-ld emits __wasm_init_tls
    force_tls_anchor();

    use avian3d::prelude::*;
    use bevy::prelude::*;
    use game::GamePluginGroup;

    bevy::app::App::new()
        .insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)))
        .add_plugins(
            DefaultPlugins
                .set(bevy::window::WindowPlugin {
                    primary_window: Some(bevy::window::Window {
                        title: "KBVE Isometric".to_string(),
                        canvas: Some("#bevy-canvas".to_string()),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                })
                .set(bevy::asset::AssetPlugin {
                    file_path: "/isometric/assets".to_string(),
                    meta_check: bevy::asset::AssetMetaCheck::Never,
                    ..default()
                }),
        )
        .add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default())
        .add_plugins(bevy::picking::mesh_picking::MeshPickingPlugin)
        .add_plugins(PhysicsPlugins::default())
        .add_plugins(GamePluginGroup)
        .add_systems(Update, update_fps_counter)
        .run();
}

#[cfg(target_arch = "wasm32")]
fn update_fps_counter(diagnostics: bevy::prelude::Res<bevy::diagnostic::DiagnosticsStore>) {
    use bevy::diagnostic::FrameTimeDiagnosticsPlugin;
    if let Some(fps) = diagnostics.get(&FrameTimeDiagnosticsPlugin::FPS) {
        if let Some(avg) = fps.smoothed() {
            AVERAGE_FRAME_RATE.store(avg as usize, std::sync::atomic::Ordering::Relaxed);
        }
    }
}
