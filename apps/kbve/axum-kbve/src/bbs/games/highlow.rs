use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const RANKS: [&str; 13] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round {
    Guessing,
    Revealed,
}

pub struct HighLow {
    rng: Rng,
    current: usize,
    previous: Option<usize>,
    streak: u32,
    best: u32,
    round: Round,
    message: String,
}

impl HighLow {
    pub fn new(mut rng: Rng) -> Self {
        let current = rng.below(RANKS.len());
        Self {
            rng,
            current,
            previous: None,
            streak: 0,
            best: 0,
            round: Round::Guessing,
            message: String::new(),
        }
    }

    #[cfg(test)]
    pub fn streak(&self) -> u32 {
        self.streak
    }

    fn guess(&mut self, higher: bool) {
        if self.round != Round::Guessing {
            return;
        }
        let next = self.rng.below(RANKS.len());
        let correct = if next == self.current {
            true
        } else {
            (next > self.current) == higher
        };

        self.previous = Some(self.current);
        self.current = next;
        self.round = Round::Revealed;

        if correct {
            self.streak += 1;
            self.best = self.best.max(self.streak);
            self.message = if next == self.previous.unwrap_or(next) {
                "tie - counts".to_string()
            } else {
                "correct".to_string()
            };
        } else {
            self.streak = 0;
            self.message = "wrong - streak reset".to_string();
        }
    }
}

impl Game for HighLow {
    fn title(&self) -> &str {
        "HIGH-LOW"
    }

    fn draw(&self, screen: &mut Screen) {
        screen.nl().ink(Ink::Body);
        if let Some(prev) = self.previous {
            screen.line(&format!("was     {}", RANKS[prev]));
        }
        screen.ink(Ink::Accent);
        screen.line(&format!("card    {}", RANKS[self.current]));
        screen.reset();

        screen.nl().ink(Ink::Dim);
        screen.line(&format!("streak {}  best {}", self.streak, self.best));
        if !self.message.is_empty() {
            screen.line(&self.message);
        }
        screen.reset().nl();

        match self.round {
            Round::Guessing => {
                screen.item('H', "Next is higher");
                screen.item('L', "Next is lower");
            }
            Round::Revealed => {
                screen.item('N', "Deal again");
            }
        }
        screen.item('Q', "Back");
        screen.prompt("call> ");
    }

    fn on_key(&mut self, key: char) -> Flow {
        match (self.round, key) {
            (_, 'Q') => return Flow::Exit,
            (Round::Guessing, 'H') => self.guess(true),
            (Round::Guessing, 'L') => self.guess(false),
            (Round::Revealed, 'N') => {
                self.round = Round::Guessing;
                self.message.clear();
            }
            _ => {}
        }
        Flow::Continue
    }
}
