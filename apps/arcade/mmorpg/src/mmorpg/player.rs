//! The keyboard, and nothing else.
//!
//! Everything this module used to hold -- movement, gait, facing, the skeleton
//! wiring -- lives in [`super::character`] now, because none of it was ever
//! about the player. What is left is the tag that says which character input
//! steers, and the one system that reads a key.

use bevy::prelude::*;

use super::camera::{CameraTarget, OrbitCamera};
use super::character::{MoveIntent, spawn_character};
use super::combat::{CameraLock, Faction, make_combatant};
use super::world::height_at;

/// How many idle characters to place beside the player.
///
/// Not scenery. Until a second character exists, nothing proves the systems
/// stopped assuming there is exactly one -- a `Single<>` left anywhere in the
/// movement path panics on the frame this becomes non-zero.
const COMPANIONS: usize = 4;

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_cast)
            .add_systems(Update, read_input);
    }
}

/// Marks the one character the keyboard drives.
///
/// A tag, and only [`read_input`] looks at it. Everything downstream works off
/// [`MoveIntent`], so an NPC or a networked player runs the identical movement
/// and animation path -- the only difference is what fills the intent in.
#[derive(Component)]
pub struct Player;

fn spawn_cast(mut commands: Commands, assets: Res<AssetServer>) {
    let drop = |x: f32, z: f32| Vec3::new(x, height_at(x, z) + 4.0, z);

    let player = spawn_character(&mut commands, &assets, drop(0.0, 0.0));
    commands
        .entity(player)
        .insert((Player, CameraTarget, CameraLock::default()));
    make_combatant(
        &mut commands,
        player,
        Faction::Friendly,
        500,
        super::combat::player_stats(),
    );

    for index in 0..COMPANIONS {
        let angle = index as f32 / COMPANIONS as f32 * core::f32::consts::TAU;
        let (x, z) = (angle.cos() * 4.0, angle.sin() * 4.0);
        spawn_character(&mut commands, &assets, drop(x, z));
    }
}

/// The only system in the game that knows a keyboard exists.
fn read_input(
    keys: Res<ButtonInput<KeyCode>>,
    camera: Single<&OrbitCamera>,
    mut controlled: Query<&mut MoveIntent, With<Player>>,
) {
    let mut stick = Vec2::ZERO;
    if keys.pressed(KeyCode::KeyW) {
        stick.y += 1.0;
    }
    if keys.pressed(KeyCode::KeyS) {
        stick.y -= 1.0;
    }
    if keys.pressed(KeyCode::KeyD) {
        stick.x += 1.0;
    }
    if keys.pressed(KeyCode::KeyA) {
        stick.x -= 1.0;
    }

    // Resolved against the camera here, so the intent that leaves this system
    // is already in world space and nothing downstream needs a camera.
    let yaw = Quat::from_rotation_y(camera.yaw);
    let wish = (yaw * Vec3::NEG_Z * stick.y + yaw * Vec3::X * stick.x).normalize_or_zero();

    for mut intent in &mut controlled {
        intent.wish = wish;
        intent.run = keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight);
        intent.jump = keys.just_pressed(KeyCode::Space);
    }
}
