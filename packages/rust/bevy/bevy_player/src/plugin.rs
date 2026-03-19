use avian3d::prelude::*;
use bevy::prelude::*;

use crate::config::{DirectionMap, PlayerConfig};
use crate::ground::detect_ground;
use crate::movement::{PlayerMovement, move_player};

/// Bevy plugin that registers the player character controller systems.
///
/// Inserts [`PlayerConfig`] and [`DirectionMap`] as resources, and adds
/// the [`move_player`] and [`detect_ground`] systems in the appropriate
/// schedules.
///
/// # Examples
///
/// ```ignore
/// use bevy::prelude::*;
/// use bevy_player::{PlayerPlugin, PlayerConfig};
///
/// App::new()
///     .add_plugins(DefaultPlugins)
///     .add_plugins(PlayerPlugin::new(PlayerConfig {
///         speed: 7.0,
///         ..default()
///     }));
/// ```
#[derive(Default)]
pub struct PlayerPlugin {
    config: PlayerConfig,
}

impl PlayerPlugin {
    /// Create a player plugin with the given configuration.
    pub fn new(config: PlayerConfig) -> Self {
        Self { config }
    }
}

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.config.clone());
        app.init_resource::<DirectionMap>();
        app.add_systems(Update, move_player.in_set(PlayerMovement));
        app.add_systems(
            PostUpdate,
            detect_ground
                .after(PhysicsSystems::Writeback)
                .in_set(PlayerMovement),
        );
    }
}
