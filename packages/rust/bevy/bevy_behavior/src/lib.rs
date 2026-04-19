//! # bevy_behavior
//!
//! Game-agnostic behavior tree engine. Provides the core `BehaviorNode` trait,
//! composite nodes (`Selector`, `Sequence`), a cooldown system, and observation
//! traits that let the same tree logic drive NPCs across Minecraft, Bevy
//! Isometric, Discord MUD, and Unity without game-specific coupling.
//!
//! ## Design
//!
//! The tree engine is generic over three associated types:
//!
//! - **Observation** (`O`) — immutable snapshot of what the NPC can see.
//!   Implement the [`Positioned`], [`Healthed`], and [`Aware`] traits on your
//!   observation type so built-in leaves can query position, health, and
//!   nearby entities without knowing the concrete struct.
//!
//! - **Action** (`A`) — a command the NPC wants to execute. Each game defines
//!   its own enum (`NpcCommand` in MC, `BattleAction` in Isometric, etc.).
//!
//! - **Context** (`C`) — mutable per-evaluation state (cooldowns, tick counter).
//!   The provided [`BehaviorContext`] covers the common case; games can extend
//!   it or substitute their own.
//!
//! ## Feature flags
//!
//! - **`bevy`** — adds `Resource`/`Component` derives and a future
//!   `BehaviorTreePlugin` for in-ECS evaluation. Without this flag the crate
//!   is pure Rust with zero framework dependency.

pub mod cooldown;
pub mod observation;
pub mod tree;

// Re-exports for convenience
pub use cooldown::{BehaviorContext, CooldownState, TickCooldown};
pub use observation::{Aware, EntitySnapshot, Healthed, Positioned, Ticked};
pub use tree::{BehaviorNode, NodeStatus, Selector, Sequence};
