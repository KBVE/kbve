use bevy::prelude::*;

use super::scene_objects::Collider;
use super::state::PlayerState;
use super::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_HALF_X: f32 = 0.3;
const PLAYER_HALF_Z: f32 = 0.3;
const PLAYER_HEIGHT: f32 = 1.2;
const PLAYER_SPEED: f32 = 5.0;
const GRAVITY: f32 = 20.0;
const JUMP_VELOCITY: f32 = 8.0;
const MAX_STEP_HEIGHT: f32 = 1.0;
const FALL_DAMAGE_THRESHOLD: f32 = 3.0;
const FALL_DAMAGE_PER_UNIT: f32 = 15.0;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

#[derive(Component)]
pub struct Player;

#[derive(Component)]
pub struct PlayerPhysics {
    pub velocity_y: f32,
    pub on_ground: bool,
    pub fall_start_y: f32,
}

impl Default for PlayerPhysics {
    fn default() -> Self {
        Self {
            velocity_y: 0.0,
            on_ground: true,
            fall_start_y: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// System set (used by camera for ordering)
// ---------------------------------------------------------------------------

#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PlayerMovement;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_player);
        app.add_systems(
            Update,
            (
                move_player_horizontal,
                player_vertical_physics,
                sync_player_state,
            )
                .chain()
                .in_set(PlayerMovement),
        );
    }
}

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

fn spawn_player(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut terrain: ResMut<TerrainMap>,
) {
    let spawn_x = 2.0;
    let spawn_z = 2.0;
    let ground_h = terrain.height_at_world(spawn_x, spawn_z);
    let spawn_y = ground_h + PLAYER_HEIGHT / 2.0;

    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.6, PLAYER_HEIGHT, 0.6))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.4, 0.8),
            ..default()
        })),
        Transform::from_xyz(spawn_x, spawn_y, spawn_z),
        Player,
        PlayerPhysics::default(),
    ));
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

/// Check if the player (AABB) overlaps with a collider (AABB or Cylinder).
fn player_overlaps_collider(
    player_pos: Vec3,
    player_half: Vec3,
    col_pos: Vec3,
    col: &Collider,
) -> bool {
    match col {
        Collider::Aabb {
            half_x,
            half_y,
            half_z,
        } => {
            let d = (player_pos - col_pos).abs();
            d.x < (player_half.x + half_x)
                && d.y < (player_half.y + half_y)
                && d.z < (player_half.z + half_z)
        }
        Collider::Cylinder { radius, half_y } => {
            // Y axis: box check
            let dy = (player_pos.y - col_pos.y).abs();
            if dy >= player_half.y + half_y {
                return false;
            }
            // XZ plane: circle vs AABB
            // Clamp circle center to AABB, then check distance
            let cx = (col_pos.x - player_pos.x).clamp(-player_half.x, player_half.x) + player_pos.x;
            let cz = (col_pos.z - player_pos.z).clamp(-player_half.z, player_half.z) + player_pos.z;
            let dx = col_pos.x - cx;
            let dz = col_pos.z - cz;
            (dx * dx + dz * dz) < radius * radius
        }
    }
}

// ---------------------------------------------------------------------------
// Horizontal movement with terrain step-up
// ---------------------------------------------------------------------------

fn move_player_horizontal(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut terrain: ResMut<TerrainMap>,
    mut player_query: Query<(&mut Transform, &PlayerPhysics), With<Player>>,
    colliders: Query<(&Transform, &Collider), Without<Player>>,
) {
    let mut direction = Vec3::ZERO;

    // WASD isometric directions
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

    if direction == Vec3::ZERO {
        return;
    }
    direction = direction.normalize();

    for (mut transform, physics) in &mut player_query {
        let delta = direction * PLAYER_SPEED * time.delta_secs();
        let current = transform.translation;
        let player_half = Vec3::new(PLAYER_HALF_X, PLAYER_HEIGHT / 2.0, PLAYER_HALF_Z);

        // Try X movement
        let candidate_x = current.x + delta.x;
        let target_h_x = terrain.height_at_world(candidate_x, current.z);
        let current_h = terrain.height_at_world(current.x, current.z);
        let diff_x = target_h_x - current_h;

        let elevation_ok_x = diff_x.abs() <= MAX_STEP_HEIGHT || !physics.on_ground; // airborne can go over

        let mut blocked_x = !elevation_ok_x;
        if !blocked_x {
            let candidate_pos = Vec3::new(candidate_x, current.y, current.z);
            for (col_tf, col) in &colliders {
                if player_overlaps_collider(candidate_pos, player_half, col_tf.translation, col) {
                    blocked_x = true;
                    break;
                }
            }
        }

        // Try Z movement
        let candidate_z = current.z + delta.z;
        let target_h_z = terrain.height_at_world(current.x, candidate_z);
        let diff_z = target_h_z - current_h;

        let elevation_ok_z = diff_z.abs() <= MAX_STEP_HEIGHT || !physics.on_ground;

        let mut blocked_z = !elevation_ok_z;
        if !blocked_z {
            let candidate_pos = Vec3::new(current.x, current.y, candidate_z);
            for (col_tf, col) in &colliders {
                if player_overlaps_collider(candidate_pos, player_half, col_tf.translation, col) {
                    blocked_z = true;
                    break;
                }
            }
        }

        // Apply only unblocked axes (wall-sliding)
        if !blocked_x {
            transform.translation.x = candidate_x;
        }
        if !blocked_z {
            transform.translation.z = candidate_z;
        }
    }
}

// ---------------------------------------------------------------------------
// Vertical physics: gravity, jump, ground snap, fall damage
// ---------------------------------------------------------------------------

fn player_vertical_physics(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut terrain: ResMut<TerrainMap>,
    mut query: Query<(&mut Transform, &mut PlayerPhysics), With<Player>>,
    mut player_state: ResMut<PlayerState>,
) {
    for (mut transform, mut physics) in &mut query {
        let ground_y = terrain.height_at_world(transform.translation.x, transform.translation.z);
        let feet_target = ground_y + PLAYER_HEIGHT / 2.0;

        // Jump input
        if keyboard.just_pressed(KeyCode::Space) && physics.on_ground {
            physics.velocity_y = JUMP_VELOCITY;
            physics.on_ground = false;
            physics.fall_start_y = transform.translation.y;
        }

        if !physics.on_ground {
            // Apply gravity
            physics.velocity_y -= GRAVITY * time.delta_secs();
            transform.translation.y += physics.velocity_y * time.delta_secs();

            // Ground check
            if transform.translation.y <= feet_target {
                // Land
                let fall_distance = physics.fall_start_y - transform.translation.y;

                // Fall damage
                if physics.velocity_y < 0.0 && fall_distance > FALL_DAMAGE_THRESHOLD {
                    let damage = (fall_distance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_UNIT;
                    player_state.health = (player_state.health - damage).max(0.0);
                }

                transform.translation.y = feet_target;
                physics.velocity_y = 0.0;
                physics.on_ground = true;
            }
        } else {
            // On ground — smoothly follow terrain height (auto-step lerp)
            let diff = feet_target - transform.translation.y;
            if diff.abs() < 0.005 {
                transform.translation.y = feet_target; // snap to stop micro-jitter
            } else {
                let t = (time.delta_secs() * 15.0).min(1.0);
                transform.translation.y += diff * t;
            }

            // If we're significantly above ground (walked off an edge), start falling
            if transform.translation.y > feet_target + 0.1 {
                physics.on_ground = false;
                physics.fall_start_y = transform.translation.y;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// State sync
// ---------------------------------------------------------------------------

fn sync_player_state(
    query: Query<&Transform, With<Player>>,
    mut player_state: ResMut<PlayerState>,
) {
    if let Ok(transform) = query.single() {
        let pos = transform.translation;
        player_state.position = [pos.x, pos.y, pos.z];
    }
}
