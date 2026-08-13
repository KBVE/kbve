use std::collections::HashMap;
use std::marker::PhantomData;

use godot::prelude::*;

pub fn hash64(mut x: u64) -> u64 {
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ceb9fe1a85ec53);
    x ^= x >> 33;
    x
}

pub fn stable_id(seed: u64, x: f32, z: f32) -> u64 {
    let qx = (x * 10.0).round() as i64 as u64;
    let qz = (z * 10.0).round() as i64 as u64;
    hash64(seed ^ qx.wrapping_mul(0x9e3779b97f4a7c15) ^ qz.rotate_left(32))
}

#[derive(Clone, Copy)]
pub struct DropEntry {
    pub ore: &'static str,
    pub weight: u32,
    pub min: u8,
    pub max: u8,
}

pub trait HarvestKind {
    const STAGES: u8;
    fn drop_table() -> &'static [DropEntry];
}

pub struct Stone;

impl HarvestKind for Stone {
    const STAGES: u8 = 3;

    fn drop_table() -> &'static [DropEntry] {
        &[
            DropEntry {
                ore: "stone",
                weight: 55,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "coal",
                weight: 20,
                min: 1,
                max: 3,
            },
            DropEntry {
                ore: "copper",
                weight: 12,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "iron",
                weight: 8,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "gold",
                weight: 5,
                min: 1,
                max: 1,
            },
        ]
    }
}

#[derive(Clone, Copy)]
pub struct Entry {
    pub id: u64,
    pub pos: Vector3,
    /// Ground normal the instance is bedded into; drives both its transform and its
    /// collider so the two never disagree on a slope.
    pub up: Vector3,
    pub scale: f32,
    pub yaw: f32,
    pub variant: u8,
    pub ore: u8,
    pub amount: u8,
}

pub struct HarvestOutcome {
    pub stage: u8,
    pub broken: bool,
    pub ore: &'static str,
    pub amount: u8,
}

pub struct ScatterCore<K: HarvestKind> {
    entries: Vec<Entry>,
    index: HashMap<u64, u32>,
    stages: HashMap<u64, u8>,
    _kind: PhantomData<K>,
}

impl<K: HarvestKind> Default for ScatterCore<K> {
    fn default() -> Self {
        Self::new()
    }
}

impl<K: HarvestKind> ScatterCore<K> {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            index: HashMap::new(),
            stages: HashMap::new(),
            _kind: PhantomData,
        }
    }

    pub fn roll_ore(id: u64) -> (u8, u8) {
        let table = K::drop_table();
        let total: u32 = table.iter().map(|d| d.weight).sum();
        let r = hash64(id ^ ORE_SALT);
        let mut pick = (r % total as u64) as u32;
        for (i, d) in table.iter().enumerate() {
            if pick < d.weight {
                let span = (d.max - d.min) as u64 + 1;
                let amount = d.min + ((r >> 32) % span) as u8;
                return (i as u8, amount);
            }
            pick -= d.weight;
        }
        (0, 1)
    }

    pub fn insert(&mut self, mut e: Entry) {
        let (ore, amount) = Self::roll_ore(e.id);
        e.ore = ore;
        e.amount = amount;
        self.index.insert(e.id, self.entries.len() as u32);
        self.entries.push(e);
    }

    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    pub fn stage(&self, id: u64) -> u8 {
        *self.stages.get(&id).unwrap_or(&0)
    }

    pub fn alive(&self, id: u64) -> bool {
        self.stage(id) < K::STAGES
    }

    pub fn get(&self, id: u64) -> Option<&Entry> {
        self.index.get(&id).map(|i| &self.entries[*i as usize])
    }

    pub fn query_radius(&self, pos: Vector3, radius: f32, max: usize) -> Vec<u64> {
        let r2 = radius * radius;
        let mut out: Vec<(f32, u64)> = self
            .entries
            .iter()
            .filter(|e| self.alive(e.id))
            .map(|e| (e.pos.distance_squared_to(pos), e.id))
            .filter(|(d2, _)| *d2 <= r2)
            .collect();
        out.sort_by(|a, b| a.0.total_cmp(&b.0));
        out.truncate(max);
        out.into_iter().map(|(_, id)| id).collect()
    }

    pub fn apply_damage(&mut self, id: u64, hits: u8) -> Option<HarvestOutcome> {
        let entry = *self.get(id)?;
        let cur = self.stage(id);
        if cur >= K::STAGES {
            return None;
        }
        let next = (cur + hits).min(K::STAGES);
        self.stages.insert(id, next);
        let broken = next >= K::STAGES;
        let drop = K::drop_table()[entry.ore as usize];
        Some(HarvestOutcome {
            stage: next,
            broken,
            ore: if broken { drop.ore } else { "" },
            amount: if broken { entry.amount } else { 0 },
        })
    }
}

const ORE_SALT: u64 = 0x00e5_eed0_0e5e_ed00;
