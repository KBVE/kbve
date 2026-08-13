use super::text::{meter, strip_markup};
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
