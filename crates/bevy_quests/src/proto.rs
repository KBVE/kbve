//! The quest types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.
//!
//! Extensions are the same open key/value a map object or an item carries, so
//! they are shared from `kbve.common.v1` rather than redeclared per domain.

pub use kbve_proto::kbve::common::v1::{Extension, extension};
pub use kbve_proto::kbve::quest::v1 as quest;
