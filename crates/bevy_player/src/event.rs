use bevy::prelude::*;

/// Fired when the player lands after exceeding the fall damage threshold.
///
/// Games can observe this to apply damage, play sounds, show effects, etc.
#[derive(Event, Debug, Clone)]
pub struct FallDamageEvent {
    /// The player entity that took fall damage.
    pub entity: Entity,
    /// Total distance fallen.
    pub fall_distance: f32,
    /// Calculated damage amount.
    pub damage: f32,
}
