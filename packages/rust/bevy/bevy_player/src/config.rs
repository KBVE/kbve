use bevy::prelude::*;
use serde::{Deserialize, Serialize};

/// Tunable parameters for the kinematic character controller.
///
/// # Examples
///
/// ```
/// use bevy_player::PlayerConfig;
///
/// let config = PlayerConfig::default();
/// assert!(config.speed > 0.0);
/// assert!(config.gravity > 0.0);
/// ```
#[derive(Resource, Debug, Clone, Serialize, Deserialize)]
pub struct PlayerConfig {
    /// Half-width of the player collider on X axis.
    pub half_x: f32,
    /// Half-width of the player collider on Z axis.
    pub half_z: f32,
    /// Full height of the player collider.
    pub height: f32,
    /// Horizontal movement speed (units/sec).
    pub speed: f32,
    /// Downward acceleration (units/sec²).
    pub gravity: f32,
    /// Initial upward velocity on jump.
    pub jump_velocity: f32,
    /// Maximum step height for auto-stepping.
    pub max_step_height: f32,
    /// Fall distance before damage starts.
    pub fall_damage_threshold: f32,
    /// Damage per unit of fall distance beyond the threshold.
    pub fall_damage_per_unit: f32,
    /// Small skin distance to prevent touching colliders exactly during sweeps.
    pub collision_skin: f32,
}

impl Default for PlayerConfig {
    fn default() -> Self {
        Self {
            half_x: 0.3,
            half_z: 0.3,
            height: 1.2,
            speed: 5.0,
            gravity: 20.0,
            jump_velocity: 8.0,
            max_step_height: 0.35,
            fall_damage_threshold: 3.0,
            fall_damage_per_unit: 15.0,
            collision_skin: 0.01,
        }
    }
}

/// Defines how WASD keys map to world-space directions.
///
/// Override this resource to change movement orientation.
/// Use [`DirectionMap::isometric`] (default) for isometric games
/// or [`DirectionMap::top_down`] for cardinal direction movement.
///
/// # Examples
///
/// ```
/// use bevy_player::DirectionMap;
///
/// let iso = DirectionMap::isometric();
/// assert_eq!(iso.forward.y, 0.0); // no vertical component
///
/// let td = DirectionMap::top_down();
/// assert_eq!(td.forward, bevy::math::Vec3::NEG_Z);
/// ```
#[derive(Resource, Debug, Clone)]
pub struct DirectionMap {
    /// Direction for the W key.
    pub forward: Vec3,
    /// Direction for the S key.
    pub back: Vec3,
    /// Direction for the A key.
    pub left: Vec3,
    /// Direction for the D key.
    pub right: Vec3,
}

impl Default for DirectionMap {
    fn default() -> Self {
        Self::isometric()
    }
}

impl DirectionMap {
    /// Isometric WASD mapping: diagonal directions on the XZ plane.
    pub fn isometric() -> Self {
        Self {
            forward: Vec3::new(-1.0, 0.0, -1.0),
            back: Vec3::new(1.0, 0.0, 1.0),
            left: Vec3::new(-1.0, 0.0, 1.0),
            right: Vec3::new(1.0, 0.0, -1.0),
        }
    }

    /// Top-down cardinal WASD mapping.
    pub fn top_down() -> Self {
        Self {
            forward: Vec3::NEG_Z,
            back: Vec3::Z,
            left: Vec3::NEG_X,
            right: Vec3::X,
        }
    }
}
