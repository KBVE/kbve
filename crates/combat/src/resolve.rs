use crate::ability::{Ability, Payload};
use crate::rng::Rng;
use crate::stats::{Modifiers, Stats};

/// What happened when an ability was applied to one character.
///
/// One of these per character affected, so an area ability produces several.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Miss,
    Hit {
        damage: i32,
        crit: bool,
        /// How much of the damage a shield swallowed.
        absorbed: i32,
    },
    Healed {
        amount: i32,
        crit: bool,
    },
    /// The ability applied an effect rather than a number.
    Applied,
}

impl Outcome {
    /// Damage dealt, zero for anything that was not a damaging hit. Saves every
    /// caller writing the same match to feed a damage meter.
    #[inline]
    pub const fn damage(self) -> i32 {
        match self {
            Self::Hit { damage, .. } => damage,
            _ => 0,
        }
    }

    #[inline]
    pub const fn is_miss(self) -> bool {
        matches!(self, Self::Miss)
    }
}

/// The floor on a damaging hit that lands.
///
/// A connected blow always does something. Without this, enough armour makes a
/// character unkillable rather than merely tough, and every game that has
/// allowed that has regretted it.
const MINIMUM_DAMAGE: i32 = 1;

/// Resolves one ability against one character.
///
/// This is the function both lanes share. Nothing here knows whether a turn or
/// a frame is in progress, where anybody is standing, or who else is affected:
/// range and shape are settled by the caller before it gets here, and the
/// caller applies the [`Outcome`] afterwards. What is left is the part that
/// must agree exactly between a client's prediction and a server's authority,
/// which is why it is one pure function over explicit inputs and a seeded
/// [`Rng`].
///
/// `modifiers` is the already-folded contribution of effects, gear and anything
/// else the caller tracks -- see [`crate::effect::combine`].
pub fn resolve(
    ability: &Ability,
    attacker: &Stats,
    defender: &Stats,
    modifiers: Modifiers,
    rng: &mut Rng,
) -> Outcome {
    match ability.payload {
        Payload::Apply { .. } => Outcome::Applied,
        Payload::Heal => resolve_heal(ability, attacker, modifiers, rng),
        Payload::Damage => resolve_damage(ability, attacker, defender, modifiers, rng),
    }
}

fn resolve_damage(
    ability: &Ability,
    attacker: &Stats,
    defender: &Stats,
    modifiers: Modifiers,
    rng: &mut Rng,
) -> Outcome {
    if !rng.chance(hit_chance(attacker, defender)) {
        return Outcome::Miss;
    }

    let crit = rng.chance(attacker.crit_chance);

    // Order matters and is deliberate: the attacker's contribution and crit are
    // applied first, then the defender's armour, then the multipliers, then the
    // absorb. Armour before the multipliers means a damage buff is worth more
    // against a heavily armoured target than after it, which is what makes
    // armour scale sensibly rather than trivialising it.
    let mut damage = ability.power as i64 + attacker.power as i64;
    if crit {
        damage = damage * attacker.crit_multiplier as i64 / 1000;
    }
    damage -= defender.armor as i64;
    damage = damage * modifiers.dealt as i64 / 1000;
    damage = damage * modifiers.taken as i64 / 1000;

    let before_absorb = damage.max(MINIMUM_DAMAGE as i64);
    let absorbed = before_absorb.min(modifiers.absorb.max(0) as i64);
    let damage = (before_absorb - absorbed).max(MINIMUM_DAMAGE as i64);

    Outcome::Hit {
        damage: clamp(damage),
        crit,
        absorbed: clamp(absorbed),
    }
}

fn resolve_heal(
    ability: &Ability,
    attacker: &Stats,
    modifiers: Modifiers,
    rng: &mut Rng,
) -> Outcome {
    let crit = rng.chance(attacker.crit_chance);

    let mut amount = ability.power as i64 + attacker.power as i64;
    if crit {
        amount = amount * attacker.crit_multiplier as i64 / 1000;
    }
    amount = amount * modifiers.dealt as i64 / 1000;

    Outcome::Healed {
        amount: clamp(amount.max(0)),
        crit,
    }
}

/// The chance for an attack to land, in per-mille.
///
/// Floored rather than allowed to reach zero: a defender who can never be hit
/// is a defender who cannot be fought, and stacking evasion should have
/// diminishing value rather than a wall at the top.
pub fn hit_chance(attacker: &Stats, defender: &Stats) -> u16 {
    const FLOOR: u16 = 50;
    const CEILING: u16 = 1000;
    attacker
        .accuracy
        .saturating_sub(defender.evasion)
        .clamp(FLOOR, CEILING)
}

fn clamp(value: i64) -> i32 {
    value.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}
