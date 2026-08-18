pub mod blackjack;
pub mod dungeon;
pub mod hangman;
pub mod highlow;
pub mod map;
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

/// What runs behind a door. Kept free of I/O so every game is testable by
/// feeding it keys and reading the buffer back.
pub trait Game {
    fn title(&self) -> &str;
    fn draw(&self, screen: &mut Screen);
    fn on_key(&mut self, key: char) -> Flow;

    /// A door that needs more than one keystroke — a quantity, a name — draws
    /// its prompt here. While this is `Some` the board collects a line and
    /// delivers it to `on_line`, and `on_key` is not called at all.
    fn prompt(&self) -> Option<&str> {
        None
    }

    /// The caller's line, already trimmed of the terminator. Empty means they
    /// pressed escape, which every prompt has to accept as a way out.
    fn on_line(&mut self, _line: &str) -> Flow {
        Flow::Continue
    }
}
