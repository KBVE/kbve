//! Core behavior tree trait and composite nodes.
//!
//! Generic over `O` (observation) and `A` (action). The context type
//! ([`BehaviorContext`]) is fixed as a method parameter — not a type
//! parameter — so trait objects (`Box<dyn BehaviorNode<O, A>>`) work
//! without lifetime gymnastics.

mod builtin;

pub use builtin::*;

use crate::cooldown::BehaviorContext;

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
/// - `A` — action/command the NPC wants to execute
///
/// The mutable [`BehaviorContext`] (tick counter + cooldowns) is passed
/// as a method parameter so the trait is object-safe without lifetime
/// parameters leaking into `Box<dyn BehaviorNode<O, A>>`.
pub trait BehaviorNode<O, A>: Send + Sync {
    fn evaluate(&self, observation: &O, ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>);
}

/// Runs children in order until one succeeds (OR / fallback).
pub struct Selector<O, A> {
    pub children: Vec<Box<dyn BehaviorNode<O, A>>>,
}

impl<O, A> BehaviorNode<O, A> for Selector<O, A>
where
    O: Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
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
pub struct Sequence<O, A> {
    pub children: Vec<Box<dyn BehaviorNode<O, A>>>,
}

impl<O, A> BehaviorNode<O, A> for Sequence<O, A>
where
    O: Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
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
