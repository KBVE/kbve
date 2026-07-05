//! Battle AI policies over the pure [`BattleState`] reducer — pick one
//! [`BattleAction`] per turn (or a replacement index after a faint) at a given
//! [`AiDifficulty`]. Pure and deterministic: all randomness comes from the caller's rng.

use serde::{Deserialize, Serialize};

use crate::battle::{BattleAction, BattleSide, BattleState, Combatant, Side, expected_damage};
use crate::rng::Mulberry32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AiDifficulty {
    Dumb,
    Greedy,
    Tactician,
}

fn sides(state: &BattleState, side: Side) -> (&BattleSide, &BattleSide) {
    match side {
        Side::Player => (&state.player, &state.enemy),
        Side::Enemy => (&state.enemy, &state.player),
    }
}

fn best_move(att: &Combatant, def: &Combatant) -> Option<(usize, i32)> {
    att.moves
        .iter()
        .enumerate()
        .filter(|(_, m)| m.pp > 0)
        .map(|(i, m)| (i, expected_damage(att, def, &m.data)))
        .max_by_key(|(_, d)| *d)
}

fn any_pp_move(c: &Combatant, rng: &mut Mulberry32) -> usize {
    let usable: Vec<usize> = c
        .moves
        .iter()
        .enumerate()
        .filter(|(_, m)| m.pp > 0)
        .map(|(i, _)| i)
        .collect();
    if usable.is_empty() {
        0
    } else {
        usable[(rng.next_u32() as usize) % usable.len()]
    }
}

/// Pick `side`'s action for the coming turn.
pub fn choose_action(
    state: &BattleState,
    side: Side,
    difficulty: AiDifficulty,
    rng: &mut Mulberry32,
) -> BattleAction {
    let (mine, theirs) = sides(state, side);
    let active = mine.active();
    let opp = theirs.active();
    match difficulty {
        AiDifficulty::Dumb => BattleAction::Move {
            slot: any_pp_move(active, rng),
        },
        AiDifficulty::Greedy => BattleAction::Move {
            slot: best_move(active, opp).map(|(i, _)| i).unwrap_or(0),
        },
        AiDifficulty::Tactician => tactician(state, side, rng),
    }
}

fn tactician(state: &BattleState, side: Side, rng: &mut Mulberry32) -> BattleAction {
    let (mine, theirs) = sides(state, side);
    BattleAction::Move {
        slot: best_move(mine.active(), theirs.active())
            .map(|(i, _)| i)
            .unwrap_or_else(|| any_pp_move(mine.active(), rng)),
    }
}

/// Pick the reserve index to send out after a faint. Falls back to the first living
/// reserve; callers should only invoke this when `needs_replacement(side)` is true.
pub fn choose_replacement(state: &BattleState, side: Side, difficulty: AiDifficulty) -> usize {
    let (mine, theirs) = sides(state, side);
    let opp = theirs.active();
    let first = mine.team.iter().position(Combatant::is_alive).unwrap_or(0);
    if difficulty == AiDifficulty::Dumb {
        return first;
    }
    mine.team
        .iter()
        .enumerate()
        .filter(|(i, c)| c.is_alive() && *i != mine.active)
        .max_by_key(|(_, c)| {
            let own = best_move(c, opp).map(|(_, d)| d).unwrap_or(0);
            let incoming = best_move(opp, c).map(|(_, d)| d).unwrap_or(0);
            own - incoming
        })
        .map(|(i, _)| i)
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::battle::BattleState;
    use crate::data::{NpcAbility, NpcDef, NpcMovepoolEntry, NpcPet, NpcStats};
    use crate::pets::mint_pet_from_species;
    use crate::rng;

    fn ability(id: &str, power: i32, cat: &str, elem: &str) -> NpcAbility {
        NpcAbility {
            id: id.into(),
            power,
            max_pp: 20,
            category: cat.into(),
            element: elem.into(),
            hit_chance: 1.0,
            ..Default::default()
        }
    }

    fn species(ref_id: &str, elem: &str, abilities: Vec<NpcAbility>) -> NpcDef {
        let movepool = abilities
            .iter()
            .map(|a| NpcMovepoolEntry {
                level: 1,
                ability_id: a.id.clone(),
            })
            .collect();
        NpcDef {
            ref_id: ref_id.into(),
            name: ref_id.into(),
            level: 5,
            element: elem.into(),
            stats: NpcStats {
                hp: 45,
                max_hp: 45,
                attack: 9,
                defense: 7,
                speed: 11,
                special_attack: 12,
                special_defense: 8,
            },
            equipment: None,
            faction: None,
            shop_items: vec![],
            abilities,
            pet: Some(NpcPet {
                catchable: true,
                movepool,
                ..Default::default()
            }),
        }
    }

    fn mint(def: &NpcDef, level: u32) -> crate::battle::Combatant {
        let snap = mint_pet_from_species(def, level).unwrap();
        crate::battle::Combatant::from_pet(&snap, def)
    }

    fn firefox(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "firefox",
                "ELEMENT_FIRE",
                vec![
                    ability("ember", 25, "MOVE_CATEGORY_SPECIAL", "ELEMENT_FIRE"),
                    ability("gust", 40, "MOVE_CATEGORY_SPECIAL", "ELEMENT_WIND"),
                ],
            ),
            level,
        )
    }

    fn leafling(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "leafling",
                "ELEMENT_NATURE",
                vec![ability(
                    "vine",
                    20,
                    "MOVE_CATEGORY_SPECIAL",
                    "ELEMENT_NATURE",
                )],
            ),
            level,
        )
    }

    fn stoneling(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "stoneling",
                "ELEMENT_EARTH",
                vec![ability(
                    "rock",
                    20,
                    "MOVE_CATEGORY_PHYSICAL",
                    "ELEMENT_EARTH",
                )],
            ),
            level,
        )
    }

    #[test]
    fn greedy_prefers_super_effective_over_raw_power() {
        let state = BattleState::versus(1, vec![firefox(20)], vec![leafling(20)]);
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Greedy, &mut r);
        assert_eq!(
            a,
            BattleAction::Move { slot: 0 },
            "ember 25 at 2x fire->nature + stab (75 effective) beats neutral gust 40"
        );
    }

    #[test]
    fn dumb_only_picks_moves_with_pp() {
        let mut state = BattleState::versus(1, vec![firefox(20)], vec![leafling(20)]);
        state.player.team[0].moves[0].pp = 0;
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        for _ in 0..8 {
            let a = choose_action(&state, Side::Player, AiDifficulty::Dumb, &mut r);
            assert_eq!(a, BattleAction::Move { slot: 1 });
        }
    }

    #[test]
    fn replacement_picks_best_matchup_not_first_alive() {
        let mut state = BattleState::versus(
            1,
            vec![firefox(20)],
            vec![leafling(20), leafling(20), stoneling(20)],
        );
        state.enemy.team[0].hp = 0;
        let dumb = choose_replacement(&state, Side::Enemy, AiDifficulty::Dumb);
        let smart = choose_replacement(&state, Side::Enemy, AiDifficulty::Greedy);
        assert_eq!(dumb, 1, "dumb takes first living reserve");
        assert_eq!(
            smart, 2,
            "stoneling resists nothing but leafling takes 2x from fire — earth is the better matchup"
        );
    }

    #[test]
    fn choose_action_is_deterministic_per_seed() {
        let state = BattleState::versus(7, vec![firefox(20)], vec![leafling(20)]);
        let pick = |seed: u32| {
            let mut r = rng::stream(seed, rng::domain::PETBATTLE, &[0, 0xA1]);
            choose_action(&state, Side::Player, AiDifficulty::Dumb, &mut r)
        };
        assert_eq!(pick(42), pick(42));
    }
}
