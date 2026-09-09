//! One-shot animations that interrupt locomotion: swings, casts, flinches and
//! dying.
//!
//! Locomotion is a loop chosen from how fast a character is moving. An action
//! is the opposite -- it has a beginning and an end, it must not be restarted
//! by a gait change halfway through, and when it finishes the character has to
//! be handed back to whatever it was doing. That difference is why this is a
//! separate component rather than another `Gait` variant.
//!
//! Every clip here is driven by a message from the `combat` crate, so an NPC
//! swinging a sword animates through the identical path as the player.

use bevy::animation::RepeatAnimation;
use bevy::prelude::*;
use combat::{AbilityLanded, AbilityStarted, CombatSystems, Died, Outcome};

use super::character::{CharacterAnimator, CharacterSystems, Clip, Gait, Locomotion};

pub struct ActionPlugin;

impl Plugin for ActionPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (start_actions, flinch_on_hit, drop_on_death, advance_actions)
                .chain()
                // After combat, because these react to what it announced, and
                // after locomotion, because an action overrides the gait rather
                // than competing with it for the same frame.
                .after(CombatSystems)
                .after(CharacterSystems),
        );
    }
}

/// How long the crossfade into an action is.
///
/// Shorter than the locomotion blend: a swing that eases in over the usual
/// blend reads as sluggish, because the first fifth of the clip is the wind-up
/// that sells the hit.
const ACTION_BLEND: core::time::Duration = core::time::Duration::from_millis(90);

/// How long a flinch lasts at most.
///
/// Capped rather than played whole, so being hit repeatedly does not lock a
/// character out of moving.
const FLINCH_SECONDS: f32 = 0.4;

/// A one-shot animation in progress.
///
/// While this is present, [`super::character::drive_gait`] leaves the character
/// alone -- the query there filters on `Without<Action>`.
#[derive(Component)]
pub struct Action {
    remaining: f32,
    /// Whether to hold on the last frame instead of returning to locomotion.
    /// Death does; nothing else should.
    hold: bool,
    /// Whether this is a cast winding up, and so should be replaced by its
    /// release when the ability finally lands.
    ///
    /// Recorded rather than inferred. Asking "does this character have an
    /// action?" was true of a punch thrown a frame earlier, so every melee
    /// swing was immediately overwritten by the spell release and the game
    /// looked like it had one animation for everything.
    channelling: bool,
}

/// What to play, and how it ends.
struct Shot<'a> {
    clip: &'a Clip,
    /// Hold the last frame instead of returning to locomotion.
    hold: bool,
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
            hold: false,
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

    fn holding(clip: &'a Clip) -> Self {
        Self {
            hold: true,
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
    players: &mut Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    clips: &Assets<AnimationClip>,
    character: Entity,
    animator: Entity,
    shot: Shot,
) -> bool {
    let Some(duration) = shot.clip.duration(clips) else {
        return false;
    };
    let Ok((mut player, mut transitions)) = players.get_mut(animator) else {
        return false;
    };

    transitions
        .play(&mut player, shot.clip.node, ACTION_BLEND)
        .set_repeat(RepeatAnimation::Never);

    commands.entity(character).insert(Action {
        remaining: shot.cap.map_or(duration, |cap| duration.min(cap)),
        hold: shot.hold,
        channelling: shot.channelling,
    });
    true
}

/// Swings, casts and throws, keyed off the ability that started.
fn start_actions(
    mut started: MessageReader<AbilityStarted>,
    locomotion: Option<Res<Locomotion>>,
    clips: Res<Assets<AnimationClip>>,
    characters: Query<&CharacterAnimator>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for started in started.read() {
        let Ok(animator) = characters.get(started.caster) else {
            info!(
                "action: caster {:?} has no CharacterAnimator",
                started.caster
            );
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
    characters: Query<&CharacterAnimator>,
    holding: Query<&Action>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for landing in landings.read() {
        // The caster's release, but only for something that was actually
        // channelling -- not for every action that happens to be running.
        if let Ok(animator) = characters.get(landing.caster)
            && holding
                .get(landing.caster)
                .is_ok_and(|action| action.channelling)
        {
            play(
                &mut commands,
                &mut players,
                &clips,
                landing.caster,
                animator.0,
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

        let Ok(animator) = characters.get(landing.target) else {
            continue;
        };
        // A flinch never interrupts a death.
        if holding.get(landing.target).is_ok_and(|action| action.hold) {
            continue;
        }

        play(
            &mut commands,
            &mut players,
            &clips,
            landing.target,
            animator.0,
            Shot::capped(&locomotion.hit, FLINCH_SECONDS),
        );
    }
}

fn drop_on_death(
    mut deaths: MessageReader<Died>,
    locomotion: Option<Res<Locomotion>>,
    clips: Res<Assets<AnimationClip>>,
    characters: Query<&CharacterAnimator>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    mut commands: Commands,
) {
    let Some(locomotion) = locomotion else {
        return;
    };

    for death in deaths.read() {
        let Ok(animator) = characters.get(death.entity) else {
            continue;
        };
        play(
            &mut commands,
            &mut players,
            &clips,
            death.entity,
            animator.0,
            Shot::holding(&locomotion.death),
        );
    }
}

/// Counts actions down and hands the character back to locomotion.
fn advance_actions(
    time: Res<Time>,
    mut characters: Query<(Entity, &mut Action, &mut Gait)>,
    mut commands: Commands,
) {
    for (entity, mut action, mut gait) in &mut characters {
        if action.hold {
            continue;
        }

        action.remaining -= time.delta_secs();
        if action.remaining > 0.0 {
            continue;
        }

        commands.entity(entity).remove::<Action>();
        // Touched rather than assigned: the gait is already whatever the
        // character's speed implies, and `drive_gait` only acts on a change. A
        // character coming out of a swing while standing still would otherwise
        // hold the last frame of it until it next started moving.
        gait.set_changed();
    }
}
