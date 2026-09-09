use crate::effect::EffectKind;
use crate::time::Millis;

/// How an ability chooses what it lands on.
///
/// The same vocabulary as the spell schema in `packages/proto`, so an ability
/// loaded from a `SpellDb` maps across without inventing a second taxonomy.
///
/// Note what is missing: no positions, no entity ids, no world. Deciding *who*
/// a `Cone` covers needs a spatial query and belongs to whatever owns the
/// world. This crate only says what the shape is and how big.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    /// The caster only.
    Caster,
    /// One selected character, at range.
    Target,
    /// Everything in an arc in front of the caster.
    ///
    /// The hybrid case: the swing lands on whoever is inside the arc, and a
    /// selected target only biases which of them counts as the primary hit.
    Cone { angle_degrees: u16 },
    /// Everything within `radius` of the caster.
    Nova,
    /// Everything within `radius` of a chosen point.
    Ground,
    /// A travelling projectile that resolves on contact.
    Projectile { speed: i32 },
}

impl Shape {
    /// Whether the shape can land on more than one character.
    #[inline]
    pub const fn is_area(self) -> bool {
        matches!(self, Self::Cone { .. } | Self::Nova | Self::Ground)
    }

    /// Whether the caller must supply a selected target for this to resolve.
    ///
    /// Only [`Shape::Target`] genuinely requires one. A cone with nothing
    /// selected is a perfectly good swing at empty air, which is the whole
    /// point of the hybrid model.
    #[inline]
    pub const fn requires_target(self) -> bool {
        matches!(self, Self::Target)
    }
}

/// Who an ability is allowed to affect.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Allegiance {
    Hostile,
    Friendly,
    Any,
}

/// What lands when an ability connects.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Payload {
    Damage,
    Heal,
    /// Applies an effect for a duration, dealing nothing on its own.
    Apply {
        kind: EffectKind,
        stacks: u8,
        duration: Millis,
    },
}

/// A single thing a character can do.
///
/// Pure data. It carries no cooldown *state* -- that is a [`Timer`] the caller
/// keeps per character, because one ability definition is shared by every
/// character that knows it.
///
/// [`Timer`]: crate::time::Timer
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ability {
    /// Base damage or healing, before the caster's `power`.
    pub power: i32,
    pub payload: Payload,
    pub shape: Shape,
    pub targets: Allegiance,
    /// Maximum distance to the target or the far edge of the shape, in
    /// centimetres.
    ///
    /// Centimetres so range stays an integer and comparisons stay exact. The
    /// unit only has to agree with whatever the caller measures with.
    pub range_cm: u32,
    /// Radius of an area shape, in centimetres. Ignored by single-target
    /// shapes.
    pub radius_cm: u32,
    pub cost: i32,
    pub cooldown: Millis,
    /// Time spent casting before it resolves. Zero is instant.
    pub cast_time: Millis,
    /// Whether this triggers, and waits on, the global cooldown.
    pub on_global_cooldown: bool,
}

impl Ability {
    /// An instant, free, single-target attack. A starting point to adjust from,
    /// so a test or a placeholder ability does not have to name every field.
    pub const fn attack(power: i32, range_cm: u32) -> Self {
        Self {
            power,
            payload: Payload::Damage,
            shape: Shape::Target,
            targets: Allegiance::Hostile,
            range_cm,
            radius_cm: 0,
            cost: 0,
            cooldown: Millis::ZERO,
            cast_time: Millis::ZERO,
            on_global_cooldown: true,
        }
    }

    /// A melee swing that covers an arc rather than one selected enemy.
    pub const fn swing(power: i32, range_cm: u32, angle_degrees: u16) -> Self {
        Self {
            shape: Shape::Cone { angle_degrees },
            radius_cm: range_cm,
            ..Self::attack(power, range_cm)
        }
    }

    #[inline]
    pub const fn is_instant(self) -> bool {
        self.cast_time.is_zero()
    }
}

/// Why an ability could not be used.
///
/// Separate variants rather than a bool because the interface has to say which
/// one it was: "not enough mana" and "out of range" want different feedback,
/// and a silent failure is the most annoying thing an ability bar can do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Denial {
    OnCooldown,
    GlobalCooldown,
    NotEnoughResource,
    OutOfRange,
    NoTarget,
    Stunned,
    AlreadyCasting,
    Dead,
}
