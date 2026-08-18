use super::games::{Game, blackjack, hangman, highlow, run, text, tictactoe};

/// What the board tells a door about the caller before handing over the
/// screen. The DOS-era stack wrote this to a `DOOR.SYS` drop file and hoped
/// the door parsed the right column; here it is a value the door is handed,
/// so a door cannot read a field the board did not mean to share.
///
/// Deliberately thin. Terminal width and colour already travel with `Screen`,
/// and a door wanting a field not listed here is a door asking for something
/// the board does not yet know how to promise.
pub struct DoorContext {
    pub handle: String,
    pub user_id: Option<String>,
}

impl DoorContext {
    pub fn new(handle: impl Into<String>, user_id: Option<String>) -> Self {
        Self {
            handle: handle.into(),
            user_id,
        }
    }

    /// A guest is anyone the board could not name. Doors that touch an account
    /// key off this rather than off the handle, which a guest also has.
    pub fn authed(&self) -> bool {
        self.user_id.is_some()
    }
}

/// One entry in the door catalog. `open` is a plain fn pointer, so registering
/// a door is data rather than another arm of a match the whole board has to
/// agree on.
///
/// The board does not gate entry itself. A door needing a signed-in caller
/// reads `ctx.authed()` and opens onto its own refusal, which keeps the rule
/// beside the door that has it instead of in a permission table the board
/// would have to keep true.
pub struct Door {
    pub key: char,
    pub name: &'static str,
    pub blurb: &'static str,
    open: fn(&DoorContext) -> Box<dyn Game + Send>,
}

impl Door {
    pub fn open(&self, ctx: &DoorContext) -> Box<dyn Game + Send> {
        (self.open)(ctx)
    }
}

pub const CATALOG: &[Door] = &[
    Door {
        key: '1',
        name: "Dungeons",
        blurb: "Delve, fight, gather, craft, sell",
        open: |ctx| Box::new(run::Run::new(text::Rng::from_clock(), ctx)),
    },
    Door {
        key: '2',
        name: "Blackjack",
        blurb: "Draw to twenty-one, dealer stands on soft 17",
        open: |_| Box::new(blackjack::Blackjack::new(text::Rng::from_clock())),
    },
    Door {
        key: '3',
        name: "Tic-tac-toe",
        blurb: "Three in a row against the board",
        open: |_| Box::new(tictactoe::TicTacToe::new(text::Rng::from_clock())),
    },
    Door {
        key: '4',
        name: "Hangman",
        blurb: "Guess the word before the rope runs out",
        open: |_| Box::new(hangman::Hangman::new(text::Rng::from_clock())),
    },
    Door {
        key: '5',
        name: "High-low",
        blurb: "Call the next card higher or lower",
        open: |_| Box::new(highlow::HighLow::new(text::Rng::from_clock())),
    },
];

pub fn find(key: char) -> Option<&'static Door> {
    CATALOG.iter().find(|door| door.key == key)
}
