use crate::ability::{Ability, Denial};
use crate::stats::{Health, Resource};
use crate::time::{Millis, Timer};

/// The usual global cooldown. A default, not a rule -- haste and class design
/// both change it.
pub const GLOBAL_COOLDOWN: Millis = Millis(1500);

/// Everything about a character that decides whether it may act right now.
///
/// Gathered into one value so the check is a single call with an explicit
/// input, rather than a function of eight arguments that each caller assembles
/// slightly differently.
#[derive(Clone, Copy, Debug)]
pub struct Readiness {
    /// This ability's own cooldown.
    pub cooldown: Timer,
    pub global_cooldown: Timer,
    pub resource: Resource,
    pub health: Health,
    pub stunned: bool,
    /// Whether a cast is already in progress.
    pub casting: bool,
}

/// What an ability is aimed at.
///
/// Two separate facts, because conflating them is a bug: having no target is
/// not the same as having a target whose distance is unknown. A headless
/// server with no transforms knows perfectly well who the target is and simply
/// cannot measure the gap, and it must not be told it has no target.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Aim {
    /// Whether a target was selected at all.
    pub target: bool,
    /// How far away it is, when both ends have a place in the world. `None`
    /// skips the range check rather than failing it.
    pub distance_cm: Option<u32>,
}

impl Aim {
    /// Nothing selected.
    pub const NONE: Self = Self {
        target: false,
        distance_cm: None,
    };

    /// A target at a known distance.
    pub const fn at(distance_cm: u32) -> Self {
        Self {
            target: true,
            distance_cm: Some(distance_cm),
        }
    }

    /// A target whose distance cannot be measured.
    pub const fn unmeasured() -> Self {
        Self {
            target: true,
            distance_cm: None,
        }
    }
}

/// Whether an ability can be used, and if not, which reason to show.
///
/// The order of the checks is the order of the answers a player should get.
/// Being dead outranks being stunned, which outranks having no target, and cost
/// is checked before range so that walking into range of an ability you cannot
/// afford still tells you the useful thing.
pub fn usable(ability: &Ability, state: &Readiness, aim: Aim) -> Result<(), Denial> {
    if state.health.is_dead() {
        return Err(Denial::Dead);
    }
    if state.stunned {
        return Err(Denial::Stunned);
    }
    if state.casting {
        return Err(Denial::AlreadyCasting);
    }
    if !state.cooldown.is_ready() {
        return Err(Denial::OnCooldown);
    }
    if ability.on_global_cooldown && !state.global_cooldown.is_ready() {
        return Err(Denial::GlobalCooldown);
    }
    if !state.resource.can_afford(ability.cost) {
        return Err(Denial::NotEnoughResource);
    }

    if ability.shape.requires_target() && !aim.target {
        return Err(Denial::NoTarget);
    }
    match aim.distance_cm {
        Some(distance) if distance > ability.range_cm => Err(Denial::OutOfRange),
        _ => Ok(()),
    }
}

/// A cast in progress.
///
/// An instant ability never produces one of these -- the caller resolves it on
/// the spot. Anything with a cast time does, and [`Cast::tick`] reports the
/// single frame on which it completes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cast {
    timer: Timer,
    total: Millis,
}

impl Cast {
    pub fn new(cast_time: Millis) -> Self {
        Self {
            timer: Timer::new(cast_time),
            total: cast_time,
        }
    }

    /// Advances the cast, returning true on the step that finishes it.
    #[inline]
    pub fn tick(&mut self, elapsed: Millis) -> bool {
        self.timer.tick(elapsed)
    }

    #[inline]
    pub const fn remaining(self) -> Millis {
        self.timer.remaining()
    }

    /// How far along the cast is, from 0.0 to 1.0 -- a cast bar.
    ///
    /// An instant cast reads as already complete rather than dividing by zero.
    pub fn progress(self) -> f32 {
        if self.total.is_zero() {
            return 1.0;
        }
        let elapsed = self.total.0.saturating_sub(self.timer.remaining().0);
        (elapsed as f32 / self.total.0 as f32).clamp(0.0, 1.0)
    }
}
