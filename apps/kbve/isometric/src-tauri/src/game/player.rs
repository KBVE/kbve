use avian3d::prelude::*;
use bevy::prelude::*;

use super::state::PlayerState;
use super::terrain::TerrainMap;
use super::virtual_joystick::VirtualJoystickState;

/// Fired when the player takes fall damage. The networking layer picks this up
/// and sends a DamageEvent to the server.
#[derive(Event)]
pub struct FallDamageEvent {
    pub amount: f32,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_HALF_X: f32 = 0.3;
const PLAYER_HALF_Z: f32 = 0.3;
const PLAYER_HEIGHT: f32 = 1.2;
const PLAYER_SPEED: f32 = 5.0;
const GRAVITY: f32 = 20.0;
const JUMP_VELOCITY: f32 = 11.0;
#[allow(dead_code)]
const MAX_STEP_HEIGHT: f32 = 0.35;
const FALL_DAMAGE_THRESHOLD: f32 = 3.0;
const FALL_DAMAGE_PER_UNIT: f32 = 15.0;

/// Small skin distance to prevent the player from touching colliders exactly.
const COLLISION_SKIN: f32 = 0.01;

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
            process_player_ground_detection
                .after(PhysicsSystems::Writeback)
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
        // Avian3d components
        RigidBody::Kinematic,
        Collider::cuboid(PLAYER_HALF_X * 2.0, PLAYER_HEIGHT, PLAYER_HALF_Z * 2.0),
        // Ground detection: short downward shape cast from player center
        ShapeCaster::new(
            Collider::cuboid(PLAYER_HALF_X * 2.0 * 0.9, 0.1, PLAYER_HALF_Z * 2.0 * 0.9),
            Vec3::new(0.0, -(PLAYER_HEIGHT / 2.0), 0.0),
            Quat::IDENTITY,
            Dir3::NEG_Y,
        )
        .with_max_distance(0.15),
    ));
}

// ---------------------------------------------------------------------------
// Movement: WASD + gravity + jump → set desired translation
// ---------------------------------------------------------------------------

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut joystick: ResMut<VirtualJoystickState>,
    time: Res<Time>,
    spatial_query: SpatialQuery,
    sensor_query: Query<Entity, With<Sensor>>,
    mut query: Query<(Entity, &mut Transform, &mut PlayerPhysics), With<Player>>,
) {
    for (entity, mut transform, mut physics) in &mut query {
        // WASD + Arrow keys → isometric directions
        let mut direction = Vec3::ZERO;
        if keyboard.pressed(KeyCode::KeyW) || keyboard.pressed(KeyCode::ArrowUp) {
            direction += Vec3::new(-1.0, 0.0, -1.0);
        }
        if keyboard.pressed(KeyCode::KeyS) || keyboard.pressed(KeyCode::ArrowDown) {
            direction += Vec3::new(1.0, 0.0, 1.0);
        }
        if keyboard.pressed(KeyCode::KeyA) || keyboard.pressed(KeyCode::ArrowLeft) {
            direction += Vec3::new(-1.0, 0.0, 1.0);
        }
        if keyboard.pressed(KeyCode::KeyD) || keyboard.pressed(KeyCode::ArrowRight) {
            direction += Vec3::new(1.0, 0.0, -1.0);
        }

        // Virtual joystick input (already in isometric space)
        if joystick.active {
            direction += joystick.direction;
        }

        if direction != Vec3::ZERO {
            direction = direction.normalize();
        }

        let horizontal = direction * PLAYER_SPEED * time.delta_secs();

        // Jump (keyboard Space or mobile jump button)
        let jump_btn = joystick.jump_requested;
        joystick.jump_requested = false;
        joystick.action_requested = false;
        if (keyboard.just_pressed(KeyCode::Space) || jump_btn) && physics.on_ground {
            physics.velocity_y = JUMP_VELOCITY;
            physics.on_ground = false;
            physics.fall_start_y = transform.translation.y;
        }

        // Gravity
        if !physics.on_ground {
            physics.velocity_y -= GRAVITY * time.delta_secs();
        }

        let vertical = Vec3::new(0.0, physics.velocity_y * time.delta_secs(), 0.0);

        // -- Collision-aware movement via shape casting -------------------------
        // Use a slightly shrunk collider for sweeping to avoid edge-catching.
        let sweep_collider = Collider::cuboid(
            PLAYER_HALF_X * 2.0 * 0.85,
            PLAYER_HEIGHT * 0.9,
            PLAYER_HALF_Z * 2.0 * 0.85,
        );
        // Exclude self + all Sensor entities (flowers, mushrooms) from sweep.
        // Sensors should be walkable — only solid geometry blocks the player.
        let mut excluded: Vec<Entity> = vec![entity];
        excluded.extend(sensor_query.iter());
        let base_filter = SpatialQueryFilter::default().with_excluded_entities(excluded.clone());
        let pos = transform.translation;

        // Exclude entities that already overlap the sweep collider at the
        // start position. Without this, overlapping colliders cause cast_shape
        // to return distance 0 in every direction, freezing the player.
        let overlapping =
            spatial_query.shape_intersections(&sweep_collider, pos, Quat::IDENTITY, &base_filter);
        if !overlapping.is_empty() {
            excluded.extend_from_slice(&overlapping);
        }
        let filter = SpatialQueryFilter::default().with_excluded_entities(excluded);

        // Sweep horizontal movement (XZ) — slide along walls by trying each
        // axis independently when the combined sweep is blocked.
        let resolved_h = sweep_move(&spatial_query, &sweep_collider, pos, horizontal, &filter);

        // Sweep vertical movement from the post-horizontal position.
        let pos_after_h = pos + resolved_h;
        let resolved_v = sweep_move(
            &spatial_query,
            &sweep_collider,
            pos_after_h,
            vertical,
            &filter,
        );

        // If vertical movement was blocked while falling, land.
        if physics.velocity_y < 0.0 && resolved_v.y.abs() < vertical.y.abs() * 0.5 {
            physics.velocity_y = 0.0;
        }

        transform.translation += resolved_h + resolved_v;
    }
}

/// Sweep a shape along `delta` and return the safe displacement.
/// If the full sweep is blocked, tries sliding along each axis independently.
fn sweep_move(
    spatial_query: &SpatialQuery,
    collider: &Collider,
    origin: Vec3,
    delta: Vec3,
    filter: &SpatialQueryFilter,
) -> Vec3 {
    let dist = delta.length();
    if dist < 1e-6 {
        return Vec3::ZERO;
    }

    // Try the full movement first.
    if let Some(safe) = try_cast(spatial_query, collider, origin, delta, dist, filter) {
        if safe >= dist - COLLISION_SKIN {
            return delta; // No obstruction.
        }
    } else {
        return delta; // No hit — clear path.
    }

    // Blocked: try sliding along each axis independently (XZ then Y).
    let mut result = Vec3::ZERO;

    // X axis
    let dx = Vec3::new(delta.x, 0.0, 0.0);
    let dx_len = dx.length();
    if dx_len > 1e-6 {
        if let Some(safe) = try_cast(spatial_query, collider, origin, dx, dx_len, filter) {
            let clamped = (safe - COLLISION_SKIN).max(0.0);
            result.x = dx.x.signum() * clamped.min(dx_len);
        } else {
            result.x = dx.x;
        }
    }

    // Z axis
    let dz = Vec3::new(0.0, 0.0, delta.z);
    let dz_len = dz.length();
    if dz_len > 1e-6 {
        let slide_origin = origin + result; // account for X slide
        if let Some(safe) = try_cast(spatial_query, collider, slide_origin, dz, dz_len, filter) {
            let clamped = (safe - COLLISION_SKIN).max(0.0);
            result.z = dz.z.signum() * clamped.min(dz_len);
        } else {
            result.z = dz.z;
        }
    }

    // Y axis
    let dy = Vec3::new(0.0, delta.y, 0.0);
    let dy_len = dy.length();
    if dy_len > 1e-6 {
        let slide_origin = origin + result;
        if let Some(safe) = try_cast(spatial_query, collider, slide_origin, dy, dy_len, filter) {
            let clamped = (safe - COLLISION_SKIN).max(0.0);
            result.y = dy.y.signum() * clamped.min(dy_len);
        } else {
            result.y = dy.y;
        }
    }

    result
}

/// Cast the shape along a direction and return `Some(safe_distance)` if hit,
/// or `None` if the path is clear.
fn try_cast(
    spatial_query: &SpatialQuery,
    collider: &Collider,
    origin: Vec3,
    delta: Vec3,
    max_dist: f32,
    filter: &SpatialQueryFilter,
) -> Option<f32> {
    let dir = Dir3::new(delta).ok()?;
    let config = ShapeCastConfig::from_max_distance(max_dist);
    spatial_query
        .cast_shape(collider, origin, Quat::IDENTITY, dir, &config, filter)
        .map(|hit| hit.distance)
}

// ---------------------------------------------------------------------------
// Post-physics: ground detection via ShapeCaster + fall damage
// ---------------------------------------------------------------------------

fn process_player_ground_detection(
    mut commands: Commands,
    mut query: Query<(&ShapeHits, &mut PlayerPhysics, &Transform), With<Player>>,
    mut player_state: ResMut<PlayerState>,
) {
    for (hits, mut physics, transform) in &mut query {
        let was_airborne = !physics.on_ground;
        let grounded = !hits.is_empty();
        physics.on_ground = grounded;

        if grounded {
            // Just landed
            if was_airborne {
                let fall_distance = physics.fall_start_y - transform.translation.y;
                if physics.velocity_y < 0.0 && fall_distance > FALL_DAMAGE_THRESHOLD {
                    let damage = (fall_distance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_UNIT;
                    // Apply locally for immediate feedback
                    player_state.health = (player_state.health - damage).max(0.0);
                    // Trigger event so networking observer can forward to server
                    commands.trigger(FallDamageEvent { amount: damage });
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
