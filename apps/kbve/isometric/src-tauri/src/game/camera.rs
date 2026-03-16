use avian3d::prelude::PhysicsSystems;
use bevy::prelude::*;

use super::pixelate::PixelateSettings;
use super::player::PlayerMovement;

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
            // Zoom locked to 1.0 — fixed resolution prevents pixel swimming.
            zoom_min: 1.0,
            zoom_max: 1.0,
            zoom_factor: 1.0,
            zoom_smoothing: 4.0,
        }));

        // Attach PixelateSettings to the display camera (one-shot, bevy_cam spawns it).
        app.add_systems(
            Update,
            attach_pixelate_settings.run_if(
                any_with_component::<DisplayCamera>
                    .and(not(any_with_component::<PixelateSettings>)),
            ),
        );

        // Order bevy_cam's PostUpdate systems after physics writeback
        // so the camera tracks the player's post-physics position.
        app.configure_sets(
            PostUpdate,
            CameraUpdate
                .after(PhysicsSystems::Writeback)
                .in_set(PlayerMovement),
        );
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
