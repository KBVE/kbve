//! What a body has left: how much punishment, effort and will it can still spend.
//!
//! Held here rather than in the engine because the same numbers have to be true in two
//! places. The dedicated server links this crate without Godot, and a character's health
//! is exactly the kind of thing that cannot be allowed to disagree between the machine
//! deciding it and the machine drawing it.
//!
//! Everything in this module is plain arithmetic on plain data. It knows nothing about
//! nodes, frames or threads: [`sim`] owns the running world, and `bridge` hands it to
//! Godot.

pub mod sim;

#[cfg(feature = "client")]
pub mod bridge;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

/// Which of the three pools something is being taken out of.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum PoolKind {
    Health = 0,
    Mana = 1,
    Energy = 2,
}

/// Which attribute an investment raises.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum Attribute {
    Strength = 0,
    Skill = 1,
    Will = 2,
}

/// What a character is made of. The pools are read off these rather than stored beside
/// them, so there is one place a body gets tougher and no way for the two to drift.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attributes {
    pub strength: u16,
    pub skill: u16,
    pub will: u16,
}

impl Default for Attributes {
    fn default() -> Self {
        Self {
            strength: 1,
            skill: 1,
            will: 1,
        }
    }
}

/// Nobody has a zeroth point in anything: a rank of 0 would read as "has no arms" rather
/// than "is a beginner", and it puts a zero into every derived maximum.
pub const MIN_RANK: u16 = 1;
/// Far enough away that the numbers stay in a range worth balancing, and near enough that
/// the arithmetic cannot run off.
pub const MAX_RANK: u16 = 100;

/// Health is the flat part of a body plus what strength adds to it.
pub const HEALTH_BASE: f32 = 60.0;
pub const HEALTH_PER_STRENGTH: f32 = 8.0;
pub const MANA_BASE: f32 = 20.0;
pub const MANA_PER_WILL: f32 = 6.0;
pub const ENERGY_BASE: f32 = 50.0;
pub const ENERGY_PER_SKILL: f32 = 6.0;

/// Wounds close slowly, effort comes back quickly, and will sits between them. This is
/// most of what makes the three pools feel like different resources rather than three
/// copies of one.
pub const HEALTH_REGEN: f32 = 0.6;
pub const MANA_REGEN_BASE: f32 = 1.0;
pub const MANA_REGEN_PER_WILL: f32 = 0.2;
pub const ENERGY_REGEN_BASE: f32 = 6.0;
pub const ENERGY_REGEN_PER_SKILL: f32 = 0.4;

/// What the next rank in an attribute costs. Rising, so a fourth point in one thing costs
/// more than a first point in another, and spreading is a real choice rather than a
/// rounding error.
pub const INVEST_BASE: u32 = 50;
pub const INVEST_STEP: u32 = 25;

impl Attributes {
    pub fn new(strength: u16, skill: u16, will: u16) -> Self {
        Self {
            strength: strength.clamp(MIN_RANK, MAX_RANK),
            skill: skill.clamp(MIN_RANK, MAX_RANK),
            will: will.clamp(MIN_RANK, MAX_RANK),
        }
    }

    pub fn rank(&self, attribute: Attribute) -> u16 {
        match attribute {
            Attribute::Strength => self.strength,
            Attribute::Skill => self.skill,
            Attribute::Will => self.will,
        }
    }

    fn raise(&mut self, attribute: Attribute) {
        let slot = match attribute {
            Attribute::Strength => &mut self.strength,
            Attribute::Skill => &mut self.skill,
            Attribute::Will => &mut self.will,
        };
        *slot = (*slot + 1).min(MAX_RANK);
    }

    /// What the rank after this one costs in experience.
    pub fn next_cost(&self, attribute: Attribute) -> u32 {
        let rank = u32::from(self.rank(attribute));
        INVEST_BASE + INVEST_STEP * (rank - u32::from(MIN_RANK))
    }

    pub fn max_of(&self, pool: PoolKind) -> f32 {
        match pool {
            PoolKind::Health => HEALTH_BASE + HEALTH_PER_STRENGTH * f32::from(self.strength),
            PoolKind::Mana => MANA_BASE + MANA_PER_WILL * f32::from(self.will),
            PoolKind::Energy => ENERGY_BASE + ENERGY_PER_SKILL * f32::from(self.skill),
        }
    }

    pub fn regen_of(&self, pool: PoolKind) -> f32 {
        match pool {
            PoolKind::Health => HEALTH_REGEN,
            PoolKind::Mana => MANA_REGEN_BASE + MANA_REGEN_PER_WILL * f32::from(self.will),
            PoolKind::Energy => ENERGY_REGEN_BASE + ENERGY_REGEN_PER_SKILL * f32::from(self.skill),
        }
    }
}

/// A quantity with a ceiling. Current is never above max and never below zero, enforced
/// here rather than at every call site that moves it.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Pool {
    current: f32,
    max: f32,
}

impl Pool {
    pub fn full(max: f32) -> Self {
        let max = max.max(0.0);
        Self { current: max, max }
    }

    pub fn current(&self) -> f32 {
        self.current
    }

    pub fn max(&self) -> f32 {
        self.max
    }

    /// Zero when there is nothing to be a fraction of, rather than a NaN that spreads into
    /// every bar drawn from it.
    pub fn fraction(&self) -> f32 {
        if self.max <= 0.0 {
            0.0
        } else {
            self.current / self.max
        }
    }

    pub fn is_empty(&self) -> bool {
        self.current <= 0.0
    }

    pub fn set_current(&mut self, value: f32) {
        self.current = value.clamp(0.0, self.max);
    }

    /// Moves the ceiling and carries the contents with it. A character who has just grown
    /// tougher is not also suddenly hurt, which is what happens if the maximum moves and
    /// the current does not.
    pub fn set_max(&mut self, max: f32) {
        let max = max.max(0.0);
        let gained = max - self.max;
        self.max = max;
        self.current = (self.current + gained.max(0.0)).clamp(0.0, max);
    }

    /// Takes what it can and reports how much that was, so a caller can tell a spend that
    /// happened from one that did not.
    pub fn drain(&mut self, amount: f32) -> f32 {
        if amount <= 0.0 {
            return 0.0;
        }
        let taken = amount.min(self.current);
        self.current -= taken;
        taken
    }

    /// All of it or none of it, for costs that a character cannot half-pay.
    pub fn try_spend(&mut self, amount: f32) -> bool {
        if amount <= 0.0 {
            return true;
        }
        if self.current < amount {
            return false;
        }
        self.current -= amount;
        true
    }

    pub fn restore(&mut self, amount: f32) {
        if amount <= 0.0 {
            return;
        }
        self.current = (self.current + amount).min(self.max);
    }
}

/// One character's condition.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Vitals {
    pub attributes: Attributes,
    health: Pool,
    mana: Pool,
    energy: Pool,
    /// Earned and not yet spent. Kept separate from a level, because what is interesting
    /// later is what a player chose to become, not how far along a single line they are.
    experience: u32,
    down: bool,
}

/// What a tick did to a character that anybody outside needs to hear about. Ordinary regen
/// is not news; falling over is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum VitalEvent {
    Downed,
    Revived,
    Invested(Attribute),
}

impl Default for Vitals {
    fn default() -> Self {
        Self::new(Attributes::default())
    }
}

impl Vitals {
    pub fn new(attributes: Attributes) -> Self {
        Self {
            attributes,
            health: Pool::full(attributes.max_of(PoolKind::Health)),
            mana: Pool::full(attributes.max_of(PoolKind::Mana)),
            energy: Pool::full(attributes.max_of(PoolKind::Energy)),
            experience: 0,
            down: false,
        }
    }

    pub fn pool(&self, kind: PoolKind) -> &Pool {
        match kind {
            PoolKind::Health => &self.health,
            PoolKind::Mana => &self.mana,
            PoolKind::Energy => &self.energy,
        }
    }

    fn pool_mut(&mut self, kind: PoolKind) -> &mut Pool {
        match kind {
            PoolKind::Health => &mut self.health,
            PoolKind::Mana => &mut self.mana,
            PoolKind::Energy => &mut self.energy,
        }
    }

    pub fn experience(&self) -> u32 {
        self.experience
    }

    pub fn is_down(&self) -> bool {
        self.down
    }

    /// A second of being alive. Fixed `dt` from the sim, so this is the same everywhere
    /// regardless of what the frame rate is doing.
    ///
    /// A character who is down does not quietly heal back up: getting up is somebody
    /// else's decision, not the passage of time.
    pub fn tick(&mut self, dt: f32) -> Option<VitalEvent> {
        if self.down {
            return None;
        }
        for kind in [PoolKind::Health, PoolKind::Mana, PoolKind::Energy] {
            let step = self.attributes.regen_of(kind) * dt;
            self.pool_mut(kind).restore(step);
        }
        None
    }

    pub fn damage(&mut self, amount: f32) -> Option<VitalEvent> {
        if amount <= 0.0 || self.down {
            return None;
        }
        self.health.drain(amount);
        if self.health.is_empty() {
            self.down = true;
            return Some(VitalEvent::Downed);
        }
        None
    }

    pub fn heal(&mut self, amount: f32) -> Option<VitalEvent> {
        if amount <= 0.0 {
            return None;
        }
        self.health.restore(amount);
        if self.down && !self.health.is_empty() {
            self.down = false;
            return Some(VitalEvent::Revived);
        }
        None
    }

    /// Back on your feet with a given share of your health, which is what a bed, a potion
    /// or a merciful opponent hands back.
    pub fn revive(&mut self, fraction: f32) -> Option<VitalEvent> {
        if !self.down {
            return None;
        }
        let share = fraction.clamp(0.05, 1.0);
        self.health.set_current(self.health.max() * share);
        self.down = false;
        Some(VitalEvent::Revived)
    }

    pub fn spend(&mut self, kind: PoolKind, amount: f32) -> bool {
        if self.down {
            return false;
        }
        self.pool_mut(kind).try_spend(amount)
    }

    /// For costs that should take what is there rather than fail: a sprint does not refuse
    /// to start because the last tenth of a second of it is unaffordable.
    pub fn drain(&mut self, kind: PoolKind, amount: f32) -> f32 {
        if self.down {
            return 0.0;
        }
        self.pool_mut(kind).drain(amount)
    }

    pub fn award(&mut self, experience: u32) {
        self.experience = self.experience.saturating_add(experience);
    }

    /// Spends experience to raise an attribute, and grows the pool that hangs off it.
    /// Refuses rather than going into debt, so the caller can offer the choice and let the
    /// answer be no.
    pub fn invest(&mut self, attribute: Attribute) -> Option<VitalEvent> {
        if self.attributes.rank(attribute) >= MAX_RANK {
            return None;
        }
        let cost = self.attributes.next_cost(attribute);
        if self.experience < cost {
            return None;
        }
        self.experience -= cost;
        self.attributes.raise(attribute);
        self.resize_pools();
        Some(VitalEvent::Invested(attribute))
    }

    fn resize_pools(&mut self) {
        for kind in [PoolKind::Health, PoolKind::Mana, PoolKind::Energy] {
            let max = self.attributes.max_of(kind);
            self.pool_mut(kind).set_max(max);
        }
    }
}
