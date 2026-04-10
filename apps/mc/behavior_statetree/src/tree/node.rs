//! Core behavior tree node trait and composite types.
//!
//! Behavior nodes are evaluated against an observation **and** a mutable
//! `BehaviorContext` that lets them read/update per-NPC cooldowns and the
//! shared global cooldown. Putting policy state in Rust keeps the Java side
//! a dumb actuator that just executes whatever commands flow back.

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

/// Mutable per-evaluation context passed to every behavior node.
///
/// Carries the current tick (so nodes can compare against cooldowns) plus
/// borrows of the per-NPC and global cooldown state. Nodes are responsible
/// for both checking and updating these — there's no separate "commit"
/// step, so a node that decides to fire an ability MUST also bump the
/// cooldown.
pub struct BehaviorContext<'a> {
    pub current_tick: u64,
    pub per_npc: &'a mut dyn CooldownState,
    pub global: &'a mut dyn CooldownState,
}

/// Minimal interface that ECS cooldown components/resources expose to the
/// behavior tree. Keeps the tree decoupled from Bevy types so the tree can
/// be unit-tested without an `App`.
pub trait CooldownState {
    fn can_fire(&self, current_tick: u64) -> bool;
    fn mark_fired(&mut self, current_tick: u64);
}

/// A node in the behavior tree. Evaluated synchronously within the Tokio task.
pub trait BehaviorNode: Send + Sync {
    /// Evaluate this node given the NPC's current observation + context.
    /// Returns a status and any commands to emit.
    fn evaluate(
        &self,
        observation: &NpcObservation,
        ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>);
}

/// Runs children in order until one succeeds (OR logic).
pub struct Selector {
    pub children: Vec<Box<dyn BehaviorNode>>,
}

impl BehaviorNode for Selector {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        for child in &self.children {
            let (status, commands) = child.evaluate(observation, ctx);
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
    fn evaluate(
        &self,
        observation: &NpcObservation,
        ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let mut all_commands = Vec::new();
        for child in &self.children {
            let (status, commands) = child.evaluate(observation, ctx);
            all_commands.extend(commands);
            if status != NodeStatus::Success {
                return (status, all_commands);
            }
        }
        (NodeStatus::Success, all_commands)
    }
}
