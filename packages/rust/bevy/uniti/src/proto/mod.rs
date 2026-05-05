//! Generated proto types — populated by `prost-build` in `build.rs` from
//! `packages/data/proto/empire/empire.proto`. Each `.proto` package
//! becomes a `<package>.rs` file we re-export here so callers can write
//! `use crate::proto::empire::EmpireSnapshot;` instead of including
//! the file path directly. The nested `kbve::common` matches the proto
//! package path so prost-generated cross-message references resolve.

pub mod empire {
    include!("empire.rs");
}

pub mod kbve {
    pub mod common {
        include!("kbve.common.rs");
    }
}
