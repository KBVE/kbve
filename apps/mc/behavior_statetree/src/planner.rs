//! NPC AI planner — evaluates behavior trees for each observation.
//!
//! This runs inside Tokio tasks. The planner receives an immutable
//! NpcObservation and returns an immutable NpcIntent. All world
//! mutation happens back on the Fabric server tick thread.

use crate::tree::builtin::{AttackNearest, CallAllies, Flee, IsHealthLow, Wander};
use crate::tree::node::{BehaviorNode, Selector, Sequence};
use crate::types::{NpcIntent, NpcObservation};

/// Evaluate the default NPC behavior tree and produce an intent.
///
/// The tree structure:
/// ```text
/// Selector
///   ├── Sequence [flee if critically low health]
///   │     ├── IsHealthLow(5.0)
///   │     └── Flee(16.0)
///   ├── Sequence [call for help if wounded]
///   │     ├── IsHealthLow(12.0)
///   │     └── CallAllies(12.0, 2)
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
            // Priority 1: flee if health is critically low
            Box::new(Sequence {
                children: vec![
                    Box::new(IsHealthLow { threshold: 5.0 }),
                    Box::new(Flee {
                        flee_distance: 16.0,
                    }),
                ],
            }),
            // Priority 2: call for help if wounded (< 12 HP but > 5)
            Box::new(Sequence {
                children: vec![
                    Box::new(IsHealthLow { threshold: 12.0 }),
                    Box::new(CallAllies {
                        health_threshold: 12.0,
                        reinforcement_count: 2,
                    }),
                ],
            }),
            // Priority 3: attack nearest hostile in range
            Box::new(AttackNearest { range: 4.0 }),
            // Priority 4: wander
            Box::new(Wander { radius: 8.0 }),
        ],
    }
}
