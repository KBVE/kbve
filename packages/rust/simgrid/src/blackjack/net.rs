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
    let seats: Vec<proto::BlackjackSeatView> = session
        .seats
        .iter()
        .filter_map(|s| s.as_ref())
        .map(|seat| {
            let hands: Vec<proto::BlackjackHandView> = seat
                .hands
                .iter()
                .map(|hand| {
                    let (value, soft) = blackjack::value_hand(&hand.cards);
                    proto::BlackjackHandView {
                        cards: hand.cards.clone(),
                        bet: hand.bet,
                        value,
                        soft,
                        doubled: hand.doubled,
                        surrendered: hand.surrendered,
                        done: hand.done,
                        outcome: hand.outcome.map(|o| o.as_str().to_string()),
                    }
                })
                .collect();
            proto::BlackjackSeatView {
                slot: seat.slot,
                username: seat.username.clone(),
                bet: seat.bet,
                insurance: seat.insurance,
                hands,
                disconnected: seat.disconnected_since.is_some(),
            }
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
    let event = proto::BlackjackStateView {
        table_ref: table_ref.to_string(),
        phase: session.phase.as_str().to_string(),
        seats,
        dealer_hand,
        dealer_hidden,
        active_slot,
        active_hand: active_hand.map(|hi| hi as u32),
        your_balance,
        deadline_ms,
        commitment: session.commitment.clone(),
        seed: revealed_seed,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_BLACKJACK,
        to: proto::PlayerSlot(slot),
        payload,
    });
}
