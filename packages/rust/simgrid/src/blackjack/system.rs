use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::prelude::{Query, Res, ResMut};

use crate::blackjack::engine as blackjack;
use crate::blackjack::net::send_blackjack;
use crate::blackjack::table::{
    BJ_BET_TICKS, BJ_HOLD_TICKS, BJ_INSURANCE_TICKS, BJ_MAX_HANDS, BJ_MIN_BET, BJ_PROXIMITY,
    BJ_SETTLE_TICKS, BJ_SPECTATE, BJ_TURN_TICKS, BjInput, BjPhase, Hand, PendingBlackjack, Seat,
    TableRegistry, TableSession, Tables,
};
use crate::grid::GridPos;
use crate::proto::{self, Tile};
use crate::sim::{
    COIN_REF, Inventory, ItemBank, Outbound, PlayerSlotTag, RosterHandle, SimClock, SimSeed,
    coin_balance, send_inventory, spend_coins,
};

fn table_salt(table_ref: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in table_ref.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

type PlayerQuery<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static PlayerSlotTag,
        &'static GridPos,
        &'static mut Inventory,
    ),
>;

/// Credit coins back to a player's live inventory and resync it.
fn credit_coins(
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity: Entity,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) {
    if amount == 0 {
        return;
    }
    if let Ok((_, _, _, mut inv)) = q.get_mut(entity) {
        bank.add(&mut inv, COIN_REF, amount);
        let items = bank.snapshot(&inv);
        send_inventory(bcast, proto::PlayerSlot(slot), &items);
    }
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
pub fn apply_blackjack(
    mut pending: ResMut<PendingBlackjack>,
    mut reg: ResMut<TableRegistry>,
    tables: Res<Tables>,
    roster: Res<RosterHandle>,
    seed: Res<SimSeed>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut q: PlayerQuery<'_, '_>,
    mut bank: ItemBank,
) {
    let tick = clock.tick;

    let mut entity_of: HashMap<u16, Entity> = HashMap::new();
    let mut tile_of: HashMap<u16, Tile> = HashMap::new();
    for (entity, slot, pos, _inv) in q.iter() {
        entity_of.insert(slot.0.0, entity);
        tile_of.insert(slot.0.0, pos.tile);
    }

    // ---- Intent pass ----
    for (pslot, input) in pending.0.drain(..) {
        let slot = pslot.0;
        match input {
            BjInput::Join { table_ref } => {
                if reg.sessions.values().any(|s| s.seat_of(slot).is_some()) {
                    continue;
                }
                let Some(def) = tables.0.iter().find(|d| d.table_ref == table_ref) else {
                    continue;
                };
                let username = roster
                    .0
                    .read()
                    .ok()
                    .and_then(|r| r.username(pslot))
                    .unwrap_or_default();
                // Reclaiming a seat held open from a disconnect skips the proximity
                // gate — a reconnecting player respawns away from the table but was
                // already seated. Fresh seating still requires being adjacent.
                if let Some(seat) = reg
                    .sessions
                    .get_mut(&table_ref)
                    .and_then(|s| s.held_seat_for(&username))
                {
                    seat.slot = slot;
                    seat.disconnected_since = None;
                    continue;
                }
                let Some(&ptile) = tile_of.get(&slot) else {
                    continue;
                };
                if ptile.chebyshev(def.tile) > BJ_PROXIMITY {
                    continue;
                }
                let salt = table_salt(&table_ref);
                let session = reg.sessions.entry(table_ref.clone()).or_insert_with(|| {
                    TableSession::create(def, blackjack::Rng::seed(seed.0, salt, tick as u64), tick)
                });
                if let Some(i) = session.first_free() {
                    session.seats[i] = Some(Seat::new(slot, username));
                }
            }
            BjInput::Leave => {
                leave_seat(&mut reg, &mut q, &mut bank, &entity_of, &bcast, slot);
            }
            BjInput::Bet { amount } => {
                let Some(session) = reg
                    .sessions
                    .values_mut()
                    .find(|s| s.seat_of(slot).is_some())
                else {
                    continue;
                };
                if session.phase != BjPhase::Betting {
                    continue;
                }
                let i = session.seat_of(slot).unwrap();
                if session.seats[i].as_ref().unwrap().bet > 0 {
                    continue;
                }
                let Some(&entity) = entity_of.get(&slot) else {
                    continue;
                };
                let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
                    continue;
                };
                let held = coin_balance(&bank, &inv);
                if held < BJ_MIN_BET {
                    continue;
                }
                let stake = amount.clamp(BJ_MIN_BET, held);
                if !spend_coins(&mut bank, &mut inv, stake) {
                    continue;
                }
                session.seats[i].as_mut().unwrap().bet = stake;
                let items = bank.snapshot(&inv);
                send_inventory(&bcast, pslot, &items);
            }
            BjInput::Act { kind } => {
                handle_bj_action(&mut reg, &mut q, &mut bank, &entity_of, &bcast, slot, kind);
            }
            BjInput::Insure { amount } => {
                handle_bj_insurance(
                    &mut reg, &mut q, &mut bank, &entity_of, &bcast, slot, amount,
                );
            }
        }
    }

    // ---- Disconnect sweep: hold a vacated seat for the same player to reconnect
    // into; release it (forfeiting any live bet) once the grace window lapses.
    // Anonymous seats can't be name-matched on reconnect, so they drop at once. ----
    let name_of: HashMap<u16, String> = {
        let guard = roster.0.read().ok();
        entity_of
            .keys()
            .filter_map(|&s| {
                guard
                    .as_ref()
                    .and_then(|g| g.username(proto::PlayerSlot(s)))
                    .map(|n| (s, n))
            })
            .collect()
    };
    for session in reg.sessions.values_mut() {
        for slot_opt in session.seats.iter_mut() {
            let Some(seat) = slot_opt.as_mut() else {
                continue;
            };
            // A live entity at the seat's slot only counts if it is the same player;
            // a slot reassigned to someone else must not silently inherit the seat.
            let present = entity_of.contains_key(&seat.slot)
                && name_of.get(&seat.slot) == Some(&seat.username);
            if present {
                seat.disconnected_since = None;
                continue;
            }
            let release = if seat.username.is_empty() {
                true
            } else {
                match seat.disconnected_since {
                    None => {
                        // Park the seat: detach the stale slot so a reused slot can't
                        // route this table's state or be mistaken for the occupant.
                        seat.disconnected_since = Some(tick);
                        seat.slot = proto::PLAYER_SLOT_NONE.0;
                        false
                    }
                    Some(since) => tick.saturating_sub(since) >= BJ_HOLD_TICKS,
                }
            };
            if release {
                *slot_opt = None;
            }
        }
    }

    // ---- Per-tick phase driver ----
    for session in reg.sessions.values_mut() {
        advance_bj_phase(session, tick, &mut q, &mut bank, &entity_of, &bcast);
    }

    // ---- Teardown empty tables ----
    reg.sessions.retain(|_, s| s.occupied() > 0);

    // ---- Scoped broadcast ----
    let mut balance_of: HashMap<u16, u32> = HashMap::new();
    for (_, slot, _, inv) in q.iter() {
        balance_of.insert(slot.0.0, coin_balance(&bank, inv));
    }
    for (table_ref, session) in reg.sessions.iter() {
        let mut recipients: Vec<u16> = session
            .seats
            .iter()
            .filter_map(|s| s.as_ref().map(|x| x.slot))
            .collect();
        for (&slot, &tile) in tile_of.iter() {
            if tile.chebyshev(session.tile) <= BJ_SPECTATE && !recipients.contains(&slot) {
                recipients.push(slot);
            }
        }
        for slot in recipients {
            let balance = balance_of.get(&slot).copied().unwrap_or(0);
            send_blackjack(&bcast, table_ref, session, slot, balance, tick);
        }
    }
}

fn leave_seat(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    let i = session.seat_of(slot).unwrap();
    let Some(seat) = session.seats[i].take() else {
        return;
    };
    // Refund only when the round hasn't been dealt yet (betting window).
    if session.phase == BjPhase::Betting
        && seat.bet > 0
        && let Some(&entity) = entity_of.get(&slot)
    {
        credit_coins(q, bank, entity, bcast, slot, seat.bet);
    }
}

fn handle_bj_insurance(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    if session.phase != BjPhase::Insurance {
        return;
    }
    let i = session.seat_of(slot).unwrap();
    let seat = session.seats[i].as_ref().unwrap();
    // Insurance is a one-time side bet, capped at half the main bet.
    if seat.bet == 0 || seat.insurance > 0 {
        return;
    }
    let cap = seat.bet / 2;
    if cap == 0 {
        return;
    }
    let Some(&entity) = entity_of.get(&slot) else {
        return;
    };
    let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
        return;
    };
    let stake = amount.min(cap).min(coin_balance(bank, &inv));
    if stake == 0 || !spend_coins(bank, &mut inv, stake) {
        return;
    }
    let items = bank.snapshot(&inv);
    send_inventory(bcast, proto::PlayerSlot(slot), &items);
    session.seats[i].as_mut().unwrap().insurance = stake;
}

fn handle_bj_action(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    kind: proto::BjActionKind,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    if session.phase != BjPhase::PlayerTurn {
        return;
    }
    // Only the player owning the active seat may act, and only on its active hand.
    let Some((si, hi)) = session.active() else {
        return;
    };
    if session.seats[si].as_ref().unwrap().slot != slot {
        return;
    }
    match kind {
        proto::BjActionKind::Hit => {
            let card = blackjack::draw(&mut session.shoe, &mut session.rng);
            let hand = &mut session.seats[si].as_mut().unwrap().hands[hi];
            hand.cards.push(card);
            if blackjack::value_hand(&hand.cards).0 >= 21 {
                hand.done = true;
            }
        }
        proto::BjActionKind::Stand => {
            session.seats[si].as_mut().unwrap().hands[hi].done = true;
        }
        proto::BjActionKind::Double => {
            let bet = {
                let hand = &session.seats[si].as_ref().unwrap().hands[hi];
                if hand.cards.len() != 2 || hand.doubled {
                    return;
                }
                hand.bet
            };
            if !try_debit(q, bank, entity_of, bcast, slot, bet) {
                return;
            }
            let card = blackjack::draw(&mut session.shoe, &mut session.rng);
            let hand = &mut session.seats[si].as_mut().unwrap().hands[hi];
            hand.bet = hand.bet.saturating_add(bet);
            hand.doubled = true;
            hand.cards.push(card);
            hand.done = true;
        }
        proto::BjActionKind::Split => {
            let bet = {
                let seat = session.seats[si].as_ref().unwrap();
                if seat.hands.len() >= BJ_MAX_HANDS {
                    return;
                }
                let hand = &seat.hands[hi];
                if !blackjack::can_split(&hand.cards) {
                    return;
                }
                hand.bet
            };
            if !try_debit(q, bank, entity_of, bcast, slot, bet) {
                return;
            }
            let moved = session.seats[si].as_mut().unwrap().hands[hi]
                .cards
                .pop()
                .unwrap();
            let aces = blackjack::is_ace(session.seats[si].as_ref().unwrap().hands[hi].cards[0]);
            let card_a = blackjack::draw(&mut session.shoe, &mut session.rng);
            let card_b = blackjack::draw(&mut session.shoe, &mut session.rng);
            let seat = session.seats[si].as_mut().unwrap();
            seat.hands[hi].cards.push(card_a);
            let mut split_hand = Hand::new(bet);
            split_hand.cards.push(moved);
            split_hand.cards.push(card_b);
            // Split aces draw a single card each and stand automatically.
            if aces {
                seat.hands[hi].done = true;
                split_hand.done = true;
            }
            seat.hands.insert(hi + 1, split_hand);
        }
        proto::BjActionKind::Surrender => {
            // Late surrender: only the untouched original hand, never after a split.
            let bet = {
                let seat = session.seats[si].as_ref().unwrap();
                if seat.hands.len() != 1 {
                    return;
                }
                let hand = &seat.hands[0];
                if hand.cards.len() != 2 || hand.doubled || hand.natural {
                    return;
                }
                hand.bet
            };
            let refund = blackjack::surrender_credit(bet);
            if refund > 0
                && let Some(&entity) = entity_of.get(&slot)
            {
                credit_coins(q, bank, entity, bcast, slot, refund);
            }
            let hand = &mut session.seats[si].as_mut().unwrap().hands[0];
            hand.surrendered = true;
            hand.outcome = Some(blackjack::Outcome::Loss);
            hand.done = true;
        }
    }
    // The phase driver resets the turn clock once the active hand changes.
}

/// Debit `amount` coins from the player's inventory, pushing an inventory sync on
/// success. Returns false (and changes nothing) if they can't cover it.
fn try_debit(
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) -> bool {
    let Some(&entity) = entity_of.get(&slot) else {
        return false;
    };
    let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
        return false;
    };
    if coin_balance(bank, &inv) < amount || !spend_coins(bank, &mut inv, amount) {
        return false;
    }
    let items = bank.snapshot(&inv);
    send_inventory(bcast, proto::PlayerSlot(slot), &items);
    true
}

fn start_player_turn(session: &mut TableSession, tick: u32) {
    session.phase = BjPhase::PlayerTurn;
    let (si, hi) = session.active().unwrap_or((0, 0));
    session.active_seat = si;
    session.active_hand = hi;
    session.deadline_tick = tick + BJ_TURN_TICKS;
}

/// Settle every live hand against the dealer's final hand and pay out per seat.
/// Hands already carrying an outcome (surrenders) are left untouched.
fn settle_bj_round(
    session: &mut TableSession,
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
) {
    let dealer = session.dealer.clone();
    let dealer_natural = blackjack::is_blackjack(&dealer);
    for i in 0..session.seats.len() {
        let Some(slot) = session.seats[i]
            .as_ref()
            .and_then(|s| (s.bet > 0).then_some(s.slot))
        else {
            continue;
        };
        let mut credit = 0u32;
        let hands_len = session.seats[i].as_ref().unwrap().hands.len();
        for hi in 0..hands_len {
            let (bet, natural, cards, settled) = {
                let hand = &session.seats[i].as_ref().unwrap().hands[hi];
                (
                    hand.bet,
                    hand.natural,
                    hand.cards.clone(),
                    hand.outcome.is_some(),
                )
            };
            if settled {
                continue;
            }
            let outcome = blackjack::settle(&cards, &dealer, natural);
            credit = credit.saturating_add(blackjack::payout_credit(bet, outcome));
            let hand = &mut session.seats[i].as_mut().unwrap().hands[hi];
            hand.outcome = Some(outcome);
            hand.done = true;
        }
        // Insurance pays 2:1 when the dealer turned a natural.
        let insurance = session.seats[i].as_ref().unwrap().insurance;
        if insurance > 0 {
            credit = credit.saturating_add(blackjack::insurance_credit(insurance, dealer_natural));
        }
        if credit > 0
            && let Some(&entity) = entity_of.get(&slot)
        {
            credit_coins(q, bank, entity, bcast, slot, credit);
        }
    }
}

fn advance_bj_phase(
    session: &mut TableSession,
    tick: u32,
    q: &mut PlayerQuery<'_, '_>,
    bank: &mut ItemBank,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
) {
    match session.phase {
        BjPhase::Betting => {
            if tick < session.deadline_tick {
                return;
            }
            if session.participants() == 0 {
                session.deadline_tick = tick + BJ_BET_TICKS;
                return;
            }
            // Provable fairness: draw a fresh round seed, build the shoe solely from
            // it, and publish its commitment before any card is dealt. The seed is
            // revealed at settle so clients can replay this exact shoe.
            session.round_seed = session.rng.next_u64();
            session.commitment = blackjack::commit_seed(session.round_seed);
            session.shoe = blackjack::shoe_for_seed(session.round_seed);
            session.dealer.clear();
            for i in 0..session.seats.len() {
                let bet = {
                    let Some(seat) = session.seats[i].as_mut() else {
                        continue;
                    };
                    seat.hands.clear();
                    seat.insurance = 0;
                    seat.bet
                };
                if bet == 0 {
                    continue;
                }
                let c1 = blackjack::draw(&mut session.shoe, &mut session.rng);
                let c2 = blackjack::draw(&mut session.shoe, &mut session.rng);
                let mut hand = Hand::new(bet);
                hand.cards.push(c1);
                hand.cards.push(c2);
                hand.natural = blackjack::is_blackjack(&hand.cards);
                hand.done = hand.natural;
                session.seats[i].as_mut().unwrap().hands.push(hand);
            }
            let d1 = blackjack::draw(&mut session.shoe, &mut session.rng);
            let d2 = blackjack::draw(&mut session.shoe, &mut session.rng);
            session.dealer.push(d1);
            session.dealer.push(d2);
            // Offer insurance only when the dealer's upcard is an ace.
            if session.dealer_upcard_ace() {
                session.phase = BjPhase::Insurance;
                session.deadline_tick = tick + BJ_INSURANCE_TICKS;
            } else {
                start_player_turn(session, tick);
            }
        }
        BjPhase::Insurance => {
            if tick < session.deadline_tick {
                return;
            }
            // Window closed — peek the hole card. A dealer natural ends the round now;
            // insurance (and any player naturals) settle, everyone else loses.
            if blackjack::is_blackjack(&session.dealer) {
                settle_bj_round(session, q, bank, entity_of, bcast);
                session.phase = BjPhase::Settle;
                session.deadline_tick = tick + BJ_SETTLE_TICKS;
            } else {
                start_player_turn(session, tick);
            }
        }
        BjPhase::PlayerTurn => match session.active() {
            None => {
                session.phase = BjPhase::DealerTurn;
            }
            Some((si, hi)) => {
                if (si, hi) != (session.active_seat, session.active_hand) {
                    session.active_seat = si;
                    session.active_hand = hi;
                    session.deadline_tick = tick + BJ_TURN_TICKS;
                } else if tick >= session.deadline_tick {
                    session.seats[si].as_mut().unwrap().hands[hi].done = true;
                }
            }
        },
        BjPhase::DealerTurn => {
            blackjack::play_dealer(&mut session.dealer, &mut session.shoe, &mut session.rng);
            settle_bj_round(session, q, bank, entity_of, bcast);
            session.phase = BjPhase::Settle;
            session.deadline_tick = tick + BJ_SETTLE_TICKS;
        }
        BjPhase::Settle => {
            if tick >= session.deadline_tick {
                session.dealer.clear();
                for seat in session.seats.iter_mut().flatten() {
                    seat.reset_for_round();
                }
                session.phase = BjPhase::Betting;
                session.active_seat = 0;
                session.active_hand = 0;
                session.deadline_tick = tick + BJ_BET_TICKS;
            }
        }
    }
}
