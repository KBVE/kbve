use bevy::prelude::*;

use crate::events::{GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg};
use crate::profile::SkillProfile;
use crate::registry::SkillRegistry;

/// Processes [`GrantXpMsg`]s: adds XP, recalculates levels, fires [`LevelUpMsg`]s.
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

/// Processes [`SkillCheckMsg`]s: reads the profile and fires [`SkillCheckResultMsg`]s.
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
