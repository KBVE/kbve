//! Compiles the generated Rust.
//!
//! Nothing depends on this crate; it exists so a schema that generates but
//! does not compile fails here rather than in a Bevy crate downstream.
#![allow(clippy::all)]

include!("../../../gen/rust/mod.rs");

/// Mirror of kbve-proto's helper.
///
/// The generated `Ulid` names `crate::UlidText`, so whichever crate includes
/// the tree has to provide one. Kept minimal here: this crate exists to prove
/// the output compiles, not to be used.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct UlidText(String);

impl From<UlidText> for kbve::r#type::v1::Ulid {
    fn from(_: UlidText) -> Self {
        Self::default()
    }
}

impl From<kbve::r#type::v1::Ulid> for UlidText {
    fn from(_: kbve::r#type::v1::Ulid) -> Self {
        Self(String::new())
    }
}

/// The service code, which nothing else includes.
///
/// The tonic plugin runs with `no_include`, so the generated clients and
/// servers are referenced only by kbve-proto's `grpc` feature. That is a
/// feature, so an ordinary build never compiles them -- and generated code
/// nothing compiles is generated code nobody checks. This mirrors what
/// kbve-proto does, unconditionally, so a service that generates code no
/// toolchain will accept still fails here.
///
/// Kept in step by hand: a new service in the schemas needs a line here and a
/// line in kbve-proto. If the two ever disagree, this is the one that catches
/// it first.
pub mod grpc {
    macro_rules! service {
        ($name:ident, $pkg:ident, $file:literal) => {
            pub mod $name {
                mod generated {
                    pub use crate::kbve::$pkg::v1::*;
                    include!(concat!("../../../gen/rust/", $file));
                }
                pub use generated::*;
            }
        };
    }

    service!(redis, redis, "kbve/redis/v1/kbve.redis.v1.tonic.rs");
    service!(
        clickhouse,
        clickhouse,
        "kbve/clickhouse/v1/kbve.clickhouse.v1.tonic.rs"
    );
}
