// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod game;
mod renderer;
mod tauri_plugin;

use bevy::DefaultPlugins;
use bevy::app::App;
use bevy::prelude::*;
use tauri_plugin::TauriPlugin;

use game::camera::IsometricCameraPlugin;
use game::player::PlayerPlugin;
use game::state::GameStatePlugin;
use game::tilemap::TilemapPlugin;

fn main() {
    let mut app = App::new();

    app.insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)));

    // Tauri runs alongside Bevy for IPC (FPS, player state, etc.)
    // The custom runner interleaves Tauri event processing with Bevy updates.
    app.add_plugins(TauriPlugin::new(|builder| {
        builder
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                commands::get_fps,
                commands::get_player_state,
                commands::greet,
            ])
    }));

    // Bevy renders to its own window via DefaultPlugins
    app.add_plugins(DefaultPlugins.set(bevy::window::WindowPlugin {
        primary_window: Some(bevy::window::Window {
            title: "KBVE Isometric".to_string(),
            resolution: bevy::window::WindowResolution::new(1024.0, 768.0),
            ..default()
        }),
        ..default()
    }));

    // Game plugins
    app.add_plugins((
        GameStatePlugin,
        IsometricCameraPlugin,
        TilemapPlugin,
        PlayerPlugin,
    ));

    app.run();
}
