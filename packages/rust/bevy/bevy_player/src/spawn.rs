use avian3d::prelude::*;
use bevy::prelude::*;

use crate::component::{Player, PlayerPhysics};
use crate::config::PlayerConfig;

/// Spawns a player entity with all required physics components.
///
/// Creates the entity with `Transform`, `Player` marker, `PlayerPhysics`,
/// `RigidBody::Kinematic`, a cuboid `Collider`, and a downward `ShapeCaster`
/// for ground detection. Does **not** add any mesh or material — that is the
/// game's responsibility.
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_player::{spawn_player_entity, PlayerConfig};
///
/// fn setup(mut commands: Commands) {
///     let config = PlayerConfig::default();
///     spawn_player_entity(&mut commands, &config, Vec3::new(0.0, 5.0, 0.0));
/// }
/// ```
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
            RigidBody::Kinematic,
            Collider::cuboid(config.half_x * 2.0, config.height, config.half_z * 2.0),
            // Ground detection: short downward shape cast from player's feet.
            ShapeCaster::new(
                Collider::cuboid(
                    config.half_x * 2.0 * 0.9,
                    0.1,
                    config.half_z * 2.0 * 0.9,
                ),
                Vec3::new(0.0, -(config.height / 2.0), 0.0),
                Quat::IDENTITY,
                Dir3::NEG_Y,
            )
            .with_max_distance(0.15),
        ))
        .id()
}
