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

        let mut options: Vec<(char, String)> = Vec::new();
        match self.state.phase {
            GamePhase::Combat | GamePhase::WaitingForActions => {
                options.push(('A', "Attack".to_string()));
                options.push(('D', "Defend".to_string()));
            }
            GamePhase::GameOver(_) => {
                options.push(('N', "New run".to_string()));
            }
            _ => {
                for dir in self.exits() {
                    let key = match dir {
                        Direction::North => 'N',
                        Direction::South => 'S',
                        Direction::East => 'E',
                        Direction::West => 'W',
                    };
                    options.push((key, format!("Go {}", dir.code())));
                }
            }
        }
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
                if !tile.visited && pos != here {
                    continue;
                }

                let cell = if pos == here {
                    Cell::Current
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

                let links = Links {
                    north: tile.exits.contains(&Direction::North),
                    south: tile.exits.contains(&Direction::South),
                    east: tile.exits.contains(&Direction::East),
                    west: tile.exits.contains(&Direction::West),
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
            'A' => self.act(GameAction::Attack),
            'D' => self.act(GameAction::Defend),
            'N' if matches!(self.state.phase, GamePhase::GameOver(_)) => {
                let me = self.state.player(self.actor);
                let (name, class) = (me.name.clone(), me.class);
                self.state = start_solo(self.actor, &name, class);
                self.notice = None;
            }
            'N' => self.act(GameAction::Move(Direction::North)),
            'S' => self.act(GameAction::Move(Direction::South)),
            'E' => self.act(GameAction::Move(Direction::East)),
            'W' => self.act(GameAction::Move(Direction::West)),
            _ => {}
        }
        Flow::Continue
    }
}
