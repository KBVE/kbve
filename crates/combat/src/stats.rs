/// A pool of hit points.
///
/// Deliberately the same shape as `bevy_battle::Health`, so a character can be
/// carried between the turn-based lane and the real-time one without a
/// conversion that could round differently in each direction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Health {
    current: i32,
    max: i32,
}

impl Health {
    /// A full pool. A `max` below 1 is clamped, because a character that starts
    /// dead is never what the caller meant.
    pub fn new(max: i32) -> Self {
        let max = max.max(1);
        Self { current: max, max }
    }

    #[inline]
    pub const fn current(self) -> i32 {
        self.current
    }

    #[inline]
    pub const fn max(self) -> i32 {
        self.max
    }

    #[inline]
    pub const fn is_dead(self) -> bool {
        self.current <= 0
    }

    #[inline]
    pub fn fraction(self) -> f32 {
        self.current.max(0) as f32 / self.max as f32
    }

    /// Applies damage and reports how far past zero it went.
    ///
    /// The overkill is returned rather than discarded because it is what an
    /// execute, a killing-blow log line or a damage meter needs, and it cannot
    /// be recovered afterwards once `current` has clamped.
    pub fn damage(&mut self, amount: i32) -> i32 {
        if amount <= 0 {
            return 0;
        }
        let after = self.current as i64 - amount as i64;
        self.current = after.max(i32::MIN as i64) as i32;
        if after < 0 { (-after) as i32 } else { 0 }
    }

    /// Heals, never above `max`. Returns the amount actually restored, which is
    /// what an overheal-aware meter or a lifesteal cap needs.
    ///
    /// The dead are not healed. Bringing something back is a deliberate act
    /// with its own rules -- a resurrection sets the pool with [`Health::revive`]
    /// -- and a stray area heal or a lifesteal tick must never do it by
    /// accident.
    pub fn heal(&mut self, amount: i32) -> i32 {
        if amount <= 0 || self.is_dead() || self.current >= self.max {
            return 0;
        }
        let before = self.current;
        self.current = (self.current as i64 + amount as i64).min(self.max as i64) as i32;
        self.current - before
    }

    /// Brings a dead character back with `amount` hit points, clamped to the
    /// pool. Does nothing to the living.
    pub fn revive(&mut self, amount: i32) -> bool {
        if !self.is_dead() {
            return false;
        }
        self.current = amount.clamp(1, self.max);
        true
    }
}

/// A spendable pool: mana, stamina, rage, whatever the class calls it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Resource {
    current: i32,
    max: i32,
}

impl Resource {
    pub fn new(max: i32) -> Self {
        let max = max.max(0);
        Self { current: max, max }
    }

    /// An empty pool, for a resource that builds during a fight rather than
    /// starting full.
    pub fn empty(max: i32) -> Self {
        Self {
            current: 0,
            max: max.max(0),
        }
    }

    #[inline]
    pub const fn current(self) -> i32 {
        self.current
    }

    #[inline]
    pub const fn max(self) -> i32 {
        self.max
    }

    #[inline]
    pub const fn can_afford(self, cost: i32) -> bool {
        cost <= self.current
    }

    /// Spends `cost` if it is affordable, all or nothing.
    ///
    /// Returning a bool rather than spending what it can is the difference
    /// between a failed cast and a cast that goes off at partial strength.
    pub fn spend(&mut self, cost: i32) -> bool {
        if cost <= 0 {
            return true;
        }
        if !self.can_afford(cost) {
            return false;
        }
        self.current -= cost;
        true
    }

    pub fn restore(&mut self, amount: i32) -> i32 {
        if amount <= 0 || self.current >= self.max {
            return 0;
        }
        let before = self.current;
        self.current = (self.current as i64 + amount as i64).min(self.max as i64) as i32;
        self.current - before
    }
}

/// The numbers a character brings to a resolution.
///
/// Chances are per-mille integers rather than floats so that a roll decides the
/// same way on every machine. Multipliers are per-mille too: `1500` is 1.5x.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stats {
    /// Added to an ability's own power before mitigation.
    pub power: i32,
    /// Subtracted from incoming damage, after the attacker's multipliers.
    pub armor: i32,
    /// Chance to land, before the defender's evasion.
    pub accuracy: u16,
    /// Chance to avoid, subtracted from the attacker's accuracy.
    pub evasion: u16,
    pub crit_chance: u16,
    /// What a crit multiplies damage by, in per-mille.
    pub crit_multiplier: u16,
}

impl Default for Stats {
    /// A plain combatant: always-ish hits, never crits, no armour.
    ///
    /// `crit_multiplier` is 1.5x even though `crit_chance` is zero, so raising
    /// only the chance produces a sensible crit rather than one that multiplies
    /// damage by nothing.
    fn default() -> Self {
        Self {
            power: 0,
            armor: 0,
            accuracy: 950,
            evasion: 0,
            crit_chance: 0,
            crit_multiplier: 1500,
        }
    }
}

/// Per-resolution adjustments contributed by whatever the caller is tracking:
/// active effects, gear, stance, terrain.
///
/// The core does not walk an effect list, because the storage of that list is
/// the caller's -- and once this is the seam, buffs, auras, a difficulty
/// setting and a PvP damage modifier all arrive the same way instead of each
/// needing to be understood in here.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Modifiers {
    /// Scales what the attacker deals, in per-mille.
    pub dealt: u16,
    /// Scales what the defender takes, in per-mille.
    pub taken: u16,
    /// Flat absorb applied last, before the damage floor. A shield.
    pub absorb: i32,
}

impl Default for Modifiers {
    fn default() -> Self {
        Self {
            dealt: 1000,
            taken: 1000,
            absorb: 0,
        }
    }
}
