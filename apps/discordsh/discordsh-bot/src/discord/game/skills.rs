//! Skill definitions and XP grant helpers for the Embed Dungeon.
//!
//! Uses `bevy_skills::SkillProfile` as a standalone data structure (no ECS).
//! The profile is stored on `PlayerState` and persisted via `DungeonProfile`.

use bevy_skills::{SkillId, SkillProfile, XpCurve};

// ── Skill IDs ──────────────────────────────────────────────────────

pub const COMBAT_REF: &str = "combat";
pub const EXPLORATION_REF: &str = "exploration";
pub const FORAGING_REF: &str = "foraging";

/// Stable skill ID for combat (killing enemies, boss fights).
pub fn combat_id() -> SkillId {
    SkillId::from_ref(COMBAT_REF)
}

/// Stable skill ID for exploration (rooms cleared, maps traversed).
pub fn exploration_id() -> SkillId {
    SkillId::from_ref(EXPLORATION_REF)
}

/// Stable skill ID for foraging (gathering, looting, treasure rooms).
pub fn foraging_id() -> SkillId {
    SkillId::from_ref(FORAGING_REF)
}

// ── XP curve ────────────────────────────────────────────────────────

/// The XP curve shared by all dungeon skills.
///
/// Level 1 = 75 XP, quadratic scaling:
///   `xp_for_level(n) = 50*n + 25*n*n`
pub fn dungeon_xp_curve() -> XpCurve {
    XpCurve {
        base: 50,
        scaling: 25,
        max_level: 99,
    }
}

// ── XP grant helpers ────────────────────────────────────────────────

/// Grant combat XP based on enemy level (scaled: 10 + 5*level).
pub fn grant_combat_xp(profile: &mut SkillProfile, enemy_level: u8) {
    let id = combat_id();
    let xp = 10 + 5 * enemy_level as u64;
    let total = profile.grant_xp_direct(id, xp);
    profile.set_level_direct(id, dungeon_xp_curve().level_for_xp(total));
}

/// Grant exploration XP for clearing a room (flat 15 XP + depth bonus).
pub fn grant_exploration_xp(profile: &mut SkillProfile, depth: u32) {
    let id = exploration_id();
    let xp = 15 + depth as u64 * 2;
    let total = profile.grant_xp_direct(id, xp);
    profile.set_level_direct(id, dungeon_xp_curve().level_for_xp(total));
}

/// Grant foraging XP for looting (flat 8 XP per item picked up).
pub fn grant_foraging_xp(profile: &mut SkillProfile, item_count: u32) {
    let id = foraging_id();
    let xp = 8 * item_count as u64;
    if xp > 0 {
        let total = profile.grant_xp_direct(id, xp);
        profile.set_level_direct(id, dungeon_xp_curve().level_for_xp(total));
    }
}

/// Recompute levels for all skills using the dungeon XP curve.
///
/// Call this after granting XP to update cached levels.
pub fn recompute_levels(profile: &mut SkillProfile) {
    let curve = dungeon_xp_curve();
    // Collect ids + xp first to release the immutable borrow.
    let entries: Vec<(SkillId, u64)> = profile.iter().map(|(id, e)| (id, e.total_xp)).collect();
    for (id, total) in entries {
        let level = curve.level_for_xp(total);
        profile.set_level_direct(id, level);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combat_xp_scales_with_level() {
        let mut profile = SkillProfile::default();
        grant_combat_xp(&mut profile, 1);
        assert_eq!(profile.total_xp(combat_id()), 15); // 10 + 5*1
        grant_combat_xp(&mut profile, 10);
        assert_eq!(profile.total_xp(combat_id()), 75); // 15 + 10 + 5*10
    }

    #[test]
    fn exploration_xp_includes_depth() {
        let mut profile = SkillProfile::default();
        grant_exploration_xp(&mut profile, 5);
        assert_eq!(profile.total_xp(exploration_id()), 25); // 15 + 5*2
    }

    #[test]
    fn level_computation() {
        let mut profile = SkillProfile::default();
        // Grant enough XP for level 1 (75 on default curve)
        for _ in 0..5 {
            grant_combat_xp(&mut profile, 10); // 5 * 60 = 300 total
        }
        recompute_levels(&mut profile);
        assert!(profile.level(combat_id()) >= 1);
    }
}
