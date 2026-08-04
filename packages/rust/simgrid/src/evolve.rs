//! Evolution — a one-way, one-time species change on an owned pet.
//!
//! The shibe line forks: one base species, eighteen terminal forms, and the form is chosen by
//! which trigger item the owner spends. There is no second stage and no way back, so this module
//! is deliberately conservative about what it destroys.
//!
//! Split from `progress.rs` because that module owns growth *within* a species — level, xp, and
//! the stat curve keyed off one `NpcDef`. Evolution swaps the `NpcDef` out from under a live pet,
//! which is a different problem: stats have to be recomputed against a new base, and the pet's
//! moves may no longer exist on the species it just became.

use crate::data::{NpcDef, NpcEvolution, NpcPet};
use crate::pets::{PET_MOVE_SLOTS, PetMoves, PetProgress, PetVitals, move_slot_from_species};
use crate::progress::{BaseStats, carry_hp};

/// The evolution `item_ref` triggers on this species, if any.
///
/// An entry with a `level` also gates on it, so data can require both — none of the shibe forms
/// do today, but the proto carries the field and honouring it here means the gate is a data edit
/// rather than a code change.
pub fn evolution_for<'a>(pet: &'a NpcPet, item_ref: &str, level: u32) -> Option<&'a NpcEvolution> {
    pet.evolutions.iter().find(|evo| {
        evo.item_ref.as_deref() == Some(item_ref)
            && evo.level.map(|need| level >= need).unwrap_or(true)
            && !evo.evolves_to_ref.is_empty()
    })
}

/// Every item that could evolve this species, for the client to offer.
pub fn evolution_items(pet: &NpcPet, level: u32) -> Vec<String> {
    pet.evolutions
        .iter()
        .filter(|evo| {
            !evo.evolves_to_ref.is_empty() && evo.level.map(|need| level >= need).unwrap_or(true)
        })
        .filter_map(|evo| evo.item_ref.clone())
        .collect()
}

/// What an evolution changed, so the caller can report it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EvolutionResult {
    pub to_ref: String,
    pub to_name: String,
    /// Moves dropped because the new species does not define them.
    pub forgotten: Vec<String>,
    /// Moves granted from the new species' movepool to backfill the freed slots.
    pub learned: Vec<String>,
    pub max_hp_gain: i32,
}

/// Apply an evolution in place: recompute stats against the new species and reconcile the
/// moveset.
///
/// Level and xp are untouched — evolving is not growth, and a pet that evolves at level 9 is
/// still level 9. Current hp carries proportionally via the same [`carry_hp`] used by levelling,
/// so evolving is not a heal and a fainted pet stays fainted.
///
/// **Moves are the subtle part.** `Combatant::from_pet` silently drops any move whose ability the
/// species does not define, so a move kept across evolution would not fail here — it would
/// vanish at the pet's next battle, which is far harder to explain. So they are reconciled now:
/// anything the new species still defines is kept at its current PP, anything it does not is
/// dropped and reported, and freed slots are backfilled from the new species' movepool at or
/// below the pet's level. A pet can never come out of this with an empty moveset while its new
/// species has anything to teach it.
pub fn evolve_pet(
    to: &NpcDef,
    progress: &PetProgress,
    vitals: &mut PetVitals,
    moves: &mut PetMoves,
) -> EvolutionResult {
    let mut result = EvolutionResult {
        to_ref: to.ref_id.clone(),
        to_name: to.name.clone(),
        ..Default::default()
    };

    let hp_before = vitals.hp;
    let max_before = vitals.max_hp.max(1);
    let base = BaseStats::of(to);
    crate::progress::rescale_for(vitals, &base, progress.level);
    result.max_hp_gain = vitals.max_hp - max_before;
    vitals.hp = carry_hp(hp_before, max_before, vitals.max_hp);

    // Keep what survives the species change, in slot order, at the PP it had.
    let mut kept: Vec<crate::pets::PetMoveSlot> = Vec::new();
    for slot in moves.0.drain(..) {
        if to.abilities.iter().any(|a| a.id == slot.ability_id) {
            kept.push(slot);
        } else {
            result.forgotten.push(slot.ability_id);
        }
    }

    // Backfill from the new movepool, newest-first so a pet that lost everything comes out with
    // the strongest moves it has earned rather than the four it earned first.
    if let Some(pet) = to.pet.as_ref() {
        let mut available: Vec<&str> = pet
            .movepool
            .iter()
            .filter(|m| m.level <= progress.level && !m.ability_id.is_empty())
            .map(|m| m.ability_id.as_str())
            .collect();
        available.reverse();
        for ability_id in available {
            if kept.len() >= PET_MOVE_SLOTS {
                break;
            }
            if kept.iter().any(|s| s.ability_id == ability_id) {
                continue;
            }
            if let Some(slot) = move_slot_from_species(to, ability_id) {
                kept.push(slot);
                result.learned.push(ability_id.to_string());
            }
        }
    }
    moves.0 = kept;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{NpcAbility, NpcEvolution, NpcMovepoolEntry, NpcStats};
    use crate::pets::PetMoveSlot;

    fn ability(id: &str) -> NpcAbility {
        NpcAbility {
            id: id.to_string(),
            name: id.to_string(),
            pp: 20,
            max_pp: 20,
            ..Default::default()
        }
    }

    fn species(ref_id: &str, abilities: &[&str], movepool: &[(u32, &str)]) -> NpcDef {
        NpcDef {
            ref_id: ref_id.to_string(),
            name: ref_id.to_string(),
            level: 5,
            element: String::new(),
            stats: NpcStats {
                hp: 60,
                max_hp: 60,
                attack: 20,
                defense: 18,
                special_attack: 22,
                special_defense: 16,
                speed: 24,
            },
            equipment: None,
            faction: None,
            shop_items: Vec::new(),
            abilities: abilities.iter().map(|id| ability(id)).collect(),
            pet: Some(NpcPet {
                catchable: true,
                movepool: movepool
                    .iter()
                    .map(|(level, id)| NpcMovepoolEntry {
                        level: *level,
                        ability_id: id.to_string(),
                    })
                    .collect(),
                ..Default::default()
            }),
        }
    }

    fn moves_of(ids: &[&str]) -> PetMoves {
        PetMoves(
            ids.iter()
                .map(|id| PetMoveSlot {
                    ability_id: id.to_string(),
                    pp: 7,
                    max_pp: 20,
                })
                .collect(),
        )
    }

    fn vitals() -> PetVitals {
        PetVitals {
            hp: 20,
            max_hp: 40,
            attack: 10,
            defense: 10,
            sp_attack: 10,
            sp_defense: 10,
            speed: 10,
        }
    }

    fn base_pet(evolutions: Vec<NpcEvolution>) -> NpcPet {
        NpcPet {
            catchable: true,
            evolutions,
            ..Default::default()
        }
    }

    fn evo(to: &str, item: Option<&str>, level: Option<u32>) -> NpcEvolution {
        NpcEvolution {
            evolves_to_ref: to.to_string(),
            item_ref: item.map(|s| s.to_string()),
            level,
            condition: None,
        }
    }

    #[test]
    fn the_item_picks_the_branch() {
        let pet = base_pet(vec![
            evo("mechamutt", Some("cyber-core"), None),
            evo("frostfang", Some("frost-fang"), None),
        ]);
        assert_eq!(
            evolution_for(&pet, "frost-fang", 9).map(|e| e.evolves_to_ref.as_str()),
            Some("frostfang")
        );
        assert!(
            evolution_for(&pet, "not-an-item", 9).is_none(),
            "an unrelated item evolves nothing"
        );
    }

    #[test]
    fn a_level_gate_is_honoured_when_the_data_sets_one() {
        let pet = base_pet(vec![evo("mechamutt", Some("cyber-core"), Some(16))]);
        assert!(evolution_for(&pet, "cyber-core", 15).is_none());
        assert!(evolution_for(&pet, "cyber-core", 16).is_some());
    }

    #[test]
    fn evolution_items_lists_every_reachable_branch() {
        let pet = base_pet(vec![
            evo("a", Some("item-a"), None),
            evo("b", Some("item-b"), Some(20)),
            evo("c", None, None),
        ]);
        assert_eq!(evolution_items(&pet, 9), vec!["item-a"]);
        assert_eq!(evolution_items(&pet, 20), vec!["item-a", "item-b"]);
    }

    #[test]
    fn stats_are_recomputed_against_the_new_species() {
        let to = species("strong", &["tackle"], &[(1, "tackle")]);
        let progress = PetProgress { level: 9, xp: 40 };
        let mut v = vitals();
        let mut m = moves_of(&["tackle"]);
        let result = evolve_pet(&to, &progress, &mut v, &mut m);
        assert_eq!(result.to_ref, "strong");
        assert!(v.max_hp > 40, "the new base is bigger");
        assert_eq!(result.max_hp_gain, v.max_hp - 40);
        assert_eq!(progress.level, 9, "evolving is not growth");
    }

    #[test]
    fn evolving_is_not_a_heal() {
        let to = species("strong", &["tackle"], &[(1, "tackle")]);
        let mut v = vitals();
        v.hp = 20;
        v.max_hp = 40;
        let mut m = moves_of(&["tackle"]);
        evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut v, &mut m);
        let ratio = v.hp as f32 / v.max_hp as f32;
        assert!(
            (ratio - 0.5).abs() < 0.05,
            "hp {} of {} — expected to stay about half",
            v.hp,
            v.max_hp
        );
    }

    #[test]
    fn a_fainted_pet_evolves_still_fainted() {
        let to = species("strong", &["tackle"], &[(1, "tackle")]);
        let mut v = vitals();
        v.hp = 0;
        let mut m = moves_of(&["tackle"]);
        evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut v, &mut m);
        assert_eq!(v.hp, 0);
    }

    #[test]
    fn moves_the_new_species_still_defines_are_kept_at_their_pp() {
        let to = species("strong", &["tackle", "bite"], &[(1, "tackle"), (1, "bite")]);
        let mut m = moves_of(&["tackle", "bite"]);
        let result = evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut vitals(), &mut m);
        assert!(result.forgotten.is_empty());
        assert_eq!(m.0.len(), 2);
        assert_eq!(m.0[0].pp, 7, "spent PP is not refilled");
    }

    #[test]
    fn a_move_the_new_species_lacks_is_dropped_and_reported() {
        // Without this the move would survive here and then vanish at the pet's next battle,
        // because `Combatant::from_pet` drops abilities the species does not define.
        let to = species("strong", &["tackle"], &[(1, "tackle")]);
        let mut m = moves_of(&["tackle", "howl"]);
        let result = evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut vitals(), &mut m);
        assert_eq!(result.forgotten, vec!["howl"]);
        assert!(!m.0.iter().any(|s| s.ability_id == "howl"));
    }

    #[test]
    fn freed_slots_are_backfilled_from_the_new_movepool() {
        let to = species(
            "strong",
            &["tackle", "burst", "sig"],
            &[(1, "tackle"), (8, "burst"), (26, "sig")],
        );
        let mut m = moves_of(&["howl"]); // nothing survives
        let result = evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut vitals(), &mut m);
        assert_eq!(result.forgotten, vec!["howl"]);
        // `sig` is level 26 and out of reach at 9; the rest backfill.
        assert_eq!(result.learned, vec!["burst", "tackle"]);
        assert!(!m.0.is_empty(), "never left with an unusable pet");
    }

    #[test]
    fn backfill_respects_the_four_slot_cap() {
        let to = species(
            "strong",
            &["a", "b", "c", "d", "e"],
            &[(1, "a"), (1, "b"), (1, "c"), (1, "d"), (1, "e")],
        );
        let mut m = moves_of(&["gone"]);
        evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut vitals(), &mut m);
        assert_eq!(m.0.len(), PET_MOVE_SLOTS);
    }

    #[test]
    fn a_full_surviving_moveset_gains_nothing() {
        let to = species(
            "strong",
            &["a", "b", "c", "d", "e"],
            &[(1, "a"), (1, "b"), (1, "c"), (1, "d"), (1, "e")],
        );
        let mut m = moves_of(&["a", "b", "c", "d"]);
        let result = evolve_pet(&to, &PetProgress { level: 9, xp: 0 }, &mut vitals(), &mut m);
        assert!(result.learned.is_empty());
        assert_eq!(m.0.len(), PET_MOVE_SLOTS);
    }
}
