use bevy::prelude::*;
use bevy_rapier3d::prelude::*;

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
const MAX_STEP_HEIGHT: f32 = 0.35;
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
            (move_player, sync_player_state)
                .chain()
                .in_set(PlayerMovement),
        );
        app.add_systems(
            PostUpdate,
            process_player_physics_output
                .after(PhysicsSet::Writeback)
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
    let spawn_y = ground_h + PLAYER_HEIGHT / 2.0 + 0.5; // slight offset to avoid spawning inside terrain

    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.6, PLAYER_HEIGHT, 0.6))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.4, 0.8),
            ..default()
        })),
        Transform::from_xyz(spawn_x, spawn_y, spawn_z),
        Player,
        PlayerPhysics::default(),
        // Rapier components
        RigidBody::KinematicPositionBased,
        Collider::cuboid(PLAYER_HALF_X, PLAYER_HEIGHT / 2.0, PLAYER_HALF_Z),
        KinematicCharacterController {
            autostep: Some(CharacterAutostep {
                max_height: CharacterLength::Absolute(MAX_STEP_HEIGHT),
                min_width: CharacterLength::Absolute(0.2),
                include_dynamic_bodies: false,
            }),
            snap_to_ground: Some(CharacterLength::Absolute(0.5)),
            offset: CharacterLength::Absolute(0.01),
            slide: true,
            ..default()
        },
    ));
}

// ---------------------------------------------------------------------------
// Movement: WASD + gravity + jump → set desired translation
// ---------------------------------------------------------------------------

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut query: Query<
        (
            &mut KinematicCharacterController,
            &mut PlayerPhysics,
            &Transform,
        ),
        With<Player>,
    >,
) {
    for (mut controller, mut physics, transform) in &mut query {
        // WASD isometric directions
        let mut direction = Vec3::ZERO;
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
        }

        let horizontal = direction * PLAYER_SPEED * time.delta_secs();

        // Jump
        if keyboard.just_pressed(KeyCode::Space) && physics.on_ground {
            physics.velocity_y = JUMP_VELOCITY;
            physics.on_ground = false;
            physics.fall_start_y = transform.translation.y;
        }

        // Gravity
        if !physics.on_ground {
            physics.velocity_y -= GRAVITY * time.delta_secs();
        }

        let vertical = Vec3::new(0.0, physics.velocity_y * time.delta_secs(), 0.0);

        // Tell Rapier where we want to go — it resolves collisions
        controller.translation = Some(horizontal + vertical);
    }
}

// ---------------------------------------------------------------------------
// Post-physics: read Rapier output, handle ground detection + fall damage
// ---------------------------------------------------------------------------

fn process_player_physics_output(
    mut query: Query<
        (
            &KinematicCharacterControllerOutput,
            &mut PlayerPhysics,
            &Transform,
        ),
        With<Player>,
    >,
    mut player_state: ResMut<PlayerState>,
) {
    for (output, mut physics, transform) in &mut query {
        let was_airborne = !physics.on_ground;
        physics.on_ground = output.grounded;

        if output.grounded {
            // Just landed
            if was_airborne {
                let fall_distance = physics.fall_start_y - transform.translation.y;
                if physics.velocity_y < 0.0 && fall_distance > FALL_DAMAGE_THRESHOLD {
                    let damage = (fall_distance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_UNIT;
                    player_state.health = (player_state.health - damage).max(0.0);
                }
            }
            physics.velocity_y = 0.0;
        } else if !was_airborne {
            // Just left ground (walked off edge)
            physics.fall_start_y = transform.translation.y;
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
