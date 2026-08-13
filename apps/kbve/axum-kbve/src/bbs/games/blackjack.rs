use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const STARTING_CHIPS: i32 = 100;
const ANTE: i32 = 10;
const DEALER_STANDS_AT: i32 = 17;

const RANKS: [(&str, i32); 13] = [
    ("A", 11),
    ("2", 2),
    ("3", 3),
    ("4", 4),
    ("5", 5),
    ("6", 6),
    ("7", 7),
    ("8", 8),
    ("9", 9),
    ("10", 10),
    ("J", 10),
    ("Q", 10),
    ("K", 10),
];
const SUITS: [char; 4] = ['S', 'H', 'D', 'C'];

#[derive(Clone, Copy)]
pub struct Card {
    rank: usize,
    suit: char,
}

impl Card {
    fn label(&self) -> String {
        format!("{}{}", RANKS[self.rank].0, self.suit)
    }

    fn value(&self) -> i32 {
        RANKS[self.rank].1
    }

    fn is_ace(&self) -> bool {
        self.rank == 0
    }
}

/// Blackjack totals treat aces as 11 until that would bust.
pub fn score(hand: &[Card]) -> i32 {
    let mut total: i32 = hand.iter().map(Card::value).sum();
    let mut aces = hand.iter().filter(|c| c.is_ace()).count();
    while total > 21 && aces > 0 {
        total -= 10;
        aces -= 1;
    }
    total
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Playing,
    Settled,
    Broke,
}

pub struct Blackjack {
    rng: Rng,
    deck: Vec<Card>,
    player: Vec<Card>,
    dealer: Vec<Card>,
    chips: i32,
    phase: Phase,
    message: String,
}

impl Blackjack {
    pub fn new(rng: Rng) -> Self {
        let mut game = Self {
            rng,
            deck: Vec::new(),
            player: Vec::new(),
            dealer: Vec::new(),
            chips: STARTING_CHIPS,
            phase: Phase::Playing,
            message: String::new(),
        };
        game.deal();
        game
    }

    pub fn chips(&self) -> i32 {
        self.chips
    }

    fn reshuffle(&mut self) {
        let mut deck = Vec::with_capacity(52);
        for suit in SUITS {
            for rank in 0..RANKS.len() {
                deck.push(Card { rank, suit });
            }
        }
        self.rng.shuffle(&mut deck);
        self.deck = deck;
    }

    fn draw_card(&mut self) -> Card {
        if self.deck.is_empty() {
            self.reshuffle();
        }
        self.deck.pop().unwrap_or(Card {
            rank: 0,
            suit: SUITS[0],
        })
    }

    fn deal(&mut self) {
        if self.chips < ANTE {
            self.phase = Phase::Broke;
            self.message = "out of chips".to_string();
            return;
        }
        self.chips -= ANTE;
        self.player.clear();
        self.dealer.clear();
        for _ in 0..2 {
            let c = self.draw_card();
            self.player.push(c);
            let d = self.draw_card();
            self.dealer.push(d);
        }
        self.phase = Phase::Playing;
        self.message = format!("ante {ANTE}");

        if score(&self.player) == 21 {
            self.settle();
        }
    }

    fn hit(&mut self) {
        if self.phase != Phase::Playing {
            return;
        }
        let c = self.draw_card();
        self.player.push(c);
        if score(&self.player) > 21 {
            self.phase = Phase::Settled;
            self.message = "bust".to_string();
        }
    }

    fn settle(&mut self) {
        while score(&self.dealer) < DEALER_STANDS_AT {
            let c = self.draw_card();
            self.dealer.push(c);
        }
        let player = score(&self.player);
        let dealer = score(&self.dealer);

        let (payout, note) = if player > 21 {
            (0, "bust")
        } else if player == 21 && self.player.len() == 2 {
            (ANTE * 5 / 2, "blackjack")
        } else if dealer > 21 || player > dealer {
            (ANTE * 2, "you win")
        } else if player == dealer {
            (ANTE, "push")
        } else {
            (0, "dealer wins")
        };

        self.chips += payout;
        self.phase = Phase::Settled;
        self.message = note.to_string();
    }
}

impl Game for Blackjack {
    fn title(&self) -> &str {
        "BLACKJACK"
    }

    fn draw(&self, screen: &mut Screen) {
        let hidden = self.phase == Phase::Playing;
        let dealer_cards: Vec<String> = if hidden {
            self.dealer
                .iter()
                .enumerate()
                .map(|(i, c)| if i == 0 { c.label() } else { "??".to_string() })
                .collect()
        } else {
            self.dealer.iter().map(Card::label).collect()
        };

        screen.nl().ink(Ink::Body);
        screen.line(&format!("dealer  {}", dealer_cards.join(" ")));
        if !hidden {
            screen.line(&format!("        = {}", score(&self.dealer)));
        }
        screen.nl();
        let player_cards: Vec<String> = self.player.iter().map(Card::label).collect();
        screen.line(&format!("you     {}", player_cards.join(" ")));
        screen.line(&format!("        = {}", score(&self.player)));

        screen.nl().ink(Ink::Accent);
        screen.line(&format!("chips {}", self.chips));
        if !self.message.is_empty() {
            screen.ink(Ink::Warn).line(&self.message);
        }
        screen.reset().nl();

        match self.phase {
            Phase::Playing => {
                screen.item('H', "Hit");
                screen.item('S', "Stand");
            }
            Phase::Settled => {
                screen.item('N', "Next hand");
            }
            Phase::Broke => {
                screen.ink(Ink::Warn).line("you are out of chips").reset();
            }
        }
        screen.item('Q', "Back");
        screen.prompt("bet> ");
    }

    fn on_key(&mut self, key: char) -> Flow {
        match (self.phase, key) {
            (_, 'Q') => return Flow::Exit,
            (Phase::Playing, 'H') => self.hit(),
            (Phase::Playing, 'S') => self.settle(),
            (Phase::Settled, 'N') => self.deal(),
            _ => {}
        }
        Flow::Continue
    }
}
