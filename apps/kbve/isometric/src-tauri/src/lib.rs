use std::sync::atomic::AtomicUsize;

/// Shared FPS counter — written by desktop runner, readable on all targets.
pub static AVERAGE_FRAME_RATE: AtomicUsize = AtomicUsize::new(0);

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

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Info).expect("logger");

    use bevy::prelude::*;
    use bevy_rapier3d::prelude::*;
    use game::GamePluginGroup;

    bevy::app::App::new()
        .insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)))
        .add_plugins(DefaultPlugins.set(bevy::window::WindowPlugin {
            primary_window: Some(bevy::window::Window {
                title: "KBVE Isometric".to_string(),
                canvas: Some("#bevy-canvas".to_string()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: true,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default())
        .add_plugins(bevy::picking::mesh_picking::MeshPickingPlugin)
        .add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
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
