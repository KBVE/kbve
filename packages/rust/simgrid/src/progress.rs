//! Pet growth — experience curves, level-up, and the stat recompute that follows.
//!
//! Split from `pets.rs` because that module owns *identity and storage* (mint, bank, roster
//! sync) while this one owns *change over time*. The two meet only at [`grow_pet`], which is
//! the single writer of `PetProgress` and the level-driven half of `PetVitals`.
//!
//! Curves are the canonical JRPG cubics, keyed by the species' `growth_rate`, so tuning how
//! fast a species levels is a data edit in npcdb rather than a code change.

use bevy::prelude::{Entity, Resource};

use crate::data::NpcPet;
use crate::pets::{PetProgress, PetVitals, level_scale};
use crate::proto::PlayerSlot;

/// Level ceiling. Past this, xp stops accumulating rather than silently overflowing the
/// curve — `total_xp` is cubic and a runaway level would blow past `i32` stats.
pub const PET_LEVEL_MAX: u32 = 100;

/// How fast a species climbs. Mirrors the npcdb `GrowthRate` enum (string form
/// `GROWTH_RATE_*`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GrowthRate {
    Erratic,
    Fast,
    #[default]
    MediumFast,
    MediumSlow,
    Slow,
    Fluctuating,
}

impl GrowthRate {
    /// Parse the npcdb proto-string form (`"GROWTH_RATE_MEDIUM_FAST"`), case-insensitively.
    /// Anything unrecognised — including the unspecified default and an unauthored empty
    /// string — falls back to `MediumFast`, the curve whose total is a plain `n³`.
    pub fn from_proto(s: &str) -> GrowthRate {
        match s
            .trim_start_matches("GROWTH_RATE_")
            .to_ascii_uppercase()
            .as_str()
        {
            "ERRATIC" => GrowthRate::Erratic,
            "FAST" => GrowthRate::Fast,
            "MEDIUM_SLOW" => GrowthRate::MediumSlow,
            "SLOW" => GrowthRate::Slow,
            "FLUCTUATING" => GrowthRate::Fluctuating,
            _ => GrowthRate::MediumFast,
        }
    }

    /// Total xp required to have *reached* `level` from level 1. Integer division is
    /// deliberate and matches the canonical tables — floating point would drift between
    /// the server and any client that recomputed it.
    pub fn total_xp(self, level: u32) -> u64 {
        let n = level.clamp(1, PET_LEVEL_MAX) as u64;
        let cube = n * n * n;
        match self {
            GrowthRate::Fast => 4 * cube / 5,
            GrowthRate::MediumFast => cube,
            GrowthRate::Slow => 5 * cube / 4,
            GrowthRate::MediumSlow => {
                // 6n³/5 − 15n² + 100n − 140, floored at 0 for the low levels where the
                // negative terms dominate.
                let positive = 6 * cube / 5 + 100 * n;
                let negative = 15 * n * n + 140;
                positive.saturating_sub(negative)
            }
            GrowthRate::Erratic => match n {
                0..=49 => cube * (100 - n) / 50,
                50..=67 => cube * (150 - n) / 100,
                68..=97 => cube * ((1911 - 10 * n) / 3) / 500,
                _ => cube * (160 - n) / 100,
            },
            GrowthRate::Fluctuating => match n {
                0..=14 => cube * ((n + 1) / 3 + 24) / 50,
                15..=35 => cube * (n + 14) / 50,
                _ => cube * (n / 2 + 32) / 50,
            },
        }
    }

    /// XP needed to get from `level` to `level + 1`. At the ceiling this is 0, which callers
    /// read as "cannot level further".
    pub fn xp_to_next(self, level: u32) -> u32 {
        if level >= PET_LEVEL_MAX {
            return 0;
        }
        let span = self.total_xp(level + 1) - self.total_xp(level);
        // Every curve is strictly increasing over 1..=100, but clamp anyway: a future curve
        // with a flat segment would otherwise make a level free.
        span.max(1) as u32
    }
}

/// XP a victor earns for downing one foe. The canonical `base * level / 7`, split across the
/// pets that took part so a six-pet roster cannot farm six times the xp from one fight.
pub fn xp_yield(base_xp_yield: i32, loser_level: u32, participants: u32) -> u32 {
    let base = base_xp_yield.max(0) as u64;
    let total = base * loser_level.clamp(1, PET_LEVEL_MAX) as u64 / 7;
    (total / participants.max(1) as u64) as u32
}

/// One pet's share of a won battle, waiting to be applied.
#[derive(Debug, Clone, Copy)]
pub struct PetXpAward {
    pub slot: PlayerSlot,
    pub pet: Entity,
    pub xp: u32,
}

/// XP earned but not yet applied. A queue for the same reason [`crate::pets::PendingRosterSyncs`]
/// is one: the duel systems that know a battle ended hold `&mut ActiveDuels`, while applying the
/// award needs `&mut PetProgress` and `&mut PetVitals` — the components `PetBank` reads. Draining
/// in a separate system keeps those out of one another's way.
#[derive(Resource, Default)]
pub struct PendingPetXp(pub Vec<PetXpAward>);

/// What [`grow_pet`] did, so the caller can tell the player about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GrowthResult {
    pub gained: u32,
    pub levels: u32,
    pub max_hp_gain: i32,
}

impl GrowthResult {
    pub fn leveled(&self) -> bool {
        self.levels > 0
    }
}

/// Add `gained` xp, rolling as many levels as it covers, and rescale the stats.
///
/// Current hp is carried across the level-up **proportionally**, not refilled: phase D of
/// #14948 made battle damage persist, and a free heal every level would hand it straight back.
/// A pet that levels at 10% hp comes out at 10% of its new maximum — bigger in absolute terms,
/// because the maximum grew, but still hurt.
///
/// A fainted pet (0 hp) stays fainted; it earns the xp but does not stand up.
pub fn grow_pet(
    progress: &mut PetProgress,
    vitals: &mut PetVitals,
    pet: &NpcPet,
    base_stats: &BaseStats,
    gained: u32,
) -> GrowthResult {
    let rate = GrowthRate::from_proto(&pet.growth_rate);
    let mut result = GrowthResult {
        gained,
        ..Default::default()
    };
    if gained == 0 || progress.level >= PET_LEVEL_MAX {
        return result;
    }
    progress.xp = progress.xp.saturating_add(gained);

    let hp_before = vitals.hp;
    let max_before = vitals.max_hp.max(1);
    while progress.level < PET_LEVEL_MAX {
        let needed = rate.xp_to_next(progress.level);
        if needed == 0 || progress.xp < needed {
            break;
        }
        progress.xp -= needed;
        progress.level += 1;
        result.levels += 1;
    }
    if result.levels == 0 {
        return result;
    }
    if progress.level >= PET_LEVEL_MAX {
        // Nothing left to save toward.
        progress.xp = 0;
    }

    rescale(vitals, base_stats, progress.level);
    result.max_hp_gain = vitals.max_hp - max_before;
    vitals.hp = if hp_before <= 0 {
        0
    } else {
        // Round up so a sliver of hp can never round away into a faint.
        let numerator = hp_before as i64 * vitals.max_hp as i64;
        let scaled = (numerator + max_before as i64 - 1) / max_before as i64;
        (scaled as i32).clamp(1, vitals.max_hp)
    };
    result
}

/// The species' unscaled stat line, pulled out of `NpcDef.stats` so this module does not
/// need the whole definition.
#[derive(Debug, Clone, Copy)]
pub struct BaseStats {
    pub hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub sp_attack: i32,
    pub sp_defense: i32,
    pub speed: i32,
}

impl BaseStats {
    pub fn of(species: &crate::data::NpcDef) -> BaseStats {
        let s = &species.stats;
        BaseStats {
            hp: s.max_hp.max(s.hp),
            attack: s.attack,
            defense: s.defense,
            sp_attack: s.special_attack,
            sp_defense: s.special_defense,
            speed: s.speed,
        }
    }
}

/// Recompute every level-driven stat. Shares `level_scale` with `mint_pet_from_species`, so a
/// pet grown to level N and a pet minted at level N have identical stats — otherwise a caught
/// pet and a bred one would diverge.
fn rescale(vitals: &mut PetVitals, base: &BaseStats, level: u32) {
    vitals.max_hp = level_scale(base.hp, level);
    vitals.attack = level_scale(base.attack, level);
    vitals.defense = level_scale(base.defense, level);
    vitals.sp_attack = level_scale(base.sp_attack, level);
    vitals.sp_defense = level_scale(base.sp_defense, level);
    vitals.speed = level_scale(base.speed, level);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> BaseStats {
        BaseStats {
            hp: 45,
            attack: 9,
            defense: 7,
            sp_attack: 12,
            sp_defense: 8,
            speed: 11,
        }
    }

    fn pet_with(rate: &str) -> NpcPet {
        NpcPet {
            growth_rate: rate.to_string(),
            ..Default::default()
        }
    }

    fn vitals_at(level: u32) -> PetVitals {
        let mut v = PetVitals {
            hp: 0,
            max_hp: 0,
            attack: 0,
            defense: 0,
            sp_attack: 0,
            sp_defense: 0,
            speed: 0,
        };
        rescale(&mut v, &base(), level);
        v.hp = v.max_hp;
        v
    }

    #[test]
    fn growth_rate_parses_the_proto_string_form() {
        assert_eq!(
            GrowthRate::from_proto("GROWTH_RATE_MEDIUM_SLOW"),
            GrowthRate::MediumSlow
        );
        assert_eq!(GrowthRate::from_proto("slow"), GrowthRate::Slow);
        assert_eq!(
            GrowthRate::from_proto("GROWTH_RATE_UNSPECIFIED"),
            GrowthRate::MediumFast
        );
        assert_eq!(GrowthRate::from_proto(""), GrowthRate::MediumFast);
    }

    #[test]
    fn every_curve_is_strictly_increasing() {
        for rate in [
            GrowthRate::Erratic,
            GrowthRate::Fast,
            GrowthRate::MediumFast,
            GrowthRate::MediumSlow,
            GrowthRate::Slow,
            GrowthRate::Fluctuating,
        ] {
            for level in 1..PET_LEVEL_MAX {
                assert!(
                    rate.total_xp(level + 1) > rate.total_xp(level),
                    "{rate:?} flat or falling at {level}"
                );
                assert!(rate.xp_to_next(level) > 0, "{rate:?} free level at {level}");
            }
        }
    }

    #[test]
    fn the_ceiling_ends_the_curve() {
        assert_eq!(GrowthRate::MediumFast.xp_to_next(PET_LEVEL_MAX), 0);
    }

    #[test]
    fn fast_is_cheaper_than_slow_at_every_level() {
        for level in 2..=PET_LEVEL_MAX {
            assert!(GrowthRate::Fast.total_xp(level) < GrowthRate::Slow.total_xp(level));
        }
    }

    #[test]
    fn xp_yield_splits_across_participants() {
        let solo = xp_yield(64, 10, 1);
        assert_eq!(solo, 91);
        assert_eq!(xp_yield(64, 10, 2), 45);
        assert_eq!(
            xp_yield(64, 10, 0),
            solo,
            "no participants cannot divide by 0"
        );
    }

    #[test]
    fn enough_xp_levels_the_pet_and_grows_its_stats() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 5, xp: 0 };
        let mut vitals = vitals_at(5);
        let before = vitals.attack;
        let need = GrowthRate::MediumFast.xp_to_next(5);
        let result = grow_pet(&mut progress, &mut vitals, &pet, &base(), need);
        assert_eq!(progress.level, 6);
        assert_eq!(result.levels, 1);
        assert!(result.max_hp_gain > 0);
        assert!(vitals.attack >= before);
    }

    #[test]
    fn one_award_can_cross_several_levels() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 2, xp: 0 };
        let mut vitals = vitals_at(2);
        let lump: u32 = (2..6).map(|l| GrowthRate::MediumFast.xp_to_next(l)).sum();
        let result = grow_pet(&mut progress, &mut vitals, &pet, &base(), lump);
        assert_eq!(progress.level, 6);
        assert_eq!(result.levels, 4);
        assert_eq!(progress.xp, 0, "an exact lump leaves nothing over");
    }

    #[test]
    fn leftover_xp_carries_toward_the_next_level() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 3, xp: 0 };
        let mut vitals = vitals_at(3);
        let need = GrowthRate::MediumFast.xp_to_next(3);
        grow_pet(&mut progress, &mut vitals, &pet, &base(), need + 7);
        assert_eq!(progress.level, 4);
        assert_eq!(progress.xp, 7);
    }

    #[test]
    fn a_level_up_does_not_heal() {
        // The whole point of phase D: damage persists. Levelling at 1 hp must not refill.
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 5, xp: 0 };
        let mut vitals = vitals_at(5);
        vitals.hp = 1;
        let need = GrowthRate::MediumFast.xp_to_next(5);
        grow_pet(&mut progress, &mut vitals, &pet, &base(), need);
        assert!(
            vitals.hp < vitals.max_hp,
            "hp {} of {} — levelling healed the pet",
            vitals.hp,
            vitals.max_hp
        );
        assert!(vitals.hp >= 1, "a sliver of hp must not round away");
    }

    #[test]
    fn hp_carries_proportionally() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 9, xp: 0 };
        let mut vitals = vitals_at(9);
        vitals.hp = vitals.max_hp / 2;
        let ratio_before = vitals.hp as f32 / vitals.max_hp as f32;
        grow_pet(
            &mut progress,
            &mut vitals,
            &pet,
            &base(),
            GrowthRate::MediumFast.xp_to_next(9),
        );
        let ratio_after = vitals.hp as f32 / vitals.max_hp as f32;
        assert!((ratio_before - ratio_after).abs() < 0.05);
    }

    #[test]
    fn a_fainted_pet_stays_fainted() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 5, xp: 0 };
        let mut vitals = vitals_at(5);
        vitals.hp = 0;
        grow_pet(
            &mut progress,
            &mut vitals,
            &pet,
            &base(),
            GrowthRate::MediumFast.xp_to_next(5),
        );
        assert_eq!(progress.level, 6, "it still earns the level");
        assert_eq!(vitals.hp, 0, "but does not stand up");
    }

    #[test]
    fn a_grown_pet_matches_one_minted_at_the_same_level() {
        // Otherwise a caught-and-raised pet would be weaker (or stronger) than a wild one
        // found at the same level.
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress { level: 5, xp: 0 };
        let mut vitals = vitals_at(5);
        let lump: u32 = (5..12).map(|l| GrowthRate::MediumFast.xp_to_next(l)).sum();
        grow_pet(&mut progress, &mut vitals, &pet, &base(), lump);
        assert_eq!(progress.level, 12);
        let minted = vitals_at(12);
        assert_eq!(vitals.max_hp, minted.max_hp);
        assert_eq!(vitals.attack, minted.attack);
        assert_eq!(vitals.speed, minted.speed);
    }

    #[test]
    fn the_ceiling_stops_growth() {
        let pet = pet_with("GROWTH_RATE_MEDIUM_FAST");
        let mut progress = PetProgress {
            level: PET_LEVEL_MAX,
            xp: 0,
        };
        let mut vitals = vitals_at(PET_LEVEL_MAX);
        let result = grow_pet(&mut progress, &mut vitals, &pet, &base(), 1_000_000);
        assert_eq!(progress.level, PET_LEVEL_MAX);
        assert_eq!(result.levels, 0);
        assert_eq!(progress.xp, 0, "xp does not pile up past the ceiling");
    }
}
