//! The map types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.

pub use kbve_proto::kbve::map::v1 as map;
