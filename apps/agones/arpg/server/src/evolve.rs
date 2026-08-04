//! Evolution policy: validate the trigger, spend the item, swap the species.
//!
//! simgrid owns the mechanism ([`simgrid::evolve_pet`] — stat rescale and move reconciliation);
//! this lives here because the checks need the item bank, the roster, and the duel registry, none
//! of which the engine knows about.
//!
//! Evolution is permanent and unrepeatable, so every refusal happens **before** the item is
//! spent. The one thing worse than a refused evolution is a consumed item and an unchanged pet.

use bevy::prelude::*;
use simgrid::sim::PendingEvolutions;

/// Drain this frame's evolution attempts.
///
/// Refused while the owner is in a duel, for the same reason `apply_roster_ops` and
/// `apply_learn_responses` refuse: the live `BattleState` holds combatant copies built from these
/// components, and changing species mid-battle would leave the engine fighting with the old stats
/// and the client rendering the new sprite.
pub fn apply_evolutions(
    bcast: Res<simgrid::Outbound>,
    duels: Res<crate::duel::ActiveDuels>,
    mut pending: ResMut<PendingEvolutions>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut items: simgrid::sim::ItemBank,
    mut owners: Query<(
        &simgrid::PlayerSlotTag,
        &simgrid::PetRoster,
        &mut simgrid::Inventory,
    )>,
    mut pets: Query<(
        &mut simgrid::PetRef,
        &mut simgrid::PetNickname,
        &simgrid::PetProgress,
        &simgrid::PetGenes,
        &mut simgrid::PetVitals,
        &mut simgrid::PetMoves,
    )>,
) {
    if pending.0.is_empty() {
        return;
    }
    for (slot, idx, item_ref) in std::mem::take(&mut pending.0) {
        let Some((_, roster, mut inventory)) = owners
            .iter_mut()
            .find(|(tag, _, _)| tag.0 == slot)
            .map(|(t, r, i)| (t, r.clone(), i))
        else {
            continue;
        };
        if duels.by_slot.contains_key(&slot.0) {
            crate::restore::notify(
                &bcast,
                slot,
                false,
                "Finish the battle before evolving a pet.",
            );
            continue;
        }
        let Some(&entity) = roster.slots.get(idx) else {
            crate::restore::notify(&bcast, slot, false, "No pet in that slot.");
            continue;
        };
        let Ok((mut species_ref, mut nickname, progress, genes, mut vitals, mut moves)) =
            pets.get_mut(entity)
        else {
            continue;
        };
        let Some(from) = crate::game::NPC_DB.get(&species_ref.0) else {
            continue;
        };
        let Some(from_pet) = from.pet.as_ref() else {
            continue;
        };

        // Does this species evolve on this item at this level?
        let Some(evolution) = simgrid::evolution_for(from_pet, &item_ref, progress.level) else {
            crate::restore::notify(
                &bcast,
                slot,
                false,
                &format!("{} does not react to that.", nickname.0),
            );
            continue;
        };
        let Some(to) = crate::game::NPC_DB.get(&evolution.evolves_to_ref) else {
            // Data bug rather than player error — a guard test covers dangling refs, so say
            // nothing specific and leave the item unspent.
            continue;
        };
        if items.count(&inventory, &item_ref) == 0 {
            crate::restore::notify(
                &bcast,
                slot,
                false,
                &format!("You have no {}.", pretty(&item_ref)),
            );
            continue;
        }

        // Every check has passed; only now is the item gone.
        items.remove(&mut inventory, &item_ref, 1);
        // A nickname the owner never touched tracks the species; a custom one is theirs to keep.
        let renamed = nickname.0 == from.name;
        let result = simgrid::evolve_pet(to, progress, genes, &mut vitals, &mut moves);
        species_ref.0 = result.to_ref.clone();
        if renamed {
            nickname.0 = result.to_name.clone();
        }
        queued.0.insert(slot);

        let who = if renamed {
            &result.to_name
        } else {
            &nickname.0
        };
        crate::restore::notify(
            &bcast,
            slot,
            true,
            &format!("{} evolved into {}!", from.name, result.to_name),
        );
        if !result.forgotten.is_empty() {
            crate::restore::notify(
                &bcast,
                slot,
                true,
                &format!(
                    "{who} forgot {} as it changed.",
                    result
                        .forgotten
                        .iter()
                        .map(|id| pretty(id))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            );
        }
        if !result.learned.is_empty() {
            crate::restore::notify(
                &bcast,
                slot,
                true,
                &format!(
                    "{who} learned {}.",
                    result
                        .learned
                        .iter()
                        .map(|id| pretty(id))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            );
        }
    }
}

/// Turn a kebab-case ref into something readable for a notice.
fn pretty(reference: &str) -> String {
    reference
        .split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game;

    const SLOT: simgrid::proto::PlayerSlot = simgrid::proto::PlayerSlot(2);
    const CORE: &str = "cyber-core";

    fn shibe() -> &'static simgrid::NpcDef {
        game::NPC_DB.get("shibe").expect("shibe")
    }

    /// A world with one owner holding `cores` cyber-cores and one shibe in the roster.
    fn harness(cores: u32, dueling: bool) -> (App, Entity) {
        let mut app = App::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        app.insert_resource(PendingEvolutions::default());
        app.insert_resource(simgrid::sim::PendingItems::default());
        app.insert_resource(crate::game::registry());
        let mut duels = crate::duel::ActiveDuels::default();
        if dueling {
            duels.by_slot.insert(SLOT.0, 1);
        }
        app.insert_resource(duels);

        let snap = simgrid::mint_pet_from_species(shibe(), 9).expect("mint");
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
                simgrid::PetMoves(snap.moves.clone()),
            ))
            .id();

        let mut slots = Vec::new();
        for _ in 0..cores {
            let e = app
                .world_mut()
                .spawn((
                    simgrid::sim::ItemRef(CORE.to_string()),
                    simgrid::sim::StackCount(1),
                    simgrid::sim::ItemId("core".to_string()),
                ))
                .id();
            slots.push(e);
        }
        app.world_mut().spawn((
            simgrid::PlayerSlotTag(SLOT),
            simgrid::PetRoster {
                slots: vec![pet],
                active: Some(0),
            },
            simgrid::Inventory { slots },
        ));
        app.add_systems(Update, apply_evolutions);
        (app, pet)
    }

    fn request(app: &mut App, idx: usize, item_ref: &str) {
        app.world_mut().resource_mut::<PendingEvolutions>().0.push((
            SLOT,
            idx,
            item_ref.to_string(),
        ));
    }

    fn species_of(app: &App, pet: Entity) -> String {
        app.world()
            .get::<simgrid::PetRef>(pet)
            .expect("ref")
            .0
            .clone()
    }

    #[test]
    fn the_item_evolves_the_shibe_into_that_form() {
        let (mut app, pet) = harness(1, false);
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "mechamutt");
        assert_eq!(
            app.world()
                .get::<simgrid::PetNickname>(pet)
                .expect("nickname")
                .0,
            "Mechamutt",
            "an untouched nickname follows the species"
        );
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&SLOT)
        );
    }

    #[test]
    fn a_custom_nickname_survives_the_change() {
        let (mut app, pet) = harness(1, false);
        app.world_mut()
            .entity_mut(pet)
            .insert(simgrid::PetNickname("Biscuit".to_string()));
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "mechamutt");
        assert_eq!(
            app.world()
                .get::<simgrid::PetNickname>(pet)
                .expect("nickname")
                .0,
            "Biscuit"
        );
    }

    #[test]
    fn evolving_is_one_way_and_one_time() {
        // mechamutt lists no evolutions, so a second core does nothing.
        let (mut app, pet) = harness(2, false);
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "mechamutt");
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "mechamutt", "still terminal");
    }

    #[test]
    fn a_wrong_item_is_refused_and_kept() {
        let (mut app, pet) = harness(1, false);
        request(&mut app, 0, "pet-elixir");
        app.update();
        assert_eq!(species_of(&app, pet), "shibe");
        // The core was never spent, because the elixir is not a trigger for this species.
        let held = app
            .world_mut()
            .query::<&simgrid::sim::ItemRef>()
            .iter(app.world())
            .filter(|r| r.0 == CORE)
            .count();
        assert_eq!(held, 1);
    }

    #[test]
    fn an_item_not_held_cannot_evolve() {
        let (mut app, pet) = harness(0, false);
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "shibe");
    }

    #[test]
    fn evolution_is_refused_mid_duel() {
        let (mut app, pet) = harness(1, true);
        request(&mut app, 0, CORE);
        app.update();
        assert_eq!(species_of(&app, pet), "shibe");
        let held = app
            .world_mut()
            .query::<&simgrid::sim::ItemRef>()
            .iter(app.world())
            .filter(|r| r.0 == CORE)
            .count();
        assert_eq!(held, 1, "a refusal never spends the item");
    }

    #[test]
    fn an_empty_slot_is_refused() {
        let (mut app, _) = harness(1, false);
        request(&mut app, 7, CORE);
        app.update();
        let held = app
            .world_mut()
            .query::<&simgrid::sim::ItemRef>()
            .iter(app.world())
            .filter(|r| r.0 == CORE)
            .count();
        assert_eq!(held, 1);
    }

    #[test]
    fn every_shibe_branch_resolves_to_a_mintable_species() {
        // The data half of the fork: 18 items, 18 distinct forms, all real and all catchable
        // enough to mint (evolution goes through the same species path a capture does).
        let pet = shibe().pet.as_ref().expect("shibe is a pet");
        assert_eq!(pet.evolutions.len(), 18);
        let mut targets = std::collections::HashSet::new();
        let mut items = std::collections::HashSet::new();
        for evo in &pet.evolutions {
            let item = evo.item_ref.as_deref().expect("every branch has an item");
            assert!(items.insert(item), "{item} triggers two forms");
            assert!(
                targets.insert(evo.evolves_to_ref.as_str()),
                "{} is reachable twice",
                evo.evolves_to_ref
            );
            let to = game::NPC_DB
                .get(&evo.evolves_to_ref)
                .unwrap_or_else(|| panic!("{} missing from npcdb", evo.evolves_to_ref));
            assert!(
                simgrid::mint_pet_from_species(to, 16).is_some(),
                "{} will not mint",
                evo.evolves_to_ref
            );
            assert!(
                to.pet.as_ref().is_some_and(|p| p.evolutions.is_empty()),
                "{} must be terminal — evolution is one stage",
                evo.evolves_to_ref
            );
        }
    }

    #[test]
    fn pretty_names_read_like_item_names() {
        assert_eq!(pretty("cyber-core"), "Cyber Core");
        assert_eq!(pretty("umbral-shard"), "Umbral Shard");
    }
}
