use bevy::prelude::*;

use super::scene_objects::Collider;
use super::state::PlayerState;

/// Player half-extents for collision (matches Cuboid 0.6 x 1.2 x 0.6)
const PLAYER_HALF_X: f32 = 0.3;
const PLAYER_HALF_Z: f32 = 0.3;

#[derive(Component)]
pub struct Player;

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_player);
        app.add_systems(Update, (move_player, sync_player_state));
    }
}

fn spawn_player(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Player represented as a colored cube
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.6, 1.2, 0.6))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.4, 0.8),
            ..default()
        })),
        Transform::from_xyz(2.0, 0.6, 2.0),
        Player,
    ));
}

/// Check if two AABBs overlap on X and Z axes.
fn aabb_overlap(
    pos_a: Vec3,
    half_a_x: f32,
    half_a_z: f32,
    pos_b: Vec3,
    half_b_x: f32,
    half_b_z: f32,
) -> bool {
    let dx = (pos_a.x - pos_b.x).abs();
    let dz = (pos_a.z - pos_b.z).abs();
    dx < (half_a_x + half_b_x) && dz < (half_a_z + half_b_z)
}

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut player_query: Query<&mut Transform, With<Player>>,
    colliders: Query<(&Transform, &Collider), Without<Player>>,
) {
    let speed = 5.0;
    let mut direction = Vec3::ZERO;

    // WASD movement in isometric space
    if keyboard.pressed(KeyCode::KeyW) {
        direction += Vec3::new(-1.0, 0.0, -1.0);
    }
    if keyboard.pressed(KeyCode::KeyS) {
        direction += Vec3::new(1.0, 0.0, 1.0);
    }
    if keyboard.pressed(KeyCode::KeyA) {
        direction += Vec3::new(-1.0, 0.0, 1.0);
    }
    if keyboard.pressed(KeyCode::KeyD) {
        direction += Vec3::new(1.0, 0.0, -1.0);
    }

    if direction != Vec3::ZERO {
        direction = direction.normalize();
        for mut transform in &mut player_query {
            let delta = direction * speed * time.delta_secs();
            let current = transform.translation;

            // Try X movement independently
            let candidate_x = Vec3::new(current.x + delta.x, current.y, current.z);
            let mut blocked_x = false;
            for (col_tf, col) in &colliders {
                if aabb_overlap(
                    candidate_x,
                    PLAYER_HALF_X,
                    PLAYER_HALF_Z,
                    col_tf.translation,
                    col.half_x,
                    col.half_z,
                ) {
                    blocked_x = true;
                    break;
                }
            }

            // Try Z movement independently
            let candidate_z = Vec3::new(current.x, current.y, current.z + delta.z);
            let mut blocked_z = false;
            for (col_tf, col) in &colliders {
                if aabb_overlap(
                    candidate_z,
                    PLAYER_HALF_X,
                    PLAYER_HALF_Z,
                    col_tf.translation,
                    col.half_x,
                    col.half_z,
                ) {
                    blocked_z = true;
                    break;
                }
            }

            // Apply only unblocked axes (allows wall-sliding)
            if !blocked_x {
                transform.translation.x += delta.x;
            }
            if !blocked_z {
                transform.translation.z += delta.z;
            }
        }
    }
}

fn sync_player_state(
    query: Query<&Transform, With<Player>>,
    mut player_state: ResMut<PlayerState>,
) {
    if let Ok(transform) = query.single() {
        let pos = transform.translation;
        player_state.position = [pos.x, pos.y, pos.z];
    }
}
