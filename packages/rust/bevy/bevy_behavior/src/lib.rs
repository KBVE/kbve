//! # bevy_behavior
//!
//! Game-agnostic behavior tree engine. Provides the core
//! [`BehaviorNode`] trait, composite nodes ([`Selector`], [`Sequence`]),
//! a tick-based cooldown system, and observation traits that let the
//! same tree logic drive NPCs across Minecraft, Bevy Isometric, Discord
//! MUD, and Unity without game-specific coupling.
//!
//! ## Design
//!
//! The tree is generic over two type parameters and one fixed runtime
//! context type:
//!
//! - **Observation** (`O`) — immutable snapshot of what the NPC can see.
//!   Implement [`Positioned`], [`Healthed`], [`Aware`], and [`Ticked`]
//!   on your snapshot type so built-in leaves can query the NPC's
//!   world without knowing the concrete struct.
//! - **Action** (`A`) — a command the NPC wants to execute. Each game
//!   defines its own enum (`NpcCommand` in MC, `BattleAction` in
//!   Isometric, etc.).
//! - **Context** ([`BehaviorContext`]) — mutable per-evaluation state
//!   (current tick, per-NPC + global cooldown handles). Passed as a
//!   method parameter so the trait stays object-safe.
//!
//! ## Example
//!
//! ```rust,ignore
//! use bevy_behavior::{BehaviorNode, IsHealthLow, Flee, Selector, BehaviorContext};
//!
//! enum BattleAction {
//!     MoveTo { target: [f64; 3], speed: f64 },
//!     Attack { entity_id: u64 },
//! }
//!
//! let tree: Box<dyn BehaviorNode<MyObservation, BattleAction>> =
//!     Box::new(Selector {
//!         children: vec![
//!             Box::new(Flee {
//!                 flee_distance: 8.0,
//!                 make_move: |target, speed| BattleAction::MoveTo { target, speed },
//!             }),
//!             // ... more leaves
//!         ],
//!     });
//!
//! let (status, actions) = tree.evaluate(&observation, &mut ctx);
//! ```
//!
//! ## Feature flags
//!
//! - **`bevy`** — adds Bevy `Resource` / `Component` derives and a
//!   future `BehaviorTreePlugin` for in-ECS evaluation. Without this
//!   flag the crate is pure Rust with zero framework dependency.

pub mod cooldown;
pub mod observation;
pub mod tree;

pub use cooldown::{BehaviorContext, CooldownState, TickCooldown};
pub use observation::{Aware, EntitySnapshot, Healthed, Positioned, Ticked};
pub use tree::{BehaviorNode, NodeStatus, Selector, Sequence};
