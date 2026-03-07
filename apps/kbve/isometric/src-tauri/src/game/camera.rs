use bevy::prelude::*;

use super::pixelate::PixelateSettings;

#[derive(Component)]
pub struct IsometricCamera;

pub struct IsometricCameraPlugin;

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_camera);
    }
}

fn setup_camera(mut commands: Commands) {
    // Isometric camera looking down at the tile grid
    let camera_pos = Vec3::new(15.0, 20.0, 15.0);

    commands.spawn((
        Camera3d::default(),
        Projection::from(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: 20.0,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(camera_pos).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
        PixelateSettings {
            pixel_size: 4.0,
            edge_strength: 0.5,
            depth_edge_strength: 0.3,
            scale_factor: 1.0, // auto-updated from window each frame
        },
    ));
}
