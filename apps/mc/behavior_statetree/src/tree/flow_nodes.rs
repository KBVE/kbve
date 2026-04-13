//! Flow-field-aware behavior tree leaf nodes.
//!
//! These nodes read the `FlowFieldHint` on the `NpcObservation` to make
//! terrain-aware movement decisions. When no flow field data is available
//! (Java hasn't sent map data yet, or the NPC is outside the grid), they
//! return `Failure` so the behavior tree falls through to the classic
//! blind `Wander` / `Flee` nodes.

use crate::types::{NpcCommand, NpcObservation};

use super::node::{BehaviorContext, BehaviorNode, NodeStatus};

/// Move toward the nearest player using the precomputed flow field.
///
/// Unlike the blind `Wander` which orbits at a fixed radius, this node
/// follows the BFS-optimal path around walls, water, and cliffs. Falls
/// through to `Failure` if no flow field data is available so the tree
/// can try classic movement as a fallback.
pub struct FlowApproach;

impl BehaviorNode for FlowApproach {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let Some(target) = observation.flow_hint.approach_target else {
            return (NodeStatus::Failure, vec![]);
        };

        (
            NodeStatus::Success,
            vec![NpcCommand::MoveTo { target, speed: 1.0 }],
        )
    }
}

/// Flee from all players using the precomputed flee flow field.
///
/// Unlike the blind `Flee` which runs in a straight line away from the
/// nearest hostile, this follows the flow field to find paths that
/// actually lead somewhere safe (around walls, through doors, etc.).
pub struct FlowFlee;

impl BehaviorNode for FlowFlee {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let Some(target) = observation.flow_hint.flee_target else {
            return (NodeStatus::Failure, vec![]);
        };

        (
            NodeStatus::Success,
            vec![NpcCommand::MoveTo { target, speed: 1.4 }],
        )
    }
}

/// Move toward the nearest detected chokepoint / flow gate.
///
/// Useful for ambush behavior — the skeleton moves to a strategically
/// important narrow passage and waits for players to come through.
/// Falls through if no gates are detected in the current grid.
pub struct PatrolGate;

impl BehaviorNode for PatrolGate {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let Some(gate_pos) = observation.flow_hint.nearest_gate else {
            return (NodeStatus::Failure, vec![]);
        };

        (
            NodeStatus::Success,
            vec![NpcCommand::MoveTo {
                target: gate_pos,
                speed: 1.0,
            }],
        )
    }
}

/// Condition node: check if the flow field data is available.
///
/// Succeeds if the NPC has a valid flow field hint (Java has sent map
/// data and the NPC is within the scanned region). Useful as a guard
/// before flow-aware nodes in a Sequence.
pub struct HasFlowField;

impl BehaviorNode for HasFlowField {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        if observation.flow_hint.approach_target.is_some() {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

/// Condition node: check if a player is within a certain BFS distance.
///
/// Uses the flow field distance (terrain-aware, not straight line).
/// Succeeds if the nearest player is within `max_distance` BFS steps.
pub struct PlayerWithinFlowDistance {
    pub max_distance: u32,
}

impl BehaviorNode for PlayerWithinFlowDistance {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        match observation.flow_hint.player_distance {
            Some(d) if d <= self.max_distance => (NodeStatus::Success, vec![]),
            _ => (NodeStatus::Failure, vec![]),
        }
    }
}

/// Condition node: check if there are chokepoints nearby.
///
/// Succeeds if at least `min_gates` flow gates are within patrol range.
/// Useful to gate whether the NPC should attempt tactical patrolling
/// or fall back to basic wandering in open terrain.
pub struct HasNearbyGates {
    pub min_gates: u32,
}

impl BehaviorNode for HasNearbyGates {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        if observation.flow_hint.gates_in_range >= self.min_gates {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}
