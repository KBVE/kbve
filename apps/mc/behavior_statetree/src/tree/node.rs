//! Core behavior tree node trait and composite types.

use crate::types::{NpcCommand, NpcObservation};

/// Result of evaluating a behavior tree node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NodeStatus {
    /// Node completed successfully.
    Success,
    /// Node failed.
    Failure,
    /// Node is still running (will be re-evaluated next tick).
    Running,
}

/// A node in the behavior tree. Evaluated synchronously within the Tokio task.
pub trait BehaviorNode: Send + Sync {
    /// Evaluate this node given the NPC's current observation.
    /// Returns a status and any commands to emit.
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>);
}

/// Runs children in order until one succeeds (OR logic).
pub struct Selector {
    pub children: Vec<Box<dyn BehaviorNode>>,
}

impl BehaviorNode for Selector {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        for child in &self.children {
            let (status, commands) = child.evaluate(observation);
            if status != NodeStatus::Failure {
                return (status, commands);
            }
        }
        (NodeStatus::Failure, vec![])
    }
}

/// Runs children in order until one fails (AND logic).
pub struct Sequence {
    pub children: Vec<Box<dyn BehaviorNode>>,
}

impl BehaviorNode for Sequence {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        let mut all_commands = Vec::new();
        for child in &self.children {
            let (status, commands) = child.evaluate(observation);
            all_commands.extend(commands);
            if status != NodeStatus::Success {
                return (status, all_commands);
            }
        }
        (NodeStatus::Success, all_commands)
    }
}
