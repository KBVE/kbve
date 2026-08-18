//! Skill definitions and XP grant helpers for the Embed Dungeon.
//!
//! Uses `bevy_skills::SkillProfile` as a standalone data structure (no ECS).
//! The profile is stored on `PlayerState` and persisted via `DungeonProfile`.

use std::sync::LazyLock;

use bevy_items::profession::{GatherInfo, ProfessionDb};
use bevy_skills::{SkillId, SkillProfile, XpCurve};

/// Embedded snapshot of the profession database, baked from the professiondb
/// MDX collection by `apps/kbve/isometric/scripts/sync-professiondb.mjs`.
const PROFESSIONDB_JSON: &str = include_str!("../data/professiondb.json");

static PROFESSIONS: LazyLock<Option<ProfessionDb>> =
    LazyLock::new(|| match ProfessionDb::from_json(PROFESSIONDB_JSON) {
        Ok(db) => Some(db),
        Err(e) => {
            tracing::warn!(
                "[professiondb] dungeon failed to parse baked professiondb.json: {e:?} — \
                 gathering disabled"
            );
            None
        }
    });

/// The profession database, or `None` if the baked snapshot failed to parse.
///
/// Gathering degrades to unavailable rather than panicking: a bad snapshot
/// should not take a running dungeon down.
pub fn professions() -> Option<&'static ProfessionDb> {
    PROFESSIONS.as_ref()
}

/// What gathering a given item costs and pays, straight from professiondb.
pub fn gather_info(item_ref: &str) -> Option<&'static GatherInfo> {
    professions()?.gather(item_ref)
}

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
    XpCurve::Quadratic {
        base: 50,
        scaling: 25,
        max_level: 99,
    }
}

/// Every profession's declared curve, keyed by skill id.
///
/// `SkillProfile` is keyed by a hash of the skill ref, so a level cannot be
/// re-derived from the id alone — the curve has to be looked up here or a
/// mining level gets recomputed on the combat curve.
static PROFESSION_CURVES: LazyLock<Vec<(SkillId, XpCurve)>> = LazyLock::new(|| {
    let Some(db) = professions() else {
        return Vec::new();
    };
    db.professions()
        .iter()
        .map(|p| {
            let curve = p
                .curve
                .as_ref()
                .map(|c| XpCurve::Polynomial {
                    base_xp: c.base_xp,
                    growth_factor: c.growth_factor,
                    max_level: c.max_level,
                })
                .unwrap_or_else(dungeon_xp_curve);
            (SkillId::from_ref(&p.r#ref), curve)
        })
        .collect()
});

/// The curve a given skill levels on: its profession's if it is one, the
/// dungeon's own otherwise.
pub fn curve_for(id: SkillId) -> XpCurve {
    PROFESSION_CURVES
        .iter()
        .find(|(skill, _)| *skill == id)
        .map(|(_, curve)| curve.clone())
        .unwrap_or_else(dungeon_xp_curve)
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

/// Grant XP for gathering `quantity` of `item_ref`, on whichever profession
/// professiondb says owns it.
///
/// Returns the skill that was trained and its level afterwards, or `None` if
/// the item is not a gatherable.
pub fn grant_gather_xp(
    profile: &mut SkillProfile,
    item_ref: &str,
    quantity: u32,
) -> Option<(SkillId, u32)> {
    let info = gather_info(item_ref)?;
    let id = SkillId::from_ref(&info.skill_ref);
    let xp = info.xp_reward as u64 * quantity.max(1) as u64;
    let total = profile.grant_xp_direct(id, xp);
    let level = curve_for(id).level_for_xp(total);
    profile.set_level_direct(id, level);
    Some((id, level))
}

/// Grant XP to a skill by ref, on whichever curve that skill levels on.
///
/// Returns the new level when it went up, so a caller can say so.
pub fn grant_skill_xp(profile: &mut SkillProfile, skill_ref: &str, xp: u64) -> Option<u32> {
    if xp == 0 {
        return None;
    }
    let id = SkillId::from_ref(skill_ref);
    let before = profile.level(id);
    let total = profile.grant_xp_direct(id, xp);
    let after = curve_for(id).level_for_xp(total);
    profile.set_level_direct(id, after);
    (after > before).then_some(after)
}

/// Whether the player is trained enough to work a given gatherable.
pub fn can_gather(profile: &SkillProfile, item_ref: &str) -> bool {
    match gather_info(item_ref) {
        Some(info) => profile.level(SkillId::from_ref(&info.skill_ref)) >= info.required_level,
        None => false,
    }
}

/// Recompute levels for all skills, each on its own curve.
///
/// Call this after granting XP to update cached levels.
pub fn recompute_levels(profile: &mut SkillProfile) {
    // Collect ids + xp first to release the immutable borrow.
    let entries: Vec<(SkillId, u64)> = profile.iter().map(|(id, e)| (id, e.total_xp)).collect();
    for (id, total) in entries {
        let level = curve_for(id).level_for_xp(total);
        profile.set_level_direct(id, level);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baked_professiondb_parses_and_carries_the_gathering_skills() {
        let db = professions().expect("baked professiondb.json must parse");
        for skill in ["mining", "woodcutting", "foraging"] {
            assert!(
                db.profession(skill).is_some(),
                "{skill} missing from professiondb"
            );
        }
        assert!(db.gather_len() > 0, "no gatherable items indexed");
    }

    #[test]
    fn ore_and_logs_are_gatherable_on_the_right_skill() {
        assert_eq!(
            gather_info("copper-ore").map(|i| i.skill_ref.as_str()),
            Some("mining")
        );
        assert_eq!(
            gather_info("log").map(|i| i.skill_ref.as_str()),
            Some("woodcutting")
        );
        assert_eq!(gather_info("potion"), None, "a potion is not gathered");
    }

    #[test]
    fn gathering_trains_the_owning_profession_not_foraging() {
        let mut profile = SkillProfile::default();
        let mining = SkillId::from_ref("mining");

        let (trained, _) = grant_gather_xp(&mut profile, "copper-ore", 2).expect("copper is mined");

        assert_eq!(trained, mining);
        let xp = gather_info("copper-ore").unwrap().xp_reward as u64;
        assert_eq!(profile.total_xp(mining), xp * 2);
        assert_eq!(
            profile.total_xp(foraging_id()),
            0,
            "mining XP leaked into foraging"
        );
    }

    #[test]
    fn a_profession_levels_on_its_own_curve() {
        let mining = SkillId::from_ref("mining");
        assert!(
            matches!(curve_for(mining), XpCurve::Polynomial { .. }),
            "mining should use its declared polynomial curve"
        );
        assert!(
            matches!(curve_for(combat_id()), XpCurve::Quadratic { .. }),
            "combat should stay on the dungeon curve"
        );
    }

    #[test]
    fn recompute_does_not_reprice_a_profession_on_the_dungeon_curve() {
        let mut profile = SkillProfile::default();
        let mining = SkillId::from_ref("mining");
        for _ in 0..40 {
            grant_gather_xp(&mut profile, "copper-ore", 1);
        }
        let before = profile.level(mining);

        recompute_levels(&mut profile);

        assert_eq!(profile.level(mining), before, "recompute changed the level");
    }

    #[test]
    fn deeper_nodes_are_gated_on_skill_level() {
        let mut profile = SkillProfile::default();

        assert!(
            can_gather(&profile, "stone"),
            "stone is the untrained entry node"
        );
        assert!(can_gather(&profile, "log"), "logs are the entry node too");
        assert!(
            !can_gather(&profile, "copper-ore"),
            "copper wants one level of mining first"
        );
        assert!(!can_gather(&profile, "iron-ore"), "iron wants fifteen");

        // Working the entry node is what opens the next one.
        for _ in 0..12 {
            grant_gather_xp(&mut profile, "stone", 1);
        }
        assert!(
            can_gather(&profile, "copper-ore"),
            "mining stone should train into copper"
        );
        assert!(!can_gather(&profile, "iron-ore"), "iron is still far off");
    }

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
