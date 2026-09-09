//! Deterministic combat resolution, with no engine attached.
//!
//! # Why one crate for two kinds of combat
//!
//! Real-time and turn-based combat look like different problems and are not.
//! They disagree about *when* a resolution happens and about how time advances;
//! they agree completely about what a resolution *is*. Given an attacker, a
//! defender, an ability and a source of randomness, the damage is the damage.
//!
//! So the split here is not "real-time module, turn-based module". It is:
//!
//! - **this crate** owns stats, abilities, effects, cooldowns and the
//!   resolution maths, and knows nothing about frames, turns or space;
//! - **the caller** owns scheduling and the world -- when to resolve, who is in
//!   the cone, and what to do with the outcome.
//!
//! A turn-based lane advances the clock by a turn's worth and resolves on
//! command. A real-time lane advances it by the frame delta and resolves when a
//! swing connects. Both call the same [`resolve`] and get the same answer.
//!
//! Every duration is a [`Millis`], which is what makes that true: a turn is not
//! a different unit of time, only a larger step of the same one.
//!
//! # Determinism
//!
//! A server that re-simulates a client's attack has to reach the client's
//! conclusion, and a replay has to replay. So randomness is an explicit,
//! seeded [`Rng`] passed in by the caller rather than drawn from the
//! environment, chances are per-mille integers rather than floats, and damage
//! is computed in integers throughout.
//!
//! # No world, no allocator
//!
//! Nothing here stores a position, an entity id or a collection. Range arrives
//! as a distance the caller measured; a cone's victims are found by the caller's
//! spatial query. That is what lets the same maths run in a bevy client, an
//! authoritative server, and a headless simulation used to balance the numbers.
//!
//! ```
//! use combat::{Ability, Health, Millis, Modifiers, Rng, Stats, Timer, resolve};
//!
//! let sword = Ability::swing(20, 250, 90);
//! let attacker = Stats {
//!     power: 5,
//!     crit_chance: 0,
//!     ..Stats::default()
//! };
//! let defender = Stats {
//!     armor: 4,
//!     evasion: 0,
//!     ..Stats::default()
//! };
//!
//! let mut rng = Rng::new(7, 0);
//! let outcome = resolve(&sword, &attacker, &defender, Modifiers::default(), &mut rng);
//!
//! // 20 power + 5 attack - 4 armour, with no crit and no modifiers.
//! assert_eq!(outcome.damage(), 21);
//!
//! // The same seed reaches the same verdict, which is the whole point.
//! let mut replay = Rng::new(7, 0);
//! assert_eq!(
//!     outcome,
//!     resolve(&sword, &attacker, &defender, Modifiers::default(), &mut replay)
//! );
//!
//! // Cooldowns and effects run off the same clock whether that step came from
//! // a frame delta or from a turn ending.
//! let mut cooldown = Timer::new(Millis(1500));
//! assert!(!cooldown.tick(Millis(500)));
//! assert!(cooldown.tick(Millis(1000)));
//!
//! let mut health = Health::new(100);
//! health.damage(outcome.damage());
//! assert_eq!(health.current(), 79);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(docsrs, feature(doc_cfg))]

pub mod ability;
pub mod cast;
pub mod effect;
#[cfg(feature = "bevy")]
#[cfg_attr(docsrs, doc(cfg(feature = "bevy")))]
pub mod plugin;
pub mod resolve;
pub mod rng;
pub mod stats;
pub mod time;

pub use ability::{Ability, Allegiance, Denial, Payload, Shape};
pub use cast::{Aim, Cast, GLOBAL_COOLDOWN, Readiness, usable};
pub use effect::{Effect, EffectKind, combine};
#[cfg(feature = "bevy")]
pub use plugin::{
    AbilityBar, AbilityDenied, AbilityLanded, AbilityStarted, ActiveEffects, Casting, CombatPlugin,
    CombatRng, CombatSystems, Combatant, Dead, Died, Slot, UseAbility,
};
pub use resolve::{Outcome, hit_chance, resolve};
pub use rng::Rng;
pub use stats::{Health, Modifiers, Resource, Stats};
pub use time::{Millis, Timer};
