//! Godot adapter over [`super::sim`].
//!
//! One node holds the simulation for the whole scene. Godot never touches a character's
//! numbers directly: it sends what happened down to the sim and reads the latest snapshot
//! back once a frame, so the main thread's share of this is one drain of a channel and a
//! table lookup per character that asks.

use std::collections::HashMap;

use godot::classes::{INode, Node};
use godot::prelude::*;

use super::sim::{CharacterId, Command, Row, Sim, Snapshot, TICK_HZ};
use super::{Attribute, Attributes, PoolKind, VitalEvent};

#[derive(GodotClass)]
#[class(base = Node)]
pub struct QVitals {
    base: Base<Node>,
    sim: Option<Sim>,
    rows: HashMap<CharacterId, Row>,
    tick: u64,

    /// How often the world is stepped. Left alone unless there is a reason: it matches the
    /// dedicated server's snapshot rate, and the point of this node is that both machines
    /// agree.
    #[export]
    tick_hz: u32,
}

#[godot_api]
impl INode for QVitals {
    fn init(base: Base<Node>) -> Self {
        Self {
            base,
            sim: None,
            rows: HashMap::new(),
            tick: 0,
            tick_hz: TICK_HZ,
        }
    }

    fn ready(&mut self) {
        self.sim = Some(Sim::spawn(self.tick_hz));
    }

    /// Drains to the newest snapshot and reports anything worth hearing about. Cheap by
    /// construction: whole snapshots are posted at the tick rate, and everything older
    /// than the newest is thrown away rather than replayed.
    fn process(&mut self, _delta: f64) {
        let Some(sim) = self.sim.as_ref() else {
            return;
        };
        let Some(snapshot) = sim.latest() else {
            return;
        };
        self.absorb(snapshot);
    }

    fn exit_tree(&mut self) {
        // Dropped here rather than left to the object's own teardown, so the thread is
        // joined while the scene is still coming down in an orderly way.
        self.sim = None;
    }
}

#[godot_api]
impl QVitals {
    #[constant]
    pub const POOL_HEALTH: i64 = PoolKind::Health as i64;
    #[constant]
    pub const POOL_MANA: i64 = PoolKind::Mana as i64;
    #[constant]
    pub const POOL_ENERGY: i64 = PoolKind::Energy as i64;

    #[constant]
    pub const ATTRIBUTE_STRENGTH: i64 = Attribute::Strength as i64;
    #[constant]
    pub const ATTRIBUTE_SKILL: i64 = Attribute::Skill as i64;
    #[constant]
    pub const ATTRIBUTE_WILL: i64 = Attribute::Will as i64;

    /// A character has run out of health. Raised once, on the frame the snapshot carrying
    /// it arrives.
    #[signal]
    fn downed(id: i64);

    /// A character who was down is back up.
    #[signal]
    fn revived(id: i64);

    /// Experience was spent and an attribute went up.
    #[signal]
    fn invested(id: i64, attribute: i64);

    #[func]
    fn spawn_character(&self, id: i64, strength: i64, skill: i64, will: i64) {
        self.send(Command::Spawn {
            id: as_character(id),
            attributes: Attributes::new(as_rank(strength), as_rank(skill), as_rank(will)),
        });
    }

    #[func]
    fn despawn_character(&self, id: i64) {
        self.send(Command::Despawn {
            id: as_character(id),
        });
    }

    #[func]
    fn damage(&self, id: i64, amount: f32) {
        self.send(Command::Damage {
            id: as_character(id),
            amount,
        });
    }

    #[func]
    fn heal(&self, id: i64, amount: f32) {
        self.send(Command::Heal {
            id: as_character(id),
            amount,
        });
    }

    #[func]
    fn revive(&self, id: i64, fraction: f32) {
        self.send(Command::Revive {
            id: as_character(id),
            fraction,
        });
    }

    /// All of it or none of it. The answer is not immediate — the sim decides at the next
    /// tick — so a caller that needs to know whether it could afford something should read
    /// the pool first and treat this as the spend.
    #[func]
    fn spend(&self, id: i64, pool: i64, amount: f32) {
        let Some(pool) = as_pool(pool) else { return };
        self.send(Command::Spend {
            id: as_character(id),
            pool,
            amount,
        });
    }

    /// As much of it as there is, for costs that should not refuse to start.
    #[func]
    fn drain(&self, id: i64, pool: i64, amount: f32) {
        let Some(pool) = as_pool(pool) else { return };
        self.send(Command::Drain {
            id: as_character(id),
            pool,
            amount,
        });
    }

    #[func]
    fn award(&self, id: i64, experience: i64) {
        self.send(Command::Award {
            id: as_character(id),
            experience: experience.max(0) as u32,
        });
    }

    #[func]
    fn invest(&self, id: i64, attribute: i64) {
        let Some(attribute) = as_attribute(attribute) else {
            return;
        };
        self.send(Command::Invest {
            id: as_character(id),
            attribute,
        });
    }

    /// Whether the sim has ever reported this character. False for one tick after a spawn,
    /// which is the price of the sim owning the numbers.
    #[func]
    fn knows(&self, id: i64) -> bool {
        self.rows.contains_key(&as_character(id))
    }

    #[func]
    fn current(&self, id: i64, pool: i64) -> f32 {
        self.read(id, pool, |row, kind| match kind {
            PoolKind::Health => row.health,
            PoolKind::Mana => row.mana,
            PoolKind::Energy => row.energy,
        })
    }

    #[func]
    fn maximum(&self, id: i64, pool: i64) -> f32 {
        self.read(id, pool, |row, kind| match kind {
            PoolKind::Health => row.health_max,
            PoolKind::Mana => row.mana_max,
            PoolKind::Energy => row.energy_max,
        })
    }

    /// Zero rather than a NaN where there is nothing to be a fraction of, so a bar drawn
    /// from an unknown character is empty rather than broken.
    #[func]
    fn fraction(&self, id: i64, pool: i64) -> f32 {
        let max = self.maximum(id, pool);
        if max <= 0.0 {
            return 0.0;
        }
        self.current(id, pool) / max
    }

    #[func]
    fn is_down(&self, id: i64) -> bool {
        self.rows.get(&as_character(id)).is_some_and(|row| row.down)
    }

    #[func]
    fn experience(&self, id: i64) -> i64 {
        self.rows
            .get(&as_character(id))
            .map_or(0, |row| i64::from(row.experience))
    }

    #[func]
    fn rank(&self, id: i64, attribute: i64) -> i64 {
        let Some(attribute) = as_attribute(attribute) else {
            return 0;
        };
        self.rows.get(&as_character(id)).map_or(0, |row| {
            i64::from(match attribute {
                Attribute::Strength => row.strength,
                Attribute::Skill => row.skill,
                Attribute::Will => row.will,
            })
        })
    }

    /// What the next rank in an attribute costs, so a menu can price a choice without
    /// re-deriving the curve in GDScript.
    #[func]
    fn next_cost(&self, id: i64, attribute: i64) -> i64 {
        let Some(attribute) = as_attribute(attribute) else {
            return 0;
        };
        self.rows.get(&as_character(id)).map_or(0, |row| {
            let attributes = Attributes::new(row.strength, row.skill, row.will);
            i64::from(attributes.next_cost(attribute))
        })
    }

    /// Everything about one character in a single call, for the places that would
    /// otherwise make eight.
    #[func]
    fn snapshot_of(&self, id: i64) -> VarDictionary {
        let mut out = VarDictionary::new();
        let Some(row) = self.rows.get(&as_character(id)) else {
            return out;
        };
        out.set("health", row.health);
        out.set("health_max", row.health_max);
        out.set("mana", row.mana);
        out.set("mana_max", row.mana_max);
        out.set("energy", row.energy);
        out.set("energy_max", row.energy_max);
        out.set("experience", i64::from(row.experience));
        out.set("down", row.down);
        out.set("strength", i64::from(row.strength));
        out.set("skill", i64::from(row.skill));
        out.set("will", i64::from(row.will));
        out
    }

    /// How many characters the sim last reported, which is the cheapest way to tell a sim
    /// that is running from one that is not.
    #[func]
    fn known_count(&self) -> i64 {
        self.rows.len() as i64
    }

    /// Which tick the numbers on hand came from. Rising means the thread is alive.
    #[func]
    fn tick(&self) -> i64 {
        self.tick as i64
    }

    fn send(&self, command: Command) {
        if let Some(sim) = self.sim.as_ref() {
            sim.send(command);
        }
    }

    fn read(&self, id: i64, pool: i64, pick: impl Fn(&Row, PoolKind) -> f32) -> f32 {
        let Some(kind) = as_pool(pool) else {
            return 0.0;
        };
        self.rows
            .get(&as_character(id))
            .map_or(0.0, |row| pick(row, kind))
    }

    fn absorb(&mut self, snapshot: Snapshot) {
        self.tick = snapshot.tick;
        self.rows.clear();
        for row in snapshot.rows {
            self.rows.insert(row.id, row);
        }
        for (id, event) in snapshot.events {
            let id = id as i64;
            match event {
                VitalEvent::Downed => self.signals().downed().emit(id),
                VitalEvent::Revived => self.signals().revived().emit(id),
                VitalEvent::Invested(attribute) => {
                    self.signals().invested().emit(id, attribute as i64)
                }
            }
        }
    }
}

/// Ids are unsigned in the sim and signed across the boundary, because GDScript has no
/// unsigned integer. Negative ids are folded rather than rejected: the caller's hash is
/// its own business, and every one of them names a distinct character either way.
fn as_character(id: i64) -> CharacterId {
    id as CharacterId
}

fn as_rank(value: i64) -> u16 {
    value.clamp(0, i64::from(u16::MAX)) as u16
}

fn as_pool(value: i64) -> Option<PoolKind> {
    match value {
        0 => Some(PoolKind::Health),
        1 => Some(PoolKind::Mana),
        2 => Some(PoolKind::Energy),
        _ => None,
    }
}

fn as_attribute(value: i64) -> Option<Attribute> {
    match value {
        0 => Some(Attribute::Strength),
        1 => Some(Attribute::Skill),
        2 => Some(Attribute::Will),
        _ => None,
    }
}
