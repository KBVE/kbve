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
///
/// - `O` — observation (immutable snapshot the NPC sees)
/// - `A` — action / command the NPC wants to execute
///
/// The mutable [`BehaviorContext`] (tick counter + cooldowns) is passed
/// as a method parameter so the trait is object-safe without lifetime
/// parameters leaking into `Box<dyn BehaviorNode<O, A>>`.
pub trait BehaviorNode<O, A>: Send + Sync {
    /// Evaluate this node against `observation` using the per-tick
    /// `ctx`.
    ///
    /// # Returns
    ///
    /// A `(status, commands)` tuple:
    ///
    /// - [`NodeStatus::Success`] / [`Failure`](NodeStatus::Failure) /
    ///   [`Running`](NodeStatus::Running)
    /// - A list of game-specific actions the caller should enqueue.
    ///   May be empty even on success (e.g. a pure condition check).
    fn evaluate(&self, observation: &O, ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>);
}

/// Runs children in order until one succeeds (OR / fallback).
///
/// Returns the first non-[`Failure`](NodeStatus::Failure) child's
/// `(status, commands)`. If every child fails, returns
/// [`NodeStatus::Failure`] with no commands.
pub struct Selector<O, A> {
    /// Ordered child nodes. Higher-priority behaviors first.
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
///
/// Accumulates every child's emitted commands. Returns
/// [`NodeStatus::Success`] with the full command list if every child
/// succeeded. Returns the failing/running child's status with the
/// accumulated commands so far if any child returns
/// [`NodeStatus::Failure`] or [`NodeStatus::Running`].
pub struct Sequence<O, A> {
    /// Ordered child nodes. Each runs only if the previous succeeded.
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
