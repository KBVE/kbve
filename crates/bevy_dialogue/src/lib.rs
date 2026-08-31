//! # bevy_dialogue
//!
//! Conversation graphs for Bevy games, over `kbve.dialogue.v1`.
//!
//! A graph is a web rather than a tree: it has several entry points, each
//! guarded by a condition and ordered by priority, so the same NPC opens on a
//! different line depending on what the player has done. Graphs are addressed
//! by reference, so several NPCs can share one and a quest choice can drop the
//! player into the middle of one.
//!
//! This crate holds the registry and the rules -- which entry applies, which
//! choices are offered, where a node leads. It does not run a conversation:
//! that is the caller's loop, because what a line does on screen is a game's
//! own business.
//!
//! ```rust,ignore
//! let db = DialogueDb::from_json(include_str!("../data/dialogue.json"))?;
//! let graph = db.get("innkeeper-mara").unwrap();
//! let mut ctx = DialogueContext { level: 3, ..default() };
//! ctx.flags.insert("met_mara".into());
//!
//! if let Some(node) = entry_node(graph, &ctx) {
//!     for line in &node.texts { println!("{line}"); }
//!     for offered in choices(graph, node, &ctx) {
//!         println!("[{}] {}", offered.available, offered.choice.label);
//!     }
//! }
//! ```

mod context;
mod proto;
mod registry;

pub use context::DialogueContext;
pub use proto::*;
pub use registry::{
    DialogueDb, OfferedChoice, choice_key, choices, entry_node, next_node, node, node_key,
    node_open,
};

use bevy::prelude::*;

/// Registers [`DialogueDb`] and [`DialogueContext`] as resources.
///
/// Both start empty. Games populate the database at startup from a content
/// file and update the context as the player does things.
pub struct BevyDialoguePlugin;

impl Plugin for BevyDialoguePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<DialogueDb>()
            .init_resource::<DialogueContext>();
    }
}
