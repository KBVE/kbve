//! Core behavior tree trait and composite nodes.
//!
//! Everything here is generic over `O` (observation), `C` (context), and
//! `A` (action) so games can plug in their own types without touching this
//! crate.

mod builtin;

pub use builtin::*;

/// Result of evaluating a single behavior tree node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NodeStatus {
    /// The node completed its goal.
    Success,
    /// The node cannot achieve its goal right now.
    Failure,
    /// The node is mid-execution and should be re-evaluated next tick.
    Running,
}

/// A single node in a behavior tree.
///
/// Generic over:
/// - `O` — observation (immutable snapshot the NPC sees)
/// - `C` — context (mutable per-evaluation state: cooldowns, tick, etc.)
/// - `A` — action/command the NPC wants to execute
pub trait BehaviorNode<O, C, A>: Send + Sync {
    fn evaluate(&self, observation: &O, ctx: &mut C) -> (NodeStatus, Vec<A>);
}

/// Runs children in order until one succeeds (OR / fallback).
///
/// Returns the status + commands of the first child that doesn't fail.
/// If every child fails, the selector itself fails.
pub struct Selector<O, C, A> {
    pub children: Vec<Box<dyn BehaviorNode<O, C, A>>>,
}

impl<O, C, A> BehaviorNode<O, C, A> for Selector<O, C, A>
where
    O: Send + Sync,
    C: Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, ctx: &mut C) -> (NodeStatus, Vec<A>) {
        for child in &self.children {
            let (status, commands) = child.evaluate(observation, ctx);
            if status != NodeStatus::Failure {
                return (status, commands);
            }
        }
        (NodeStatus::Failure, vec![])
    }
}

/// Runs children in order until one fails (AND / sequence).
///
/// Accumulates commands from all successful children. Returns failure
/// (plus whatever was accumulated so far) as soon as one child fails.
pub struct Sequence<O, C, A> {
    pub children: Vec<Box<dyn BehaviorNode<O, C, A>>>,
}

impl<O, C, A> BehaviorNode<O, C, A> for Sequence<O, C, A>
where
    O: Send + Sync,
    C: Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, ctx: &mut C) -> (NodeStatus, Vec<A>) {
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
