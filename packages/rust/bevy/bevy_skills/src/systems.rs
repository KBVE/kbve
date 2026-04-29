//! Bevy systems wired up by [`crate::BevySkillsPlugin`].

use bevy::prelude::*;

use crate::events::{GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg};
use crate::profile::SkillProfile;
use crate::registry::SkillRegistry;

/// Drain [`GrantXpMsg`]s, add XP, recalculate levels, and fire a
/// [`LevelUpMsg`] whenever the level increased.
///
/// Targets entities carrying a [`SkillProfile`] component. Messages
/// addressed to entities without a profile are logged + skipped.
pub fn process_xp_grants(
    mut xp_msgs: MessageReader<GrantXpMsg>,
    mut level_up_msgs: MessageWriter<LevelUpMsg>,
    mut profiles: Query<&mut SkillProfile>,
    registry: Res<SkillRegistry>,
) {
    for msg in xp_msgs.read() {
        let Ok(mut profile) = profiles.get_mut(msg.entity) else {
            eprintln!(
                "bevy_skills: GrantXpMsg for entity {:?} but no SkillProfile found",
                msg.entity
            );
            continue;
        };

        let old_level = profile.level(msg.skill);
        profile.grant_xp(msg.skill, msg.amount);

        let curve = registry.xp_curve(msg.skill);
        let new_total = profile.total_xp(msg.skill);
        let new_level = curve.level_for_xp(new_total);
        profile.set_level(msg.skill, new_level);

        if new_level > old_level {
            level_up_msgs.write(LevelUpMsg {
                entity: msg.entity,
                skill: msg.skill,
                new_level,
                old_level,
            });
        }
    }
}

/// Drain [`SkillCheckMsg`]s, read the entity's level, and fire a
/// [`SkillCheckResultMsg`] for every check (passed or failed).
///
/// Entities without a [`SkillProfile`] are treated as level `0`, so
/// any non-zero requirement fails for them.
pub fn process_skill_checks(
    mut check_msgs: MessageReader<SkillCheckMsg>,
    mut result_msgs: MessageWriter<SkillCheckResultMsg>,
    profiles: Query<&SkillProfile>,
) {
    for msg in check_msgs.read() {
        let actual_level = profiles
            .get(msg.entity)
            .map(|p| p.level(msg.skill))
            .unwrap_or(0);

        result_msgs.write(SkillCheckResultMsg {
            entity: msg.entity,
            skill: msg.skill,
            passed: actual_level >= msg.required_level,
            actual_level,
            required_level: msg.required_level,
            context: msg.context.clone(),
        });
    }
}
