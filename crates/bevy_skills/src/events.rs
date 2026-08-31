use bevy::prelude::*;

use crate::registry::SkillId;

/// Message to grant XP to an entity's skill.
///
/// Sent by game systems when a player completes a skill action
/// (harvests a node, crafts an item, wins a fight, etc.).
#[derive(Message, Debug, Clone)]
pub struct GrantXpMsg {
    /// The entity receiving XP.
    pub entity: Entity,
    /// Which skill to grant XP to.
    pub skill: SkillId,
    /// Amount of XP to grant.
    pub amount: u64,
}

/// Message fired when a skill levels up.
///
/// Consumers can use this to trigger UI notifications, unlock
/// recipes, or gate content behind skill milestones.
#[derive(Message, Debug, Clone)]
pub struct LevelUpMsg {
    /// The entity that leveled up.
    pub entity: Entity,
    /// Which skill leveled up.
    pub skill: SkillId,
    /// The new level.
    pub new_level: u32,
    /// The previous level.
    pub old_level: u32,
}

/// Message to request a skill check.
///
/// Sent by interaction systems to ask whether an entity meets
/// the skill requirement for an action (e.g. mining iron requires
/// mining level 15).
#[derive(Message, Debug, Clone)]
pub struct SkillCheckMsg {
    /// The entity attempting the action.
    pub entity: Entity,
    /// Which skill is being checked.
    pub skill: SkillId,
    /// Minimum level required.
    pub required_level: u32,
    /// Opaque context tag so the requester can match the result
    /// back to the original action (e.g. "mine_iron_vein").
    pub context: String,
}

/// Result of a skill check, fired in response to [`SkillCheckMsg`].
#[derive(Message, Debug, Clone)]
pub struct SkillCheckResultMsg {
    /// The entity that was checked.
    pub entity: Entity,
    /// Which skill was checked.
    pub skill: SkillId,
    /// Whether the check passed.
    pub passed: bool,
    /// The entity's actual level in this skill.
    pub actual_level: u32,
    /// The required level from the original check.
    pub required_level: u32,
    /// Context tag from the original [`SkillCheckMsg`].
    pub context: String,
}
