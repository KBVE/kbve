//! # bevy_dungeon
//!
//! The dungeon crawl rules engine, with no presentation layer.
//!
//! Rooms, combat, quests, crafting and loot, driven by the shared proto
//! content registries (`bevy_npc`, `bevy_items`, `bevy_quests`, `bevy_mapdb`).
//! Players are identified by an opaque [`PlayerId`]; the crate never learns
//! whether a caller arrived over Discord, telnet, or anything else.
//!
//! Front ends own their own rendering and drive the same entry point:
//!
//! ```rust,ignore
//! let result = bevy_dungeon::logic::apply_action(&mut session, action, actor)?;
//! for line in &result.logs {
//!     // draw however this front end draws
//! }
//! ```

pub mod battle_bridge;
pub mod content;
pub mod logic;
pub mod pathfinding;
pub mod player;
pub mod proto_bridge;
pub mod session;
pub mod skills;
pub mod types;

pub use logic::{ActionResult, apply_action};
pub use player::PlayerId;
pub use session::start_solo;
pub use types::*;
