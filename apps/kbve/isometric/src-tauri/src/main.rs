// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use bevy::prelude::*;
use bevy_rapier3d::prelude::*;

use isometric_game::game::GamePluginGroup;
use isometric_game::game::input_bridge::InputBridgePlugin;
use isometric_game::tauri_plugin::TauriPlugin;

fn main() {
    let mut app = App::new();

    app.insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)));

    // --- Non-rendering core plugins (registered upfront) ---
    // WinitPlugin is skipped — Tauri manages the OS window.
    app.add_plugins((
        bevy::app::PanicHandlerPlugin::default(),
        bevy::app::TaskPoolPlugin::default(),
        bevy::diagnostic::FrameCountPlugin,
        bevy::time::TimePlugin,
        bevy::transform::TransformPlugin,
        bevy::diagnostic::DiagnosticsPlugin,
        bevy::input::InputPlugin,
        bevy::asset::AssetPlugin::default(),
        bevy::state::app::StatesPlugin,
    ));

    // Window entity (Bevy tracks it; actual OS window is Tauri's)
    app.add_plugins(bevy::window::WindowPlugin {
        primary_window: Some(bevy::window::Window {
            title: "KBVE Isometric".to_string(),
            resolution: bevy::window::WindowResolution::new(1024, 768),
            ..default()
        }),
        ..default()
    });

    // Tauri (builds app, sets custom runner, defers render plugins to Ready event)
    app.add_plugins(TauriPlugin::new(|builder| {
        builder
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                isometric_game::commands::get_fps,
                isometric_game::commands::get_player_state,
                isometric_game::commands::get_object_registry,
                isometric_game::commands::on_input_frame,
                isometric_game::commands::greet,
            ])
    }));

    // Physics (no render dependency)
    app.add_plugins(RapierPhysicsPlugin::<NoUserData>::default());

    // Game plugins (Startup systems run on first update after Ready handler
    // adds render plugins, so Assets<Mesh>/Assets<StandardMaterial> exist by then)
    app.add_plugins(GamePluginGroup);

    // Input bridge: forwards keyboard/mouse from webview JS to Bevy messages
    // (desktop-only, not needed for WASM which has WinitPlugin)
    app.add_plugins(InputBridgePlugin);

    app.run();
}
