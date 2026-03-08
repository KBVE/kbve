use bevy::prelude::*;

use super::player::{Player, PlayerMovement};

const CAMERA_OFFSET: Vec3 = Vec3::new(15.0, 20.0, 15.0);
const VIEWPORT_HEIGHT: f32 = 20.0;

#[derive(Component)]
pub struct IsometricCamera;

pub struct IsometricCameraPlugin;

impl Plugin for IsometricCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_camera);
        app.add_systems(Update, camera_follow_player.after(PlayerMovement));
    }
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Projection::from(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: VIEWPORT_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(CAMERA_OFFSET).looking_at(Vec3::ZERO, Vec3::Y),
        IsometricCamera,
    ));
}

fn camera_follow_player(
    player_query: Query<&Transform, (With<Player>, Without<IsometricCamera>)>,
    mut camera_query: Query<&mut Transform, (With<IsometricCamera>, Without<Player>)>,
) {
    let Ok(player_tf) = player_query.single() else {
        return;
    };
    let Ok(mut camera_tf) = camera_query.single_mut() else {
        return;
    };
    camera_tf.translation = player_tf.translation + CAMERA_OFFSET;
}
