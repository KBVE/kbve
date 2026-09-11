//! Opt-in `bevy_behavior` trees for Isometric creatures.
//!
//! Attach [`SharedBehaviorTree`] to a creature entity and `brain.rs`
//! will evaluate decisions through the shared `bevy_behavior` engine
//! on its async dispatch path instead of the local enum walker.
//!
//! The wraith type ships with [`build_wraith_tree`] as the first
//! demo. Other creatures continue using the enum-based
//! `BehaviorNode` in `generic/behavior.rs` until they're migrated
//! one at a time in future PRs.

use std::sync::Arc;

use bevy::prelude::Component;
use bevy_behavior::{BehaviorContext, BehaviorNode, NodeStatus, Selector};

use super::generic::behavior::CreatureIntent;
use super::observation::CreatureObservation;

/// Type alias for the shared-tree trait object. `Arc` lets the brain
/// dispatch clone a cheap handle into the async evaluation task
/// without needing the tree itself to be `Clone`.
pub type SharedTree = Arc<dyn BehaviorNode<CreatureObservation, CreatureIntent>>;

/// Attach this component to a creature entity to evaluate its decisions
/// through the shared `bevy_behavior` engine. Without it, the creature
/// keeps using the existing `BehaviorProfile` / local `BehaviorNode`
/// enum walker in `generic/behavior.rs`.
#[derive(Component, Clone)]
pub struct SharedBehaviorTree(pub SharedTree);

/// Flee from the player when they're within `trigger_distance`.
///
/// Uses `nearby_entities` from the observation's `Aware` impl — the
/// dispatch layer (future PR) will populate this with hostile player
/// snapshots captured on the main thread.
struct FleeWhenPlayerClose {
    trigger_distance: f64,
    speed: f32,
    anim: &'static str,
}

impl BehaviorNode<CreatureObservation, CreatureIntent> for FleeWhenPlayerClose {
    fn evaluate(
        &self,
        observation: &CreatureObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<CreatureIntent>) {
        use bevy_behavior::{Aware, Positioned, observation::dist_sq};

        let self_pos = observation.position();
        let nearest = observation
            .nearby_entities()
            .iter()
            .filter(|e| e.is_hostile)
            .min_by(|a, b| {
                dist_sq(&self_pos, &a.position)
                    .partial_cmp(&dist_sq(&self_pos, &b.position))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

        let Some(threat) = nearest else {
            return (NodeStatus::Failure, vec![]);
        };
        let dist = dist_sq(&self_pos, &threat.position).sqrt();
        if dist > self.trigger_distance {
            return (NodeStatus::Failure, vec![]);
        }

        // Unit vector away from the threat (y discarded — Isometric
        // creatures move on the surface plane).
        let dx = self_pos[0] - threat.position[0];
        let dz = self_pos[2] - threat.position[2];
        let norm = (dx * dx + dz * dz).sqrt().max(1e-3);
        let direction = bevy::prelude::Vec3::new((dx / norm) as f32, 0.0, (dz / norm) as f32);

        (
            NodeStatus::Success,
            vec![CreatureIntent::Flee {
                direction,
                speed: self.speed,
                anim_name: self.anim,
            }],
        )
    }
}

/// Demo tree for the wraith — the Isometric equivalent of MC's
/// "spooky but non-combat" archetype. Flees when any hostile closes
/// within 4 blocks; otherwise returns no intent (the existing enum
/// tree produces the normal wander-and-emote behavior).
pub fn build_wraith_tree() -> SharedTree {
    Arc::new(Selector {
        children: vec![Box::new(FleeWhenPlayerClose {
            trigger_distance: 4.0,
            speed: 2.5,
            anim: "wraith_flee",
        })],
    })
}
