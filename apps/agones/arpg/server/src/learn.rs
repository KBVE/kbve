//! Move learning — the half of levelling that needs the player's consent.
//!
//! A pet under [`simgrid::PET_MOVE_SLOTS`] known moves learns anything its movepool grants
//! outright. At the cap it cannot, so the server holds an **offer** and waits: forgetting a move
//! is destructive and irreversible, and picking the victim is the owner's call.
//!
//! This is also the change that makes a pet's stored move list authoritative. Until now the list
//! was reconstructible from `species_ref` + `level` (`mint_pet_from_species` derives it), so it
//! read as a cache. Once an owner can decline a move or overwrite a specific slot, two pets at
//! the same level and species can legitimately know different moves — see #15159 on why that
//! matters before #13789 freezes the schema.

use std::collections::{HashMap, VecDeque};

use bevy::prelude::*;
use simgrid::sim::PendingLearnResponses;

/// How long an owner has to answer. Matches the duel turn clock, since both are "a modal choice
/// the battle log is waiting on".
pub const LEARN_OFFER_TICKS: u32 = 30 * simgrid::SIM_TICK_HZ;

/// One pet's outstanding move-learn choice, plus anything else it is owed.
///
/// `queue` exists because a single xp award can cross several levels: growing 7 → 16 on a
/// mechamutt grants `static-bite`, `plate-up` and `overclock` at once. They are offered one at a
/// time, in learn order, so the player answers about one move with a stable set of four to
/// choose from.
pub struct LearnOffer {
    pub slot: simgrid::proto::PlayerSlot,
    pub pet: Entity,
    pub queue: VecDeque<String>,
    pub deadline_tick: u32,
}

/// Live offers keyed by pet instance id. Keyed by id rather than entity so a response that
/// arrives after a release simply finds nothing, and rather than roster index so reordering the
/// roster cannot retarget an answer at the wrong pet.
#[derive(Resource, Default)]
pub struct PendingLearnOffers(pub HashMap<String, LearnOffer>);

/// Try to learn `ability_id` outright. Returns true when it landed in a free slot.
///
/// Refuses a move the pet already knows: a species can list the same ability at several levels,
/// and re-learning it would burn a slot on a duplicate.
pub fn learn_if_room(
    moves: &mut simgrid::PetMoves,
    species: &simgrid::NpcDef,
    ability_id: &str,
) -> bool {
    if moves.0.iter().any(|m| m.ability_id == ability_id) {
        return true;
    }
    if moves.0.len() >= simgrid::PET_MOVE_SLOTS {
        return false;
    }
    if let Some(slot) = simgrid::move_slot_from_species(species, ability_id) {
        moves.0.push(slot);
    }
    // Even an ability the species no longer defines counts as handled — there is nothing to
    // offer the player, and holding an un-answerable offer open would wedge the queue.
    true
}

/// The display name for an ability, falling back to its id so a prompt is never blank.
fn ability_name(species: &simgrid::NpcDef, ability_id: &str) -> String {
    species
        .abilities
        .iter()
        .find(|a| a.id == ability_id)
        .map(|a| a.name.clone())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| ability_id.to_string())
}

/// Milliseconds left on an offer, for the client's countdown.
fn deadline_ms(deadline_tick: u32, now: u32) -> u32 {
    deadline_tick.saturating_sub(now) * 1000 / simgrid::SIM_TICK_HZ
}

/// Send one `PetLearnOffer` in whatever status it is now.
#[allow(clippy::too_many_arguments)]
pub fn send_offer(
    bcast: &simgrid::Outbound,
    slot: simgrid::proto::PlayerSlot,
    status: u8,
    pet_id: &str,
    nickname: &str,
    ability_id: &str,
    ability_name: &str,
    known: Vec<String>,
    deadline_ms: u32,
) {
    let offer = simgrid::proto::PetLearnOffer {
        status,
        pet_id: pet_id.to_string(),
        nickname: nickname.to_string(),
        ability_id: ability_id.to_string(),
        ability_name: ability_name.to_string(),
        known,
        deadline_ms,
    };
    let payload = simgrid::proto::encode_inner(&offer).unwrap_or_default();
    let _ = bcast.tx.send(simgrid::proto::ServerEvent::Ephemeral {
        kind: simgrid::proto::EPHEMERAL_PET_LEARN,
        to: slot,
        payload,
    });
}

/// Emit the offer at the front of a pet's queue.
pub fn offer_front(
    bcast: &simgrid::Outbound,
    offer: &LearnOffer,
    pet_id: &str,
    nickname: &str,
    species: &simgrid::NpcDef,
    moves: &simgrid::PetMoves,
    now: u32,
) {
    let Some(ability_id) = offer.queue.front() else {
        return;
    };
    send_offer(
        bcast,
        offer.slot,
        simgrid::proto::PET_LEARN_OFFER,
        pet_id,
        nickname,
        ability_id,
        &ability_name(species, ability_id),
        moves.0.iter().map(|m| m.ability_id.clone()).collect(),
        deadline_ms(offer.deadline_tick, now),
    );
}

/// Apply this frame's answers to outstanding offers.
///
/// Refused while the owner is in a duel, for the same reason `apply_roster_ops` refuses: the live
/// `BattleState` holds combatant copies whose move slots are index-aligned with `PetMoves`, so
/// swapping a move mid-battle would silently shift PP onto the wrong move. The offer survives the
/// refusal — see [`expire_learn_offers`], which does not run its clock during a duel.
pub fn apply_learn_responses(
    bcast: Res<simgrid::Outbound>,
    clock: Res<simgrid::SimClock>,
    duels: Res<crate::duel::ActiveDuels>,
    mut responses: ResMut<PendingLearnResponses>,
    mut offers: ResMut<PendingLearnOffers>,
    mut queued: ResMut<simgrid::PendingRosterSyncs>,
    mut pets: Query<(
        &simgrid::PetRef,
        &simgrid::PetNickname,
        &mut simgrid::PetMoves,
    )>,
) {
    if responses.0.is_empty() {
        return;
    }
    for (slot, pet_id, at) in std::mem::take(&mut responses.0) {
        let Some(offer) = offers.0.get_mut(&pet_id) else {
            continue;
        };
        // An answer only counts from the owner the offer was made to.
        if offer.slot != slot {
            continue;
        }
        if duels.by_slot.contains_key(&slot.0) {
            crate::restore::notify(
                &bcast,
                slot,
                false,
                "Finish the battle before changing moves.",
            );
            continue;
        }
        let Ok((species_ref, nickname, mut moves)) = pets.get_mut(offer.pet) else {
            offers.0.remove(&pet_id);
            continue;
        };
        let Some(species) = crate::game::NPC_DB.get(&species_ref.0) else {
            offers.0.remove(&pet_id);
            continue;
        };
        let Some(ability_id) = offer.queue.pop_front() else {
            offers.0.remove(&pet_id);
            continue;
        };

        let (status, text) = match at {
            Some(idx) if idx < moves.0.len() => {
                match simgrid::move_slot_from_species(species, &ability_id) {
                    Some(new_slot) => {
                        let forgotten = ability_name(species, &moves.0[idx].ability_id);
                        let learned = ability_name(species, &ability_id);
                        moves.0[idx] = new_slot;
                        queued.0.insert(slot);
                        (
                            simgrid::proto::PET_LEARN_LEARNED,
                            format!("{} forgot {forgotten} and learned {learned}!", nickname.0),
                        )
                    }
                    // The species stopped defining the ability between offer and answer.
                    None => (
                        simgrid::proto::PET_LEARN_DECLINED,
                        format!("{} can no longer learn that move.", nickname.0),
                    ),
                }
            }
            // Out-of-range slot is treated as a decline rather than clamped: guessing which move
            // to destroy is worse than doing nothing.
            _ => (
                simgrid::proto::PET_LEARN_DECLINED,
                format!(
                    "{} did not learn {}.",
                    nickname.0,
                    ability_name(species, &ability_id)
                ),
            ),
        };

        send_offer(
            &bcast,
            slot,
            status,
            &pet_id,
            &nickname.0,
            &ability_id,
            &ability_name(species, &ability_id),
            moves.0.iter().map(|m| m.ability_id.clone()).collect(),
            0,
        );
        crate::restore::notify(
            &bcast,
            slot,
            status == simgrid::proto::PET_LEARN_LEARNED,
            &text,
        );

        if offer.queue.is_empty() {
            offers.0.remove(&pet_id);
        } else {
            // Next move in the same award. Fresh clock: the player should get a full window per
            // decision, not share one across three.
            offer.deadline_tick = clock.tick.saturating_add(LEARN_OFFER_TICKS);
            let offer = &offers.0[&pet_id];
            offer_front(
                &bcast,
                offer,
                &pet_id,
                &nickname.0,
                species,
                &moves,
                clock.tick,
            );
        }
    }
}

/// Drop offers nobody answered, and offers whose pet is gone.
///
/// The clock does not run while the owner is in a duel: an offer arrives at the end of a battle,
/// and the player may well walk straight into another one. Expiring mid-battle would silently
/// throw away a move they never got a chance to answer for.
pub fn expire_learn_offers(
    bcast: Res<simgrid::Outbound>,
    clock: Res<simgrid::SimClock>,
    duels: Res<crate::duel::ActiveDuels>,
    mut offers: ResMut<PendingLearnOffers>,
    pets: Query<&simgrid::PetNickname>,
) {
    if offers.0.is_empty() {
        return;
    }
    let mut dropped: Vec<(String, simgrid::proto::PlayerSlot, String, bool)> = Vec::new();
    for (pet_id, offer) in offers.0.iter_mut() {
        let gone = pets.get(offer.pet).is_err();
        if gone {
            dropped.push((pet_id.clone(), offer.slot, String::new(), false));
            continue;
        }
        if duels.by_slot.contains_key(&offer.slot.0) {
            // Frozen: push the deadline along so it does not fire the moment the duel ends.
            offer.deadline_tick = clock.tick.saturating_add(LEARN_OFFER_TICKS);
            continue;
        }
        if clock.tick >= offer.deadline_tick {
            let ability_id = offer.queue.front().cloned().unwrap_or_default();
            dropped.push((pet_id.clone(), offer.slot, ability_id, true));
        }
    }
    for (pet_id, slot, ability_id, notify) in dropped {
        offers.0.remove(&pet_id);
        if !notify {
            continue;
        }
        let nickname = "Your pet".to_string();
        send_offer(
            &bcast,
            slot,
            simgrid::proto::PET_LEARN_EXPIRED,
            &pet_id,
            &nickname,
            &ability_id,
            &ability_id,
            Vec::new(),
            0,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mechamutt() -> &'static simgrid::NpcDef {
        crate::game::NPC_DB
            .get(crate::game::MECHAMUTT_REF)
            .expect("mechamutt")
    }

    fn moves_of(ids: &[&str]) -> simgrid::PetMoves {
        simgrid::PetMoves(
            ids.iter()
                .filter_map(|id| simgrid::move_slot_from_species(mechamutt(), id))
                .collect(),
        )
    }

    #[test]
    fn a_free_slot_learns_outright() {
        let mut moves = moves_of(&["tackle"]);
        assert!(learn_if_room(&mut moves, mechamutt(), "static-bite"));
        assert_eq!(moves.0.len(), 2);
        assert_eq!(moves.0[1].ability_id, "static-bite");
        assert!(moves.0[1].pp > 0, "a learned move arrives usable");
    }

    #[test]
    fn a_full_moveset_refuses_and_needs_an_offer() {
        let mut moves = moves_of(&["tackle", "spark-bark", "static-bite", "plate-up"]);
        assert_eq!(moves.0.len(), simgrid::PET_MOVE_SLOTS);
        assert!(!learn_if_room(&mut moves, mechamutt(), "overclock"));
        assert_eq!(
            moves.0.len(),
            simgrid::PET_MOVE_SLOTS,
            "nothing overwritten"
        );
    }

    #[test]
    fn a_move_already_known_is_not_relearned() {
        // Movepools may list the same ability twice; a duplicate would waste a slot.
        let mut moves = moves_of(&["tackle"]);
        assert!(learn_if_room(&mut moves, mechamutt(), "tackle"));
        assert_eq!(moves.0.len(), 1);
    }

    #[test]
    fn an_ability_the_species_dropped_is_treated_as_handled() {
        // Otherwise the queue wedges on a move that can never be offered.
        let mut moves = moves_of(&["tackle"]);
        assert!(learn_if_room(&mut moves, mechamutt(), "not-a-real-move"));
        assert_eq!(moves.0.len(), 1);
    }

    #[test]
    fn deadline_ms_counts_down_and_floors_at_zero() {
        assert_eq!(deadline_ms(simgrid::SIM_TICK_HZ * 2, 0), 2000);
        assert_eq!(deadline_ms(5, 100), 0);
    }

    #[test]
    fn ability_names_fall_back_to_the_id() {
        assert_eq!(ability_name(mechamutt(), "tackle"), "Tackle");
        assert_eq!(ability_name(mechamutt(), "mystery"), "mystery");
    }

    const SLOT: simgrid::proto::PlayerSlot = simgrid::proto::PlayerSlot(4);
    const PET_ID: &str = "01JPET";

    /// One owned pet at the move cap with `overclock` offered, and both learn systems live.
    fn harness(dueling: bool) -> (App, Entity) {
        let mut app = App::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        app.insert_resource(simgrid::SimClock::default());
        app.insert_resource(simgrid::PendingRosterSyncs::default());
        app.insert_resource(PendingLearnResponses::default());
        let mut duels = crate::duel::ActiveDuels::default();
        if dueling {
            duels.by_slot.insert(SLOT.0, 1);
        }
        app.insert_resource(duels);
        let pet = app
            .world_mut()
            .spawn((
                simgrid::PetId(PET_ID.to_string()),
                simgrid::PetRef(crate::game::MECHAMUTT_REF.to_string()),
                simgrid::PetNickname("Rex".to_string()),
                moves_of(&["tackle", "spark-bark", "static-bite", "plate-up"]),
            ))
            .id();
        let mut offers = PendingLearnOffers::default();
        offers.0.insert(
            PET_ID.to_string(),
            LearnOffer {
                slot: SLOT,
                pet,
                queue: VecDeque::from(vec!["overclock".to_string()]),
                deadline_tick: LEARN_OFFER_TICKS,
            },
        );
        app.insert_resource(offers);
        app.add_systems(Update, (apply_learn_responses, expire_learn_offers).chain());
        (app, pet)
    }

    fn respond(app: &mut App, at: Option<usize>) {
        app.world_mut()
            .resource_mut::<PendingLearnResponses>()
            .0
            .push((SLOT, PET_ID.to_string(), at));
    }

    fn move_ids(app: &App, pet: Entity) -> Vec<String> {
        app.world()
            .get::<simgrid::PetMoves>(pet)
            .expect("moves")
            .0
            .iter()
            .map(|m| m.ability_id.clone())
            .collect()
    }

    #[test]
    fn choosing_a_slot_overwrites_exactly_that_move() {
        let (mut app, pet) = harness(false);
        respond(&mut app, Some(1));
        app.update();
        let ids = move_ids(&app, pet);
        assert_eq!(ids, vec!["tackle", "overclock", "static-bite", "plate-up"]);
        assert!(
            app.world().resource::<PendingLearnOffers>().0.is_empty(),
            "the offer is settled"
        );
        assert!(
            app.world()
                .resource::<simgrid::PendingRosterSyncs>()
                .0
                .contains(&SLOT),
            "the client is told the moveset changed"
        );
    }

    #[test]
    fn declining_keeps_the_moveset_and_settles_the_offer() {
        let (mut app, pet) = harness(false);
        respond(&mut app, None);
        app.update();
        assert_eq!(
            move_ids(&app, pet),
            vec!["tackle", "spark-bark", "static-bite", "plate-up"]
        );
        assert!(app.world().resource::<PendingLearnOffers>().0.is_empty());
    }

    #[test]
    fn an_out_of_range_slot_declines_rather_than_clamping() {
        // Clamping would destroy a move the player never picked.
        let (mut app, pet) = harness(false);
        respond(&mut app, Some(99));
        app.update();
        assert_eq!(
            move_ids(&app, pet),
            vec!["tackle", "spark-bark", "static-bite", "plate-up"]
        );
        assert!(app.world().resource::<PendingLearnOffers>().0.is_empty());
    }

    #[test]
    fn a_response_is_refused_mid_duel_and_the_offer_survives() {
        // Combatant move slots are index-aligned with `PetMoves`, so swapping one mid-battle
        // would shift PP onto the wrong move.
        let (mut app, pet) = harness(true);
        respond(&mut app, Some(0));
        app.update();
        assert_eq!(
            move_ids(&app, pet),
            vec!["tackle", "spark-bark", "static-bite", "plate-up"]
        );
        assert!(
            app.world()
                .resource::<PendingLearnOffers>()
                .0
                .contains_key(PET_ID),
            "the choice is still owed once the battle ends"
        );
    }

    #[test]
    fn an_answer_from_another_slot_is_ignored() {
        let (mut app, pet) = harness(false);
        app.world_mut()
            .resource_mut::<PendingLearnResponses>()
            .0
            .push((simgrid::proto::PlayerSlot(99), PET_ID.to_string(), Some(0)));
        app.update();
        assert_eq!(move_ids(&app, pet)[0], "tackle");
        assert!(
            app.world()
                .resource::<PendingLearnOffers>()
                .0
                .contains_key(PET_ID)
        );
    }

    #[test]
    fn an_unanswered_offer_expires() {
        let (mut app, _) = harness(false);
        app.world_mut().resource_mut::<simgrid::SimClock>().tick = LEARN_OFFER_TICKS + 1;
        app.update();
        assert!(app.world().resource::<PendingLearnOffers>().0.is_empty());
    }

    #[test]
    fn the_expiry_clock_is_frozen_during_a_duel() {
        // An offer lands as a battle ends; walking straight into another must not silently
        // throw the choice away.
        let (mut app, _) = harness(true);
        app.world_mut().resource_mut::<simgrid::SimClock>().tick = LEARN_OFFER_TICKS + 1;
        app.update();
        assert!(
            app.world()
                .resource::<PendingLearnOffers>()
                .0
                .contains_key(PET_ID)
        );
    }

    #[test]
    fn an_offer_for_a_released_pet_is_dropped() {
        let (mut app, pet) = harness(false);
        app.world_mut().entity_mut(pet).despawn();
        app.update();
        assert!(app.world().resource::<PendingLearnOffers>().0.is_empty());
    }
}
