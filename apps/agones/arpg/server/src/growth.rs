//! Pet XP: who earns it when a duel ends, and what happens when it lands.
//!
//! Two halves, split by the same constraint as `vitals.rs`. [`queue_duel_xp`] runs inside
//! `finish_duel`, which holds `&mut ActiveDuels` and knows who won; [`apply_pet_xp`] drains the
//! queue in its own system, because growing a pet needs `&mut PetProgress` and `&mut PetVitals`
//! — the components `PetBank` reads, which cannot be borrowed both ways in one system.

use bevy::prelude::*;

use crate::duel::{Duel, DuelSide, engine_side};
use crate::game;

/// Queue each owned pet's share of a won duel.
///
/// Only defeated foes pay out, and only the fainted ones: a duel that ended because the other
/// player disconnected has no fainted foes, so a forfeit wins the battle but earns nothing.
/// Catching does not pay either — `BattleOutcome::Caught` is not a win, and the pet itself is
/// the reward.
///
/// The award splits across every owned pet that was fielded, whether or not it is still
/// standing. Tracking per-foe participation would need the engine to record who was out when
/// each foe fell; splitting evenly is close enough and cannot be farmed, since the divisor grows
/// with the team.
pub fn queue_duel_xp(duel: &Duel, pending: &mut simgrid::PendingPetXp) {
    let winner = match duel.state.outcome {
        simgrid::BattleOutcome::PlayerWon => 0,
        simgrid::BattleOutcome::PlayerLost => 1,
        _ => return,
    };
    let DuelSide::Human { slot, .. } = duel.sides[winner] else {
        return;
    };
    let loser = 1 - winner;
    let loser_team = match engine_side(loser) {
        simgrid::Side::Player => &duel.state.player.team,
        simgrid::Side::Enemy => &duel.state.enemy.team,
    };

    let earners: Vec<Entity> = duel.pets[winner].iter().flatten().copied().collect();
    if earners.is_empty() {
        return;
    }

    let total: u32 = loser_team
        .iter()
        .filter(|c| c.hp <= 0)
        .filter_map(|c| {
            let species = game::NPC_DB.get(&c.species_ref)?;
            let base = species.pet.as_ref().map(|p| p.base_xp_yield).unwrap_or(0);
            Some(simgrid::xp_yield(base, c.level, earners.len() as u32))
        })
        .sum();
    if total == 0 {
        return;
    }
    for pet in earners {
        pending.0.push(simgrid::PetXpAward {
            slot: simgrid::proto::PlayerSlot(slot),
            pet,
            xp: total,
        });
    }
}

/// What [`apply_pet_xp`] touches on a growing pet. Named because the inline tuple crossed
/// clippy's complexity threshold once genetics and friendship joined it.
type GrowQuery = (
    &'static simgrid::PetId,
    &'static simgrid::PetRef,
    &'static simgrid::PetNickname,
    &'static mut simgrid::PetProgress,
    &'static simgrid::PetGenes,
    &'static mut simgrid::PetFriendship,
    &'static mut simgrid::PetVitals,
    &'static mut simgrid::PetMoves,
);

/// Apply queued XP, level up whatever crosses a threshold, learn whatever the new levels
/// grant, and tell the owner.
pub fn apply_pet_xp(
    bcast: Res<simgrid::Outbound>,
    clock: Res<simgrid::SimClock>,
    mut pending: ResMut<simgrid::PendingPetXp>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut offers: ResMut<crate::learn::PendingLearnOffers>,
    mut pets: Query<GrowQuery>,
) {
    if pending.0.is_empty() {
        return;
    }
    for award in std::mem::take(&mut pending.0) {
        let Ok((
            pet_id,
            species_ref,
            nickname,
            mut progress,
            genes,
            mut friendship,
            mut vitals,
            mut moves,
        )) = pets.get_mut(award.pet)
        else {
            continue;
        };
        let Some(species) = game::NPC_DB.get(&species_ref.0) else {
            continue;
        };
        let Some(pet) = species.pet.as_ref() else {
            continue;
        };
        let base = simgrid::BaseStats::of(species);
        let result = simgrid::grow_pet(&mut progress, &mut vitals, pet, &base, genes, award.xp);
        if result.gained == 0 {
            continue;
        }
        // Any xp at all changes the roster view, not just a level-up — the hub shows progress
        // toward the next level.
        queued.0.insert(award.slot);
        let text = if result.leveled() {
            format!(
                "{} grew to level {}! (+{} max HP)",
                nickname.0, progress.level, result.max_hp_gain
            )
        } else {
            format!("{} gained {} XP.", nickname.0, result.gained)
        };
        crate::restore::notify(&bcast, award.slot, true, &text);
        if !result.leveled() {
            continue;
        }
        // Levelling is the fast lane to FRIENDSHIP_DEVOTED. Applied here rather than queued
        // through `PendingFriendship` because this system already holds the component, and the
        // roster resync it would need is queued above.
        friendship.0 = friendship.0.saturating_add(
            simgrid::FRIENDSHIP_PER_LEVEL.saturating_mul(result.levels.min(255) as u8),
        );

        // Anything the crossed levels grant. Free slots fill silently; the rest queue up as
        // offers, because forgetting a move is the owner's call.
        let mut needs_choice: Vec<String> = Vec::new();
        for ability_id in simgrid::moves_learned_between(pet, result.from_level, result.to_level())
        {
            if crate::learn::learn_if_room(&mut moves, species, ability_id) {
                crate::restore::notify(
                    &bcast,
                    award.slot,
                    true,
                    &format!(
                        "{} learned {}!",
                        nickname.0,
                        ability_name(species, ability_id)
                    ),
                );
            } else {
                needs_choice.push(ability_id.to_string());
            }
        }
        if needs_choice.is_empty() {
            continue;
        }
        // Merge into any offer this pet already has outstanding rather than replacing it —
        // two awards in quick succession must not drop the first award's pending choice.
        let entry = offers
            .0
            .entry(pet_id.0.clone())
            .or_insert_with(|| crate::learn::LearnOffer {
                slot: award.slot,
                pet: award.pet,
                queue: Default::default(),
                deadline_tick: clock.tick.saturating_add(crate::learn::LEARN_OFFER_TICKS),
            });
        let fresh = entry.queue.is_empty();
        for ability_id in needs_choice {
            if !entry.queue.contains(&ability_id) {
                entry.queue.push_back(ability_id);
            }
        }
        if fresh {
            entry.deadline_tick = clock.tick.saturating_add(crate::learn::LEARN_OFFER_TICKS);
            crate::learn::offer_front(
                &bcast,
                entry,
                &pet_id.0,
                &nickname.0,
                species,
                &moves,
                clock.tick,
            );
        }
    }
}

/// Display name for an ability, falling back to its id.
fn ability_name(species: &simgrid::NpcDef, ability_id: &str) -> String {
    species
        .abilities
        .iter()
        .find(|a| a.id == ability_id)
        .map(|a| a.name.clone())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| ability_id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::duel::WildTarget;

    const SLOT: u16 = 3;

    fn mechamutt() -> &'static simgrid::NpcDef {
        game::NPC_DB.get(game::MECHAMUTT_REF).expect("mechamutt")
    }

    fn combatant(level: u32, hp: i32) -> simgrid::Combatant {
        let species = mechamutt();
        let snap = simgrid::mint_pet_from_species(species, level).expect("mint");
        let mut c = simgrid::Combatant::from_pet(&snap, species);
        c.hp = hp;
        c
    }

    /// A finished duel: the human on side 0 owns `owned`, the foe team is `foes`.
    fn duel_with(
        outcome: simgrid::BattleOutcome,
        owned: Vec<Option<Entity>>,
        foes: Vec<simgrid::Combatant>,
    ) -> Duel {
        let mut state = simgrid::BattleState::versus(7, vec![combatant(10, 30)], foes);
        state.outcome = outcome;
        let owned_len = owned.len();
        Duel {
            state,
            sides: [
                DuelSide::Human {
                    slot: SLOT,
                    name: "me".into(),
                },
                DuelSide::Npc {
                    trainer: None,
                    name: "bot".into(),
                    difficulty: simgrid::AiDifficulty::Greedy,
                },
            ],
            committed: [None, None],
            deadline_tick: 100,
            pets: [owned, vec![None; owned_len.max(1)]],
            wild: None,
        }
    }

    fn queued_for(duel: &Duel) -> Vec<simgrid::PetXpAward> {
        let mut pending = simgrid::PendingPetXp::default();
        queue_duel_xp(duel, &mut pending);
        pending.0
    }

    #[test]
    fn every_evolution_points_at_a_species_that_exists() {
        // `mechamutt` shipped pointing at `cyber-hound` months before that species was
        // authored. Nothing read `evolutions` then, so nothing caught it.
        for npc in &game::NPC_DB.npcs {
            let Some(pet) = npc.pet.as_ref() else {
                continue;
            };
            for evo in &pet.evolutions {
                assert!(
                    game::NPC_DB.get(&evo.evolves_to_ref).is_some(),
                    "{} evolves into {}, which is not in npcdb",
                    npc.ref_id,
                    evo.evolves_to_ref
                );
            }
        }
    }

    #[test]
    fn every_catchable_species_can_be_minted_and_grown() {
        // A catchable species with no movepool or a zero xp yield would be caught and then
        // never move again.
        for npc in &game::NPC_DB.npcs {
            let Some(pet) = npc.pet.as_ref().filter(|p| p.catchable) else {
                continue;
            };
            let snap = simgrid::mint_pet_from_species(npc, 5)
                .unwrap_or_else(|| panic!("{} is catchable but will not mint", npc.ref_id));
            assert!(
                !snap.moves.is_empty(),
                "{} mints with no moves — its movepool has nothing at or below level 5",
                npc.ref_id
            );
            assert!(
                pet.base_xp_yield > 0,
                "{} yields no xp, so beating one is worthless",
                npc.ref_id
            );
        }
    }

    #[test]
    fn a_win_pays_out_for_each_fainted_foe() {
        let mut world = World::new();
        let pet = world.spawn_empty().id();
        let duel = duel_with(
            simgrid::BattleOutcome::PlayerWon,
            vec![Some(pet)],
            vec![combatant(10, 0)],
        );
        let awards = queued_for(&duel);
        assert_eq!(awards.len(), 1);
        assert_eq!(awards[0].pet, pet);
        assert_eq!(awards[0].xp, simgrid::xp_yield(64, 10, 1));
    }

    #[test]
    fn a_forfeit_earns_nothing() {
        // The opponent disconnecting sets PlayerWon without downing anyone. Paying out here
        // would make "wait for them to rage-quit" an xp strategy.
        let mut world = World::new();
        let pet = world.spawn_empty().id();
        let duel = duel_with(
            simgrid::BattleOutcome::PlayerWon,
            vec![Some(pet)],
            vec![combatant(10, 25)],
        );
        assert!(queued_for(&duel).is_empty());
    }

    #[test]
    fn a_catch_earns_nothing() {
        let mut world = World::new();
        let pet = world.spawn_empty().id();
        let mut duel = duel_with(
            simgrid::BattleOutcome::Caught,
            vec![Some(pet)],
            vec![combatant(10, 4)],
        );
        duel.wild = Some(WildTarget {
            entity: pet,
            species_ref: game::MECHAMUTT_REF.to_string(),
        });
        assert!(queued_for(&duel).is_empty());
    }

    #[test]
    fn a_loss_earns_nothing() {
        let mut world = World::new();
        let pet = world.spawn_empty().id();
        let duel = duel_with(
            simgrid::BattleOutcome::PlayerLost,
            vec![Some(pet)],
            vec![combatant(10, 0)],
        );
        // Side 1 "won" but is an NPC, so there is no human to pay.
        assert!(queued_for(&duel).is_empty());
    }

    #[test]
    fn the_award_splits_across_the_fielded_team() {
        let mut world = World::new();
        let a = world.spawn_empty().id();
        let b = world.spawn_empty().id();
        let duel = duel_with(
            simgrid::BattleOutcome::PlayerWon,
            vec![Some(a), Some(b)],
            vec![combatant(10, 0)],
        );
        let awards = queued_for(&duel);
        assert_eq!(awards.len(), 2);
        assert_eq!(awards[0].xp, simgrid::xp_yield(64, 10, 2));
        assert!(
            awards[0].xp < simgrid::xp_yield(64, 10, 1),
            "a bigger team must not farm more total xp per head"
        );
    }

    /// A world holding one owned pet at `level`, with the award already queued. `known`
    /// overrides the minted moveset so a test can put the pet at the slot cap.
    fn apply_harness_with(level: u32, xp: u32, known: Option<&[&str]>) -> (App, Entity) {
        let species = mechamutt();
        let snap = simgrid::mint_pet_from_species(species, level).expect("mint");
        let mut app = App::new();
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        app.insert_resource(crate::learn::PendingLearnOffers::default());
        app.insert_resource(simgrid::SimClock::default());
        // The receiver is dropped immediately; `notify` ignores send failures, so the
        // notices this system emits simply go nowhere in a test.
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        let moves = match known {
            Some(ids) => simgrid::PetMoves(
                ids.iter()
                    .filter_map(|id| simgrid::move_slot_from_species(species, id))
                    .collect(),
            ),
            None => simgrid::PetMoves(snap.moves.clone()),
        };
        let pet = app
            .world_mut()
            .spawn((
                simgrid::PetId(snap.id.clone()),
                simgrid::PetRef(snap.species_ref.clone()),
                simgrid::PetNickname(snap.nickname.clone()),
                simgrid::PetProgress {
                    level: snap.level,
                    xp: 0,
                },
                snap.genes,
                snap.gender,
                simgrid::PetFriendship(snap.friendship),
                snap.vitals,
                moves,
            ))
            .id();
        app.insert_resource(simgrid::PendingPetXp(vec![simgrid::PetXpAward {
            slot: simgrid::proto::PlayerSlot(SLOT),
            pet,
            xp,
        }]));
        app.add_systems(Update, apply_pet_xp);
        (app, pet)
    }

    fn apply_harness(level: u32, xp: u32) -> (App, Entity) {
        apply_harness_with(level, xp, None)
    }

    /// XP enough to take a mechamutt from `from` to `to`.
    fn lump(from: u32, to: u32) -> u32 {
        (from..to)
            .map(|l| simgrid::GrowthRate::MediumFast.xp_to_next(l))
            .sum()
    }

    #[test]
    fn applying_enough_xp_levels_the_pet_and_syncs_the_roster() {
        let need = simgrid::GrowthRate::MediumFast.xp_to_next(5);
        let (mut app, pet) = apply_harness(5, need);
        app.update();
        let progress = app
            .world()
            .get::<simgrid::PetProgress>(pet)
            .expect("progress");
        assert_eq!(progress.level, 6);
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&simgrid::proto::PlayerSlot(SLOT))
        );
        assert!(
            app.world().resource::<simgrid::PendingPetXp>().0.is_empty(),
            "the queue drains"
        );
    }

    #[test]
    fn a_partial_award_still_syncs_so_the_hub_can_show_progress() {
        let (mut app, pet) = apply_harness(5, 3);
        app.update();
        let progress = app
            .world()
            .get::<simgrid::PetProgress>(pet)
            .expect("progress");
        assert_eq!(progress.level, 5);
        assert_eq!(progress.xp, 3);
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&simgrid::proto::PlayerSlot(SLOT))
        );
    }

    #[test]
    fn an_award_for_a_despawned_pet_is_dropped() {
        // Releasing a pet between the duel ending and the queue draining must not panic.
        let (mut app, pet) = apply_harness(5, 50);
        app.world_mut().entity_mut(pet).despawn();
        app.update();
        assert!(app.world().resource::<simgrid::PendingPetXp>().0.is_empty());
    }

    #[test]
    fn levelling_past_a_movepool_entry_learns_it_into_a_free_slot() {
        // A mechamutt minted at 5 knows tackle + spark-bark; static-bite comes at 8.
        let (mut app, pet) = apply_harness(5, lump(5, 8));
        app.update();
        let moves = app.world().get::<simgrid::PetMoves>(pet).expect("moves");
        assert!(
            moves.0.iter().any(|m| m.ability_id == "static-bite"),
            "learned outright with a slot free, got {:?}",
            moves.0.iter().map(|m| &m.ability_id).collect::<Vec<_>>()
        );
        assert!(
            app.world()
                .resource::<crate::learn::PendingLearnOffers>()
                .0
                .is_empty(),
            "a free slot needs no prompt"
        );
    }

    #[test]
    fn levelling_at_the_move_cap_queues_an_offer_instead() {
        let (mut app, pet) = apply_harness_with(
            5,
            lump(5, 8),
            Some(&["tackle", "spark-bark", "plate-up", "overclock"]),
        );
        app.update();
        let moves = app.world().get::<simgrid::PetMoves>(pet).expect("moves");
        assert_eq!(
            moves.0.len(),
            simgrid::PET_MOVE_SLOTS,
            "nothing overwritten without consent"
        );
        assert!(!moves.0.iter().any(|m| m.ability_id == "static-bite"));
        let offers = app.world().resource::<crate::learn::PendingLearnOffers>();
        let offer = offers.0.values().next().expect("one offer");
        assert_eq!(offer.pet, pet);
        assert_eq!(offer.queue.front().map(String::as_str), Some("static-bite"));
    }

    #[test]
    fn one_award_crossing_several_move_levels_queues_them_in_order() {
        // 5 → 16 grants static-bite (8), plate-up (12) and overclock (16). Two land in the free
        // slots; the last has nowhere to go and must wait for a decision.
        let (mut app, pet) = apply_harness(5, lump(5, 16));
        app.update();
        let moves = app.world().get::<simgrid::PetMoves>(pet).expect("moves");
        assert_eq!(moves.0.len(), simgrid::PET_MOVE_SLOTS);
        let offers = app.world().resource::<crate::learn::PendingLearnOffers>();
        let offer = offers.0.values().next().expect("one offer");
        assert_eq!(
            offer.queue.iter().map(String::as_str).collect::<Vec<_>>(),
            vec!["overclock"],
            "only the move that did not fit is offered"
        );
    }

    #[test]
    fn a_pet_that_learns_nothing_new_gets_no_offer() {
        let (mut app, _) = apply_harness(5, lump(5, 7));
        app.update();
        assert!(
            app.world()
                .resource::<crate::learn::PendingLearnOffers>()
                .0
                .is_empty()
        );
    }
}
