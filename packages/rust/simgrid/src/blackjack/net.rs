use serde_json::json;

use crate::blackjack::engine as blackjack;
use crate::blackjack::table::{BjPhase, TableSession};
use crate::proto::{self, ServerEvent};
use crate::sim::{Outbound, SIM_TICK_HZ};

pub(crate) fn send_blackjack(
    bcast: &Outbound,
    table_ref: &str,
    session: &TableSession,
    slot: u16,
    your_balance: u32,
    tick: u32,
) {
    let dealer_hidden = matches!(
        session.phase,
        BjPhase::Betting | BjPhase::Insurance | BjPhase::PlayerTurn
    );
    let dealer_hand: Vec<u8> = if dealer_hidden {
        session.dealer.iter().take(1).copied().collect()
    } else {
        session.dealer.clone()
    };
    let seats: Vec<_> = session
        .seats
        .iter()
        .filter_map(|s| s.as_ref())
        .map(|seat| {
            let hands: Vec<_> = seat
                .hands
                .iter()
                .map(|hand| {
                    let (value, soft) = blackjack::value_hand(&hand.cards);
                    json!({
                        "cards": hand.cards,
                        "bet": hand.bet,
                        "value": value,
                        "soft": soft,
                        "doubled": hand.doubled,
                        "surrendered": hand.surrendered,
                        "done": hand.done,
                        "outcome": hand.outcome.map(|o| o.as_str()),
                    })
                })
                .collect();
            json!({
                "slot": seat.slot,
                "username": seat.username,
                "bet": seat.bet,
                "insurance": seat.insurance,
                "hands": hands,
                "disconnected": seat.disconnected_since.is_some(),
            })
        })
        .collect();
    let active = (session.phase == BjPhase::PlayerTurn)
        .then(|| session.active())
        .flatten();
    let active_slot = active.map(|(si, _)| session.seats[si].as_ref().unwrap().slot);
    let active_hand = active.map(|(_, hi)| hi);
    let deadline_ms = session
        .deadline_tick
        .saturating_sub(tick)
        .saturating_mul(1000 / SIM_TICK_HZ);
    // Reveal the seed only once the round is over; until then clients hold the
    // commitment and verify it against the seed after settle.
    let revealed_seed = (session.phase == BjPhase::Settle && !session.commitment.is_empty())
        .then(|| session.round_seed.to_string());
    let payload = json!({
        "table_ref": table_ref,
        "phase": session.phase.as_str(),
        "seats": seats,
        "dealer_hand": dealer_hand,
        "dealer_hidden": dealer_hidden,
        "active_slot": active_slot,
        "active_hand": active_hand,
        "your_balance": your_balance,
        "deadline_ms": deadline_ms,
        "commitment": session.commitment,
        "seed": revealed_seed,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_BLACKJACK,
        to: proto::PlayerSlot(slot),
        payload,
    });
}
