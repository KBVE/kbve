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
        app.insert_resource(Autowalk::from_env())
            .add_systems(Startup, spawn_cast)
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

fn spawn_cast(mut commands: Commands) {
    let drop = |x: f32, z: f32| Vec3::new(x, height_at(x, z) + 4.0, z);

    let player = spawn_character(&mut commands, drop(0.0, 0.0));
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

    if std::env::var("MMORPG_NPCS").as_deref() == Ok("0") {
        return;
    }
    for index in 0..COMPANIONS {
        let angle = index as f32 / COMPANIONS as f32 * core::f32::consts::TAU;
        let (x, z) = (angle.cos() * 4.0, angle.sin() * 4.0);
        spawn_character(&mut commands, drop(x, z));
    }
}

/// The only system in the game that knows a keyboard exists.
/// Drives the player without a keyboard, from `MMORPG_AUTOWALK=walk|jog|turn|jogturn`.
#[derive(Resource, Default)]
pub struct Autowalk {
    pub enabled: bool,
    pub run: bool,
    pub turn_rate: f32,
}

impl Autowalk {
    fn from_env() -> Self {
        match std::env::var("MMORPG_AUTOWALK").as_deref() {
            Ok("walk") => Self {
                enabled: true,
                run: false,
                turn_rate: 0.0,
            },
            Ok("jog") => Self {
                enabled: true,
                run: true,
                turn_rate: 0.0,
            },
            Ok("turn") => Self {
                enabled: true,
                run: false,
                turn_rate: 0.8,
            },
            Ok("jogturn") => Self {
                enabled: true,
                run: true,
                turn_rate: 0.8,
            },
            Ok("zigzag") => Self {
                enabled: true,
                run: false,
                turn_rate: -1.0,
            },
            Ok("reverse") => Self {
                enabled: true,
                run: false,
                turn_rate: -2.0,
            },
            Ok("stopgo") => Self {
                enabled: true,
                run: false,
                turn_rate: -3.0,
            },
            Ok("gear") => Self {
                enabled: true,
                run: false,
                turn_rate: -4.0,
            },
            _ => Self::default(),
        }
    }
}

fn read_input(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    auto: Res<Autowalk>,
    camera: Single<&OrbitCamera>,
    mut controlled: Query<&mut MoveIntent, With<Player>>,
) {
    if auto.enabled {
        let leg = if auto.turn_rate < -1.5 && auto.turn_rate > -2.5 {
            6.0
        } else {
            1.5
        };
        let flip = (time.elapsed_secs() / leg).floor() as i32 % 2 == 1;
        let gear = auto.turn_rate < -3.5;
        let angle = if gear {
            0.0
        } else if auto.turn_rate < 0.0 {
            match (flip, auto.turn_rate < -1.5) {
                (false, _) => 0.0,
                (true, false) => core::f32::consts::FRAC_PI_2,
                (true, true) => core::f32::consts::PI,
            }
        } else {
            time.elapsed_secs() * auto.turn_rate
        };
        let halted = !gear && auto.turn_rate < -2.5 && flip;
        let wish = if halted {
            Vec3::ZERO
        } else {
            Quat::from_rotation_y(angle) * Vec3::NEG_Z
        };
        for mut intent in &mut controlled {
            intent.wish = wish;
            intent.run = auto.run || (gear && flip);
            intent.jump = false;
        }
        return;
    }
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
