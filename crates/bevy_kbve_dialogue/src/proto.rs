//! The conversation types, re-exported under the names this crate uses.
//!
//! Everything comes from `packages/proto` via `kbve-proto`. Nothing is
//! generated here and there is no build script.

pub use kbve_proto::kbve::dialogue::v1 as dialogue;
pub use kbve_proto::kbve::dialogue::v1::{
    DialogueChoice, DialogueCondition, DialogueEffect, DialogueEffectKind, DialogueEntry,
    DialogueGraph, DialogueNode, DialogueNodeKind, DialogueRegistry, QuestCondition,
};

/// Re-exported so callers resolving `dialogue_graph_refs` need not depend on
/// kbve-proto directly: the refs are ULIDs and the database is keyed by their
/// textual form.
pub use kbve_proto::ulid_text;
