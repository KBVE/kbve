use super::dungeon::{Actor, Frame, draw_frame};
use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const START_HP: i32 = 40;
const START_POTIONS: u32 = 3;
const POTION_HEAL: i32 = 14;
const SHRINE_HEAL: i32 = 10;
const FLEE_IN_CHANCE: usize = 2;
const LOG_KEPT: usize = 12;

const MONSTERS: [(&str, i32, i32); 6] = [
    ("Glass Slime", 12, 3),
    ("Cave Rat", 9, 2),
    ("Deep Warden", 22, 5),
    ("Bone Picker", 15, 4),
    ("Drowned Monk", 18, 4),
    ("Tunnel Grub", 10, 3),
];

const ROOMS: [&str; 6] = [
    "A collapsed aqueduct. Water runs black over broken tiles.",
    "A pillared hall. Something has scratched every column.",
    "A flooded stair, ankle deep and colder than it should be.",
    "A storeroom, shelves stripped bare a long time ago.",
    "A narrow gallery. Your lamp does not reach the ceiling.",
    "A shrine to nobody, its name chiselled out.",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Exploring,
    Fighting,
    Dead,
}

struct Foe {
    name: &'static str,
    hp: i32,
    max_hp: i32,
    atk: i32,
}

/// One ephemeral dungeon run. Nothing is persisted: closing the session
/// ends the run, which is intentional while the shared game core is split
/// out of the discordsh bot.
pub struct Run {
    rng: Rng,
    hp: i32,
    max_hp: i32,
    atk: i32,
    potions: u32,
    gold: u32,
    depth: u32,
    kills: u32,
    room: &'static str,
    foe: Option<Foe>,
    defending: bool,
    phase: Phase,
    log: Vec<String>,
}

impl Run {
    pub fn new(rng: Rng) -> Self {
        let mut run = Self {
            rng,
            hp: START_HP,
            max_hp: START_HP,
            atk: 4,
            potions: START_POTIONS,
            gold: 0,
            depth: 0,
            kills: 0,
            room: ROOMS[0],
            foe: None,
            defending: false,
            phase: Phase::Exploring,
            log: Vec::new(),
        };
        run.say("You climb down into the dark.");
        run.descend();
        run
    }

    #[cfg(test)]
    pub fn phase(&self) -> Phase {
        self.phase
    }

    #[cfg(test)]
    pub fn hp(&self) -> i32 {
        self.hp
    }

    #[cfg(test)]
    pub fn depth(&self) -> u32 {
        self.depth
    }

    #[cfg(test)]
    pub fn potions(&self) -> u32 {
        self.potions
    }

    fn say(&mut self, line: impl Into<String>) {
        self.log.push(line.into());
        if self.log.len() > LOG_KEPT {
            self.log.remove(0);
        }
    }

    fn descend(&mut self) {
        self.depth += 1;
        self.room = ROOMS[self.rng.below(ROOMS.len())];
        self.defending = false;

        match self.rng.below(6) {
            0 | 1 | 2 | 3 => self.spawn_foe(),
            4 => {
                let purse = 5 + self.rng.below(10) as u32 + self.depth;
                self.gold += purse;
                self.say(format!("You prise {purse} gold from the silt."));
                if self.rng.below(3) == 0 {
                    self.potions += 1;
                    self.say("A sealed vial, still good. Potion taken.");
                }
            }
            _ => {
                let before = self.hp;
                self.hp = (self.hp + SHRINE_HEAL).min(self.max_hp);
                let gained = self.hp - before;
                if gained > 0 {
                    self.say(format!("You rest at the shrine and recover {gained} HP."));
                } else {
                    self.say("You rest at the shrine. Nothing left to mend.");
                }
            }
        }
    }

    fn spawn_foe(&mut self) {
        let (name, hp, atk) = MONSTERS[self.rng.below(MONSTERS.len())];
        let bonus = (self.depth as i32 - 1) / 2;
        let foe = Foe {
            name,
            hp: hp + bonus * 2,
            max_hp: hp + bonus * 2,
            atk: atk + bonus,
        };
        self.say(format!("A {} blocks the way.", foe.name));
        self.foe = Some(foe);
        self.phase = Phase::Fighting;
    }

    fn strike(&mut self) {
        let Some(foe) = self.foe.as_mut() else {
            return;
        };
        let dmg = self.atk + self.rng.below(4) as i32;
        foe.hp -= dmg;
        let name = foe.name;
        let dead = foe.hp <= 0;
        self.say(format!("You hit the {name} for {dmg}."));

        if dead {
            let purse = 3 + self.rng.below(8) as u32 + self.depth;
            self.gold += purse;
            self.kills += 1;
            self.foe = None;
            self.phase = Phase::Exploring;
            self.say(format!("The {name} falls. You take {purse} gold."));
            if self.kills % 3 == 0 {
                self.atk += 1;
                self.max_hp += 4;
                self.hp += 4;
                self.say("You feel steadier. Attack and vigour up.");
            }
            return;
        }

        self.foe_turn();
    }

    fn foe_turn(&mut self) {
        let Some(foe) = self.foe.as_ref() else {
            return;
        };
        let raw = foe.atk + self.rng.below(3) as i32;
        let dmg = if self.defending {
            (raw / 2).max(1)
        } else {
            raw
        };
        let name = foe.name;
        self.hp -= dmg;
        self.defending = false;
        self.say(format!("The {name} hits you for {dmg}."));

        if self.hp <= 0 {
            self.hp = 0;
            self.phase = Phase::Dead;
            self.say("You go down in the dark.");
        }
    }

    fn defend(&mut self) {
        self.defending = true;
        self.say("You raise your guard.");
        self.foe_turn();
    }

    fn quaff(&mut self) {
        if self.potions == 0 {
            self.say("No potions left.");
            return;
        }
        self.potions -= 1;
        let before = self.hp;
        self.hp = (self.hp + POTION_HEAL).min(self.max_hp);
        let gained = self.hp - before;
        self.say(format!("You drink a potion and recover {gained} HP."));
        if self.phase == Phase::Fighting {
            self.foe_turn();
        }
    }

    fn flee(&mut self) {
        if self.rng.below(FLEE_IN_CHANCE) == 0 {
            let name = self.foe.as_ref().map(|f| f.name).unwrap_or("thing");
            self.foe = None;
            self.phase = Phase::Exploring;
            self.say(format!("You break away from the {name}."));
            return;
        }
        self.say("It cuts you off.");
        self.foe_turn();
    }

    fn restart(&mut self) {
        let seed = self.rng.next_u64();
        *self = Run::new(Rng::new(seed));
    }

    fn frame(&self) -> Frame {
        let mut party = vec![Actor {
            name: "you".to_string(),
            hp: self.hp,
            max_hp: self.max_hp,
        }];
        if self.phase == Phase::Dead {
            party.clear();
        }

        let enemies = self
            .foe
            .as_ref()
            .map(|f| {
                vec![Actor {
                    name: f.name.to_string(),
                    hp: f.hp,
                    max_hp: f.max_hp,
                }]
            })
            .unwrap_or_default();

        let options = match self.phase {
            Phase::Fighting => vec![
                ('A', "Attack".to_string()),
                ('D', "Defend".to_string()),
                ('P', format!("Potion ({})", self.potions)),
                ('F', "Flee".to_string()),
            ],
            Phase::Exploring => vec![
                ('G', "Go deeper".to_string()),
                ('P', format!("Potion ({})", self.potions)),
            ],
            Phase::Dead => vec![('N', "New run".to_string())],
        };

        Frame {
            room: if self.phase == Phase::Dead {
                String::new()
            } else {
                self.room.to_string()
            },
            party,
            enemies,
            log: self.log.clone(),
            options,
        }
    }
}

impl Game for Run {
    fn title(&self) -> &str {
        "DUNGEONS"
    }

    fn draw(&self, screen: &mut Screen) {
        screen
            .nl()
            .ink(Ink::Dim)
            .line(&format!(
                "depth {}  gold {}  kills {}",
                self.depth, self.gold, self.kills
            ))
            .reset();

        draw_frame(screen, &self.frame());

        if self.phase == Phase::Dead {
            screen.nl().ink(Ink::Warn).line("run over").reset();
        }
        screen
            .ink(Ink::Dim)
            .line("progress is not saved yet")
            .reset();
        screen.item('Q', "Back");
        screen.prompt("command> ");
    }

    fn on_key(&mut self, key: char) -> Flow {
        match (self.phase, key) {
            (_, 'Q') => return Flow::Exit,
            (Phase::Fighting, 'A') => self.strike(),
            (Phase::Fighting, 'D') => self.defend(),
            (Phase::Fighting, 'F') => self.flee(),
            (Phase::Fighting | Phase::Exploring, 'P') => self.quaff(),
            (Phase::Exploring, 'G') => self.descend(),
            (Phase::Dead, 'N') => self.restart(),
            _ => {}
        }
        Flow::Continue
    }
}
