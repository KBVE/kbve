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

    // Add Tauri plugin with IPC command handlers
    app.add_plugins(TauriPlugin::new(|| {
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                commands::get_fps,
                commands::get_player_state,
                commands::greet,
            ])
            .build(tauri::generate_context!())
            .expect("error while building tauri application")
    }));

    // Add Bevy default plugins (rendering, input, etc.)
    app.add_plugins(DefaultPlugins.set(bevy::window::WindowPlugin {
        primary_window: None, // Tauri manages the window
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
