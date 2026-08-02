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

/// Apply queued XP, level up whatever crosses a threshold, and tell the owner.
pub fn apply_pet_xp(
    bcast: Res<simgrid::Outbound>,
    mut pending: ResMut<simgrid::PendingPetXp>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut pets: Query<(
        &simgrid::PetRef,
        &simgrid::PetNickname,
        &mut simgrid::PetProgress,
        &mut simgrid::PetVitals,
    )>,
) {
    if pending.0.is_empty() {
        return;
    }
    for award in std::mem::take(&mut pending.0) {
        let Ok((species_ref, nickname, mut progress, mut vitals)) = pets.get_mut(award.pet) else {
            continue;
        };
        let Some(species) = game::NPC_DB.get(&species_ref.0) else {
            continue;
        };
        let Some(pet) = species.pet.as_ref() else {
            continue;
        };
        let base = simgrid::BaseStats::of(species);
        let result = simgrid::grow_pet(&mut progress, &mut vitals, pet, &base, award.xp);
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
    }
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

    /// A world holding one owned pet at `level`, with the award already queued.
    fn apply_harness(level: u32, xp: u32) -> (App, Entity) {
        let species = mechamutt();
        let snap = simgrid::mint_pet_from_species(species, level).expect("mint");
        let mut app = App::new();
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        // The receiver is dropped immediately; `notify` ignores send failures, so the
        // notices this system emits simply go nowhere in a test.
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        let pet = app
            .world_mut()
            .spawn((
                simgrid::PetRef(snap.species_ref.clone()),
                simgrid::PetNickname(snap.nickname.clone()),
                simgrid::PetProgress {
                    level: snap.level,
                    xp: 0,
                },
                snap.vitals,
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
}
