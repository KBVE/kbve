use flexbuffers::{FlexbufferSerializer, Reader};
///  packages/rust/jedi/src/entity/hash.rs
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};

/// Computes a 64-bit hash value for any type that implements [`Hash`], using `FxHasher`.
///
/// This is a fast, non-cryptographic hash suitable for in-memory keys,
/// caching, or routing purposes where speed is prioritized over security.
///
/// # Examples
///
/// ```
/// use jedi::entity::hash::hash_key;
///
/// let id = hash_key(&"my-key");
/// println!("Hashed value: {}", id);
/// assert!(id > 0);
/// ```
///
/// # Note
/// This uses `rustc_hash::FxHasher`, which is deterministic and fast,
/// but **not suitable** for cryptographic use cases.
///
pub fn hash_key<T: Hash>(value: &T) -> u64 {
    let mut hasher = FxHasher::default();
    value.hash(&mut hasher);
    hasher.finish()
}

/// Serializes any Serde-compatible value into a Flexbuffers `Vec<u8>`.
///
/// This is useful for generating a compact, schema-less binary representation
/// of your data to be used in Redis, WebSocket messages, or protobuf payloads.
///
/// # Examples
///
/// ```
/// use jedi::entity::hash::encode_flex;
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct MyData {
///     user_id: u32,
///     message: String,
/// }
///
/// let data = MyData {
///     user_id: 42,
///     message: "Hello Jedi".into(),
/// };
///
/// let encoded = encode_flex(&data);
/// assert!(!encoded.is_empty());
/// ```
pub fn encode_flex<T: Serialize>(value: &T) -> Vec<u8> {
    let mut serializer = FlexbufferSerializer::new();
    value
        .serialize(&mut serializer)
        .expect("Flexbuffer serialization failed");
    serializer.take_buffer()
}

/// Deserializes a Flexbuffers byte slice back into a Serde-compatible value.
///
/// This reverses [`encode_flex`] by decoding a compact Flexbuffer representation
/// into the original Rust data structure.
///
/// # Examples
///
/// ```
/// use jedi::entity::hash::{encode_flex, decode_flex};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Debug, PartialEq, Serialize, Deserialize)]
/// struct MyData {
///     user_id: u32,
///     message: String,
/// }
///
/// let original = MyData {
///     user_id: 42,
///     message: "Hello Jedi".into(),
/// };
///
/// let bytes = encode_flex(&original);
/// let decoded: MyData = decode_flex(&bytes);
///
/// assert_eq!(original, decoded);
/// ```
pub fn decode_flex<T: for<'de> Deserialize<'de>>(bytes: &[u8]) -> T {
    let reader = Reader::get_root(bytes).expect("Invalid Flexbuffer payload");
    T::deserialize(reader).expect("Flexbuffer deserialization failed")
}

/// A utility wrapper for working with Flexbuffers-encoded payloads.
///
/// `HashPayload` wraps a `Vec<u8>` of encoded data and provides helpers for:
/// - Creating payloads from Serde-serializable values
/// - Decoding back to typed values
/// - Computing a fast `u64` hash
/// - Accessing the payload as bytes
/// - Consuming the payload into a `Vec<u8>`
///
/// This is ideal for compact, typed message payloads over Redis, WebSocket, or Protobuf.
///
/// # Examples
///
/// ```
/// use jedi::entity::hash::HashPayload;
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Serialize, Deserialize, Debug, PartialEq)]
/// struct MyData {
///     key: String,
///     value: u32,
/// }
///
/// let data = MyData {
///     key: "example".into(),
///     value: 42,
/// };
///
/// let payload = HashPayload::from(&data);
///
/// // Decode it back
/// let decoded: MyData = payload.decode();
/// assert_eq!(data, decoded);
///
/// // Hash the payload
/// let hash = payload.hash();
/// assert!(hash > 0);
///
/// // Clone slice before consuming the payload
/// let slice = payload.as_slice().to_vec();
/// let vec = payload.into_vec();
/// assert_eq!(slice, vec);
/// ```
pub struct HashPayload {
    pub bytes: Vec<u8>,
}

impl HashPayload {
    /// Creates a new `HashPayload` by encoding any Serde-compatible value into Flexbuffers.
    pub fn from<T: Serialize>(value: &T) -> Self {
        Self {
            bytes: encode_flex(value),
        }
    }

    /// Decodes the internal Flexbuffers bytes into a Serde-compatible Rust type.
    ///
    /// # Panics
    /// This will panic if the payload is invalid or doesn't match the target type.
    pub fn decode<T: for<'de> Deserialize<'de>>(&self) -> T {
        decode_flex(&self.bytes)
    }

    /// Computes a fast `u64` hash of the internal payload using [`FxHasher`].
    ///
    /// This is useful for deduplication, cache keys, or quick comparisons.
    pub fn hash(&self) -> u64 {
        hash_key(&self.bytes)
    }

    /// Returns a byte slice reference to the internal encoded payload.
    pub fn as_slice(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the wrapper and returns the inner byte vector.
    pub fn into_vec(self) -> Vec<u8> {
        self.bytes
    }
}
