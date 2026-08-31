//! The empire types, from the schema rather than a copy of it.
//!
//! These were generated into this crate by a build script and committed, so an
//! ordinary build needed neither protoc nor the schemas -- and could not tell
//! when the two drifted. They come from `packages/proto` now.
//!
//! The `kbve::common` module the generated code used to need is gone: the
//! shared primitives live in `kbve.common.v1` and `kbve.type.v1` inside
//! kbve-proto, and cross-package references resolve there without this crate
//! mirroring the package path.

pub use kbve_proto::kbve::common::v1::Vec2I;
pub use kbve_proto::kbve::empire::v1 as empire;
pub use kbve_proto::kbve::r#type::v1::Ulid;
