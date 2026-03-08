// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use bevy::DefaultPlugins;
use bevy::app::App;
use bevy::picking::mesh_picking::MeshPickingPlugin;
use bevy::prelude::*;
use bevy_rapier3d::prelude::*;

use isometric_game::game::GamePluginGroup;
use isometric_game::tauri_plugin::TauriPlugin;

fn main() {
    let mut app = App::new();

    app.insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)));

    // Tauri runs alongside Bevy for IPC (FPS, player state, etc.)
    // The custom runner interleaves Tauri event processing with Bevy updates.
    app.add_plugins(TauriPlugin::new(|builder| {
        builder
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                isometric_game::commands::get_fps,
                isometric_game::commands::get_player_state,
                isometric_game::commands::get_object_registry,
                isometric_game::commands::greet,
            ])
    }));

    // Bevy renders to its own window via DefaultPlugins
    app.add_plugins(DefaultPlugins.set(bevy::window::WindowPlugin {
        primary_window: Some(bevy::window::Window {
            title: "KBVE Isometric".to_string(),
            resolution: bevy::window::WindowResolution::new(1024, 768),
            ..default()
        }),
        ..default()
    }));

    // Mesh picking backend for mouse hover detection on 3D objects
    app.add_plugins(MeshPickingPlugin);

    // Rapier physics engine
    app.add_plugins(RapierPhysicsPlugin::<NoUserData>::default());
    app.add_plugins(RapierDebugRenderPlugin::default());

    // Game plugins
    app.add_plugins(GamePluginGroup);

    app.run();
}
