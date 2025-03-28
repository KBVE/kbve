// packages/rust/jedi/src/entity/envelope.rs
use crate::proto::jedi::{ FlexEnvelope, MessageKind };
use crate::entity::hash::HashPayload;
use crate::error::JediError;
use serde::{ Serialize, Deserialize };

/// Wraps a serializable Rust value into a `FlexEnvelope` using Flexbuffers encoding.
///
/// This is typically used to prepare a value for transport (e.g. Redis, WebSocket, gRPC).
///
/// # Examples
/// ```
/// use jedi::entity::envelope::wrap_flex;
/// use jedi::proto::jedi::{FlexEnvelope, MessageKind};
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct MyData {
///     user: String,
///     count: u32,
/// }
///
/// let data = MyData {
///     user: "luke".into(),
///     count: 3,
/// };
///
/// let envelope: FlexEnvelope = wrap_flex(MessageKind::Action, &data);
/// assert_eq!(envelope.kind, MessageKind::Action as i32);
/// assert!(!envelope.payload.is_empty());
/// ```
pub fn wrap_flex<T: Serialize>(kind: MessageKind, value: &T) -> FlexEnvelope {
  let payload = HashPayload::from(value).into_vec();
  FlexEnvelope {
    kind: kind as i32,
    payload,
  }
}

/// Unwraps a `FlexEnvelope` and decodes the payload into a typed value.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::{wrap_flex, unwrap_flex};
/// use jedi::proto::jedi::{FlexEnvelope, MessageKind};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Serialize, Deserialize, Debug, PartialEq)]
/// struct MyData {
///     user: String,
///     count: u32,
/// }
///
/// let original = MyData {
///     user: "leia".into(),
///     count: 5,
/// };
///
/// let envelope: FlexEnvelope = wrap_flex(MessageKind::Message, &original);
/// let decoded: MyData = unwrap_flex(&envelope);
/// assert_eq!(original, decoded);
/// ```
pub fn unwrap_flex<T: for<'de> Deserialize<'de>>(envelope: &FlexEnvelope) -> T {
  (HashPayload { bytes: envelope.payload.clone() }).decode()
}

/// Attempts to decode a `FlexEnvelope` payload into a typed value.
///
/// Returns a `JediError::Internal` if deserialization fails.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::{wrap_flex, try_unwrap_flex};
/// use jedi::proto::jedi::{FlexEnvelope, MessageKind};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Serialize, Deserialize, Debug, PartialEq)]
/// struct MyData {
///     user: String,
///     level: u8,
/// }
///
/// let original = MyData {
///     user: "vader".into(),
///     level: 99,
/// };
///
/// let envelope: FlexEnvelope = wrap_flex(MessageKind::Debug, &original);
/// let result = try_unwrap_flex::<MyData>(&envelope);
/// assert!(result.is_ok());
/// assert_eq!(result.unwrap(), original);
/// ```
pub fn try_unwrap_flex<T: for<'de> Deserialize<'de>>(
  envelope: &FlexEnvelope
) -> Result<T, JediError> {
  let reader = flexbuffers::Reader
    ::get_root(&*envelope.payload)
    .map_err(|e| JediError::Internal(format!("Flexbuffers root error: {}", e).into()))?;
  let result = T::deserialize(reader).map_err(|e|
    JediError::Internal(format!("Flexbuffers decode error: {}", e).into())
  )?;
  Ok(result)
}

/// Converts a `Result<T, E>` into a `FlexEnvelope`.
///
/// On success, wraps `T` with the provided kind.
/// On error, wraps the error message under `MessageKind::Error`.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::wrap_result_flex;
/// use jedi::proto::jedi::MessageKind;
///
/// let ok_result: Result<&str, &str> = Ok("success");
/// let err_result: Result<&str, &str> = Err("failure");
///
/// let ok_env = wrap_result_flex(MessageKind::Debug, ok_result);
/// let err_env = wrap_result_flex(MessageKind::Debug, err_result);
///
/// assert_eq!(ok_env.kind, MessageKind::Debug as i32);
/// assert_eq!(err_env.kind, MessageKind::Error as i32);
/// ```
pub fn wrap_result_flex<T, E>(kind: MessageKind, result: Result<T, E>) -> FlexEnvelope
  where T: Serialize, E: std::fmt::Display
{
  match result {
    Ok(value) => wrap_flex(kind, &value),
    Err(err) => {
      let err_msg = format!("{}", err);
      wrap_flex(MessageKind::Error, &err_msg)
    }
  }
}



/// Trait to simplify wrapping a value into a `FlexEnvelope`.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::ToFlexEnvelope;
/// use jedi::proto::jedi::MessageKind;
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct Payload {
///     kind: String,
/// }
///
/// let p = Payload { kind: "cool".into() };
/// let envelope = p.to_flex_envelope(MessageKind::Debug);
/// ```
pub trait ToFlexEnvelope {
    fn to_flex_envelope(&self, kind: MessageKind) -> FlexEnvelope;
}

impl<T: Serialize> ToFlexEnvelope for T {
    fn to_flex_envelope(&self, kind: MessageKind) -> FlexEnvelope {
        wrap_flex(kind, self)
    }
}