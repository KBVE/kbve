use bevy::prelude::*;
use std::f32::consts::PI;

#[derive(Component)]
pub struct IsometricCamera;

pub struct IsometricCameraPlugin;

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_camera);
    }
}

fn setup_camera(mut commands: Commands) {
    // True isometric: 45 degrees around Y, ~35.264 degrees around X
    let iso_rotation = Quat::from_euler(
        EulerRot::YXZ,
        -PI / 4.0,   // 45 degrees Y rotation
        -PI / 5.264, // ~35.264 degrees X tilt (arctan(1/sqrt(2)))
        0.0,
    );

    let camera_distance = 20.0;
    let camera_pos = iso_rotation * Vec3::new(0.0, 0.0, camera_distance);

    commands.spawn((
        Camera3d::default(),
        Projection::from(OrthographicProjection {
            scale: 10.0,
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(camera_pos).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
    ));
}
