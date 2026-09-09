use crate::stats::Modifiers;
use crate::time::Millis;

/// What an effect does while it is on a character.
///
/// The same set the turn-based lane already uses, so an effect applied in one
/// mode still means something in the other.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EffectKind {
    Poison,
    Burning,
    Bleed,
    /// Reduces damage taken.
    Shielded,
    /// Reduces damage dealt.
    Weakened,
    /// Increases damage dealt.
    Sharpened,
    /// Cannot act at all.
    Stunned,
    /// Returns a share of damage taken to the attacker.
    Thorns,
}

impl EffectKind {
    /// Damage dealt per stack, per whole second of exposure.
    ///
    /// Per second rather than per turn: [`Effect::tick`] scales it by however
    /// much time actually passed, so the same poison does the same damage per
    /// second in the real-time lane and per turn in the turn-based one, given
    /// that lane's idea of how long a turn is.
    pub const fn damage_per_second(self) -> i32 {
        match self {
            Self::Poison => 2,
            Self::Burning => 4,
            Self::Bleed => 3,
            _ => 0,
        }
    }

    #[inline]
    pub const fn is_harmful(self) -> bool {
        matches!(
            self,
            Self::Poison | Self::Burning | Self::Bleed | Self::Weakened | Self::Stunned
        )
    }

    /// Whether this effect deals damage over time rather than changing numbers.
    #[inline]
    pub const fn is_damage_over_time(self) -> bool {
        self.damage_per_second() > 0
    }
}

/// One effect on one character.
///
/// Duration is a real duration, not a turn count. That is the change from the
/// turn-based lane's `turns_left`, and it is what allows a poison to keep
/// ticking sensibly when the same character walks out of a scripted battle and
/// into the open world.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Effect {
    pub kind: EffectKind,
    pub stacks: u8,
    remaining: Millis,
    /// Time carried over from ticks too small to deal a whole point of damage.
    ///
    /// Without this, a poison ticking at 60fps deals nothing at all: every
    /// frame rounds its fractional damage down to zero. The remainder makes the
    /// damage rate independent of how often the caller ticks.
    debt: u32,
}

impl Effect {
    pub fn new(kind: EffectKind, stacks: u8, duration: Millis) -> Self {
        Self {
            kind,
            stacks: stacks.max(1),
            remaining: duration,
            debt: 0,
        }
    }

    #[inline]
    pub const fn remaining(self) -> Millis {
        self.remaining
    }

    #[inline]
    pub const fn is_expired(self) -> bool {
        self.remaining.is_zero()
    }

    /// Refreshes an existing effect with another application of the same kind,
    /// adding stacks and keeping the longer duration.
    pub fn refresh(&mut self, stacks: u8, duration: Millis) {
        self.stacks = self.stacks.saturating_add(stacks.max(1));
        if duration > self.remaining {
            self.remaining = duration;
        }
    }

    /// Advances the effect and returns the damage it deals over `elapsed`.
    ///
    /// Damage accrues at `damage_per_second * stacks`, with the sub-point
    /// remainder carried rather than dropped, so ticking once per second and
    /// ticking sixty times per second come to the same total.
    pub fn tick(&mut self, elapsed: Millis) -> i32 {
        if self.remaining.is_zero() {
            return 0;
        }

        let active = elapsed.0.min(self.remaining.0);
        self.remaining = self.remaining.saturating_sub(elapsed);

        let rate = self.kind.damage_per_second();
        if rate <= 0 {
            return 0;
        }

        let accrued = self.debt as u64 + active as u64 * rate as u64 * self.stacks as u64;
        self.debt = (accrued % 1000) as u32;
        (accrued / 1000).min(i32::MAX as u64) as i32
    }

    /// How this effect changes a resolution while it is active.
    pub fn modifiers(self) -> Modifiers {
        let stacks = self.stacks as u32;
        let mut modifiers = Modifiers::default();
        match self.kind {
            EffectKind::Weakened => {
                modifiers.dealt = scale_down(1000, 150 * stacks);
            }
            EffectKind::Sharpened => {
                modifiers.dealt = 1000u32.saturating_add(200 * stacks).min(u16::MAX as u32) as u16;
            }
            EffectKind::Shielded => {
                modifiers.taken = scale_down(1000, 200 * stacks);
            }
            _ => {}
        }
        modifiers
    }
}

/// The least a folded multiplier may become.
///
/// Integer arithmetic is why this is needed rather than merely tidy:
/// multiplying per-mille values truncates, so 10% of 10% of 10% reaches zero in
/// four steps and the character becomes immune. A floor keeps stacking
/// strongly rewarding without ever crossing into invulnerability.
const MIN_MULTIPLIER: u16 = 50;

/// Reduces a per-mille multiplier, with a floor so that stacking a debuff can
/// never invert it into a bonus or zero damage outright.
fn scale_down(base: u32, reduction: u32) -> u16 {
    base.saturating_sub(reduction).max(MIN_MULTIPLIER as u32) as u16
}

/// Folds several effects' modifiers together with any the caller supplies.
///
/// Multiplicative rather than additive, and floored at [`MIN_MULTIPLIER`]:
/// stacking reductions has strongly diminishing returns and bottoms out at 5%
/// of the damage rather than at none of it, so no amount of it makes a
/// character immune.
pub fn combine(base: Modifiers, effects: impl IntoIterator<Item = Effect>) -> Modifiers {
    let mut combined = base;
    for effect in effects {
        if effect.is_expired() {
            continue;
        }
        let m = effect.modifiers();
        combined.dealt = mix(combined.dealt, m.dealt);
        combined.taken = mix(combined.taken, m.taken);
    }
    combined
}

fn mix(a: u16, b: u16) -> u16 {
    ((a as u32 * b as u32) / 1000).clamp(MIN_MULTIPLIER as u32, u16::MAX as u32) as u16
}
