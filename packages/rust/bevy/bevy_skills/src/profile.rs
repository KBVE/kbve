//! Per-entity skill state component.

use std::collections::HashMap;

use bevy::prelude::*;

use crate::registry::SkillId;

/// A single skill's state on an entity.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SkillEntry {
    /// Total accumulated XP.
    pub total_xp: u64,
    /// Cached current level — recomputed by the XP processing system
    /// using the [`crate::XpCurve`] for this skill.
    pub level: u32,
}

/// Component holding all skill data for a single entity (player, NPC,
/// etc.). Attach to any entity that should track skill progression.
#[derive(Component, Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SkillProfile {
    skills: HashMap<SkillId, SkillEntry>,
}

impl SkillProfile {
    /// Get the entry for a skill.
    ///
    /// # Returns
    ///
    /// `Some(&entry)` if the entity has trained this skill at least
    /// once, `None` otherwise.
    pub fn get(&self, id: SkillId) -> Option<&SkillEntry> {
        self.skills.get(&id)
    }

    /// Current cached level for a skill. Returns `0` if the skill has
    /// never been trained.
    pub fn level(&self, id: SkillId) -> u32 {
        self.skills.get(&id).map(|e| e.level).unwrap_or(0)
    }

    /// Total XP for a skill. Returns `0` if the skill has never been
    /// trained.
    pub fn total_xp(&self, id: SkillId) -> u64 {
        self.skills.get(&id).map(|e| e.total_xp).unwrap_or(0)
    }

    /// Returns `true` if the entity's level in `id` is at least
    /// `required_level`.
    pub fn meets_requirement(&self, id: SkillId, required_level: u32) -> bool {
        self.level(id) >= required_level
    }

    /// Grant XP to a skill. Returns the new total XP.
    ///
    /// Internal helper — the level is recalculated by
    /// [`crate::process_xp_grants`] using the skill's XP curve.
    /// External callers should use [`crate::GrantXpMsg`] or
    /// [`SkillProfile::grant_xp_direct`].
    pub(crate) fn grant_xp(&mut self, id: SkillId, amount: u64) -> u64 {
        let entry = self.skills.entry(id).or_default();
        entry.total_xp = entry.total_xp.saturating_add(amount);
        entry.total_xp
    }

    /// Set the cached level for a skill. Internal helper called by the
    /// XP processing system.
    pub(crate) fn set_level(&mut self, id: SkillId, level: u32) {
        if let Some(entry) = self.skills.get_mut(&id) {
            entry.level = level;
        }
    }

    /// Grant XP directly without going through the ECS message
    /// pipeline.
    ///
    /// Useful for headless or non-ECS consumers (e.g. Discord bot
    /// sessions). The caller is responsible for recomputing levels
    /// afterward via [`SkillProfile::set_level_direct`].
    ///
    /// # Returns
    ///
    /// New total XP for the skill (saturates at `u64::MAX`).
    pub fn grant_xp_direct(&mut self, id: SkillId, amount: u64) -> u64 {
        self.grant_xp(id, amount)
    }

    /// Set the cached level directly without going through the ECS
    /// system. Useful for headless consumers that compute levels
    /// externally.
    pub fn set_level_direct(&mut self, id: SkillId, level: u32) {
        self.set_level(id, level);
    }

    /// Iterate over every skill the entity has trained.
    pub fn iter(&self) -> impl Iterator<Item = (SkillId, &SkillEntry)> {
        self.skills.iter().map(|(&id, entry)| (id, entry))
    }

    /// Number of skills the entity has trained.
    pub fn trained_count(&self) -> usize {
        self.skills.len()
    }

    /// Sum of cached levels across every trained skill. Useful for the
    /// classic "total level" UI display.
    pub fn total_level(&self) -> u32 {
        self.skills.values().map(|e| e.level).sum()
    }
}
