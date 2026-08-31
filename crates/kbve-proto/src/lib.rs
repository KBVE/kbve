//! The generated prost output lives in `packages/proto/gen/rust`, which is
//! gitignored and written by `moon run protobuf:build`. Including it from
//! there rather than copying it in keeps a single generated tree for every
//! consumer; `include!` resolves the nested paths relative to `mod.rs`, so the
//! whole module tree comes along.
#![allow(clippy::all)]

include!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/proto/gen/rust/mod.rs"
));

pub use kbve::*;

/// A ULID in its textual form, which is how JSON carries one.
///
/// The generated `Ulid` holds sixteen bytes, and serde would otherwise write
/// them as an array of numbers -- unreadable, and not what any content file
/// contains. `Ulid` is declared to convert through this type, so JSON sees the
/// twenty-six characters and the wire still carries the bytes.
///
/// Anything that is not a valid ULID decodes to an empty value rather than
/// failing the whole document. A content file with one bad id should lose that
/// id, not the file.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct UlidText(String);

impl From<UlidText> for kbve::r#type::v1::Ulid {
    fn from(text: UlidText) -> Self {
        let value = ulid::Ulid::from_string(&text.0)
            .map(|u| u.to_bytes().to_vec())
            .unwrap_or_default();
        Self { value }
    }
}

impl From<kbve::r#type::v1::Ulid> for UlidText {
    fn from(id: kbve::r#type::v1::Ulid) -> Self {
        Self(ulid_text(Some(&id)).unwrap_or_default())
    }
}


/// A ULID's textual form, or `None` when there is not one to render.
///
/// The schema carries a ULID as its sixteen bytes rather than its twenty-six
/// characters, and says the textual encoding belongs at the edges. A registry
/// looked up by a string out of a content file is such an edge, and five of
/// them wanted the same four lines, so the conversion lives beside the type it
/// converts.
///
/// Anything that is not exactly sixteen bytes is not a ULID. It is dropped
/// rather than rendered into something no caller would ever search for.
pub fn ulid_text(id: Option<&kbve::r#type::v1::Ulid>) -> Option<String> {
    let bytes: [u8; 16] = id?.value.as_slice().try_into().ok()?;
    Some(ulid::Ulid::from_bytes(bytes).to_string())
}

/// The gRPC clients and servers, behind the `grpc` feature.
///
/// The tonic plugin writes these to a file per package and, with `no_include`,
/// leaves them unreferenced -- which is the point: an include! inside the
/// message file could not be switched off. The generated code names its
/// messages `super::RedisCommand`, and puts its client and server in nested
/// modules of their own, so `super` is the module holding the include -- which
/// is where the re-export of the package has to go.
///
/// Only the two schemas that declare a service appear here. Adding a service
/// to a schema means adding four lines below; nothing finds it automatically,
/// which is worth knowing before wondering where a new client went.
#[cfg(feature = "grpc")]
pub mod grpc {
    macro_rules! service {
        ($name:ident, $pkg:ident, $file:literal) => {
            pub mod $name {
                mod generated {
                    // Inside the include, `super` is this module rather than
                    // the one below: the generated code puts its client and
                    // server in modules of their own, so the re-export has to
                    // sit beside the include and not one level out.
                    pub use crate::kbve::$pkg::v1::*;
                    include!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../../packages/proto/gen/rust/",
                        $file
                    ));
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

/// Rewrites proto enum value names into their numbers, in place.
///
/// Canonical proto JSON writes an enum as its name -- `"WORLD_OBJECT_TYPE_LIGHT"`
/// -- and the generated Rust types hold an `i32` that serde will not accept a
/// string for. Content pipelines emit the canonical form, so the choice is
/// between teaching every loader to read it and asking authors to write
/// numbers. This is the first.
///
/// The rewrite is safe to run over a whole document because a value name
/// carries its enum's name as a prefix, which the linter enforces, so a name
/// that resolves belongs to exactly one enum. Strings that resolve to nothing
/// are left alone -- a ULID looks like an enum name to a regular expression
/// and like nothing at all to a resolver.
pub fn json_enum_names_to_numbers(
    value: &mut serde_json::Value,
    resolve: &dyn Fn(&str) -> Option<i32>,
) {
    match value {
        serde_json::Value::String(name) => {
            if let Some(number) = resolve(name) {
                *value = serde_json::Value::from(number);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                json_enum_names_to_numbers(item, resolve);
            }
        }
        serde_json::Value::Object(fields) => {
            for (_, field) in fields.iter_mut() {
                json_enum_names_to_numbers(field, resolve);
            }
        }
        _ => {}
    }
}

/// Builds a resolver for [`json_enum_names_to_numbers`] from a list of enums.
///
/// ```rust,ignore
/// let resolve = kbve_proto::enum_resolver!(map::WorldObjectType, map::ZoneType);
/// kbve_proto::json_enum_names_to_numbers(&mut value, &resolve);
/// ```
///
/// An enum left off the list is not silently ignored: its names stay strings,
/// and deserialising into an `i32` field then fails with the name in the error.
/// That is the intended failure -- loud, and naming the thing to add.
#[macro_export]
macro_rules! enum_resolver {
    ($($ty:ty),+ $(,)?) => {
        |name: &str| -> Option<i32> {
            $(
                if let Some(value) = <$ty>::from_str_name(name) {
                    return Some(value as i32);
                }
            )+
            None
        }
    };
}
