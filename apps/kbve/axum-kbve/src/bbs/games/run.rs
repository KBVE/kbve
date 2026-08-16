use bevy_dungeon::content::{self, TileVisibility};
use bevy_dungeon::types::{
    ClassType, Direction, GameAction, GamePhase, MapPos, RoomType, SessionState,
};
use bevy_dungeon::{PlayerId, logic, start_solo};

use super::dungeon::{Actor, Frame, draw_frame};
use super::map::{self, Cell, Grid, Links};
use super::text::Rng;
use super::text::strip_markup;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen, wrap_lines};

const LOG_KEPT: usize = 12;
const MAP_SPAN: i16 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum View {
    Play,
    Map,
}

/// What a key on the board does: hand something to the rules engine, or start
/// a fresh run once this one is over.
#[derive(Debug, Clone)]
enum Act {
    Do(GameAction),
    Restart,
}

/// A dungeon run on the board, driven by the same `bevy_dungeon` rules the
/// Discord bot uses. Nothing is persisted yet: the run ends with the call.
pub struct Run {
    state: SessionState,
    actor: PlayerId,
    view: View,
    notice: Option<String>,
}

impl Run {
    pub fn new(mut rng: Rng, handle: &str) -> Self {
        let actor = PlayerId::new(rng.next_u64() | 1);
        let class = match rng.below(3) {
            0 => ClassType::Warrior,
            1 => ClassType::Rogue,
            _ => ClassType::Cleric,
        };
        Self {
            state: start_solo(actor, handle, class),
            actor,
            view: View::Play,
            notice: None,
        }
    }

    #[cfg(test)]
    pub fn phase(&self) -> GamePhase {
        self.state.phase.clone()
    }

    #[cfg(test)]
    pub fn hp(&self) -> i32 {
        self.state.player(self.actor).hp
    }

    #[cfg(test)]
    pub fn keys(&self) -> Vec<char> {
        self.actions().into_iter().map(|(k, _, _)| k).collect()
    }

    #[cfg(test)]
    pub fn notice(&self) -> Option<&str> {
        self.notice.as_deref()
    }

    #[cfg(test)]
    pub fn depth(&self) -> u32 {
        self.state.map.position.depth()
    }

    fn act(&mut self, action: GameAction) {
        match logic::apply_action(&mut self.state, action, self.actor) {
            Ok(result) => {
                self.notice = None;
                for line in result.logs.iter() {
                    self.state.log.push(line.clone());
                }
            }
            Err(reason) => self.notice = Some(reason),
        }
        let len = self.state.log.len();
        if len > LOG_KEPT {
            self.state.log.drain(..len - LOG_KEPT);
        }
    }

    /// Exits belong to the map tile, not the room description.
    fn exits(&self) -> Vec<Direction> {
        self.state
            .map
            .tiles
            .get(&self.state.map.position)
            .map(|t| t.exits.clone())
            .unwrap_or_default()
    }

    /// Every action the current phase will actually accept, keyed for the
    /// board. Drawing and input both read this, so the menu can never offer a
    /// move the engine is going to refuse.
    fn actions(&self) -> Vec<(char, String, Act)> {
        let mut out: Vec<(char, String, Act)> = Vec::new();

        match self.state.phase {
            GamePhase::Combat | GamePhase::WaitingForActions => {
                out.push(('A', "Attack".to_string(), Act::Do(GameAction::Attack)));
                out.push(('D', "Defend".to_string(), Act::Do(GameAction::Defend)));
                out.push(('F', "Flee".to_string(), Act::Do(GameAction::Flee)));
            }
            GamePhase::GameOver(_) => {}
            GamePhase::Trap => {
                out.push((
                    '1',
                    "Disarm".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push(('2', "Brace".to_string(), Act::Do(GameAction::RoomChoice(1))));
            }
            GamePhase::Treasure => {
                out.push((
                    '1',
                    "Open carefully".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push((
                    '2',
                    "Force open".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Hallway => {
                out.push((
                    '1',
                    "Move quickly".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push((
                    '2',
                    "Search".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Rest if self.state.room.room_type == RoomType::RestShrine => {
                out.push(('1', "Rest".to_string(), Act::Do(GameAction::RoomChoice(0))));
                out.push((
                    '2',
                    "Meditate".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Event => {
                if let Some(event) = &self.state.room.story_event {
                    for (i, choice) in event.choices.iter().enumerate().take(9) {
                        let key = char::from_digit(i as u32 + 1, 10).unwrap_or('1');
                        out.push((
                            key,
                            choice.label.clone(),
                            Act::Do(GameAction::StoryChoice(i)),
                        ));
                    }
                }
            }
            _ => {}
        }

        if matches!(self.state.phase, GamePhase::Exploring | GamePhase::City) {
            for dir in self.exits() {
                let key = match dir {
                    Direction::North => 'N',
                    Direction::South => 'S',
                    Direction::East => 'E',
                    Direction::West => 'W',
                };
                out.push((
                    key,
                    format!("Go {}", dir.code()),
                    Act::Do(GameAction::Move(dir)),
                ));
            }
        }

        if self.state.phase == GamePhase::City {
            let cost = logic::inn_cost(&self.state);
            if self.state.player(self.actor).gold >= cost {
                out.push(('R', format!("Rest ({cost}g)"), Act::Do(GameAction::Rest)));
            }
        }

        match self.state.phase {
            GamePhase::GameOver(_) => out.push(('N', "New run".to_string(), Act::Restart)),
            GamePhase::Exploring => {
                out.push(('C', "Search".to_string(), Act::Do(GameAction::Explore)))
            }
            _ if out.is_empty() => {
                out.push(('C', "Continue".to_string(), Act::Do(GameAction::Explore)))
            }
            _ => {}
        }

        out
    }

    fn frame(&self) -> Frame {
        let me = self.state.player(self.actor);
        let party = vec![Actor {
            name: me.name.clone(),
            hp: me.hp,
            max_hp: me.max_hp,
        }];

        let enemies = self
            .state
            .enemies
            .iter()
            .filter(|e| e.hp > 0)
            .map(|e| Actor {
                name: e.name.clone(),
                hp: e.hp,
                max_hp: e.max_hp,
            })
            .collect();

        let mut options: Vec<(char, String)> = self
            .actions()
            .into_iter()
            .map(|(key, label, _)| (key, label))
            .collect();
        options.push(('M', "Map".to_string()));

        Frame {
            room: format!("{} - {}", self.state.room.name, self.state.room.description),
            party,
            enemies,
            log: self.state.log.clone(),
            options,
        }
    }

    fn grid(&self, span: i16) -> Grid {
        let here = self.state.map.position;
        let size = (span * 2 + 1) as usize;
        let mut grid = Grid::new(size, size);

        for dy in -span..=span {
            for dx in -span..=span {
                let pos = MapPos {
                    x: here.x + dx,
                    y: here.y + dy,
                };
                let Some(tile) = self.state.map.tiles.get(&pos) else {
                    continue;
                };
                let visibility = content::tile_visibility(&self.state.map, pos);
                if visibility == TileVisibility::Hidden && pos != here {
                    continue;
                }

                let cell = if pos == here {
                    Cell::Current
                } else if visibility == TileVisibility::Discovered {
                    Cell::Discovered
                } else {
                    match tile.room_type {
                        RoomType::Boss => Cell::Boss,
                        RoomType::Merchant => Cell::Shop,
                        RoomType::RestShrine => Cell::Shrine,
                        RoomType::UndergroundCity => Cell::Exit,
                        _ if tile.cleared => Cell::Cleared,
                        _ => Cell::Visited,
                    }
                };

                let links = if visibility == TileVisibility::Discovered {
                    Links::NONE
                } else {
                    Links {
                        north: tile.exits.contains(&Direction::North),
                        south: tile.exits.contains(&Direction::South),
                        east: tile.exits.contains(&Direction::East),
                        west: tile.exits.contains(&Direction::West),
                    }
                };

                grid.set((dx + span) as usize, (dy + span) as usize, cell, links);
            }
        }
        grid
    }
}

impl Game for Run {
    fn title(&self) -> &str {
        "DUNGEONS"
    }

    fn draw(&self, screen: &mut Screen) {
        let me = self.state.player(self.actor);
        screen
            .nl()
            .ink(Ink::Dim)
            .line(&format!(
                "depth {}  gold {}  lv {}",
                self.state.map.position.depth(),
                me.gold,
                me.level
            ))
            .reset();

        match self.view {
            View::Map => {
                let across = map::fits(screen, (MAP_SPAN * 2 + 1) as usize);
                let span = ((across as i16 - 1) / 2).max(1);
                map::draw(screen, &self.grid(span));
                screen.nl();
                map::legend(screen);
                screen.nl();
                screen.item('Q', "Back");
            }
            View::Play => {
                draw_frame(screen, &self.frame());
                if let Some(notice) = &self.notice {
                    let width = screen.width.saturating_sub(1);
                    screen.nl().ink(Ink::Warn);
                    for line in wrap_lines(&strip_markup(notice), width) {
                        screen.line(&line);
                    }
                    screen.reset();
                }
                screen
                    .ink(Ink::Dim)
                    .line("progress is not saved yet")
                    .reset();
                screen.item('Q', "Back");
            }
        }
        screen.prompt("command> ");
    }

    fn on_key(&mut self, key: char) -> Flow {
        if self.view == View::Map {
            if matches!(key, 'Q' | 'M') {
                self.view = View::Play;
            }
            return Flow::Continue;
        }

        match key {
            'Q' => return Flow::Exit,
            'M' => self.view = View::Map,
            _ => {
                let bound = self
                    .actions()
                    .into_iter()
                    .find(|(k, _, _)| *k == key)
                    .map(|(_, _, act)| act);
                match bound {
                    Some(Act::Do(action)) => self.act(action),
                    Some(Act::Restart) => {
                        let me = self.state.player(self.actor);
                        let (name, class) = (me.name.clone(), me.class);
                        self.state = start_solo(self.actor, &name, class);
                        self.notice = None;
                    }
                    None => {}
                }
            }
        }
        Flow::Continue
    }
}
