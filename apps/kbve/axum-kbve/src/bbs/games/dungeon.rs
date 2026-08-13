use super::text::{meter, strip_markup};
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen, truncate, wrap_lines};

const MAX_LOG_LINES: usize = 8;
const METER_WIDTH: usize = 10;

/// One combatant as the BBS needs to draw it.
pub struct Actor {
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
}

/// Terminal-facing view of a dungeon turn. The extracted game crate maps
/// its `SessionState` onto this; nothing here knows about Discord.
#[derive(Default)]
pub struct Frame {
    pub room: String,
    pub party: Vec<Actor>,
    pub enemies: Vec<Actor>,
    pub log: Vec<String>,
    pub options: Vec<(char, String)>,
}

/// Render a dungeon turn into the caller's terminal.
pub fn draw_frame(screen: &mut Screen, frame: &Frame) {
    let width = screen.width.saturating_sub(1);

    if !frame.room.is_empty() {
        screen.nl().ink(Ink::Body);
        for line in wrap_lines(&strip_markup(&frame.room), width) {
            screen.line(&line);
        }
    }

    if !frame.party.is_empty() {
        screen.nl().ink(Ink::Accent).line("party").ink(Ink::Body);
        for actor in &frame.party {
            screen.line(&truncate(
                &format!(
                    "{:<12} {}",
                    truncate(&strip_markup(&actor.name), 12),
                    meter("HP", actor.hp, actor.max_hp, METER_WIDTH)
                ),
                width,
            ));
        }
    }

    if !frame.enemies.is_empty() {
        screen.nl().ink(Ink::Warn).line("enemies").ink(Ink::Body);
        for (i, actor) in frame.enemies.iter().enumerate() {
            screen.line(&truncate(
                &format!(
                    "{}. {:<12} {}",
                    i + 1,
                    truncate(&strip_markup(&actor.name), 12),
                    meter("HP", actor.hp, actor.max_hp, METER_WIDTH)
                ),
                width,
            ));
        }
    }

    if !frame.log.is_empty() {
        screen.nl().ink(Ink::Dim);
        let start = frame.log.len().saturating_sub(MAX_LOG_LINES);
        for entry in frame.log.iter().skip(start) {
            for line in wrap_lines(&strip_markup(entry), width) {
                screen.line(&line);
            }
        }
    }

    screen.reset();

    if !frame.options.is_empty() {
        screen.nl();
        for (key, label) in &frame.options {
            screen.item(*key, label);
        }
    }
}

fn preview_frame() -> Frame {
    Frame {
        room: "**Collapsed Aqueduct** — water runs black over the `broken` tiles.".to_string(),
        party: vec![
            Actor {
                name: "you".to_string(),
                hp: 32,
                max_hp: 50,
            },
            Actor {
                name: "Kurenai".to_string(),
                hp: 44,
                max_hp: 44,
            },
        ],
        enemies: vec![
            Actor {
                name: "Glass Slime".to_string(),
                hp: 7,
                max_hp: 20,
            },
            Actor {
                name: "Deep Warden".to_string(),
                hp: 31,
                max_hp: 31,
            },
        ],
        log: vec![
            "\u{2660} You strike the Glass Slime for **13** damage.".to_string(),
            "\u{2620} Deep Warden braces (+4 armor).".to_string(),
            "\u{2665}\u{2665}\u{2661} Kurenai drinks a potion.".to_string(),
        ],
        options: vec![
            ('A', "Attack".to_string()),
            ('D', "Defend".to_string()),
            ('I', "Inventory".to_string()),
        ],
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum View {
    Status,
    Preview,
}

/// Entry point for `[G] Games -> [1] Dungeons`.
///
/// The dungeon simulation still lives in the discordsh bot process, so this
/// reports status rather than pretending to deal a hand. `[P]` renders a
/// representative turn so the terminal layout can be reviewed already.
pub struct Lobby {
    view: View,
}

impl Lobby {
    pub fn new() -> Self {
        Self { view: View::Status }
    }
}

impl Default for Lobby {
    fn default() -> Self {
        Self::new()
    }
}

impl Game for Lobby {
    fn title(&self) -> &str {
        "DUNGEONS"
    }

    fn draw(&self, screen: &mut Screen) {
        match self.view {
            View::Status => {
                let width = screen.width.saturating_sub(1);
                screen.nl().ink(Ink::Body);
                for line in wrap_lines(
                    "The dungeon runs in the discordsh bot for now. Play it there with /dungeon while the shared game core is split out.",
                    width,
                ) {
                    screen.line(&line);
                }
                screen
                    .nl()
                    .ink(Ink::Dim)
                    .line("not yet playable from the board")
                    .reset()
                    .nl();
                screen.item('P', "Preview the terminal layout");
                screen.item('Q', "Back");
                screen.prompt("command> ");
            }
            View::Preview => {
                draw_frame(screen, &preview_frame());
                screen
                    .nl()
                    .ink(Ink::Dim)
                    .line("sample turn - not a live game")
                    .reset();
                screen.item('Q', "Back");
                screen.prompt("command> ");
            }
        }
    }

    fn on_key(&mut self, key: char) -> Flow {
        match (self.view, key) {
            (View::Status, 'Q') => return Flow::Exit,
            (View::Status, 'P') => self.view = View::Preview,
            (View::Preview, 'Q') => self.view = View::Status,
            _ => {}
        }
        Flow::Continue
    }
}
