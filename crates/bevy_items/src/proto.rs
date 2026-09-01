//! The item types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.
//!
//! Rarity, Element and EquipSlot left the item package on the way in. An item's
//! rarity is the same tier an NPC or a spell has and an element is the same
//! element, so they are shared from `kbve.common.v1` rather than redeclared per
//! domain.

pub use kbve_proto::kbve::common::v1::{Element, EquipSlot, Extension, ItemAmount, Rarity};
pub use kbve_proto::kbve::item::v1 as item;
