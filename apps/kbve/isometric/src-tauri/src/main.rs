// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod game;
mod renderer;
mod tauri_plugin;

use bevy::prelude::*;
use bevy_rapier3d::prelude::*;
use tauri_plugin::TauriPlugin;

use game::camera::IsometricCameraPlugin;
use game::input_bridge::InputBridgePlugin;
use game::object_registry::ObjectRegistryPlugin;
use game::player::PlayerPlugin;
use game::scene_objects::SceneObjectsPlugin;
use game::state::GameStatePlugin;
use game::terrain::TerrainPlugin;
use game::tilemap::TilemapPlugin;

fn main() {
    let mut app = App::new();

    app.insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)));

    // --- Non-rendering core plugins (registered upfront) ---
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
                commands::get_fps,
                commands::get_player_state,
                commands::get_object_registry,
                commands::on_input_frame,
                commands::greet,
            ])
    }));

    // Physics (no render dependency)
    app.add_plugins(RapierPhysicsPlugin::<NoUserData>::default());

    // Game plugins (Startup systems run on first update after Ready handler
    // adds render plugins, so Assets<Mesh>/Assets<StandardMaterial> exist by then)
    app.add_plugins((
        GameStatePlugin,
        TerrainPlugin,
        IsometricCameraPlugin,
        TilemapPlugin,
        PlayerPlugin,
        ObjectRegistryPlugin,
        SceneObjectsPlugin,
        InputBridgePlugin,
        // PixelatePlugin + RapierDebugRenderPlugin are added by TauriPlugin
        // after render init (they need RenderApp)
    ));

    app.run();
}
