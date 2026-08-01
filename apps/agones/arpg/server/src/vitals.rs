//! Battle vitals commit-back: the bridge from the engine's `BattleState` to the pet
//! components that persistence actually saves.
//!
//! Battles used to run on full-HP throwaway copies, so nothing needed writing back. Now
//! `roster_team` hands the engine the pet's real hp and PP, which makes the reverse trip
//! mandatory: without it, damage and PP spend would vanish the moment the duel ended, and
//! disconnecting mid-duel would be a free full heal (the exploit #13801 was opened for).
//!
//! The commit runs every frame a duel is live rather than only on turn resolve or battle
//! end. That is what makes a mid-duel disconnect safe: by the time `cleanup_stale_duels`
//! forfeits the abandoned side, the damage it took is already persisted, so `forfeit` needs
//! no commit of its own. Writes are diffed, so a duel sitting idle between turns costs
//! nothing and does not spam the roster event.

use bevy::prelude::*;

use crate::duel::{ActiveDuels, DuelSide};

/// Persist each live duel's hp and PP onto the pet entities behind the teams. Queues a
/// roster sync for any owner whose pets actually changed.
pub fn commit_duel_vitals(
    duels: Res<ActiveDuels>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut pets: Query<(&mut simgrid::PetVitals, &mut simgrid::PetMoves)>,
) {
    if duels.by_id.is_empty() {
        return;
    }
    for duel in duels.by_id.values() {
        for (side_idx, side) in duel.sides.iter().enumerate() {
            // Only human sides have an owner to sync; trainer and minted teams carry no
            // entities at all, so their `pets` vector is all `None`.
            let DuelSide::Human { slot, .. } = side else {
                continue;
            };
            let team = match crate::duel::engine_side(side_idx) {
                simgrid::Side::Player => &duel.state.player.team,
                simgrid::Side::Enemy => &duel.state.enemy.team,
            };
            let mut dirty = false;
            for (combatant, handle) in team.iter().zip(duel.pets[side_idx].iter()) {
                let Some(entity) = handle else {
                    continue;
                };
                let Ok((mut vitals, mut moves)) = pets.get_mut(*entity) else {
                    continue;
                };
                if vitals.hp != combatant.hp {
                    vitals.hp = combatant.hp;
                    dirty = true;
                }
                // Move slots are index-aligned: `Combatant::from_pet` builds them from the
                // pet's own list, dropping any whose ability the species no longer defines.
                // Guard on the id anyway so a species edit can't shift PP onto the wrong
                // move.
                for (slot_data, battle_move) in moves.0.iter_mut().zip(combatant.moves.iter()) {
                    if slot_data.ability_id != battle_move.data.id {
                        continue;
                    }
                    if slot_data.pp != battle_move.pp {
                        slot_data.pp = battle_move.pp;
                        dirty = true;
                    }
                }
            }
            if dirty {
                queued.0.insert(simgrid::proto::PlayerSlot(*slot));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::duel::Duel;

    /// One mechamutt combatant with its hp and first-move PP forced to the values a
    /// battle would have left behind.
    fn combatant(hp: i32, pp: u16) -> simgrid::Combatant {
        let species = crate::game::NPC_DB
            .get(crate::game::MECHAMUTT_REF)
            .expect("mechamutt");
        let mut c = crate::game::mechamutt_team(species)
            .into_iter()
            .next()
            .expect("a minted team is non-empty");
        c.hp = hp;
        c.moves.first_mut().expect("a move").pp = pp;
        c
    }

    /// The pet-side move list matching `combatant`'s first move, so the id guard in the
    /// commit lines up.
    fn pet_moves(pp: u16) -> simgrid::PetMoves {
        let ability_id = combatant(1, pp).moves[0].data.id.clone();
        simgrid::PetMoves(vec![simgrid::PetMoveSlot {
            ability_id,
            pp: 10,
            max_pp: 10,
        }])
    }

    /// A world with one player owning one pet, and a live duel whose player-side slot 0
    /// points at that pet. Returns the app and the pet entity.
    fn harness(battle_hp: i32, battle_pp: u16) -> (App, Entity) {
        let mut app = App::new();
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        let pet = app
            .world_mut()
            .spawn((
                simgrid::PetVitals {
                    hp: 30,
                    max_hp: 30,
                    attack: 10,
                    defense: 10,
                    sp_attack: 10,
                    sp_defense: 10,
                    speed: 10,
                },
                pet_moves(10),
            ))
            .id();
        let mut duels = ActiveDuels::default();
        duels.create(Duel {
            state: simgrid::BattleState::versus(
                7,
                vec![combatant(battle_hp, battle_pp)],
                vec![combatant(30, 10)],
            ),
            sides: [
                DuelSide::Human {
                    slot: 1,
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
            pets: [vec![Some(pet)], vec![None]],
            wild: None,
        });
        app.insert_resource(duels);
        app.add_systems(Update, commit_duel_vitals);
        (app, pet)
    }

    #[test]
    fn commits_hp_and_pp_and_queues_a_sync() {
        let (mut app, pet) = harness(12, 7);
        app.update();
        let vitals = app.world().get::<simgrid::PetVitals>(pet).expect("vitals");
        assert_eq!(vitals.hp, 12, "battle damage persisted");
        let moves = app.world().get::<simgrid::PetMoves>(pet).expect("moves");
        assert_eq!(moves.0[0].pp, 7, "PP spend persisted");
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&simgrid::proto::PlayerSlot(1))
        );
    }

    #[test]
    fn an_unchanged_duel_queues_nothing() {
        // Battle values already equal the pet's — an idle duel must not re-emit a sync
        // every frame.
        let (mut app, _) = harness(30, 10);
        app.update();
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .is_empty()
        );
    }

    #[test]
    fn damage_is_persisted_before_a_forfeit_can_discard_it() {
        // The disconnect exploit from #13801: the commit runs while the duel is still
        // live, so forfeiting afterwards cannot hand back the lost hp.
        let (mut app, pet) = harness(3, 10);
        app.update();
        let mut duels = app.world_mut().resource_mut::<ActiveDuels>();
        let id = *duels.by_id.keys().next().expect("one duel");
        crate::duel::forfeit(duels.by_id.get_mut(&id).expect("duel"), 0);
        assert_eq!(
            app.world()
                .get::<simgrid::PetVitals>(pet)
                .expect("vitals")
                .hp,
            3
        );
    }
}
