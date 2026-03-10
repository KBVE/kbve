//! # bevy_kbve_player
//!
//! Kinematic character controller plugin for Bevy + Rapier3D. Provides
//! configurable gravity, jump, fall damage, and movement direction mapping.
//!
//! ## Usage
//!
//! ```ignore
//! use bevy_kbve_player::{PlayerPlugin, PlayerConfig};
//!
//! app.add_plugins(PlayerPlugin::new(PlayerConfig {
//!     speed: 5.0,
//!     gravity: 20.0,
//!     jump_velocity: 8.0,
//!     ..default()
//! }));
//! ```

use bevy::prelude::*;
use bevy_rapier3d::prelude::*;
use serde::{Deserialize, Serialize};

// ── Configuration ───────────────────────────────────────────────────────

/// Tunable parameters for the kinematic character controller.
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
        }
    }
}

// ── Components ──────────────────────────────────────────────────────────

/// Marker component for the player entity.
#[derive(Component)]
pub struct Player;

/// Physics state tracked alongside the Rapier kinematic controller.
#[derive(Component, Debug)]
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

// ── Events ──────────────────────────────────────────────────────────────

/// Fired when the player lands after exceeding the fall damage threshold.
/// Games can observe this to apply damage, play sounds, etc.
#[derive(Event, Debug, Clone)]
pub struct FallDamageEvent {
    pub entity: Entity,
    pub fall_distance: f32,
    pub damage: f32,
}

// ── System set ──────────────────────────────────────────────────────────

/// System set for player movement — use this for ordering constraints
/// (e.g. camera follow should run after player movement).
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PlayerMovement;

// ── Direction mapping ───────────────────────────────────────────────────

/// Defines how WASD keys map to world-space directions.
/// Override this resource to change movement orientation (e.g. top-down vs isometric).
#[derive(Resource, Debug, Clone)]
pub struct DirectionMap {
    pub forward: Vec3, // W
    pub back: Vec3,    // S
    pub left: Vec3,    // A
    pub right: Vec3,   // D
}

impl Default for DirectionMap {
    /// Default: isometric WASD mapping.
    fn default() -> Self {
        Self {
            forward: Vec3::new(-1.0, 0.0, -1.0),
            back: Vec3::new(1.0, 0.0, 1.0),
            left: Vec3::new(-1.0, 0.0, 1.0),
            right: Vec3::new(1.0, 0.0, -1.0),
        }
    }
}

impl DirectionMap {
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

// ── Plugin ──────────────────────────────────────────────────────────────

pub struct PlayerPlugin {
    config: PlayerConfig,
}

impl PlayerPlugin {
    pub fn new(config: PlayerConfig) -> Self {
        Self { config }
    }
}

impl Default for PlayerPlugin {
    fn default() -> Self {
        Self {
            config: PlayerConfig::default(),
        }
    }
}

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone());
        app.init_resource::<DirectionMap>();
        app.add_systems(Update, move_player.in_set(PlayerMovement));
        app.add_systems(
            PostUpdate,
            process_physics_output
                .after(PhysicsSet::Writeback)
                .in_set(PlayerMovement),
        );
    }
}

// ── Systems ─────────────────────────────────────────────────────────────

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    config: Res<PlayerConfig>,
    dir_map: Res<DirectionMap>,
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
        let mut direction = Vec3::ZERO;
        if keyboard.pressed(KeyCode::KeyW) {
            direction += dir_map.forward;
        }
        if keyboard.pressed(KeyCode::KeyS) {
            direction += dir_map.back;
        }
        if keyboard.pressed(KeyCode::KeyA) {
            direction += dir_map.left;
        }
        if keyboard.pressed(KeyCode::KeyD) {
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
        controller.translation = Some(horizontal + vertical);
    }
}

fn process_physics_output(
    mut query: Query<
        (
            Entity,
            &KinematicCharacterControllerOutput,
            &mut PlayerPhysics,
            &Transform,
        ),
        With<Player>,
    >,
    config: Res<PlayerConfig>,
    mut commands: Commands,
) {
    for (entity, output, mut physics, transform) in &mut query {
        let was_airborne = !physics.on_ground;
        physics.on_ground = output.grounded;

        if output.grounded {
            if was_airborne {
                let fall_distance = physics.fall_start_y - transform.translation.y;
                if physics.velocity_y < 0.0 && fall_distance > config.fall_damage_threshold {
                    let damage = (fall_distance - config.fall_damage_threshold)
                        * config.fall_damage_per_unit;
                    commands.trigger(FallDamageEvent {
                        entity,
                        fall_distance,
                        damage,
                    });
                }
            }
            physics.velocity_y = 0.0;
        } else if !was_airborne {
            // Walked off edge
            physics.fall_start_y = transform.translation.y;
        }
    }
}

// ── Spawn helper ────────────────────────────────────────────────────────

/// Helper bundle for spawning a player entity with the correct physics components.
/// Call this in your game's startup system after adding `PlayerPlugin`.
pub fn spawn_player_entity(
    commands: &mut Commands,
    config: &PlayerConfig,
    position: Vec3,
) -> Entity {
    commands
        .spawn((
            Transform::from_translation(position),
            Player,
            PlayerPhysics::default(),
            RigidBody::KinematicPositionBased,
            Collider::cuboid(config.half_x, config.height / 2.0, config.half_z),
            KinematicCharacterController {
                autostep: Some(CharacterAutostep {
                    max_height: CharacterLength::Absolute(config.max_step_height),
                    min_width: CharacterLength::Absolute(0.2),
                    include_dynamic_bodies: false,
                }),
                snap_to_ground: Some(CharacterLength::Absolute(0.5)),
                offset: CharacterLength::Absolute(0.01),
                slide: true,
                ..default()
            },
        ))
        .id()
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_is_sane() {
        let config = PlayerConfig::default();
        assert!(config.speed > 0.0);
        assert!(config.gravity > 0.0);
        assert!(config.jump_velocity > 0.0);
        assert!(config.height > 0.0);
        assert!(config.fall_damage_threshold > 0.0);
    }

    #[test]
    fn direction_map_isometric_normalized() {
        let map = DirectionMap::default();
        // Diagonals should normalize to unit length
        let fwd = map.forward.normalize();
        assert!((fwd.length() - 1.0).abs() < 0.001);
    }

    #[test]
    fn direction_map_top_down() {
        let map = DirectionMap::top_down();
        assert_eq!(map.forward, Vec3::NEG_Z);
        assert_eq!(map.back, Vec3::Z);
        assert_eq!(map.left, Vec3::NEG_X);
        assert_eq!(map.right, Vec3::X);
    }

    #[test]
    fn player_physics_defaults() {
        let phys = PlayerPhysics::default();
        assert!(phys.on_ground);
        assert_eq!(phys.velocity_y, 0.0);
    }
}
