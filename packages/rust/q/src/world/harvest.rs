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

/// What the player has done to the scatter, kept apart from the scatter itself.
///
/// A sliding world re-scatters ground the player walks back to, so damage
/// cannot live in the entries -- they are rebuilt. It survives because
/// [`stable_id`] is derived from position rather than from the order things
/// were generated in, so the same rock gets the same id every bake.
///
/// Only what changed is stored. An untouched world costs nothing.
#[derive(Clone, Debug, Default)]
pub struct Ledger {
    stages: HashMap<u64, u8>,
}

impl Ledger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.stages.len()
    }

    pub fn is_empty(&self) -> bool {
        self.stages.is_empty()
    }

    pub fn record(&mut self, id: u64, stage: u8) {
        if stage == 0 {
            self.stages.remove(&id);
        } else {
            // Damage never heals, so a stale lower stage must not overwrite.
            let at = self.stages.entry(id).or_insert(0);
            *at = (*at).max(stage);
        }
    }

    pub fn stage(&self, id: u64) -> u8 {
        *self.stages.get(&id).unwrap_or(&0)
    }

    /// Flat `id_lo, id_hi, stage` triples, for handing to a save file.
    pub fn to_flat(&self) -> Vec<u32> {
        let mut ids: Vec<(&u64, &u8)> = self.stages.iter().collect();
        // Sorted, so the same world saves byte for byte and two saves can be
        // compared at all.
        ids.sort_by_key(|(id, _)| **id);
        let mut out = Vec::with_capacity(ids.len() * 3);
        for (id, stage) in ids {
            out.push(*id as u32);
            out.push((*id >> 32) as u32);
            out.push(*stage as u32);
        }
        out
    }

    pub fn from_flat(flat: &[u32]) -> Self {
        let mut out = Self::new();
        for c in flat.chunks_exact(3) {
            let id = c[0] as u64 | ((c[1] as u64) << 32);
            out.record(id, c[2].min(255) as u8);
        }
        out
    }
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

    fn rock(x: f32, z: f32) -> Entry {
        Entry {
            id: stable_id(99, x, z),
            pos: Vector3::new(x, 0.0, z),
            up: Vector3::UP,
            scale: 1.0,
            yaw: 0.0,
            variant: 0,
            ore: 0,
            amount: 0,
        }
    }

    /// The property persistence rests on: a rock's identity comes from where it
    /// is, so re-scattering the same ground finds the same rock.
    #[test]
    fn identity_survives_a_rescatter() {
        let a = rock(12.5, -40.25);
        let b = rock(12.5, -40.25);
        assert_eq!(a.id, b.id);
        assert_ne!(a.id, rock(12.6, -40.25).id);
    }

    /// The reported need: mine a rock, walk away far enough that the ground is
    /// re-scattered, come back and it is still gone.
    #[test]
    fn a_mined_rock_is_still_gone_when_the_ground_comes_back() {
        let mut ledger = Ledger::new();
        let mut core: ScatterCore<Stone> = ScatterCore::new();
        core.insert(rock(5.0, 5.0));
        core.insert(rock(30.0, -12.0));
        let id = core.entries()[0].id;
        core.apply_damage(id, Stone::STAGES);
        assert!(!core.alive(id));

        for (id, stage) in core.damage() {
            ledger.record(id, stage);
        }
        // The player walked off; this ground is generated afresh.
        core.clear();
        core.insert(rock(5.0, 5.0));
        core.insert(rock(30.0, -12.0));
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
        core.insert(rock(1.0, 1.0));
        let id = core.entries()[0].id;
        core.apply_damage(id, 1);
        for (id, stage) in core.damage() {
            ledger.record(id, stage);
        }
        core.clear();
        core.insert(rock(1.0, 1.0));
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
