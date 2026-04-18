//! Behavior tree nodes — MC-specific extensions.
//!
//! The generic tree engine (BehaviorNode trait, Selector, Sequence, cooldowns,
//! built-in leaves) lives in `bevy_behavior`. This module holds Minecraft-
//! specific leaf nodes that depend on `NpcObservation` fields like `flow_hint`
//! and MC-specific `NpcCommand` variants.
//!
//! `builtin.rs` contains MC-hardcoded leaves (Wander, Flee, etc.) that
//! implement `bevy_behavior::BehaviorNode<NpcObservation, BehaviorContext, NpcCommand>`.
//! A future PR can migrate these to the closure-driven versions in bevy_behavior.

pub mod archetype_nodes;
pub mod builtin;
pub mod flow_nodes;
