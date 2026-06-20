//! Server-authoritative blackjack rules. Pure data, no Bevy.
//!
//! Cards are the same 6-bit byte encoding the TS arcade renderer decodes:
//! `rank = byte & 0b1111` (A=0..K=12), `suit = (byte >> 4) & 0b11`
//! (0 spades, 1 hearts, 2 diamonds, 3 clubs).

pub const RANK_MASK: u8 = 0b1111;
pub const SUIT_SHIFT: u8 = 4;
pub const DECKS: usize = 4;
pub const CARDS_PER_DECK: usize = 52;
pub const SUITS: usize = 4;
pub const RANKS: usize = 13;
pub const RESHUFFLE_BELOW: usize = 20;

const RANK_POINTS: [u32; 13] = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];

/// A fresh 4-deck shoe in suit/rank order (unshuffled), matching the TS `buildShoe`.
pub fn build_shoe() -> Vec<u8> {
    let mut shoe = Vec::with_capacity(DECKS * CARDS_PER_DECK);
    for _ in 0..DECKS {
        for suit in 0..SUITS as u8 {
            for rank in 0..RANKS as u8 {
                shoe.push((suit << SUIT_SHIFT) | rank);
            }
        }
    }
    shoe
}

pub fn card_points(card: u8) -> u32 {
    RANK_POINTS[(card & RANK_MASK) as usize]
}

pub fn is_ace(card: u8) -> bool {
    (card & RANK_MASK) == 0
}

pub fn card_rank(card: u8) -> u8 {
    card & RANK_MASK
}

/// Two cards split only when they share a rank (e.g. 8♠/8♥, not 10/J).
pub fn can_split(cards: &[u8]) -> bool {
    cards.len() == 2 && card_rank(cards[0]) == card_rank(cards[1])
}

/// Coins returned for a settled insurance side bet. Pays 2:1 when the dealer has a
/// natural (stake + 2×stake back), otherwise the stake is lost.
pub fn insurance_credit(stake: u32, dealer_blackjack: bool) -> u32 {
    if dealer_blackjack {
        stake.saturating_mul(3)
    } else {
        0
    }
}

/// Coins returned when a hand surrenders: half the bet back (rounded down).
pub fn surrender_credit(bet: u32) -> u32 {
    bet / 2
}

/// Best hand value with soft-ace handling. Returns `(total, soft)` where `soft`
/// means at least one ace is still counted as 11.
pub fn value_hand(cards: &[u8]) -> (u32, bool) {
    let mut total = 0u32;
    let mut aces = 0u32;
    for &card in cards {
        total += card_points(card);
        if is_ace(card) {
            aces += 1;
        }
    }
    while total > 21 && aces > 0 {
        total -= 10;
        aces -= 1;
    }
    (total, aces > 0)
}

pub fn is_blackjack(cards: &[u8]) -> bool {
    cards.len() == 2 && card_points(cards[0]) + card_points(cards[1]) == 21
}

/// Deterministic splitmix64-based PRNG seeded from the sim seed + a table salt + tick.
/// Mirrors the `hash3` mixer used elsewhere in the sim so shuffles are reproducible.
pub struct Rng(u64);

impl Rng {
    pub fn seed(seed: u64, salt: u64, tick: u64) -> Self {
        let mut x = seed ^ salt.rotate_left(17) ^ tick.rotate_left(31);
        x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        Self(x ^ (x >> 31))
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, n)` for small `n` (bias negligible at shoe sizes).
    pub fn below(&mut self, n: u32) -> u32 {
        (self.next_u64() % n as u64) as u32
    }
}

/// Fisher–Yates shuffle in place.
pub fn shuffle(shoe: &mut [u8], rng: &mut Rng) {
    if shoe.len() < 2 {
        return;
    }
    for i in (1..shoe.len()).rev() {
        let j = rng.below(i as u32 + 1) as usize;
        shoe.swap(i, j);
    }
}

/// Draw the top card, rebuilding + reshuffling the shoe first when it runs low.
pub fn draw(shoe: &mut Vec<u8>, rng: &mut Rng) -> u8 {
    if shoe.len() < RESHUFFLE_BELOW {
        *shoe = build_shoe();
        shuffle(shoe, rng);
    }
    shoe.pop().unwrap_or(0)
}

/// Dealer hits while below 17 and stands on all 17s (including soft 17).
pub fn dealer_should_hit(cards: &[u8]) -> bool {
    value_hand(cards).0 < 17
}

pub fn play_dealer(dealer: &mut Vec<u8>, shoe: &mut Vec<u8>, rng: &mut Rng) {
    while dealer_should_hit(dealer) {
        let card = draw(shoe, rng);
        dealer.push(card);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Win,
    Loss,
    Push,
    Blackjack,
}

impl Outcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Outcome::Win => "win",
            Outcome::Loss => "loss",
            Outcome::Push => "push",
            Outcome::Blackjack => "blackjack",
        }
    }
}

/// Resolve a settled seat against the dealer's final hand.
pub fn settle(player: &[u8], dealer: &[u8], player_natural: bool) -> Outcome {
    let (pv, _) = value_hand(player);
    if pv > 21 {
        return Outcome::Loss;
    }
    let dealer_natural = is_blackjack(dealer);
    if player_natural && !dealer_natural {
        return Outcome::Blackjack;
    }
    if dealer_natural && !player_natural {
        return Outcome::Loss;
    }
    let (dv, _) = value_hand(dealer);
    if dv > 21 || pv > dv {
        Outcome::Win
    } else if pv < dv {
        Outcome::Loss
    } else {
        Outcome::Push
    }
}

/// Coins to credit back to the player for a settled bet (the original bet was
/// already debited at PlaceBet). Net: Win +bet, Blackjack +floor(bet*1.5),
/// Push 0, Loss -bet.
pub fn payout_credit(bet: u32, outcome: Outcome) -> u32 {
    match outcome {
        Outcome::Win => bet.saturating_mul(2),
        Outcome::Blackjack => bet.saturating_add(bet.saturating_mul(3) / 2),
        Outcome::Push => bet,
        Outcome::Loss => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(suit: u8, rank: u8) -> u8 {
        (suit << SUIT_SHIFT) | rank
    }

    #[test]
    fn shoe_is_four_decks() {
        let shoe = build_shoe();
        assert_eq!(shoe.len(), 208);
        // Every card is a valid 6-bit value.
        assert!(
            shoe.iter()
                .all(|&c| (c & RANK_MASK) < 13 && (c >> SUIT_SHIFT) < 4)
        );
    }

    #[test]
    fn ace_demotes_to_avoid_bust() {
        // A + K = 21 (blackjack, soft).
        let (total, soft) = value_hand(&[card(0, 0), card(0, 12)]);
        assert_eq!(total, 21);
        assert!(soft);
        // A + K + K = 21 with the ace demoted to 1 (hard).
        let (total, soft) = value_hand(&[card(0, 0), card(0, 12), card(1, 12)]);
        assert_eq!(total, 21);
        assert!(!soft);
        // A + A + 9 = 21 soft (one ace stays 11).
        let (total, soft) = value_hand(&[card(0, 0), card(1, 0), card(0, 8)]);
        assert_eq!(total, 21);
        assert!(soft);
    }

    #[test]
    fn blackjack_detection() {
        assert!(is_blackjack(&[card(0, 0), card(0, 12)]));
        assert!(!is_blackjack(&[card(0, 0), card(0, 8), card(0, 1)]));
    }

    #[test]
    fn shuffle_is_deterministic_for_same_seed() {
        let mut a = build_shoe();
        let mut b = build_shoe();
        shuffle(&mut a, &mut Rng::seed(42, 7, 100));
        shuffle(&mut b, &mut Rng::seed(42, 7, 100));
        assert_eq!(a, b);
        let mut c = build_shoe();
        shuffle(&mut c, &mut Rng::seed(42, 7, 101));
        assert_ne!(a, c, "different tick should yield a different order");
    }

    #[test]
    fn dealer_stands_on_soft_17() {
        // A + 6 = soft 17 -> stand.
        assert!(!dealer_should_hit(&[card(0, 0), card(0, 5)]));
        // 10 + 6 = 16 -> hit.
        assert!(dealer_should_hit(&[card(0, 9), card(0, 5)]));
    }

    #[test]
    fn payout_rounds_blackjack_three_to_two() {
        assert_eq!(payout_credit(25, Outcome::Blackjack), 25 + 37); // floor(25*1.5)=37
        assert_eq!(payout_credit(10, Outcome::Win), 20);
        assert_eq!(payout_credit(10, Outcome::Push), 10);
        assert_eq!(payout_credit(10, Outcome::Loss), 0);
    }

    #[test]
    fn split_only_on_matching_rank() {
        assert!(can_split(&[card(0, 7), card(1, 7)])); // 8/8
        assert!(can_split(&[card(0, 0), card(2, 0)])); // A/A
        assert!(!can_split(&[card(0, 9), card(1, 10)])); // 10/J (both 10 points, diff rank)
        assert!(!can_split(&[card(0, 5), card(1, 6)]));
        assert!(!can_split(&[card(0, 5)]));
    }

    #[test]
    fn insurance_pays_two_to_one_on_dealer_natural() {
        assert_eq!(insurance_credit(5, true), 15); // stake 5 + 2x = 15 back, net +10
        assert_eq!(insurance_credit(5, false), 0);
    }

    #[test]
    fn surrender_returns_half() {
        assert_eq!(surrender_credit(10), 5);
        assert_eq!(surrender_credit(5), 2); // floor
    }

    #[test]
    fn settle_outcomes() {
        let bust = [card(0, 9), card(1, 9), card(2, 9)]; // 30
        assert_eq!(
            settle(&bust, &[card(0, 9), card(0, 8)], false),
            Outcome::Loss
        );
        // Player 20 vs dealer 18 -> win.
        let p = [card(0, 9), card(0, 9)];
        let d = [card(1, 9), card(1, 7)];
        assert_eq!(settle(&p, &d, false), Outcome::Win);
        // Player natural vs dealer non-natural -> blackjack.
        let p = [card(0, 0), card(0, 12)];
        assert_eq!(settle(&p, &d, true), Outcome::Blackjack);
        // Equal totals -> push.
        let p = [card(0, 9), card(0, 7)];
        let d = [card(1, 9), card(1, 7)];
        assert_eq!(settle(&p, &d, false), Outcome::Push);
    }
}
