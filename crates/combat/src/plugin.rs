//! Bevy ECS integration.
//!
//! The scheduling half of the crate: components that hold the pure types, the
//! messages that request and report an ability, and the systems that advance
//! cooldowns, casts and effects. The resolution itself is still
//! [`crate::resolve`] -- nothing in here decides damage, so a server running
//! this plugin headless reaches the same numbers as a client predicting them.
//!
//! What is deliberately *not* here: input, target selection, and any opinion
//! about how a target is chosen or displayed. Those belong to the game.

use bevy::ecs::system::SystemParam;
use bevy::prelude::*;

use crate::ability::{Ability, Denial, Payload};
use crate::cast::{Aim, Cast, GLOBAL_COOLDOWN, Readiness, usable};
use crate::effect::{Effect, EffectKind, combine};
use crate::resolve::{Outcome, resolve};
use crate::rng::Rng;
use crate::stats::{Health, Modifiers, Resource, Stats};
use crate::time::{Millis, Timer};

/// Ordering handle, so a game can schedule its own work relative to combat --
/// target selection before it, floating damage numbers after it.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct CombatSystems;

pub struct CombatPlugin;

impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CombatRng>()
            .add_message::<UseAbility>()
            .add_message::<AbilityStarted>()
            .add_message::<AbilityDenied>()
            .add_message::<AbilityLanded>()
            .add_message::<Died>()
            .add_systems(
                Update,
                (advance_clocks, start_abilities, finish_casts)
                    .chain()
                    .in_set(CombatSystems),
            );
    }
}

/// The seeded generator every roll in the world draws from.
///
/// A resource rather than a field on each character so that a replay or a
/// server re-simulation can seed the whole world at once and get the fight back.
#[derive(Resource)]
pub struct CombatRng(pub Rng);

impl Default for CombatRng {
    fn default() -> Self {
        Self(Rng::new(0x5eed, 0))
    }
}

/// A character that can fight.
#[derive(Component, Debug)]
pub struct Combatant {
    pub stats: Stats,
    pub health: Health,
    pub resource: Resource,
}

impl Combatant {
    pub fn new(health: i32, resource: i32, stats: Stats) -> Self {
        Self {
            stats,
            health: Health::new(health),
            resource: Resource::new(resource),
        }
    }
}

/// Marks a character whose health has reached zero.
///
/// A component rather than despawning, because a corpse still needs to be
/// looted, resurrected, or watched by whatever animation plays it down.
#[derive(Component, Debug)]
pub struct Dead;

/// Effects currently on a character.
#[derive(Component, Debug, Default)]
pub struct ActiveEffects(pub Vec<Effect>);

impl ActiveEffects {
    /// Adds an effect, stacking onto an existing one of the same kind rather
    /// than accumulating duplicates that would each tick separately.
    pub fn apply(&mut self, kind: EffectKind, stacks: u8, duration: Millis) {
        if let Some(existing) = self.0.iter_mut().find(|effect| effect.kind == kind) {
            existing.refresh(stacks, duration);
        } else {
            self.0.push(Effect::new(kind, stacks, duration));
        }
    }

    pub fn has(&self, kind: EffectKind) -> bool {
        self.0.iter().any(|effect| effect.kind == kind)
    }

    /// The folded modifiers of everything currently active.
    pub fn modifiers(&self) -> Modifiers {
        combine(Modifiers::default(), self.0.iter().copied())
    }
}

/// One ability and its own cooldown.
#[derive(Debug, Clone, Copy)]
pub struct Slot {
    pub ability: Ability,
    pub cooldown: Timer,
}

/// What a character can do, in the order the interface shows it.
#[derive(Component, Debug, Default)]
pub struct AbilityBar {
    pub slots: Vec<Slot>,
    pub global_cooldown: Timer,
}

impl AbilityBar {
    pub fn new(abilities: impl IntoIterator<Item = Ability>) -> Self {
        Self {
            slots: abilities
                .into_iter()
                .map(|ability| Slot {
                    ability,
                    cooldown: Timer::READY,
                })
                .collect(),
            global_cooldown: Timer::READY,
        }
    }

    pub fn ability(&self, slot: usize) -> Option<Ability> {
        self.slots.get(slot).map(|slot| slot.ability)
    }
}

/// A cast in progress, and what it was aimed at when it started.
///
/// The target is captured at the start rather than read at the end, so walking
/// out of range interrupts the cast instead of silently retargeting it.
#[derive(Component, Debug)]
pub struct Casting {
    pub slot: usize,
    pub target: Option<Entity>,
    pub cast: Cast,
}

/// Ask for an ability to be used. The game writes these; nothing else should.
#[derive(Message, Debug, Clone, Copy)]
pub struct UseAbility {
    pub caster: Entity,
    pub slot: usize,
    pub target: Option<Entity>,
}

/// An ability that passed its checks and was paid for.
///
/// Announced whether it resolves instantly or begins a cast, because what
/// reacts to an ability starting -- an animation, a sound, a wind-up effect --
/// has to start at the press, not at the outcome. Without this, the only signal
/// available is [`AbilityLanded`], which for a cast arrives more than a second
/// too late and never arrives at all on a miss.
#[derive(Message, Debug, Clone, Copy)]
pub struct AbilityStarted {
    pub caster: Entity,
    pub slot: usize,
    pub target: Option<Entity>,
    /// How long until it resolves. Zero for an instant.
    pub cast_time: Millis,
}

/// An ability that could not be used, and why.
#[derive(Message, Debug, Clone, Copy)]
pub struct AbilityDenied {
    pub caster: Entity,
    pub slot: usize,
    pub denial: Denial,
}

/// An ability that resolved against one character.
///
/// One per character affected, so an area ability produces several.
#[derive(Message, Debug, Clone, Copy)]
pub struct AbilityLanded {
    pub caster: Entity,
    pub target: Entity,
    pub outcome: Outcome,
}

/// A character whose health reached zero.
#[derive(Message, Debug, Clone, Copy)]
pub struct Died {
    pub entity: Entity,
    /// Absent when nothing killed it directly -- a damage-over-time effect
    /// finishing the job, or falling out of the world.
    pub killer: Option<Entity>,
}

/// Advances every clock in the world: cooldowns, the global cooldown, casts,
/// and effects, applying whatever damage the effects deal.
fn advance_clocks(
    time: Res<Time>,
    mut bars: Query<&mut AbilityBar>,
    mut casting: Query<&mut Casting>,
    mut effected: Query<(Entity, &mut ActiveEffects, &mut Combatant), Without<Dead>>,
    mut deaths: MessageWriter<Died>,
    mut commands: Commands,
) {
    let elapsed = Millis::from_secs_f32(time.delta_secs());
    if elapsed.is_zero() {
        return;
    }

    for mut bar in &mut bars {
        bar.global_cooldown.tick(elapsed);
        for slot in &mut bar.slots {
            slot.cooldown.tick(elapsed);
        }
    }

    for mut cast in &mut casting {
        cast.cast.tick(elapsed);
    }

    for (entity, mut effects, mut combatant) in &mut effected {
        // `Dead` is inserted through Commands and so lands a sync point later
        // than the health that caused it. Until then this query still yields
        // the corpse, and without this check its remaining effects tick again
        // and announce a second death.
        if combatant.health.is_dead() {
            continue;
        }

        let mut damage = 0;
        for effect in &mut effects.0 {
            damage += effect.tick(elapsed);
        }
        effects.0.retain(|effect| !effect.is_expired());

        if damage > 0 {
            combatant.health.damage(damage);
            if combatant.health.is_dead() {
                commands.entity(entity).insert(Dead);
                deaths.write(Died {
                    entity,
                    killer: None,
                });
            }
        }
    }
}

/// Everything combat says to the rest of the game.
///
/// Bundled so the systems below take an argument list a reader can hold in
/// their head, and so a new message reaches every caller at once.
#[derive(SystemParam)]
struct Announcer<'w> {
    started: MessageWriter<'w, AbilityStarted>,
    landed: MessageWriter<'w, AbilityLanded>,
    deaths: MessageWriter<'w, Died>,
    denials: MessageWriter<'w, AbilityDenied>,
}

/// The world a resolution reads and writes.
#[derive(SystemParam)]
struct Actors<'w, 's> {
    combatants: Query<'w, 's, (&'static mut Combatant, &'static mut ActiveEffects)>,
    bars: Query<'w, 's, &'static mut AbilityBar>,
    casting: Query<'w, 's, &'static Casting>,
    positions: Query<'w, 's, &'static GlobalTransform>,
    dead: Query<'w, 's, (), With<Dead>>,
}

/// Consumes [`UseAbility`] requests: checks them, pays for them, and either
/// resolves them on the spot or starts a cast.
fn start_abilities(
    mut requests: MessageReader<UseAbility>,
    mut announcer: Announcer,
    mut actors: Actors,
    mut rng: ResMut<CombatRng>,
    mut commands: Commands,
) {
    for request in requests.read() {
        let Ok(bar) = actors.bars.get(request.caster) else {
            continue;
        };
        let Some(slot) = bar.slots.get(request.slot) else {
            continue;
        };
        let ability = slot.ability;
        let slot_cooldown = slot.cooldown;
        let global_cooldown = bar.global_cooldown;

        let Ok((combatant, effects)) = actors.combatants.get(request.caster) else {
            continue;
        };

        let target = request
            .target
            .filter(|target| actors.dead.get(*target).is_err());
        let aim = Aim {
            target: target.is_some(),
            distance_cm: target
                .and_then(|target| distance_cm(&actors.positions, request.caster, target)),
        };

        let state = Readiness {
            cooldown: slot_cooldown,
            global_cooldown,
            resource: combatant.resource,
            health: combatant.health,
            stunned: effects.has(EffectKind::Stunned),
            casting: actors.casting.get(request.caster).is_ok(),
        };

        if let Err(denial) = usable(&ability, &state, aim) {
            announcer.denials.write(AbilityDenied {
                caster: request.caster,
                slot: request.slot,
                denial,
            });
            continue;
        }

        // Paid for and locked out before it resolves, so a request repeated in
        // the same frame cannot be used twice.
        if let Ok((mut combatant, _)) = actors.combatants.get_mut(request.caster) {
            combatant.resource.spend(ability.cost);
        }
        if let Ok(mut bar) = actors.bars.get_mut(request.caster) {
            if let Some(slot) = bar.slots.get_mut(request.slot) {
                slot.cooldown.start(ability.cooldown);
            }
            if ability.on_global_cooldown {
                bar.global_cooldown.start(GLOBAL_COOLDOWN);
            }
        }

        announcer.started.write(AbilityStarted {
            caster: request.caster,
            slot: request.slot,
            target,
            cast_time: ability.cast_time,
        });

        if ability.is_instant() {
            if let Some(landing) = apply(
                &ability,
                request.caster,
                target,
                &mut actors.combatants,
                &mut rng,
            ) {
                announce(request.caster, landing, &mut announcer, &mut commands);
            }
        } else {
            commands.entity(request.caster).insert(Casting {
                slot: request.slot,
                target,
                cast: Cast::new(ability.cast_time),
            });
        }
    }
}

/// Resolves casts that finished this frame.
fn finish_casts(
    finished: Query<(Entity, &Casting)>,
    mut actors: Actors,
    mut announcer: Announcer,
    mut rng: ResMut<CombatRng>,
    mut commands: Commands,
) {
    for (caster, casting) in &finished {
        if !casting.cast.remaining().is_zero() {
            continue;
        }

        commands.entity(caster).remove::<Casting>();

        let Some(ability) = actors
            .bars
            .get(caster)
            .ok()
            .and_then(|bar| bar.ability(casting.slot))
        else {
            continue;
        };

        if let Some(landing) = apply(
            &ability,
            caster,
            casting.target,
            &mut actors.combatants,
            &mut rng,
        ) {
            announce(caster, landing, &mut announcer, &mut commands);
        }
    }
}

/// What a resolution did, for the calling system to announce.
///
/// Returned rather than written from inside [`apply`], so the helper touches
/// only the world state and every message leaves from the system that owns the
/// writers.
struct Landing {
    subject: Entity,
    outcome: Outcome,
    died: bool,
}

/// Resolves one ability against its target and applies the outcome.
///
/// Only the single-target shapes for now. An area shape needs a spatial query
/// to decide who is inside it, which is the game's to answer, and pretending
/// otherwise here would quietly resolve a cone against one character.
fn apply(
    ability: &Ability,
    caster: Entity,
    target: Option<Entity>,
    combatants: &mut Query<(&mut Combatant, &mut ActiveEffects)>,
    rng: &mut CombatRng,
) -> Option<Landing> {
    let subject = match ability.shape {
        crate::ability::Shape::Caster => Some(caster),
        _ => target,
    };
    let subject = subject?;

    let (attacker, attacker_effects) = combatants.get(caster).ok()?;
    let attacker_stats = attacker.stats;
    let dealt = attacker_effects.modifiers();

    let (defender, defender_effects) = combatants.get(subject).ok()?;

    // The same deferred-insertion gap: an ability queued while the target was
    // alive can arrive after something else has killed it. Resolving anyway
    // drives health further below zero and fires a second `Died`.
    if defender.health.is_dead() {
        return None;
    }

    let defender_stats = defender.stats;
    let taken = defender_effects.modifiers();

    let modifiers = Modifiers {
        dealt: dealt.dealt,
        taken: taken.taken,
        absorb: taken.absorb,
    };

    let outcome = resolve(
        ability,
        &attacker_stats,
        &defender_stats,
        modifiers,
        &mut rng.0,
    );

    let (mut combatant, mut effects) = combatants.get_mut(subject).ok()?;

    match outcome {
        Outcome::Hit { damage, .. } => {
            combatant.health.damage(damage);
        }
        Outcome::Healed { amount, .. } => {
            combatant.health.heal(amount);
        }
        Outcome::Applied => {
            if let Payload::Apply {
                kind,
                stacks,
                duration,
            } = ability.payload
            {
                effects.apply(kind, stacks, duration);
            }
        }
        Outcome::Miss => {}
    }

    Some(Landing {
        subject,
        outcome,
        died: combatant.health.is_dead(),
    })
}

/// Announces a landing and marks the dead.
///
/// Shared by the instant and the cast path so the two cannot drift into
/// reporting the same event differently.
fn announce(caster: Entity, landing: Landing, announcer: &mut Announcer, commands: &mut Commands) {
    announcer.landed.write(AbilityLanded {
        caster,
        target: landing.subject,
        outcome: landing.outcome,
    });

    if landing.died {
        commands.entity(landing.subject).insert(Dead);
        announcer.deaths.write(Died {
            entity: landing.subject,
            killer: Some(caster),
        });
    }
}

/// Straight-line distance in centimetres, or `None` when either end has no
/// place in the world -- a headless fight with no transforms skips the range
/// check rather than failing it.
fn distance_cm(positions: &Query<&GlobalTransform>, from: Entity, to: Entity) -> Option<u32> {
    let from = positions.get(from).ok()?.translation();
    let to = positions.get(to).ok()?.translation();
    Some((from.distance(to) * 100.0).max(0.0) as u32)
}
