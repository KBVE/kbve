//! The NPC types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.
//!
//! Two things left the NPC package on the way in. Rarity is the same tier an
//! item or a spell has, so it comes from `kbve.common.v1`. Conversations are no
//! longer inlined: an NPC carries `dialogue_graph_refs` into
//! `kbve.dialogue.v1`, so several NPCs can share one conversation and a
//! conversation can outgrow the NPC that first used it. `bevy_dialogue` is
//! where those are resolved.

pub use kbve_proto::kbve::common::v1::Rarity;
pub use kbve_proto::kbve::npc::v1 as npc;
