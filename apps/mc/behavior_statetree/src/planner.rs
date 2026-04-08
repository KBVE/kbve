//! NPC AI planner — evaluates behavior trees for each observation.
//!
//! This runs inside Tokio tasks. The planner receives an immutable
//! NpcObservation and returns an immutable NpcIntent. All world
//! mutation happens back on the Fabric server tick thread.

use crate::tree::builtin::{AttackNearest, Flee, IsHealthLow, Wander};
use crate::tree::node::{BehaviorNode, Selector, Sequence};
use crate::types::{NpcIntent, NpcObservation};

/// Evaluate the default NPC behavior tree and produce an intent.
///
/// The tree structure:
/// ```text
/// Selector
///   ├── Sequence [flee if low health]
///   │     ├── IsHealthLow(5.0)
///   │     └── Flee(16.0)
///   ├── AttackNearest(4.0)
///   └── Wander(8.0)
/// ```
pub async fn plan_npc(observation: NpcObservation) -> NpcIntent {
    let tree = build_default_tree();
    let (_status, commands) = tree.evaluate(&observation);

    NpcIntent {
        entity_id: observation.entity_id,
        epoch: observation.epoch,
        commands,
    }
}

/// Build the default behavior tree for NPCs.
fn build_default_tree() -> Selector {
    Selector {
        children: vec![
            // Priority 1: flee if health is low
            Box::new(Sequence {
                children: vec![
                    Box::new(IsHealthLow { threshold: 5.0 }),
                    Box::new(Flee {
                        flee_distance: 16.0,
                    }),
                ],
            }),
            // Priority 2: attack nearest hostile in range
            Box::new(AttackNearest { range: 4.0 }),
            // Priority 3: wander
            Box::new(Wander { radius: 8.0 }),
        ],
    }
}
