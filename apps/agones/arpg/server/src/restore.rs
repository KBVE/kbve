//! Pet restores — the counterweight to `crate::vitals`. Battle damage and PP spend now
//! persist, so a roster needs a way back to full or it grinds down permanently.
//!
//! Two paths, both landing on the same [`restore_pet`] write:
//!   - a **pet elixir** spent from the hub, restoring one slot and consuming the item;
//!   - a **healer NPC** walked up to in the world, restoring the whole roster for free.
//!
//! Restores are refused while the owner is dueling, for the same reason roster mutations
//! are: the live `BattleState` holds its own copies, so healing the persisted pet mid-battle
//! would be invisible to the duel and then clobbered by the next vitals commit.

use bevy::prelude::*;
use simgrid::sim::{PendingPetRestores, PetRestore};

/// Marker for the pet healer NPC. No sprite art exists yet, so no spawner places one in the
/// world by default — [`spawn_healers`] is ready for the moment the asset lands, and the
/// input path is live so a healer spawned by any means already works.
#[derive(Component)]
pub struct Healer;

/// Kind ref for the healer NPC. Registered so the kind id resolves; the client falls back to
/// its placeholder sprite until real art exists.
pub const HEALER_REF: &str = "pet-healer";

/// Chebyshev walk-up range for asking a healer to restore the roster. Matches the trainer
/// challenge range so both interactions feel the same.
const HEAL_RANGE: i32 = 2;

/// The inventory ref of the pet elixir (itemdb `pet-elixir`, key 118).
pub const PET_ELIXIR_REF: &str = "pet-elixir";

pub fn within_heal_range(a: simgrid::proto::Tile, b: simgrid::proto::Tile) -> bool {
    (a.x - b.x).abs() <= HEAL_RANGE && (a.y - b.y).abs() <= HEAL_RANGE
}

/// Place the healer NPCs. Not wired into world spawn yet — the healer has no art, and
/// dropping an invisible interactable into the world would read as a bug rather than a
/// feature. Call this from `spawn_world` once the sprite exists; the rest of the heal path
/// (input, range check, restore) is already live, so that one call is the whole switch.
#[allow(dead_code)]
pub fn spawn_healers(
    registry: &simgrid::KindRegistry,
    spawn: simgrid::proto::Tile,
    commands: &mut Commands,
) {
    let Some(kind) = registry.kind_of(HEALER_REF) else {
        return;
    };
    let tile = simgrid::proto::Tile::new(spawn.x - 4, spawn.y + 2);
    let spec = simgrid::NpcSpec {
        kind,
        origin: tile,
        floor: crate::game::SPAWN_FLOOR,
        ticks_per_tile: 8,
        max_hp: 50,
        level: 1,
        defense: 0,
        wander: None,
        roam: None,
        aggro: None,
        loot: None,
        respawn_ticks: 0,
        float_steer: false,
        move_profile: None,
    };
    let e = simgrid::spawn_npc_from_spec(commands, &spec);
    commands.entity(e).insert((Healer, simgrid::Invulnerable));
}

/// Restore one pet to full hp and full PP on every known move. Returns whether anything
/// actually changed, so callers can skip spending an item on an already-healthy pet.
fn restore_pet(vitals: &mut simgrid::PetVitals, moves: &mut simgrid::PetMoves) -> bool {
    let mut changed = false;
    if vitals.hp != vitals.max_hp {
        vitals.hp = vitals.max_hp;
        changed = true;
    }
    for slot in moves.0.iter_mut() {
        if slot.pp != slot.max_pp {
            slot.pp = slot.max_pp;
            changed = true;
        }
    }
    changed
}

/// Drain this frame's restore requests.
#[allow(clippy::too_many_arguments)]
pub fn apply_pet_restores(
    bcast: Res<simgrid::Outbound>,
    duels: Res<crate::duel::ActiveDuels>,
    index: Res<simgrid::EidIndex>,
    mut pending: ResMut<PendingPetRestores>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut items: simgrid::sim::ItemBank,
    healers: Query<(&Healer, &simgrid::GridPos)>,
    mut players: Query<(
        &simgrid::PlayerSlotTag,
        &simgrid::GridPos,
        &simgrid::PetRoster,
        &mut simgrid::Inventory,
    )>,
    mut pets: Query<(&mut simgrid::PetVitals, &mut simgrid::PetMoves)>,
) {
    if pending.0.is_empty() {
        return;
    }
    for (slot, op) in std::mem::take(&mut pending.0) {
        if duels.by_slot.contains_key(&slot.0) {
            notify(&bcast, slot, false, "Not while your pets are in a duel.");
            continue;
        }
        let Some((_, pos, roster, mut inventory)) =
            players.iter_mut().find(|(tag, _, _, _)| tag.0 == slot)
        else {
            continue;
        };
        match op {
            PetRestore::Elixir { idx } => {
                let Some(&entity) = roster.slots.get(idx) else {
                    continue;
                };
                let Ok((mut vitals, mut moves)) = pets.get_mut(entity) else {
                    continue;
                };
                if items.count(&inventory, PET_ELIXIR_REF) == 0 {
                    notify(&bcast, slot, false, "You have no pet elixir.");
                    continue;
                }
                // Check the pet needs it BEFORE spending — an elixir burned on a
                // full-health pet is the kind of thing players never forgive.
                if !restore_pet(&mut vitals, &mut moves) {
                    notify(&bcast, slot, false, "That pet is already at full strength.");
                    continue;
                }
                items.remove(&mut inventory, PET_ELIXIR_REF, 1);
                queued.0.insert(slot);
                notify(&bcast, slot, true, "Pet elixir used.");
            }
            PetRestore::Healer { npc } => {
                let Some(&healer_entity) = index.by_eid.get(&npc.0) else {
                    continue;
                };
                let Ok((_, healer_pos)) = healers.get(healer_entity) else {
                    continue;
                };
                if !within_heal_range(pos.tile, healer_pos.tile) {
                    notify(&bcast, slot, false, "Step closer to the healer.");
                    continue;
                }
                let mut changed = false;
                for &entity in &roster.slots {
                    if let Ok((mut vitals, mut moves)) = pets.get_mut(entity) {
                        changed |= restore_pet(&mut vitals, &mut moves);
                    }
                }
                if changed {
                    queued.0.insert(slot);
                    notify(&bcast, slot, true, "Your pets are fully restored.");
                } else {
                    notify(&bcast, slot, false, "Your pets are already in good shape.");
                }
            }
        }
    }
}

/// A one-line result for the player. Its own ephemeral kind rather than a battle event:
/// `EPHEMERAL_PET_BATTLE_LOG` decodes as a whole replay on the client, so a bare event
/// posted there would mis-parse.
pub(crate) fn notify(
    bcast: &simgrid::Outbound,
    slot: simgrid::proto::PlayerSlot,
    ok: bool,
    text: &str,
) {
    let notice = simgrid::PetNotice {
        ok,
        text: text.to_string(),
    };
    let payload = simgrid::proto::encode_inner(&notice).unwrap_or_default();
    let _ = bcast.tx.send(simgrid::proto::ServerEvent::Ephemeral {
        kind: simgrid::proto::EPHEMERAL_PET_NOTICE,
        to: slot,
        payload,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use simgrid::proto::PlayerSlot;

    const SLOT: PlayerSlot = PlayerSlot(1);

    fn worn_pet(app: &mut App) -> Entity {
        app.world_mut()
            .spawn((
                simgrid::PetVitals {
                    hp: 4,
                    max_hp: 30,
                    attack: 10,
                    defense: 10,
                    sp_attack: 10,
                    sp_defense: 10,
                    speed: 10,
                },
                simgrid::PetMoves(vec![simgrid::PetMoveSlot {
                    ability_id: "tackle".into(),
                    pp: 2,
                    max_pp: 10,
                }]),
            ))
            .id()
    }

    /// A player at `SLOT` standing on `player_tile`, owning one worn-down pet, with
    /// `elixirs` pet elixirs in the inventory. A healer sits at (0, 0).
    fn harness(elixirs: u32, player_tile: simgrid::proto::Tile) -> (App, Entity) {
        let mut app = App::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        app.insert_resource(crate::duel::ActiveDuels::default());
        app.insert_resource(simgrid::sim::PendingPetRestores::default());
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        app.insert_resource(simgrid::sim::PendingItems::default());
        app.insert_resource(crate::game::registry());
        let pet = worn_pet(&mut app);
        let healer = app
            .world_mut()
            .spawn((
                Healer,
                simgrid::GridPos::at(simgrid::proto::Tile::new(0, 0)),
            ))
            .id();
        let mut index = simgrid::EidIndex::default();
        index.by_eid.insert(9, healer);
        app.insert_resource(index);
        app.world_mut().spawn((
            simgrid::PlayerSlotTag(SLOT),
            simgrid::GridPos::at(player_tile),
            simgrid::PetRoster {
                slots: vec![pet],
                active: Some(0),
            },
            simgrid::Inventory::default(),
        ));
        app.add_systems(Update, (seed_elixirs, apply_pet_restores).chain());
        app.insert_resource(SeedElixirs(elixirs));
        app.update();
        (app, pet)
    }

    #[derive(Resource)]
    struct SeedElixirs(u32);

    fn seed_elixirs(
        mut seed: ResMut<SeedElixirs>,
        mut items: simgrid::sim::ItemBank,
        mut players: Query<&mut simgrid::Inventory>,
    ) {
        if seed.0 == 0 {
            return;
        }
        let Some(mut inv) = players.iter_mut().next() else {
            return;
        };
        items.add(&mut inv, PET_ELIXIR_REF, seed.0);
        seed.0 = 0;
    }

    fn queue(app: &mut App, op: PetRestore) {
        app.world_mut()
            .resource_mut::<simgrid::sim::PendingPetRestores>()
            .0
            .push((SLOT, op));
        app.update();
    }

    fn vitals(app: &App, pet: Entity) -> simgrid::PetVitals {
        *app.world().get::<simgrid::PetVitals>(pet).expect("vitals")
    }

    fn pp(app: &App, pet: Entity) -> u16 {
        app.world().get::<simgrid::PetMoves>(pet).expect("moves").0[0].pp
    }

    fn elixir_count(app: &mut App) -> u32 {
        let mut q = app
            .world_mut()
            .query::<(&simgrid::sim::ItemRef, &simgrid::sim::StackCount)>();
        q.iter(app.world())
            .filter(|(r, _)| r.0 == PET_ELIXIR_REF)
            .map(|(_, c)| c.0)
            .sum()
    }

    #[test]
    fn an_elixir_restores_hp_and_pp_and_is_consumed() {
        let (mut app, pet) = harness(2, simgrid::proto::Tile::new(50, 50));
        queue(&mut app, PetRestore::Elixir { idx: 0 });
        assert_eq!(vitals(&app, pet).hp, 30);
        assert_eq!(pp(&app, pet), 10);
        assert_eq!(elixir_count(&mut app), 1, "exactly one elixir spent");
    }

    #[test]
    fn a_healthy_pet_does_not_burn_an_elixir() {
        let (mut app, pet) = harness(1, simgrid::proto::Tile::new(50, 50));
        queue(&mut app, PetRestore::Elixir { idx: 0 });
        assert_eq!(vitals(&app, pet).hp, 30);
        assert_eq!(elixir_count(&mut app), 0);
        // Second attempt on the now-full pet must refuse rather than spend.
        queue(&mut app, PetRestore::Elixir { idx: 0 });
        assert_eq!(elixir_count(&mut app), 0);
    }

    #[test]
    fn no_elixir_means_no_restore() {
        let (mut app, pet) = harness(0, simgrid::proto::Tile::new(50, 50));
        queue(&mut app, PetRestore::Elixir { idx: 0 });
        assert_eq!(vitals(&app, pet).hp, 4, "still worn down");
        assert_eq!(pp(&app, pet), 2);
    }

    #[test]
    fn a_healer_in_range_restores_the_roster_for_free() {
        let (mut app, pet) = harness(0, simgrid::proto::Tile::new(1, 1));
        queue(
            &mut app,
            PetRestore::Healer {
                npc: simgrid::proto::EntityId(9),
            },
        );
        assert_eq!(vitals(&app, pet).hp, 30);
        assert_eq!(pp(&app, pet), 10);
    }

    #[test]
    fn a_healer_out_of_range_does_nothing() {
        let (mut app, pet) = harness(0, simgrid::proto::Tile::new(20, 20));
        queue(
            &mut app,
            PetRestore::Healer {
                npc: simgrid::proto::EntityId(9),
            },
        );
        assert_eq!(vitals(&app, pet).hp, 4);
    }

    #[test]
    fn restores_are_refused_mid_duel() {
        let (mut app, pet) = harness(1, simgrid::proto::Tile::new(1, 1));
        app.world_mut()
            .resource_mut::<crate::duel::ActiveDuels>()
            .by_slot
            .insert(SLOT.0, 1);
        queue(&mut app, PetRestore::Elixir { idx: 0 });
        assert_eq!(vitals(&app, pet).hp, 4, "the live BattleState owns vitals");
        assert_eq!(elixir_count(&mut app), 1, "no elixir spent");
    }
}
