use avian3d::prelude::*;
use bevy::prelude::*;

use crate::component::{Player, PlayerPhysics};
use crate::config::{DirectionMap, PlayerConfig};

/// System set for player movement — use this for ordering constraints
/// (e.g. camera follow should run after player movement).
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PlayerMovement;

/// Handles keyboard input (WASD + Space), gravity, and collision-aware movement.
///
/// Reads `ButtonInput<KeyCode>`, `Time`, `PlayerConfig`, and `DirectionMap`
/// to build horizontal direction and apply gravity/jump physics. Movement
/// is resolved via [`sweep_move`] for collision-aware sliding along walls.
pub fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    config: Res<PlayerConfig>,
    dir_map: Res<DirectionMap>,
    spatial_query: SpatialQuery,
    mut query: Query<(Entity, &mut Transform, &mut PlayerPhysics), With<Player>>,
) {
    for (entity, mut transform, mut physics) in &mut query {
        let mut direction = Vec3::ZERO;
        if keyboard.pressed(KeyCode::KeyW) || keyboard.pressed(KeyCode::ArrowUp) {
            direction += dir_map.forward;
        }
        if keyboard.pressed(KeyCode::KeyS) || keyboard.pressed(KeyCode::ArrowDown) {
            direction += dir_map.back;
        }
        if keyboard.pressed(KeyCode::KeyA) || keyboard.pressed(KeyCode::ArrowLeft) {
            direction += dir_map.left;
        }
        if keyboard.pressed(KeyCode::KeyD) || keyboard.pressed(KeyCode::ArrowRight) {
            direction += dir_map.right;
        }

        if direction != Vec3::ZERO {
            direction = direction.normalize();
        }

        let horizontal = direction * config.speed * time.delta_secs();

        // Jump
        if keyboard.just_pressed(KeyCode::Space) && physics.on_ground {
            physics.velocity_y = config.jump_velocity;
            physics.on_ground = false;
            physics.fall_start_y = transform.translation.y;
        }

        // Gravity
        if !physics.on_ground {
            physics.velocity_y -= config.gravity * time.delta_secs();
        }

        let vertical = Vec3::new(0.0, physics.velocity_y * time.delta_secs(), 0.0);

        // Collision-aware movement via shape casting.
        // Use a slightly shrunk collider for sweeping to avoid edge-catching.
        let sweep_collider = Collider::cuboid(
            config.half_x * 2.0 * 0.85,
            config.height * 0.9,
            config.half_z * 2.0 * 0.85,
        );
        let filter = SpatialQueryFilter::default().with_excluded_entities([entity]);
        let pos = transform.translation;

        // Sweep horizontal movement (XZ) — slide along walls.
        let resolved_h =
            sweep_move(&spatial_query, &sweep_collider, pos, horizontal, &filter, &config);

        // Sweep vertical movement from the post-horizontal position.
        let pos_after_h = pos + resolved_h;
        let resolved_v = sweep_move(
            &spatial_query,
            &sweep_collider,
            pos_after_h,
            vertical,
            &filter,
            &config,
        );

        // If vertical movement was blocked while falling, land.
        if physics.velocity_y < 0.0 && resolved_v.y.abs() < vertical.y.abs() * 0.5 {
            physics.velocity_y = 0.0;
        }

        transform.translation += resolved_h + resolved_v;
    }
}

/// Sweep a shape along `delta` and return the safe displacement.
///
/// If the full sweep is blocked, tries sliding along each axis independently
/// (X → Z → Y) to allow wall-sliding behavior.
pub fn sweep_move(
    spatial_query: &SpatialQuery,
    collider: &Collider,
    origin: Vec3,
    delta: Vec3,
    filter: &SpatialQueryFilter,
    config: &PlayerConfig,
) -> Vec3 {
    let dist = delta.length();
    if dist < 1e-6 {
        return Vec3::ZERO;
    }

    // Try the full movement first.
    if let Some(safe) = try_cast(spatial_query, collider, origin, delta, dist, filter) {
        if safe >= dist - config.collision_skin {
            return delta; // No obstruction.
        }
    } else {
        return delta; // No hit — clear path.
    }

    // Blocked: try sliding along each axis independently.
    let mut result = Vec3::ZERO;
    let skin = config.collision_skin;

    // X axis
    let dx = Vec3::new(delta.x, 0.0, 0.0);
    let dx_len = dx.length();
    if dx_len > 1e-6 {
        if let Some(safe) = try_cast(spatial_query, collider, origin, dx, dx_len, filter) {
            let clamped = (safe - skin).max(0.0);
            result.x = dx.x.signum() * clamped.min(dx_len);
        } else {
            result.x = dx.x;
        }
    }

    // Z axis
    let dz = Vec3::new(0.0, 0.0, delta.z);
    let dz_len = dz.length();
    if dz_len > 1e-6 {
        let slide_origin = origin + result;
        if let Some(safe) = try_cast(spatial_query, collider, slide_origin, dz, dz_len, filter) {
            let clamped = (safe - skin).max(0.0);
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
            let clamped = (safe - skin).max(0.0);
            result.y = dy.y.signum() * clamped.min(dy_len);
        } else {
            result.y = dy.y;
        }
    }

    result
}

/// Cast a shape along a direction and return `Some(safe_distance)` if hit,
/// or `None` if the path is clear.
pub fn try_cast(
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
