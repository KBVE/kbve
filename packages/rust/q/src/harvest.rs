//! Harvestable world objects, engine-agnostic half.
//!
//! Lives outside `world` for the same reason [`crate::worldgen`] does: the
//! dedicated server owns what the player has mined and felled, and it has no
//! Godot to own it with. Identity, the drop tables and the ledger are pure;
//! only the scatter itself, which needs positions, stays engine-side.

use std::collections::HashMap;

pub fn hash64(mut x: u64) -> u64 {
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ceb9fe1a85ec53);
    x ^= x >> 33;
    x
}

/// Identity for one scattered instance: its global cell, plus which instance of
/// that cell it is.
///
/// Integer in, integer out. An earlier version quantized world position, which
/// tied identity to float reproducibility -- a last-ULP difference near a
/// quantization boundary renamed a rock, and one renamed rock is a client and
/// server disagreeing about what the player just mined.
pub fn stable_id(seed: u64, cell_x: i32, cell_z: i32, ordinal: u32) -> u64 {
    let cx = cell_x as u32 as u64;
    let cz = cell_z as u32 as u64;
    hash64(
        seed ^ cx.wrapping_mul(0x9e3779b97f4a7c15)
            ^ cz.rotate_left(32)
            ^ (ordinal as u64).wrapping_mul(0xc2b2ae3d27d4eb4f),
    )
}

/// Which scatter a harvest refers to.
///
/// The wire carries this rather than a resolved id so the host can recompute
/// the id itself; a client that could name an id could name any id.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum HarvestTarget {
    Stone,
    Tree,
}

impl HarvestTarget {
    pub fn stages(self) -> u8 {
        match self {
            HarvestTarget::Stone => Stone::STAGES,
            HarvestTarget::Tree => Tree::STAGES,
        }
    }

    pub fn drop_table(self) -> &'static [DropEntry] {
        match self {
            HarvestTarget::Stone => Stone::drop_table(),
            HarvestTarget::Tree => Tree::drop_table(),
        }
    }

    /// What this object yields, by id.
    ///
    /// Here rather than only on the scatter because the host has no scatter and
    /// still has to name what it is paying out. Being a pure function of the id
    /// is what makes that possible: the same rock rolls the same ore on a client
    /// that can see it and on a server that never generated it.
    pub fn roll_drop(self, id: u64) -> (u8, u8) {
        roll_drop(self.drop_table(), id)
    }
}

/// Salt keeping the ore roll clear of every other use of an object's id.
pub const ORE_SALT: u64 = 0x00e5_eed0_0e5e_ed00;

/// Picks a drop out of `table` for `id`, as an index into it and a count.
///
/// One implementation for both sides. Two would be two things to keep in step,
/// and the failure would be a server paying out an ore the client never showed
/// breaking out of the rock.
pub fn roll_drop(table: &'static [DropEntry], id: u64) -> (u8, u8) {
    let total: u32 = table.iter().map(|d| d.weight).sum();
    if total == 0 {
        return (0, 1);
    }
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
                ore: "copper-ore",
                weight: 12,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "iron-ore",
                weight: 8,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "crystal-ore",
                weight: 5,
                min: 1,
                max: 1,
            },
        ]
    }
}

pub struct Tree;

impl HarvestKind for Tree {
    /// One more than a rock: felling should read as work, and the extra stage
    /// gives the lean-and-fall animation somewhere to live.
    const STAGES: u8 = 4;

    fn drop_table() -> &'static [DropEntry] {
        &[
            DropEntry {
                ore: "log",
                weight: 62,
                min: 1,
                max: 3,
            },
            DropEntry {
                ore: "bark",
                weight: 20,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "resin",
                weight: 12,
                min: 1,
                max: 2,
            },
            DropEntry {
                ore: "sapling",
                weight: 6,
                min: 1,
                max: 1,
            },
        ]
    }
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
/// [`stable_id`] is derived from the global cell rather than from the order
/// things were generated in, so the same rock gets the same id every bake
/// wherever the window happens to sit.
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

    /// Folds another ledger in, taking the worse damage for anything in both.
    ///
    /// This is what makes the ledger safe to replicate: damage only ever
    /// increases, so merging is order-independent and two clients that saw the
    /// same events in a different order still agree. A server merging a late
    /// client's report cannot be talked into repairing a rock.
    pub fn merge(&mut self, other: &Ledger) {
        for (id, stage) in &other.stages {
            self.record(*id, *stage);
        }
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

#[cfg(test)]
mod merge_tests {
    use super::*;

    /// Two clients mining different rocks must end up agreeing on both.
    #[test]
    fn merging_keeps_everybody_s_damage() {
        let mut host = Ledger::new();
        host.record(1, 3);
        let mut guest = Ledger::new();
        guest.record(2, 3);
        host.merge(&guest);
        assert_eq!(host.stage(1), 3);
        assert_eq!(host.stage(2), 3);
    }

    /// Order must not matter, or two servers replaying the same events disagree.
    #[test]
    fn merging_is_order_independent() {
        let mut a = Ledger::new();
        a.record(5, 1);
        let mut b = Ledger::new();
        b.record(5, 3);
        let mut forward = a.clone();
        forward.merge(&b);
        let mut backward = b.clone();
        backward.merge(&a);
        assert_eq!(forward.to_flat(), backward.to_flat());
        assert_eq!(forward.stage(5), 3);
    }

    /// A client reporting less damage than the server already has must not be
    /// able to bring a mined rock back.
    #[test]
    fn a_late_report_cannot_repair_a_rock() {
        let mut server = Ledger::new();
        server.record(9, 3);
        let mut stale = Ledger::new();
        stale.record(9, 1);
        server.merge(&stale);
        assert_eq!(server.stage(9), 3);
    }

    #[test]
    fn merging_nothing_changes_nothing() {
        let mut a = Ledger::new();
        a.record(4, 2);
        let before = a.to_flat();
        a.merge(&Ledger::new());
        assert_eq!(a.to_flat(), before);
    }

    /// Every drop names an item that exists.
    ///
    /// Nothing resolves these at runtime yet, so a wrong ref is silent until an
    /// inventory tries to award it and finds nothing. Reads the generated itemdb
    /// rather than a copy, and skips rather than fails if it is not there, so a
    /// checkout without codegen still tests everything else.
    #[test]
    fn drop_tables_name_real_items() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../data/codegen/generated/itemdb.json"
        );
        let Ok(raw) = std::fs::read_to_string(path) else {
            return;
        };
        let doc: serde_json::Value = serde_json::from_str(&raw).expect("itemdb.json parses");
        let refs: std::collections::HashSet<&str> = doc["items"]
            .as_array()
            .expect("itemdb.json has an items array")
            .iter()
            .filter_map(|i| i["ref"].as_str())
            .collect();
        assert!(!refs.is_empty(), "itemdb.json yielded no refs");
        let mut missing: Vec<&str> = Stone::drop_table()
            .iter()
            .chain(Tree::drop_table())
            .map(|d| d.ore)
            .filter(|r| !refs.contains(r))
            .collect();
        missing.sort_unstable();
        assert!(missing.is_empty(), "drops name no such item: {missing:?}");
    }
}
