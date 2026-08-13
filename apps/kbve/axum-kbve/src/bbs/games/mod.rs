pub mod blackjack;
pub mod dungeon;
pub mod hangman;
pub mod highlow;
pub mod run;
pub mod text;
pub mod tictactoe;

use super::render::Screen;

/// What the session should do after handing a key to the running game.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Exit,
}

/// A single-key, full-redraw game. Kept free of I/O so every game is
/// testable by feeding it keys and reading the buffer back.
pub trait Game {
    fn title(&self) -> &str;
    fn draw(&self, screen: &mut Screen);
    fn on_key(&mut self, key: char) -> Flow;
}

pub struct Entry {
    pub key: char,
    pub label: &'static str,
}

pub const CATALOG: &[Entry] = &[
    Entry {
        key: '1',
        label: "Dungeons",
    },
    Entry {
        key: '2',
        label: "Blackjack",
    },
    Entry {
        key: '3',
        label: "Tic-tac-toe",
    },
    Entry {
        key: '4',
        label: "Hangman",
    },
    Entry {
        key: '5',
        label: "High-low",
    },
];

pub fn launch(key: char) -> Option<Box<dyn Game + Send>> {
    match key {
        '1' => Some(Box::new(run::Run::new(text::Rng::from_clock()))),
        '2' => Some(Box::new(blackjack::Blackjack::new(text::Rng::from_clock()))),
        '3' => Some(Box::new(tictactoe::TicTacToe::new(text::Rng::from_clock()))),
        '4' => Some(Box::new(hangman::Hangman::new(text::Rng::from_clock()))),
        '5' => Some(Box::new(highlow::HighLow::new(text::Rng::from_clock()))),
        _ => None,
    }
}
