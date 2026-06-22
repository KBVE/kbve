use std::collections::HashMap;

use bevy::prelude::Resource;

use crate::blackjack::engine as blackjack;
use crate::proto::{self, Tile};
use crate::sim::SIM_TICK_HZ;

pub const BJ_SEAT_CAP: usize = 5;
pub const BJ_MIN_BET: u32 = 1;
pub const BJ_PROXIMITY: i32 = 1;
pub const BJ_SPECTATE: i32 = 4;
pub const BJ_BET_TICKS: u32 = SIM_TICK_HZ * 20;
pub const BJ_TURN_TICKS: u32 = SIM_TICK_HZ * 20;
pub const BJ_SETTLE_TICKS: u32 = SIM_TICK_HZ * 5;
/// Grace window a vacated seat is reserved for the same player to reconnect into
/// before it is released back to the table.
pub const BJ_HOLD_TICKS: u32 = SIM_TICK_HZ * 30;
/// Window to buy insurance when the dealer shows an ace, before play begins.
pub const BJ_INSURANCE_TICKS: u32 = SIM_TICK_HZ * 10;
/// Most hands one seat can hold after splitting (original + up to three splits).
pub const BJ_MAX_HANDS: usize = 4;

/// A casino table the game crate exposes for blackjack. Generic so simgrid stays
/// game-agnostic; cryptothrone populates `Tables` at bootstrap.
#[derive(Clone)]
pub struct TableDef {
    pub table_ref: String,
    pub tile: Tile,
    pub seats: u8,
}

#[derive(Resource, Default, Clone)]
pub struct Tables(pub Vec<TableDef>);

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum BjPhase {
    Betting,
    Insurance,
    PlayerTurn,
    DealerTurn,
    Settle,
}

impl BjPhase {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            BjPhase::Betting => "betting",
            BjPhase::Insurance => "insurance",
            BjPhase::PlayerTurn => "player_turn",
            BjPhase::DealerTurn => "dealer_turn",
            BjPhase::Settle => "settle",
        }
    }
}

/// One playable hand within a seat. A seat normally holds a single hand; splitting
/// adds siblings, each with its own bet, that are played and settled independently.
pub(crate) struct Hand {
    pub(crate) cards: Vec<u8>,
    pub(crate) bet: u32,
    pub(crate) natural: bool,
    pub(crate) doubled: bool,
    pub(crate) surrendered: bool,
    pub(crate) done: bool,
    pub(crate) outcome: Option<blackjack::Outcome>,
}

impl Hand {
    pub(crate) fn new(bet: u32) -> Self {
        Self {
            cards: Vec::new(),
            bet,
            natural: false,
            doubled: false,
            surrendered: false,
            done: false,
            outcome: None,
        }
    }
}

pub(crate) struct Seat {
    pub(crate) slot: u16,
    pub(crate) username: String,
    /// Main bet locked in during the betting window; each dealt/split hand stakes it.
    pub(crate) bet: u32,
    pub(crate) insurance: u32,
    pub(crate) hands: Vec<Hand>,
    /// Tick the player's entity vanished; `Some` means the seat is held open for a
    /// reconnect and the occupant is currently offline.
    pub(crate) disconnected_since: Option<u32>,
}

impl Seat {
    pub(crate) fn new(slot: u16, username: String) -> Self {
        Self {
            slot,
            username,
            bet: 0,
            insurance: 0,
            hands: Vec::new(),
            disconnected_since: None,
        }
    }

    pub(crate) fn reset_for_round(&mut self) {
        self.bet = 0;
        self.insurance = 0;
        self.hands.clear();
    }
}

pub(crate) struct TableSession {
    pub(crate) tile: Tile,
    pub(crate) shoe: Vec<u8>,
    pub(crate) dealer: Vec<u8>,
    pub(crate) phase: BjPhase,
    pub(crate) seats: Vec<Option<Seat>>,
    pub(crate) active_seat: usize,
    pub(crate) active_hand: usize,
    pub(crate) deadline_tick: u32,
    pub(crate) rng: blackjack::Rng,
    /// Provable fairness: the seed the current round's shoe was shuffled from and
    /// its published SHA-256 commitment. The seed is only revealed at settle.
    pub(crate) round_seed: u64,
    pub(crate) commitment: String,
}

impl TableSession {
    pub(crate) fn create(def: &TableDef, mut rng: blackjack::Rng, tick: u32) -> Self {
        let cap = (def.seats as usize).clamp(1, BJ_SEAT_CAP);
        let mut shoe = blackjack::build_shoe();
        blackjack::shuffle(&mut shoe, &mut rng);
        Self {
            tile: def.tile,
            shoe,
            dealer: Vec::new(),
            phase: BjPhase::Betting,
            seats: (0..cap).map(|_| None).collect(),
            active_seat: 0,
            active_hand: 0,
            deadline_tick: tick + BJ_BET_TICKS,
            rng,
            round_seed: 0,
            commitment: String::new(),
        }
    }

    pub(crate) fn occupied(&self) -> usize {
        self.seats.iter().filter(|s| s.is_some()).count()
    }

    pub(crate) fn seat_of(&self, slot: u16) -> Option<usize> {
        self.seats
            .iter()
            .position(|s| s.as_ref().map(|x| x.slot) == Some(slot))
    }

    pub(crate) fn first_free(&self) -> Option<usize> {
        self.seats.iter().position(|s| s.is_none())
    }

    /// A seat reserved for `username` whose occupant is offline, awaiting reconnect.
    pub(crate) fn held_seat_for(&mut self, username: &str) -> Option<&mut Seat> {
        self.seats.iter_mut().flatten().find(|s| {
            s.disconnected_since.is_some() && !s.username.is_empty() && s.username == username
        })
    }

    /// The `(seat, hand)` currently owing a decision, in seat-then-hand order.
    pub(crate) fn active(&self) -> Option<(usize, usize)> {
        for (si, slot) in self.seats.iter().enumerate() {
            let Some(seat) = slot else { continue };
            if seat.bet == 0 {
                continue;
            }
            for (hi, hand) in seat.hands.iter().enumerate() {
                if !hand.done {
                    return Some((si, hi));
                }
            }
        }
        None
    }

    pub(crate) fn participants(&self) -> usize {
        self.seats
            .iter()
            .filter(|s| matches!(s, Some(seat) if seat.bet > 0))
            .count()
    }

    pub(crate) fn dealer_upcard_ace(&self) -> bool {
        self.dealer
            .first()
            .map(|&c| blackjack::is_ace(c))
            .unwrap_or(false)
    }
}

pub enum BjInput {
    Join { table_ref: String },
    Leave,
    Bet { amount: u32 },
    Act { kind: proto::BjActionKind },
    Insure { amount: u32 },
}

#[derive(Resource, Default)]
pub struct PendingBlackjack(pub Vec<(proto::PlayerSlot, BjInput)>);

#[derive(Resource, Default)]
pub struct TableRegistry {
    pub(crate) sessions: HashMap<String, TableSession>,
}
