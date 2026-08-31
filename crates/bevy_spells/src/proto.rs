//! The spell types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.
//!
//! A spell's school and rarity are no longer spell-local enums. A school is an
//! elemental affinity and a rarity tier is the same tier an item or an NPC
//! has, so both come from `kbve.common.v1` and are re-exported here beside the
//! spell types that use them.

pub use kbve_proto::kbve::common::v1::{Element, Rarity};
pub use kbve_proto::kbve::spell::v1 as spell;
