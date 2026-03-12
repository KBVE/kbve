use bevy::prelude::*;
use bevy_rapier3d::prelude::PhysicsSet;

use super::pixelate::PixelateSettings;
use super::player::{Player, PlayerMovement};

// Re-export bevy_cam types that the rest of the game uses.
pub use bevy_cam::{
    CameraConfig, CameraFollowTarget, CameraUpdate, CameraZoom, DisplayCamera, IsometricCamera,
};

/// Render pixels per world unit — re-exported for convenience.
pub const PIXEL_DENSITY: u32 = 32;

pub struct IsometricCameraPlugin;

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        // Add the bevy_cam plugin with our game's configuration.
        app.add_plugins(bevy_cam::IsometricCameraPlugin::new(CameraConfig {
            offset: Vec3::new(15.0, 20.0, 15.0),
            viewport_height: 20.0,
            pixel_density: PIXEL_DENSITY,
            display_layer: 1,
            zoom_min: 0.5,
            zoom_max: 2.0,
            zoom_factor: 1.05,
            zoom_smoothing: 4.0,
        }));

        // Attach CameraFollowTarget to the player once spawned.
        app.add_systems(Update, attach_follow_target);

        // Attach PixelateSettings to the display camera (runs until attached).
        app.add_systems(Update, attach_pixelate_settings);

        // Order bevy_cam's PostUpdate systems after physics writeback
        // so the camera tracks the player's post-physics position.
        app.configure_sets(
            PostUpdate,
            CameraUpdate
                .after(PhysicsSet::Writeback)
                .in_set(PlayerMovement),
        );
    }
}

/// One-shot: attach `CameraFollowTarget` to the player entity.
fn attach_follow_target(
    mut commands: Commands,
    player_query: Query<Entity, (With<Player>, Without<CameraFollowTarget>)>,
) {
    for entity in &player_query {
        commands.entity(entity).insert(CameraFollowTarget);
    }
}

/// One-shot: attach `PixelateSettings` to the display camera.
fn attach_pixelate_settings(
    mut commands: Commands,
    display_query: Query<Entity, (With<DisplayCamera>, Without<PixelateSettings>)>,
) {
    for entity in &display_query {
        commands.entity(entity).insert(PixelateSettings::default());
    }
}
