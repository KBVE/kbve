//! # bevy_player
//!
//! Kinematic character controller plugin for Bevy + Avian3D. Provides
//! collision-aware movement with wall-sliding, configurable gravity,
//! jump, fall damage, and direction mapping.
//!
//! ## Usage
//!
//! ```ignore
//! use bevy_player::{PlayerPlugin, PlayerConfig, spawn_player_entity};
//!
//! // Register the plugin:
//! app.add_plugins(PlayerPlugin::new(PlayerConfig {
//!     speed: 5.0,
//!     gravity: 20.0,
//!     jump_velocity: 8.0,
//!     ..default()
//! }));
//!
//! // Spawn a player entity in a startup system:
//! fn setup(mut commands: Commands, config: Res<PlayerConfig>) {
//!     spawn_player_entity(&mut commands, &config, Vec3::new(0.0, 5.0, 0.0));
//! }
//! ```

pub mod component;
pub mod config;
pub mod event;
pub mod ground;
pub mod movement;
pub mod plugin;
pub mod spawn;

// Re-exports
pub use component::{Player, PlayerPhysics};
pub use config::{DirectionMap, PlayerConfig};
pub use event::FallDamageEvent;
pub use ground::detect_ground;
pub use movement::{move_player, sweep_move, try_cast, PlayerMovement};
pub use plugin::PlayerPlugin;
pub use spawn::spawn_player_entity;

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::math::Vec3;

    #[test]
    fn default_config_is_sane() {
        let config = PlayerConfig::default();
        assert!(config.speed > 0.0);
        assert!(config.gravity > 0.0);
        assert!(config.jump_velocity > 0.0);
        assert!(config.height > 0.0);
        assert!(config.half_x > 0.0);
        assert!(config.half_z > 0.0);
        assert!(config.fall_damage_threshold > 0.0);
        assert!(config.fall_damage_per_unit > 0.0);
        assert!(config.collision_skin > 0.0);
    }

    #[test]
    fn config_serialize_roundtrip() {
        let config = PlayerConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: PlayerConfig = serde_json::from_str(&json).unwrap();
        assert!((parsed.speed - config.speed).abs() < f32::EPSILON);
        assert!((parsed.gravity - config.gravity).abs() < f32::EPSILON);
        assert!((parsed.collision_skin - config.collision_skin).abs() < f32::EPSILON);
    }

    #[test]
    fn config_custom_values() {
        let config = PlayerConfig {
            speed: 10.0,
            gravity: 30.0,
            jump_velocity: 12.0,
            collision_skin: 0.05,
            ..Default::default()
        };
        assert!((config.speed - 10.0).abs() < f32::EPSILON);
        assert!((config.gravity - 30.0).abs() < f32::EPSILON);
        assert!((config.collision_skin - 0.05).abs() < f32::EPSILON);
    }

    #[test]
    fn direction_map_isometric_default() {
        let map = DirectionMap::default();
        // Default should be isometric.
        assert_eq!(map.forward, DirectionMap::isometric().forward);
        assert_eq!(map.back, DirectionMap::isometric().back);
    }

    #[test]
    fn direction_map_isometric_normalized() {
        let map = DirectionMap::isometric();
        let fwd = map.forward.normalize();
        assert!((fwd.length() - 1.0).abs() < 0.001);
        // All directions should have zero Y.
        assert_eq!(map.forward.y, 0.0);
        assert_eq!(map.back.y, 0.0);
        assert_eq!(map.left.y, 0.0);
        assert_eq!(map.right.y, 0.0);
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
    fn direction_map_isometric_opposites() {
        let map = DirectionMap::isometric();
        // Forward and back should be opposite.
        assert!((map.forward + map.back).length() < 0.001);
        // Left and right should be opposite.
        assert!((map.left + map.right).length() < 0.001);
    }

    #[test]
    fn direction_map_top_down_opposites() {
        let map = DirectionMap::top_down();
        assert!((map.forward + map.back).length() < 0.001);
        assert!((map.left + map.right).length() < 0.001);
    }

    #[test]
    fn player_physics_defaults() {
        let phys = PlayerPhysics::default();
        assert!(phys.on_ground);
        assert_eq!(phys.velocity_y, 0.0);
        assert_eq!(phys.fall_start_y, 0.0);
    }

    #[test]
    fn fall_damage_event_fields() {
        use bevy::ecs::entity::Entity;
        let event = FallDamageEvent {
            entity: Entity::from_bits(42),
            fall_distance: 10.0,
            damage: 105.0,
        };
        assert_eq!(event.fall_distance, 10.0);
        assert_eq!(event.damage, 105.0);
    }

    #[test]
    fn fall_damage_calculation() {
        let config = PlayerConfig::default();
        let fall_distance = 8.0;
        // damage = (fall_distance - threshold) * per_unit
        let expected = (fall_distance - config.fall_damage_threshold) * config.fall_damage_per_unit;
        assert!((expected - 75.0).abs() < f32::EPSILON);
    }

    #[test]
    fn fall_below_threshold_no_damage() {
        let config = PlayerConfig::default();
        let fall_distance = 2.0; // below threshold of 3.0
        assert!(fall_distance <= config.fall_damage_threshold);
    }

    #[test]
    fn collision_skin_prevents_zero() {
        let config = PlayerConfig::default();
        // Collision skin should prevent exact-zero clamp.
        assert!(config.collision_skin > 0.0);
        assert!(config.collision_skin < config.half_x);
    }
}
