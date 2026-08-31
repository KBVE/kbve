use bevy::prelude::*;

/// Marker component for the player entity.
#[derive(Component)]
pub struct Player;

/// Physics state tracked for the kinematic character controller.
///
/// # Examples
///
/// ```
/// use bevy_player::PlayerPhysics;
///
/// let phys = PlayerPhysics::default();
/// assert!(phys.on_ground);
/// assert_eq!(phys.velocity_y, 0.0);
/// ```
#[derive(Component, Debug)]
pub struct PlayerPhysics {
    /// Current vertical velocity (positive = upward).
    pub velocity_y: f32,
    /// Whether the player is currently on the ground.
    pub on_ground: bool,
    /// Y position when the player last left the ground (for fall damage).
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
