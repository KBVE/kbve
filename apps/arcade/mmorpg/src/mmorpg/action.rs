//! One-shot animations that interrupt locomotion: swings, casts, flinches and
//! dying.
//!
//! Locomotion is a loop chosen from how fast a character is moving. An action
//! is the opposite -- it has a beginning and an end, it must not be restarted
//! by a gait change halfway through, and when it finishes the character has to
//! be handed back to whatever it was doing. That difference is why this is a
//! separate component rather than another `Gait` variant.
//!
//! Actions play on the upper body alone. The legs keep taking their clip from
//! the gait, so a character can punch while backing away instead of freezing
//! mid-stride and sliding along the ground. Death is the one exception, because
//! a corpse that carries on walking is not a corpse.
//!
//! Every clip here is driven by a message from the `combat` crate, so an NPC
//! swinging a sword animates through the identical path as the player.

use avian3d::prelude::{CoefficientCombine, Friction};
use bevy::animation::RepeatAnimation;
use bevy::animation::graph::AnimationNodeIndex;
use bevy::prelude::*;
use combat::{AbilityLanded, AbilityStarted, CombatSystems, Died, Outcome};

use super::character::{CharacterAnimator, CharacterSystems, Clip, Gait, Locomotion};

pub struct ActionPlugin;

impl Plugin for ActionPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (
                start_actions,
                flinch_on_hit,
                drop_on_death,
                advance_actions,
                advance_arms,
            )
                .chain()
                // After combat, because these react to what it announced, and
                // after locomotion, because the arms layer is weighted against
                // whatever gait clip is playing this frame.
                .after(CombatSystems)
                .after(CharacterSystems),
        );
    }
}

/// How long the crossfade into an action is, in seconds.
///
/// Shorter than the locomotion blend: a swing that eases in over the usual
/// blend reads as sluggish, because the first fifth of the clip is the wind-up
/// that sells the hit.
const ARMS_FADE: f32 = 0.09;

/// The same duration for the whole-body transition death uses.
const DEATH_BLEND: core::time::Duration = core::time::Duration::from_millis(90);

/// How long a flinch lasts at most.
///
/// Capped rather than played whole, so being hit repeatedly does not lock a
/// character out of moving.
const FLINCH_SECONDS: f32 = 0.4;

/// A one-shot animation in progress.
///
/// While this is present, locomotion switches to its legs-only branch, so the
/// character keeps walking from the waist down.
#[derive(Component)]
pub struct Action {
    remaining: f32,
    /// Whether this is a cast winding up, and so should be replaced by its
    /// release when the ability finally lands.
    ///
    /// Recorded rather than inferred. Asking "does this character have an
    /// action?" was true of a punch thrown a frame earlier, so every melee
    /// swing was immediately overwritten by the spell release and the game
    /// looked like it had one animation for everything.
    channelling: bool,
}

/// A character that has stopped being animated by anything.
///
/// Only the dead. The clip is left holding its last frame, and locomotion skips
/// the entity entirely rather than competing for the same animation.
#[derive(Component)]
pub struct Frozen;

/// The upper-body layer, weighted by hand.
///
/// `AnimationTransitions` owns exactly one animation per entity and locomotion
/// already has it, so the arms cannot use it -- but they do not need most of
/// what it does either. There is only ever one action, so this is a single node
/// and a weight, and the fade in and out is a line of arithmetic.
///
/// Weights are relative within a blend node, so ramping this one against the
/// locomotion clip is what makes an action arrive and leave smoothly rather
/// than snapping the arms into place.
#[derive(Component, Default)]
pub struct Arms {
    node: Option<AnimationNodeIndex>,
    weight: f32,
    /// What the weight is heading for: 1 while the action plays, 0 once it is
    /// over. The release matters as much as the start -- cutting the arms off
    /// the instant a punch ends drops them to the bind pose for the length of
    /// the locomotion cross-fade.
    target: f32,
}

/// What to play, and how it ends.
struct Shot<'a> {
    clip: &'a Clip,
    /// Cut the clip short at this many seconds.
    cap: Option<f32>,
    /// This is a cast winding up.
    channelling: bool,
}

impl<'a> Shot<'a> {
    /// Plays to the end, then hands back to locomotion.
    fn once(clip: &'a Clip) -> Self {
        Self {
            clip,
            cap: None,
            channelling: false,
        }
    }

    /// A cast's wind-up, which its release replaces when the ability lands.
    fn channel(clip: &'a Clip) -> Self {
        Self {
            channelling: true,
            ..Self::once(clip)
        }
    }

    fn capped(clip: &'a Clip, seconds: f32) -> Self {
        Self {
            cap: Some(seconds),
            ..Self::once(clip)
        }
    }
}

/// Plays a shot on `character`, replacing whatever action was running.
///
/// Returns whether it started, which is false only while the clip is still
/// loading -- worth knowing rather than silently playing nothing.
fn play(
    commands: &mut Commands,
    players: &mut Query<&mut AnimationPlayer>,
    clips: &Assets<AnimationClip>,
    character: Entity,
    animator: Entity,
    arms: &mut Arms,
    shot: Shot,
) -> bool {
    let Some(duration) = shot.clip.duration(clips) else {
        return false;
    };
    let Ok(mut player) = players.get_mut(animator) else {
        return false;
    };

    // The outgoing node is stopped rather than cross-faded into the incoming
    // one. Two actions overlapping only happens when a player presses two
    // abilities inside a tenth of a second, and carrying the weight across
    // means the swap is a cut between two poses rather than a drop to the bind
    // pose.
    if let Some(previous) = arms.node.replace(shot.clip.node)
        && previous != shot.clip.node
    {
        player.stop(previous);
    }
    arms.target = 1.0;
    player
        .start(shot.clip.node)
        .set_repeat(RepeatAnimation::Never)
        .set_weight(arms.weight);

    commands.entity(character).insert(Action {
        remaining: shot.cap.map_or(duration, |cap| duration.min(cap)),
        channelling: shot.channelling,
    });
    true
}

/// Swings, casts and throws, keyed off the ability that started.
fn start_actions(
    mut started: MessageReader<AbilityStarted>,
    locomotion: Option<Res<Locomotion>>,
    clips: Res<Assets<AnimationClip>>,
    mut characters: Query<(&CharacterAnimator, &mut Arms), Without<Frozen>>,
    mut players: Query<&mut AnimationPlayer>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for started in started.read() {
        let Ok((animator, mut arms)) = characters.get_mut(started.caster) else {
            continue;
        };

        // The slot is the game's mapping, not the crate's -- `combat` has no
        // opinion about what an ability looks like.
        // Unarmed for now. When a weapon exists this becomes a lookup on what
        // the character is holding, which is why the attacks are data rather
        // than a match arm each.
        let shot = match started.slot {
            0 => Shot::once(&locomotion.jab.clip),
            1 => Shot::once(&locomotion.cross.clip),
            // The only one that channels: it holds the wind-up loop, and the
            // release replaces it when the ability actually resolves.
            2 => Shot::channel(&locomotion.cast_channel),
            _ => Shot::once(&locomotion.cast_poison),
        };

        play(
            &mut commands,
            &mut players,
            &clips,
            started.caster,
            animator.0,
            &mut arms,
            shot,
        );
    }
}

/// The receiving end: a flinch on the target, and the caster's release for a
/// cast that has finished channelling.
fn flinch_on_hit(
    mut landings: MessageReader<AbilityLanded>,
    locomotion: Option<Res<Locomotion>>,
    clips: Res<Assets<AnimationClip>>,
    mut characters: Query<(&CharacterAnimator, &mut Arms, Option<&Action>), Without<Frozen>>,
    mut players: Query<&mut AnimationPlayer>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for landing in landings.read() {
        // The caster's release, but only for something that was actually
        // channelling -- not for every action that happens to be running.
        if let Ok((animator, mut arms, action)) = characters.get_mut(landing.caster)
            && action.is_some_and(|action| action.channelling)
        {
            let animator = animator.0;
            play(
                &mut commands,
                &mut players,
                &clips,
                landing.caster,
                animator,
                &mut arms,
                Shot::once(&locomotion.cast_release),
            );
        }

        // A flinch only for damage that actually connected. Flinching on a miss
        // would tell the player the opposite of what happened.
        let Outcome::Hit { damage, .. } = landing.outcome else {
            continue;
        };
        if damage <= 0 || landing.target == landing.caster {
            continue;
        }

        // A corpse does not flinch, which `Without<Frozen>` already says.
        let Ok((animator, mut arms, _)) = characters.get_mut(landing.target) else {
            continue;
        };
        let animator = animator.0;

        play(
            &mut commands,
            &mut players,
            &clips,
            landing.target,
            animator,
            &mut arms,
            Shot::capped(&locomotion.hit, FLINCH_SECONDS),
        );
    }
}

/// How much the ground grips a body that has stopped driving itself.
const CORPSE_FRICTION: f32 = 0.9;

/// Death, which is the one clip that owns the whole body.
///
/// Played through the locomotion layer rather than the arms one, and the
/// character is marked [`Frozen`] so nothing plays over it afterwards.
fn drop_on_death(
    mut deaths: MessageReader<Died>,
    locomotion: Option<Res<Locomotion>>,
    mut characters: Query<(&CharacterAnimator, &mut Arms)>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for death in deaths.read() {
        let Ok((animator, mut arms)) = characters.get_mut(death.entity) else {
            continue;
        };
        let Ok((mut player, mut transitions)) = players.get_mut(animator.0) else {
            continue;
        };

        // Whatever the arms were doing, they are not doing it any more.
        arms.target = 0.0;

        transitions
            .play(&mut player, locomotion.death.node, DEATH_BLEND)
            .set_repeat(RepeatAnimation::Never);

        // The character's zero friction is a controller trick, and on a corpse it
        // is what lets the ground carry it off. A body that is no longer driving
        // itself should rest on the ground like anything else.
        commands.entity(death.entity).remove::<Action>().insert((
            Frozen,
            Friction::new(CORPSE_FRICTION).with_combine_rule(CoefficientCombine::Average),
        ));
    }
}

/// Counts actions down and hands the character back to locomotion.
fn advance_actions(
    time: Res<Time>,
    mut characters: Query<(Entity, &mut Action, &mut Arms, &mut Gait)>,
    mut commands: Commands,
) {
    for (entity, mut action, mut arms, mut gait) in &mut characters {
        action.remaining -= time.delta_secs();
        if action.remaining > 0.0 {
            continue;
        }

        commands.entity(entity).remove::<Action>();
        // The node keeps playing while it fades: the locomotion clip on the
        // whole-body branch is fading in over the same span, and stopping the
        // arms outright would leave them in the bind pose until it arrived.
        arms.target = 0.0;
        // Touched rather than assigned: the gait is already whatever the
        // character's speed implies. A character coming out of a swing while
        // standing still would otherwise hold the last frame of it.
        gait.set_changed();
    }
}

/// Moves each arms layer towards its target weight and retires it at zero.
fn advance_arms(
    time: Res<Time>,
    mut characters: Query<(&mut Arms, &CharacterAnimator)>,
    mut players: Query<&mut AnimationPlayer>,
) {
    let step = time.delta_secs() / ARMS_FADE;
    for (mut arms, animator) in &mut characters {
        let Some(node) = arms.node else {
            continue;
        };
        let Ok(mut player) = players.get_mut(animator.0) else {
            continue;
        };

        arms.weight = if arms.weight < arms.target {
            (arms.weight + step).min(arms.target)
        } else {
            (arms.weight - step).max(arms.target)
        };

        if arms.weight <= 0.0 && arms.target <= 0.0 {
            player.stop(node);
            arms.node = None;
            continue;
        }
        if let Some(active) = player.animation_mut(node) {
            active.set_weight(arms.weight);
        }
    }
}
