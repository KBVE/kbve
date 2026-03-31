// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    use avian3d::prelude::*;
    use bevy::prelude::*;
    use isometric_game::game::GamePluginGroup;

    bevy::app::App::new()
        .insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)))
        .add_plugins(
            DefaultPlugins
                .set(bevy::window::WindowPlugin {
                    primary_window: Some(bevy::window::Window {
                        title: "KBVE Isometric".to_string(),
                        ..default()
                    }),
                    ..default()
                })
                .set(bevy::asset::AssetPlugin {
                    file_path: "../public/assets".to_string(),
                    ..default()
                }),
        )
        .add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default())
        .add_plugins(bevy::picking::mesh_picking::MeshPickingPlugin)
        .add_plugins(PhysicsPlugins::default())
        .add_plugins(GamePluginGroup)
        .run();
}
