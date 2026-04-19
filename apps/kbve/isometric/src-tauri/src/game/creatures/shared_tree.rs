//! Opt-in `bevy_behavior` trees for Isometric creatures.
//!
//! Foundation layer — defines a `SharedBehaviorTree` component and a
//! demo tree for the wraith creature type. The existing enum-based
//! `BehaviorNode` in `generic/behavior.rs` continues running for every
//! other creature; this module gives future PRs a concrete shape to
//! migrate into without rewriting the full dispatch loop today.
//!
//! Next PR: extend `brain.rs` dispatch so that when an entity has
//! `SharedBehaviorTree`, its observation is built via
//! [`super::observation::CreatureObservation`] and evaluated against
//! the shared tree instead of the local enum walker.

use bevy::prelude::Component;
use bevy_behavior::{BehaviorContext, BehaviorNode, NodeStatus, Selector};

use super::generic::behavior::CreatureIntent;
use super::observation::CreatureObservation;

/// Attach this component to a creature entity to evaluate its decisions
/// through the shared `bevy_behavior` engine. Without it, the creature
/// keeps using the existing `BehaviorProfile` / local `BehaviorNode`
/// enum walker in `generic/behavior.rs`.
#[derive(Component)]
pub struct SharedBehaviorTree(pub Box<dyn BehaviorNode<CreatureObservation, CreatureIntent>>);

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
pub fn build_wraith_tree() -> Box<dyn BehaviorNode<CreatureObservation, CreatureIntent>> {
    Box::new(Selector {
        children: vec![Box::new(FleeWhenPlayerClose {
            trigger_distance: 4.0,
            speed: 2.5,
            anim: "wraith_flee",
        })],
    })
}
