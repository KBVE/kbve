//! Tab targeting, the ability bar, and the camera's opinion about who you are
//! fighting.
//!
//! The resolution itself is not here and never should be -- that is the
//! `combat` crate, which knows nothing about bevy, input or cameras. What lives
//! here is everything that is genuinely this game's: which key selects a
//! target, how a target is chosen, and what the view does about it.

use avian3d::prelude::LinearVelocity;
use bevy::input::mouse::AccumulatedMouseMotion;
use bevy::prelude::*;
use combat::{
    Ability, AbilityBar, AbilityDenied, AbilityLanded, ActiveEffects, CombatPlugin, CombatSystems,
    Combatant, Dead, Denial, Died, EffectKind, Millis, Outcome, Payload, Stats, UseAbility,
};

use super::camera::OrbitCamera;
use super::character::{Character, Heading, MoveIntent, spawn_character};
use super::player::Player;
use super::world::height_at;

pub struct GameCombatPlugin;

impl Plugin for GameCombatPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(CombatPlugin)
            .add_systems(Startup, spawn_training_dummies)
            .add_systems(
                Update,
                (
                    // Selection runs before the combat systems, so an ability
                    // pressed on the same frame as Tab uses the new target
                    // rather than the one it replaced.
                    (cycle_target, clear_dead_target).before(CombatSystems),
                    (read_ability_keys, flush_queue)
                        .chain()
                        .before(CombatSystems),
                    // Before the character systems rather than after: the model
                    // is turned and the bearing decided in the same frame the
                    // target changed, so a fresh selection does not spend a
                    // frame walking backwards away from the old one.
                    aim_at_target
                        .after(cycle_target)
                        .before(super::character::CharacterSystems),
                    (report_denials, queue_denied, report_landings, on_death).after(CombatSystems),
                ),
            )
            .add_systems(PostUpdate, face_target.before(super::camera::CameraSystems));
    }
}

/// How many practice targets to place.
const DUMMIES: usize = 3;

/// How far Tab will look for something to fight, in metres.
const SELECT_RANGE: f32 = 30.0;

/// How much of the screen counts as "in front of you" for target selection.
///
/// A full circle would happily select the enemy behind you, which is never what
/// pressing Tab meant.
const SELECT_ARC_DEGREES: f32 = 140.0;

/// How fast the camera swings to put a new target in view, per second.
const LOCK_RATE: f32 = 6.0;

/// How long a refused press keeps trying, in seconds.
///
/// A press that arrives half a second early is the player being eager, not the
/// player being wrong, and throwing it away is what made three of every four
/// keypresses do nothing. Holding it briefly and retrying is what every MMO
/// does, and it is the difference between combat that feels responsive and
/// combat that feels like it is ignoring you.
///
/// Short on purpose: a queue long enough to fire an ability the player has
/// stopped wanting is worse than no queue.
const QUEUE_SECONDS: f32 = 0.6;

/// Which side a character is on.
///
/// Two factions is enough to make targeting mean something, and adding more is
/// a matter of adding variants rather than reworking the checks.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Faction {
    Friendly,
    Hostile,
}

/// The character this one has selected.
///
/// A component rather than a resource, so an NPC picking a target uses the same
/// machinery the player does.
#[derive(Component, Default, Debug)]
pub struct Target(pub Option<Entity>);

/// A press that was refused for a reason that will pass on its own.
///
/// Only one: a queue of several would fire a burst the moment the character
/// came into range, which reads as the game playing itself.
#[derive(Component, Debug)]
pub struct Queued {
    slot: usize,
    target: Option<Entity>,
    remaining: f32,
}

/// Whether the camera should keep the selected target in frame.
#[derive(Component, Default, Debug)]
pub struct CameraLock(pub bool);

/// The starting bar.
///
/// Deliberately four different shapes of ability rather than four damage
/// numbers: an instant, a cast, a cooldown, and one that applies an effect
/// instead of dealing damage. Each exercises a different path through the
/// crate, so a regression in any of them shows up by playing rather than only
/// in a test.
fn starting_abilities() -> [Ability; 4] {
    [
        // 1 -- the auto-attack. Instant, free, and within arm's length.
        //
        // 150cm, not the 300 it was: two capsules touching are 64cm apart and
        // the arm reaches 55cm past the shoulder, measured out of the clips. A
        // punch thrown from three metres cannot connect with anything, and no
        // amount of IK correction fixes a target outside the arm's reach.
        Ability {
            cooldown: Millis(600),
            ..Ability::attack(12, 150)
        },
        // 2 -- a heavier strike on a real cooldown.
        Ability {
            cost: 10,
            cooldown: Millis(4000),
            ..Ability::attack(34, 150)
        },
        // 3 -- a ranged bolt that has to be stood still for.
        Ability {
            cost: 20,
            cast_time: Millis(1200),
            cooldown: Millis(1500),
            ..Ability::attack(45, 2500)
        },
        // 4 -- a poison, which deals nothing on impact and everything after.
        Ability {
            cost: 15,
            cooldown: Millis(8000),
            payload: Payload::Apply {
                kind: EffectKind::Poison,
                stacks: 3,
                duration: Millis(9000),
            },
            ..Ability::attack(0, 2000)
        },
    ]
}

pub fn player_stats() -> Stats {
    Stats {
        power: 6,
        accuracy: 950,
        crit_chance: 150,
        ..Stats::default()
    }
}

fn dummy_stats() -> Stats {
    Stats {
        armor: 3,
        evasion: 50,
        ..Stats::default()
    }
}

/// Adds the combat components to a character that already exists.
///
/// Separate from `spawn_character` on purpose: not everything that walks around
/// fights, and the movement code should not have to know what a `Combatant` is.
pub fn make_combatant(
    commands: &mut Commands,
    entity: Entity,
    faction: Faction,
    health: i32,
    stats: Stats,
) {
    commands.entity(entity).insert((
        Combatant::new(health, 100, stats),
        ActiveEffects::default(),
        AbilityBar::new(starting_abilities()),
        Target::default(),
        faction,
    ));
}

fn spawn_training_dummies(mut commands: Commands) {
    if std::env::var("MMORPG_NPCS").as_deref() == Ok("0") {
        return;
    }
    for index in 0..DUMMIES {
        let angle = index as f32 / DUMMIES as f32 * core::f32::consts::TAU;
        let (x, z) = (angle.cos() * 9.0, angle.sin() * 9.0);
        let position = Vec3::new(x, height_at(x, z) + 4.0, z);

        let dummy = spawn_character(&mut commands, position);
        make_combatant(&mut commands, dummy, Faction::Hostile, 220, dummy_stats());
    }
}

/// Who is doing the selecting, and what they have selected.
type Selector = (
    Entity,
    &'static Transform,
    &'static mut Target,
    &'static mut CameraLock,
);

/// Anything alive that could be selected.
type Candidate = (Entity, &'static Transform, &'static Faction);

/// Tab picks the nearest live hostile in front of the camera; Tab again moves
/// to the next one out; Escape drops the selection.
///
/// Sorted by distance rather than by entity id, so the order is the one the
/// player can see, and cycling is stable frame to frame.
fn cycle_target(
    keys: Res<ButtonInput<KeyCode>>,
    camera: Single<&Transform, With<OrbitCamera>>,
    mut selector: Query<Selector, With<Player>>,
    candidates: Query<Candidate, (With<Character>, Without<Dead>)>,
    mut auto: Local<Option<bool>>,
) {
    let auto = *auto.get_or_insert_with(|| std::env::var("MMORPG_TARGET").is_ok_and(|v| v != "0"));
    let cycle = keys.just_pressed(KeyCode::Tab)
        || (auto && selector.iter().any(|(_, _, target, _)| target.0.is_none()));
    let clear = keys.just_pressed(KeyCode::Escape);
    if !cycle && !clear {
        return;
    }

    for (me, transform, mut target, mut lock) in &mut selector {
        if clear {
            target.0 = None;
            lock.0 = false;
            continue;
        }

        let forward = camera.forward().as_vec3();
        let limit = (SELECT_ARC_DEGREES.to_radians() * 0.5).cos();

        let mut visible: Vec<(Entity, f32)> = candidates
            .iter()
            .filter(|(entity, _, faction)| *entity != me && **faction == Faction::Hostile)
            .filter_map(|(entity, other, _)| {
                let offset = other.translation - transform.translation;
                let distance = offset.length();
                if distance > SELECT_RANGE {
                    return None;
                }
                // Measured against the camera's facing, not the character's:
                // Tab should select what you are looking at, and the character
                // is often facing where they are running instead.
                let planar = Vec3::new(offset.x, 0.0, offset.z).normalize_or_zero();
                let facing = Vec3::new(forward.x, 0.0, forward.z).normalize_or_zero();
                (planar.dot(facing) >= limit).then_some((entity, distance))
            })
            .collect();

        visible.sort_by(|a, b| a.1.total_cmp(&b.1));

        let next = match target.0 {
            Some(current) => visible
                .iter()
                .position(|(entity, _)| *entity == current)
                .map(|index| visible[(index + 1) % visible.len()].0)
                .or_else(|| visible.first().map(|(entity, _)| *entity)),
            None => visible.first().map(|(entity, _)| *entity),
        };

        target.0 = next;
        lock.0 = next.is_some();
    }
}

/// Drops a selection once its subject dies, so the bar stops reporting
/// out-of-range at a corpse.
fn clear_dead_target(
    dead: Query<(), With<Dead>>,
    mut selectors: Query<(&mut Target, &mut CameraLock)>,
) {
    for (mut target, mut lock) in &mut selectors {
        if let Some(current) = target.0
            && dead.get(current).is_ok()
        {
            target.0 = None;
            lock.0 = false;
        }
    }
}

/// Points a character at whatever it has selected.
///
/// Deliberately keyed off the selection and not the camera lock. Breaking the
/// lock means "stop moving my camera for me", which is a different request from
/// "stop looking at the thing I am fighting" -- keeping the two apart is what
/// lets a player swing the view around a fight without the character pirouetting
/// to match.
fn aim_at_target(
    mut selectors: Query<(&Transform, &Target, &mut Heading)>,
    subjects: Query<&Transform, With<Character>>,
    mut strafe: Local<Option<bool>>,
) {
    let strafe =
        *strafe.get_or_insert_with(|| std::env::var("MMORPG_STRAFE").is_ok_and(|v| v != "0"));
    for (transform, target, mut heading) in &mut selectors {
        let wanted = target
            .0
            .and_then(|entity| subjects.get(entity).ok())
            .and_then(|subject| {
                let offset = subject.translation - transform.translation;
                Dir3::new(Vec3::new(offset.x, 0.0, offset.z)).ok()
            });
        heading.0 = wanted.or(strafe.then_some(Dir3::NEG_Z));
    }
}

/// Turns number keys into ability requests. The only place a keycode meets
/// combat.
fn read_ability_keys(
    keys: Res<ButtonInput<KeyCode>>,
    players: Query<(Entity, &Target), With<Player>>,
    mut requests: MessageWriter<UseAbility>,
    mut commands: Commands,
) {
    const BINDINGS: [KeyCode; 4] = [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
    ];

    for (player, target) in &players {
        for (slot, key) in BINDINGS.iter().enumerate() {
            if keys.just_pressed(*key) {
                // Replaces whatever was queued: the last thing pressed is what
                // the player wants, not the first.
                commands.entity(player).remove::<Queued>();
                requests.write(UseAbility {
                    caster: player,
                    slot,
                    target: target.0,
                });
            }
        }
    }
}

/// Re-issues a queued press while it is still wanted.
fn flush_queue(
    time: Res<Time>,
    mut queued: Query<(Entity, &mut Queued)>,
    mut requests: MessageWriter<UseAbility>,
    mut commands: Commands,
) {
    for (entity, mut queue) in &mut queued {
        queue.remaining -= time.delta_secs();
        if queue.remaining <= 0.0 {
            commands.entity(entity).remove::<Queued>();
            continue;
        }
        requests.write(UseAbility {
            caster: entity,
            slot: queue.slot,
            target: queue.target,
        });
    }
}

/// Holds onto a press that failed for a reason time will fix.
///
/// Deliberately not every refusal. Being out of mana or having nothing selected
/// will not resolve by waiting, so retrying those would just fire the moment
/// the player picked a target -- an ability they asked for seconds ago.
fn queue_denied(
    mut denials: MessageReader<AbilityDenied>,
    targets: Query<&Target>,
    mut commands: Commands,
) {
    for denial in denials.read() {
        let transient = matches!(
            denial.denial,
            Denial::OnCooldown | Denial::GlobalCooldown | Denial::OutOfRange
        );
        if !transient {
            continue;
        }
        let target = targets.get(denial.caster).ok().and_then(|target| target.0);
        commands.entity(denial.caster).insert(Queued {
            slot: denial.slot,
            target,
            remaining: QUEUE_SECONDS,
        });
    }
}

/// Swings the camera to bring a newly selected target into view.
///
/// Only the yaw, and only while locked. Taking the pitch as well would fight
/// the player for control of the camera every time they looked somewhere on
/// purpose, and this is meant to help them find the target, not to hold their
/// head.
///
/// The lock is soft in the literal sense: the moment the player drags the mouse,
/// it is gone. Two things writing the same yaw in the same frame is a fight the
/// player always loses -- the camera creeps back the instant they let go -- and
/// an assist that cannot be overridden stops being an assist. Tab puts it back.
fn face_target(
    time: Res<Time>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    targets: Query<&Transform, Without<OrbitCamera>>,
    mut selectors: Query<(&Transform, &Target, &mut CameraLock), With<Player>>,
    mut camera: Single<&mut OrbitCamera>,
) {
    let Ok((me, target, mut lock)) = selectors.single_mut() else {
        return;
    };
    if !lock.0 {
        return;
    }

    // The same test the camera itself uses to decide it is being steered, so the
    // two cannot disagree about whether the player took over.
    let steering = buttons.pressed(MouseButton::Right) || buttons.pressed(MouseButton::Left);
    if steering && motion.delta.x != 0.0 {
        lock.0 = false;
        return;
    }

    let Some(subject) = target.0.and_then(|entity| targets.get(entity).ok()) else {
        return;
    };

    let offset = subject.translation - me.translation;
    let planar = Vec3::new(offset.x, 0.0, offset.z);
    if planar.length_squared() < 0.01 {
        return;
    }

    // The camera sits behind the character looking forward, so the yaw that
    // frames a target is the one whose forward points at it.
    let wanted = (-planar.x).atan2(-planar.z);
    let step = 1.0 - (-LOCK_RATE * time.delta_secs()).exp();

    // Through the shorter arc: without wrapping, a target just past the seam
    // sends the camera the long way round.
    let delta = wrap_angle(wanted - camera.yaw);
    camera.yaw += delta * step;
}

/// Brings an angle into -PI..=PI.
fn wrap_angle(angle: f32) -> f32 {
    let turn = core::f32::consts::TAU;
    let wrapped = (angle + core::f32::consts::PI).rem_euclid(turn);
    wrapped - core::f32::consts::PI
}

/// Reports only the refusals the player can act on.
///
/// A queued press is refused on every frame until it fires, so logging all of
/// them buries everything else -- the earlier run showed 47 denials against 16
/// hits, and nearly all of them were the same press waiting its turn.
fn report_denials(mut denials: MessageReader<AbilityDenied>) {
    for denial in denials.read() {
        match denial.denial {
            Denial::OnCooldown | Denial::GlobalCooldown | Denial::OutOfRange => {
                debug!("slot {} waiting: {:?}", denial.slot + 1, denial.denial);
            }
            terminal => info!("slot {} unavailable: {:?}", denial.slot + 1, terminal),
        }
    }
}

fn report_landings(mut landings: MessageReader<AbilityLanded>, health: Query<&Combatant>) {
    for landing in landings.read() {
        let remaining = health
            .get(landing.target)
            .map(|combatant| combatant.health.current())
            .unwrap_or_default();

        match landing.outcome {
            Outcome::Hit { damage, crit, .. } => {
                info!(
                    "hit for {damage}{} -- {remaining} left",
                    if crit { " CRIT" } else { "" }
                );
            }
            Outcome::Miss => info!("missed"),
            Outcome::Healed { amount, .. } => info!("healed {amount}"),
            Outcome::Applied => info!("effect applied"),
        }
    }
}

/// Stops a corpse from walking.
///
/// The entity stays: something has to be there to loot, resurrect, or play a
/// death animation on. It simply stops being driven.
fn on_death(
    mut deaths: MessageReader<Died>,
    mut bodies: Query<(&mut MoveIntent, &mut LinearVelocity)>,
) {
    for death in deaths.read() {
        info!("{:?} died", death.entity);
        if let Ok((mut intent, mut velocity)) = bodies.get_mut(death.entity) {
            *intent = MoveIntent::default();
            velocity.x = 0.0;
            velocity.z = 0.0;
        }
    }
}
