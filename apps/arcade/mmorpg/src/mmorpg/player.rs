//! The keyboard, and nothing else.
//!
//! Everything this module used to hold -- movement, gait, facing, the skeleton
//! wiring -- lives in [`super::character`] now, because none of it was ever
//! about the player. What is left is the tag that says which character input
//! steers, and the one system that reads a key.

use bevy::prelude::*;

use super::camera::{CameraTarget, OrbitCamera};
use bevy_skills::SkillProfile;

use super::character::{MoveIntent, spawn_character};
use super::combat::{CameraLock, Faction, make_combatant};
use super::world::height_at;

/// How many idle characters to place beside the player.
///
/// Not scenery. Until a second character exists, nothing proves the systems
/// stopped assuming there is exactly one -- a `Single<>` left anywhere in the
/// movement path panics on the frame this becomes non-zero.
const COMPANIONS: usize = 4;

/// Companions per ring when `MMORPG_NPCS=<n>` asks for more; each ring sits 6 m further out.
const RING: usize = 8;

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

    let (sx, sz) = std::env::var("MMORPG_SPAWN")
        .ok()
        .and_then(|v| {
            let (x, z) = v.split_once(',')?;
            Some((x.trim().parse().ok()?, z.trim().parse().ok()?))
        })
        .unwrap_or((0.0, 0.0));
    let player = spawn_character(&mut commands, drop(sx, sz));
    commands.entity(player).insert((
        Player,
        CameraTarget,
        CameraLock::default(),
        SkillProfile::default(),
    ));
    make_combatant(
        &mut commands,
        player,
        Faction::Friendly,
        500,
        super::combat::player_stats(),
    );

    let companions = std::env::var("MMORPG_NPCS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(COMPANIONS);
    for index in 0..companions {
        let ring = index / RING;
        let angle = (index % RING) as f32 / RING as f32 * core::f32::consts::TAU;
        let radius = 4.0 + 6.0 * ring as f32;
        let (x, z) = (sx + angle.cos() * radius, sz + angle.sin() * radius);
        spawn_character(&mut commands, drop(x, z));
    }
}

/// The only system in the game that knows a keyboard exists.
/// Drives the player without a keyboard, from `MMORPG_AUTOWALK=walk|jog|turn|jogturn|zigzag|reverse|stopgo|gear|jitter|swap|stopswap|rest|nudge|orbit|hop|stillhop`; `MMORPG_STRAFE=1` locks the facing north; `MMORPG_AUTORUN=1` runs any of them; `MMORPG_NPCS=<n>` places that many idle companions in rings; `MMORPG_HEADING=<deg>` yaws every autowalk; `MMORPG_SPAWN=<x>,<z>` places the cast.
#[derive(Resource, Default)]
pub struct Autowalk {
    pub enabled: bool,
    pub run: bool,
    pub turn_rate: f32,
    /// Yaw added to every autowalk direction, radians; `MMORPG_HEADING=<deg>` aims a straight walk at a hill.
    pub heading: f32,
}

impl Autowalk {
    fn from_env() -> Self {
        let auto = match std::env::var("MMORPG_AUTOWALK").as_deref() {
            Ok("walk") => Self {
                enabled: true,
                run: false,
                turn_rate: 0.0,
                heading: 0.0,
            },
            Ok("jog") => Self {
                enabled: true,
                run: true,
                turn_rate: 0.0,
                heading: 0.0,
            },
            Ok("turn") => Self {
                enabled: true,
                run: false,
                turn_rate: 0.8,
                heading: 0.0,
            },
            Ok("jogturn") => Self {
                enabled: true,
                run: true,
                turn_rate: 0.8,
                heading: 0.0,
            },
            Ok("zigzag") => Self {
                enabled: true,
                run: false,
                turn_rate: -1.0,
                heading: 0.0,
            },
            Ok("reverse") => Self {
                enabled: true,
                run: false,
                turn_rate: -2.0,
                heading: 0.0,
            },
            Ok("stopgo") => Self {
                enabled: true,
                run: false,
                turn_rate: -3.0,
                heading: 0.0,
            },
            Ok("gear") => Self {
                enabled: true,
                run: false,
                turn_rate: -4.0,
                heading: 0.0,
            },
            Ok("jitter") => Self {
                enabled: true,
                run: false,
                turn_rate: -5.0,
                heading: 0.0,
            },
            Ok("swap") => Self {
                enabled: true,
                run: false,
                turn_rate: -6.0,
                heading: 0.0,
            },
            Ok("stopswap") => Self {
                enabled: true,
                run: false,
                turn_rate: -7.0,
                heading: 0.0,
            },
            Ok("rest") => Self {
                enabled: true,
                run: false,
                turn_rate: -8.0,
                heading: 0.0,
            },
            Ok("nudge") => Self {
                enabled: true,
                run: false,
                turn_rate: -9.0,
                heading: 0.0,
            },
            Ok("orbit") => Self {
                enabled: true,
                run: false,
                turn_rate: -10.0,
                heading: 0.0,
            },
            Ok("hop") => Self {
                enabled: true,
                run: false,
                turn_rate: -11.0,
                heading: 0.0,
            },
            Ok("stillhop") => Self {
                enabled: true,
                run: false,
                turn_rate: -12.0,
                heading: 0.0,
            },
            _ => Self::default(),
        };
        Self {
            run: auto.run || std::env::var("MMORPG_AUTORUN").is_ok_and(|v| v != "0"),
            heading: std::env::var("MMORPG_HEADING")
                .ok()
                .and_then(|v| v.parse::<f32>().ok())
                .unwrap_or(0.0)
                .to_radians(),
            ..auto
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
        let gear = auto.turn_rate < -3.5 && auto.turn_rate > -4.5;
        let jitter = auto.turn_rate < -4.5 && auto.turn_rate > -5.5;
        let hop = auto.turn_rate < -10.5;
        let still = auto.turn_rate < -11.5;
        let orbit = auto.turn_rate < -9.5 && !hop;
        let nudge = auto.turn_rate < -8.5 && !orbit && !hop;
        let swap = auto.turn_rate < -5.5 && !nudge && !orbit && !hop;
        let rest = auto.turn_rate < -7.5 && !nudge && !orbit && !hop;
        let swap_gap = if rest {
            3.0
        } else if auto.turn_rate < -6.5 {
            1.0
        } else {
            0.15
        };
        let swap_leg = 4.0 + swap_gap;
        let angle = if gear || rest || hop {
            0.0
        } else if orbit {
            time.elapsed_secs() * 0.4
        } else if nudge {
            let at = time.elapsed_secs().rem_euclid(3.0);
            if at < 1.5 {
                0.0
            } else if at < 1.6 {
                -core::f32::consts::FRAC_PI_2
            } else {
                -core::f32::consts::FRAC_PI_4
            }
        } else if swap {
            ((time.elapsed_secs() / swap_leg).floor() as i32 % 2) as f32 * core::f32::consts::PI
        } else if jitter {
            ((time.elapsed_secs() / 0.6).floor() as i32 % 4) as f32 * core::f32::consts::FRAC_PI_2
        } else if auto.turn_rate < 0.0 {
            match (flip, auto.turn_rate < -1.5) {
                (false, _) => 0.0,
                (true, false) => core::f32::consts::FRAC_PI_2,
                (true, true) => core::f32::consts::PI,
            }
        } else {
            time.elapsed_secs() * auto.turn_rate
        };
        let halted = if still {
            true
        } else if swap {
            time.elapsed_secs().rem_euclid(swap_leg) < swap_gap
        } else {
            !gear && !jitter && !nudge && !orbit && !hop && auto.turn_rate < -2.5 && flip
        };
        let wish = if halted {
            Vec3::ZERO
        } else {
            Quat::from_rotation_y(angle + auto.heading) * Vec3::NEG_Z
        };
        let now = time.elapsed_secs();
        let leap =
            hop && now > 2.0 && (now / 3.0).floor() != ((now - time.delta_secs()) / 3.0).floor();
        for mut intent in &mut controlled {
            intent.wish = wish;
            intent.run = auto.run || (gear && flip);
            intent.jump = leap;
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
