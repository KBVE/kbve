//! Capture — the last piece of the pet ownership loop (#14948 phase E).
//!
//! Split into the two halves a throw has: [`authorize_throw`] runs BEFORE the turn resolves and
//! decides whether the ball may be spent at all, and [`settle_catch`] runs AFTER the engine has
//! set `BattleOutcome::Caught` and moves the pet into the roster.
//!
//! The roll itself lives in `simgrid::battle` (`BattleAction::Catch`), drawn from the same turn
//! stream as the rest of the turn, so a replayed duel catches on the same turn.

use bevy::prelude::*;

use crate::duel::Duel;

/// The inventory ref of the ball, itemdb `pet-ball`.
pub const PET_BALL_REF: &str = "pet-ball";

/// The `BattleAction` for a throw in this duel, or `None` if the duel has nothing catchable.
/// `rate` comes from the wild species' npcdb `capture_rate`, so tuning a species is a data edit.
pub fn catch_action(duel: &Duel) -> Option<simgrid::BattleAction> {
    let wild = duel.wild.as_ref()?;
    let species = crate::game::NPC_DB.get(&wild.species_ref)?;
    let rate = species.pet.as_ref().map(|p| p.capture_rate).unwrap_or(0);
    Some(simgrid::BattleAction::Catch { rate })
}

/// Whether the throw may proceed, spending the ball as a side effect when it may.
///
/// Every refusal keeps the ball AND the turn: a wasted ball on a full roster, or a silently
/// dropped turn with no explanation, both read as bugs. Mirrors how phase D refuses to burn an
/// elixir on a healthy pet.
pub fn authorize_throw(
    bcast: &simgrid::Outbound,
    slot: simgrid::proto::PlayerSlot,
    duel: &Duel,
    items: &mut simgrid::sim::ItemBank,
    roster: &simgrid::PetRoster,
    inventory: &mut simgrid::Inventory,
) -> bool {
    if duel.wild.is_none() {
        crate::restore::notify(bcast, slot, false, "There is nothing to catch here.");
        return false;
    }
    if !simgrid::PetBank::has_room(roster) {
        crate::restore::notify(
            bcast,
            slot,
            false,
            "Your roster is full — release a pet first.",
        );
        return false;
    }
    if items.count(inventory, PET_BALL_REF) == 0 {
        crate::restore::notify(bcast, slot, false, "You have no pet balls.");
        return false;
    }
    // Spent on the attempt, not on the result — that is what makes weakening the target matter.
    items.remove(inventory, PET_BALL_REF, 1);
    true
}

/// Move a caught pet into the roster and take it out of the world.
///
/// The snapshot comes from the wild pet's LIVE combatant, so it keeps the level it was found at
/// and the damage and PP it spent during the fight — phase D made those persist, and a capture
/// that quietly healed the pet would contradict it.
#[allow(clippy::too_many_arguments)]
pub fn settle_catch(
    bcast: &simgrid::Outbound,
    slot: simgrid::proto::PlayerSlot,
    duel: &Duel,
    pet_bank: &mut simgrid::PetBank,
    roster: &mut simgrid::PetRoster,
    queued: &mut simgrid::PendingRosterSyncs,
    commands: &mut Commands,
) {
    let Some(wild) = duel.wild.as_ref() else {
        return;
    };
    // The cap was checked before the throw, but re-check: a roster can fill between the throw and
    // the catch landing, and going over would strand a pet the hub cannot show.
    if !simgrid::PetBank::has_room(roster) {
        crate::restore::notify(
            bcast,
            slot,
            false,
            "Your roster filled up — the pet got away.",
        );
        return;
    }
    let snap = simgrid::snapshot_from_combatant(duel.state.enemy.active());
    let nickname = snap.nickname.clone();
    pet_bank.add(roster, snap);
    // The world entity is gone: it is in the roster now, not on the map.
    commands.entity(wild.entity).despawn();
    queued.0.insert(slot);
    crate::restore::notify(
        bcast,
        slot,
        true,
        &format!("{nickname} joined your roster!"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use simgrid::proto::PlayerSlot;

    const SLOT: PlayerSlot = PlayerSlot(1);

    fn wild_duel(world: &mut World, wild_entity: Entity) -> Duel {
        let species = crate::game::NPC_DB
            .get(crate::wild::WILD_SPECIES_REF)
            .expect("mechamutt");
        let snap = simgrid::mint_pet_from_species(species, 5).expect("mint");
        let enemy = vec![simgrid::Combatant::from_pet(&snap, species)];
        let _ = world;
        Duel {
            state: simgrid::BattleState::versus(7, crate::game::mechamutt_team(species), enemy),
            sides: [
                crate::duel::DuelSide::Human {
                    slot: SLOT.0,
                    name: "me".into(),
                },
                crate::duel::DuelSide::Npc {
                    trainer: None,
                    name: "Wild".into(),
                    difficulty: simgrid::AiDifficulty::Greedy,
                },
            ],
            committed: [None, None],
            deadline_tick: 100,
            pets: [vec![None; crate::game::PET_TEAM_SIZE], vec![None]],
            wild: Some(crate::duel::WildTarget {
                entity: wild_entity,
                species_ref: crate::wild::WILD_SPECIES_REF.to_string(),
            }),
        }
    }

    #[test]
    fn catch_action_is_offered_only_in_wild_duels() {
        let mut world = World::new();
        let e = world.spawn_empty().id();
        let mut duel = wild_duel(&mut world, e);
        assert!(matches!(
            catch_action(&duel),
            Some(simgrid::BattleAction::Catch { .. })
        ));
        duel.wild = None;
        assert!(
            catch_action(&duel).is_none(),
            "trainer and PvP duels stay uncatchable"
        );
    }

    #[test]
    fn a_caught_pet_keeps_its_battle_vitals() {
        // The snapshot is taken from the live combatant, so damage dealt during the fight carries
        // into the roster rather than being healed away.
        let species = crate::game::NPC_DB
            .get(crate::wild::WILD_SPECIES_REF)
            .expect("mechamutt");
        let snap = simgrid::mint_pet_from_species(species, 7).expect("mint");
        let mut c = simgrid::Combatant::from_pet(&snap, species);
        c.hp = 3;
        c.moves[0].pp = 1;
        let caught = simgrid::snapshot_from_combatant(&c);
        assert_eq!(caught.level, 7);
        assert_eq!(caught.vitals.hp, 3);
        assert_eq!(caught.moves[0].pp, 1);
        assert_ne!(caught.id, snap.id, "a capture mints a new instance id");
    }

    #[test]
    fn a_caught_pet_never_arrives_fainted() {
        // Landing a ball on a 0-hp target would otherwise put an unusable pet in the roster.
        let species = crate::game::NPC_DB
            .get(crate::wild::WILD_SPECIES_REF)
            .expect("mechamutt");
        let snap = simgrid::mint_pet_from_species(species, 4).expect("mint");
        let mut c = simgrid::Combatant::from_pet(&snap, species);
        c.hp = 0;
        assert_eq!(simgrid::snapshot_from_combatant(&c).vitals.hp, 1);
    }
}
