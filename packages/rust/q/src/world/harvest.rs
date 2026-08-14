//! Scatter state, engine side.
//!
//! Identity, drop tables and the ledger live in [`crate::harvest`], which the
//! dedicated server shares. What is left needs positions, so it needs Godot.

use std::collections::HashMap;
use std::marker::PhantomData;

use godot::prelude::*;

pub use crate::harvest::{
    DropEntry, HarvestKind, HarvestOutcome, HarvestTarget, Ledger, Stone, Tree, hash64, stable_id,
};

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

    /// Replays what the player already did to this ground.
    ///
    /// Called after a rescatter, so a rock they mined before walking away is
    /// still broken when they come back.
    pub fn restore(&mut self, ledger: &Ledger) {
        for e in &self.entries {
            let stage = ledger.stage(e.id);
            if stage > 0 {
                self.stages.insert(e.id, stage.min(K::STAGES));
            }
        }
    }

    /// Everything damaged so far, to fold into the ledger before a rescatter.
    pub fn damage(&self) -> impl Iterator<Item = (u64, u8)> + '_ {
        self.stages.iter().map(|(id, stage)| (*id, *stage))
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.index.clear();
        self.stages.clear();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn rock(cell_x: i32, cell_z: i32) -> Entry {
        Entry {
            id: stable_id(99, cell_x, cell_z, 0),
            pos: Vector3::new(cell_x as f32 * 8.0, 0.0, cell_z as f32 * 8.0),
            up: Vector3::UP,
            scale: 1.0,
            yaw: 0.0,
            variant: 0,
            ore: 0,
            amount: 0,
        }
    }

    /// The property persistence rests on: a rock's identity comes from which
    /// cell it is in, so re-scattering the same ground finds the same rock.
    #[test]
    fn identity_survives_a_rescatter() {
        let a = rock(12, -40);
        let b = rock(12, -40);
        assert_eq!(a.id, b.id);
        assert_ne!(a.id, rock(13, -40).id);
        assert_ne!(a.id, rock(12, -41).id);
    }

    /// Companions share their parent's cell, so the ordinal is the only thing
    /// keeping them apart.
    #[test]
    fn companions_of_one_cell_do_not_collide() {
        let mut seen = std::collections::HashSet::new();
        for ordinal in 0..4 {
            assert!(
                seen.insert(stable_id(99, 12, -40, ordinal)),
                "ordinal {ordinal} collided with an earlier companion"
            );
        }
        assert!(seen.insert(stable_id(99, 13, -40, 0)), "cell ignored");
    }

    /// Negative cells are common -- the window straddles the origin -- and the
    /// i32 to u64 widening must not sign-extend two cells onto one id.
    #[test]
    fn negative_cells_stay_distinct() {
        let mut seen = std::collections::HashSet::new();
        for (cx, cz) in [(-1, -1), (-1, 1), (1, -1), (1, 1), (0, 0), (-1, 0)] {
            assert!(
                seen.insert(stable_id(7, cx, cz, 0)),
                "cell {cx},{cz} collided"
            );
        }
    }

    /// The reported need: mine a rock, walk away far enough that the ground is
    /// re-scattered, come back and it is still gone.
    #[test]
    fn a_mined_rock_is_still_gone_when_the_ground_comes_back() {
        let mut ledger = Ledger::new();
        let mut core: ScatterCore<Stone> = ScatterCore::new();
        core.insert(rock(5, 5));
        core.insert(rock(30, -12));
        let id = core.entries()[0].id;
        core.apply_damage(id, Stone::STAGES);
        assert!(!core.alive(id));

        for (id, stage) in core.damage() {
            ledger.record(id, stage);
        }
        // The player walked off; this ground is generated afresh.
        core.clear();
        core.insert(rock(5, 5));
        core.insert(rock(30, -12));
        assert!(core.alive(id), "test rescatter did not actually reset it");
        core.restore(&ledger);
        assert!(!core.alive(id), "the rock came back from the dead");
        assert!(
            core.alive(core.entries()[1].id),
            "restoring broke an untouched rock"
        );
    }

    #[test]
    fn a_part_mined_rock_keeps_its_stage() {
        let mut ledger = Ledger::new();
        let mut core: ScatterCore<Stone> = ScatterCore::new();
        core.insert(rock(1, 1));
        let id = core.entries()[0].id;
        core.apply_damage(id, 1);
        for (id, stage) in core.damage() {
            ledger.record(id, stage);
        }
        core.clear();
        core.insert(rock(1, 1));
        core.restore(&ledger);
        assert_eq!(core.stage(id), 1);
        assert!(core.alive(id));
    }

    /// Damage does not heal, so an older record must never undo a newer one.
    #[test]
    fn a_stale_record_cannot_repair_a_rock() {
        let mut ledger = Ledger::new();
        ledger.record(7, 3);
        ledger.record(7, 1);
        assert_eq!(ledger.stage(7), 3);
    }

    fn trunk(cell_x: i32, cell_z: i32) -> Entry {
        Entry {
            id: stable_id(4242, cell_x, cell_z, 0),
            pos: Vector3::new(cell_x as f32 * 14.0, 0.0, cell_z as f32 * 14.0),
            up: Vector3::UP,
            scale: 6.0,
            yaw: 0.0,
            variant: 0,
            ore: 0,
            amount: 0,
        }
    }

    /// A tree takes more than a rock, and must not fall early.
    #[test]
    fn felling_a_tree_takes_every_stage() {
        let mut core: ScatterCore<Tree> = ScatterCore::new();
        core.insert(trunk(3, 3));
        let id = core.entries()[0].id;
        for hit in 1..Tree::STAGES {
            let out = core.apply_damage(id, 1).expect("tree should take the hit");
            assert!(!out.broken, "fell on hit {hit} of {}", Tree::STAGES);
            assert!(core.alive(id));
        }
        let out = core.apply_damage(id, 1).expect("final hit");
        assert!(out.broken, "did not fall on the last stage");
        assert!(!core.alive(id));
    }

    /// Trees and rocks share ScatterCore but must not share a drop table.
    #[test]
    fn a_felled_tree_drops_from_the_tree_table() {
        let wood: Vec<&str> = Tree::drop_table().iter().map(|d| d.ore).collect();
        let mut core: ScatterCore<Tree> = ScatterCore::new();
        for cell in 0..40 {
            core.insert(trunk(cell, cell * 3));
        }
        for e in core.entries() {
            let ore = Tree::drop_table()[e.ore as usize].ore;
            assert!(wood.contains(&ore), "{ore} is not a tree drop");
            assert!(e.amount >= 1, "{ore} dropped nothing");
        }
    }

    /// The whole point of the ledger, for the kind that regrows slowest.
    #[test]
    fn a_felled_tree_is_still_down_when_the_ground_comes_back() {
        let mut ledger = Ledger::new();
        let mut core: ScatterCore<Tree> = ScatterCore::new();
        core.insert(trunk(2, 9));
        core.insert(trunk(-5, 1));
        let id = core.entries()[0].id;
        core.apply_damage(id, Tree::STAGES);
        assert!(!core.alive(id));
        for (id, stage) in core.damage() {
            ledger.record(id, stage);
        }

        core.clear();
        core.insert(trunk(2, 9));
        core.insert(trunk(-5, 1));
        assert!(core.alive(id), "test rescatter did not actually reset it");
        core.restore(&ledger);
        assert!(!core.alive(id), "the tree stood back up");
        assert!(
            core.alive(core.entries()[1].id),
            "restoring felled an untouched tree"
        );
    }

    #[test]
    fn an_untouched_world_costs_nothing_to_save() {
        let ledger = Ledger::new();
        assert!(ledger.is_empty());
        assert!(ledger.to_flat().is_empty());
    }

    #[test]
    fn a_save_survives_a_round_trip() {
        let mut ledger = Ledger::new();
        for i in 0..50u64 {
            ledger.record(hash64(i) | 1, (i % 3) as u8 + 1);
        }
        let flat = ledger.to_flat();
        let back = Ledger::from_flat(&flat);
        assert_eq!(back.len(), ledger.len());
        assert_eq!(back.to_flat(), flat, "reloading changed the world");
    }

    /// Ids are 64 bit and a save file carries 32 bit words, so the split and
    /// rejoin has to survive the top half being set.
    #[test]
    fn a_high_id_survives_the_split() {
        let mut ledger = Ledger::new();
        let id = 0xdead_beef_0bad_f00d;
        ledger.record(id, 2);
        assert_eq!(Ledger::from_flat(&ledger.to_flat()).stage(id), 2);
    }

    #[test]
    fn a_truncated_save_loads_what_it_can() {
        let mut ledger = Ledger::new();
        ledger.record(11, 1);
        ledger.record(22, 2);
        let mut flat = ledger.to_flat();
        flat.pop();
        let back = Ledger::from_flat(&flat);
        assert_eq!(back.len(), 1, "a cut-off save should not invent an entry");
    }
}
