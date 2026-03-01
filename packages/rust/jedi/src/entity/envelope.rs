// packages/rust/jedi/src/entity/envelope.rs
use crate::entity::hash::HashPayload;
use crate::error::JediError;
use crate::proto::jedi::{
    FlagEnvelope, FlexEnvelope, JediEnvelope, JediMessage, MessageKind, PayloadFormat, RawEnvelope,
    jedi_message,
};
use crate::state::temple::TempleState;
use crate::watchmaster::{ConnId, WatchManager};
use async_trait::async_trait;
use axum::extract::ws::{Message, Utf8Bytes};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::convert::TryFrom;
use std::sync::Arc;
use tokio::sync::oneshot;

use super::flex::serialize_to_flex_bytes;
use super::pipe_redis::KeyValueInput;

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
    let payload = Bytes::from(HashPayload::from(value).into_vec());
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
    let reader =
        flexbuffers::Reader::get_root(&*envelope.payload).expect("Invalid Flexbuffers root");
    T::deserialize(reader).expect("Flexbuffers deserialization failed")
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
    envelope: &FlexEnvelope,
) -> Result<T, JediError> {
    let reader = flexbuffers::Reader::get_root(&*envelope.payload)
        .map_err(|e| JediError::Internal(format!("Flexbuffers root error: {}", e).into()))?;
    let result = T::deserialize(reader)
        .map_err(|e| JediError::Internal(format!("Flexbuffers decode error: {}", e).into()))?;
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
where
    T: Serialize,
    E: std::fmt::Display,
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

/// Wraps a serializable payload into a `FlagEnvelope`, tagging it with an integer flag.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::wrap_flag;
/// use jedi::proto::jedi::FlagEnvelope;
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct FlagPayload {
///     feature: String,
/// }
///
/// let data = FlagPayload { feature: "fast-path".into() };
/// let env: FlagEnvelope = wrap_flag(7, &data);
/// assert_eq!(env.flag, 7);
/// assert!(!env.payload.is_empty());
/// ```
pub fn wrap_flag<T: Serialize>(flag: i32, value: &T) -> FlagEnvelope {
    let payload = Bytes::from(HashPayload::from(value).into_vec());
    FlagEnvelope { flag, payload }
}

/// Attempts to decode a `FlagEnvelope` into a typed value.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::{wrap_flag, try_unwrap_flag};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Serialize, Deserialize, PartialEq, Debug)]
/// struct FlagPayload {
///     message: String,
/// }
///
/// let original = FlagPayload { message: "flag!".into() };
/// let env = wrap_flag(1, &original);
/// let decoded: FlagPayload = try_unwrap_flag(&env).unwrap();
/// assert_eq!(original, decoded);
/// ```
pub fn try_unwrap_flag<T: for<'de> Deserialize<'de>>(
    envelope: &FlagEnvelope,
) -> Result<T, JediError> {
    let reader = flexbuffers::Reader::get_root(&*envelope.payload)
        .map_err(|e| JediError::Internal(format!("Flexbuffers root error: {}", e).into()))?;
    let result = T::deserialize(reader)
        .map_err(|e| JediError::Internal(format!("Flexbuffers decode error: {}", e).into()))?;
    Ok(result)
}

/// Wraps a serializable payload into a `RawEnvelope` with a custom byte key.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::wrap_raw;
/// use serde::Serialize;
///
/// #[derive(Serialize)]
/// struct MyData {
///     val: u64,
/// }
///
/// let data = MyData { val: 123 };
/// let env = wrap_raw(b"my:key", &data);
/// assert_eq!(env.key, b"my:key");
/// assert!(!env.payload.is_empty());
/// ```
pub fn wrap_raw<T: Serialize>(key: &[u8], value: &T) -> RawEnvelope {
    let payload = Bytes::from(HashPayload::from(value).into_vec());
    let key = Bytes::from(key.to_vec());
    RawEnvelope { key, payload }
}

/// Attempts to decode a `RawEnvelope` payload into a typed value.
///
/// # Examples
/// ```
/// use jedi::entity::envelope::{wrap_raw, try_unwrap_raw};
/// use serde::{Serialize, Deserialize};
///
/// #[derive(Serialize, Deserialize, PartialEq, Debug)]
/// struct MyData {
///     val: i32,
/// }
///
/// let original = MyData { val: 9 };
/// let env = wrap_raw(b"key123", &original);
/// let decoded: MyData = try_unwrap_raw(&env).unwrap();
/// assert_eq!(original, decoded);
/// ```
pub fn try_unwrap_raw<T: for<'de> Deserialize<'de>>(
    envelope: &RawEnvelope,
) -> Result<T, JediError> {
    let reader = flexbuffers::Reader::get_root(&*envelope.payload)
        .map_err(|e| JediError::Internal(format!("Flexbuffers root error: {}", e).into()))?;
    let result = T::deserialize(reader)
        .map_err(|e| JediError::Internal(format!("Flexbuffers decode error: {}", e).into()))?;
    Ok(result)
}

/// Wraps a `FlexEnvelope` into a `JediMessage`.
pub fn from_flex(env: FlexEnvelope) -> JediMessage {
    JediMessage {
        envelope: Some(jedi_message::Envelope::Flex(env)),
    }
}

/// Wraps a `FlagEnvelope` into a `JediMessage`.
pub fn from_flag(env: FlagEnvelope) -> JediMessage {
    JediMessage {
        envelope: Some(jedi_message::Envelope::Flag(env)),
    }
}

/// Wraps a `RawEnvelope` into a `JediMessage`.
pub fn from_raw(env: RawEnvelope) -> JediMessage {
    JediMessage {
        envelope: Some(jedi_message::Envelope::Raw(env)),
    }
}

impl From<FlexEnvelope> for JediMessage {
    fn from(env: FlexEnvelope) -> Self {
        JediMessage {
            envelope: Some(jedi_message::Envelope::Flex(env)),
        }
    }
}

impl From<FlagEnvelope> for JediMessage {
    fn from(env: FlagEnvelope) -> Self {
        JediMessage {
            envelope: Some(jedi_message::Envelope::Flag(env)),
        }
    }
}

impl From<RawEnvelope> for JediMessage {
    fn from(env: RawEnvelope) -> Self {
        JediMessage {
            envelope: Some(jedi_message::Envelope::Raw(env)),
        }
    }
}

// * Hybrid Envelopes
pub fn wrap_hybrid<T, K>(
    kind: K,
    format: PayloadFormat,
    value: &T,
    metadata: Option<Bytes>,
) -> JediEnvelope
where
    T: Serialize,
    K: Into<i32>,
{
    let vec = (match format {
        PayloadFormat::Json => serde_json::to_vec(value).map_err(|e| {
            JediError::Internal(Cow::Owned(format!("JSON serialization error: {}", e)))
        }),
        PayloadFormat::Flex => Ok(HashPayload::from(value).into_vec()),
        _ => Err(JediError::Internal("Unsupported format".into())),
    })
    .expect("Serialization failed");

    JediEnvelope {
        version: 1,
        kind: kind.into(),
        format: format as i32,
        payload: Bytes::from(vec),
        metadata: metadata.unwrap_or_default(),
    }
}

pub fn from_hybrid(env: JediEnvelope) -> JediMessage {
    JediMessage {
        envelope: Some(jedi_message::Envelope::Hybrid(env)),
    }
}

impl From<JediEnvelope> for JediMessage {
    fn from(env: JediEnvelope) -> Self {
        from_hybrid(env)
    }
}

/// Core Functions
impl JediEnvelope {
    pub fn with_metadata(mut self, meta: Bytes) -> Self {
        self.metadata = meta;
        self
    }

    pub fn metadata_or_empty(&self) -> Bytes {
        self.metadata.clone()
    }

    pub fn error(source: &str, message: &str) -> Self {
        let err_obj = serde_json::json!({
          "error": message,
          "source": source,
        });

        // Default to Flex with MessageKind::Error, keep metadata empty
        wrap_hybrid(MessageKind::Error, PayloadFormat::Flex, &err_obj, None)
    }

    pub fn error_with_meta(
        source: &str,
        message: &str,
        metadata: Bytes,
        format: PayloadFormat,
    ) -> Self {
        let err_obj = serde_json::json!({
          "error": message,
          "source": source,
        });

        wrap_hybrid(MessageKind::Error, format, &err_obj, Some(metadata))
    }

    pub fn to_ws_message(&self) -> Result<Message, JediError> {
        let format = PayloadFormat::try_from(self.format)
            .map_err(|_| JediError::Internal("Invalid PayloadFormat".into()))?;

        match format {
            PayloadFormat::Json => {
                let json = serde_json::to_string(self).map_err(|e| {
                    JediError::Internal(format!("JSON serialization error: {}", e).into())
                })?;
                Ok(Message::Text(Utf8Bytes::from(json)))
            }
            PayloadFormat::Flex => {
                let bytes = serialize_to_flex_bytes(self)?;
                Ok(Message::Binary(bytes))
            }
            _ => Err(JediError::Internal("Unsupported WebSocket format".into())),
        }
    }

    pub fn from_ws_message(msg: &Message) -> Result<Self, JediError> {
        let (payload, format) = match msg {
            Message::Text(text) => (Bytes::copy_from_slice(text.as_bytes()), PayloadFormat::Json),
            Message::Binary(bin) => (Bytes::copy_from_slice(bin), PayloadFormat::Flex),
            _ => {
                return Err(JediError::BadRequest(
                    "Unsupported WebSocket message type".into(),
                ));
            }
        };

        let env = match format {
            PayloadFormat::Json => serde_json::from_slice(&payload).map_err(|e| {
                JediError::Internal(format!("Failed to parse JSON envelope: {e}").into())
            })?,
            PayloadFormat::Flex => {
                let reader = flexbuffers::Reader::get_root(&*payload).map_err(|e| {
                    JediError::Internal(format!("Flexbuffer root error: {e}").into())
                })?;
                JediEnvelope::deserialize(reader).map_err(|e| {
                    JediError::Internal(format!("Flexbuffer decode error: {e}").into())
                })?
            }
            _ => {
                return Err(JediError::Internal("Unsupported format".into()));
            }
        };

        Ok(env)
    }

    pub fn extract_key_if_watched(
        &self,
        watch_manager: &WatchManager,
        conn_id: &ConnId,
    ) -> Result<Option<Arc<str>>, JediError> {
        if !MessageKind::try_from_valid(self.kind) {
            return Err(JediError::Internal(
                "Invalid MessageKind via Extract Key".into(),
            ));
        }

        if !MessageKind::redis(self.kind) {
            return Ok(None);
        }

        let payload = try_unwrap_payload::<KeyValueInput>(self)?;
        if watch_manager.is_watching(conn_id, &*payload.key) {
            Ok(Some(payload.key))
        } else {
            Ok(None)
        }
    }
}

#[async_trait]
pub trait EnvelopePipeline {
    async fn process(self, ctx: &TempleState) -> Result<Self, JediError>
    where
        Self: Sized;

    fn emit(self) -> Result<JediEnvelope, JediError>;

    fn publish(&self, ctx: &TempleState) -> Result<(), JediError>;
}

#[async_trait]
impl EnvelopePipeline for JediEnvelope {
    async fn process(self, ctx: &TempleState) -> Result<Self, JediError> {
        // let kind = MessageKind::try_from(self.kind).map_err(|_|
        //   JediError::Internal("Invalid MessageKind via EnvelopePipeline".into())
        // )?;

        if !MessageKind::try_from_valid(self.kind) {
            tracing::warn!(
                "Unknown or unsupported MessageKind received via EnvelopePipeline: {}",
                self.kind
            );
        }

        if MessageKind::redis(self.kind) {
            return super::pipe_redis::pipe_redis(self, ctx).await;
        }

        #[cfg(feature = "clickhouse")]
        if MessageKind::clickhouse(self.kind) {
            return super::pipe_clickhouse::pipe_clickhouse(self, ctx).await;
        }

        Err(JediError::Internal(
            "Unsupported MessageKind for EnvelopePipeline".into(),
        ))
    }

    fn emit(self) -> Result<JediEnvelope, JediError> {
        Ok(self)
    }

    fn publish(&self, _ctx: &TempleState) -> Result<(), JediError> {
        Ok(())
    }
}

// * New Helper Methods

pub fn try_unwrap_payload<T>(env: &JediEnvelope) -> Result<T, JediError>
where
    T: for<'de> Deserialize<'de>,
{
    let format = PayloadFormat::try_from(env.format)
        .map_err(|_| JediError::Internal("Invalid PayloadFormat".into()))?;

    match format {
        PayloadFormat::Flex => {
            let reader = flexbuffers::Reader::get_root(&*env.payload)
                .map_err(|e| JediError::Internal(format!("Flexbuffer root error: {e}").into()))?;
            T::deserialize(reader)
                .map_err(|e| JediError::Internal(format!("Flexbuffer decode error: {e}").into()))
        }
        PayloadFormat::Json => serde_json::from_slice(&env.payload)
            .map_err(|e| JediError::Internal(format!("JSON decode error: {e}").into())),
        _ => Err(JediError::Internal("Unsupported PayloadFormat".into())),
    }
}

// * Envelope Work Item

#[derive(Debug)]
pub struct EnvelopeWorkItem {
    pub envelope: JediEnvelope,
    pub response_tx: Option<oneshot::Sender<JediEnvelope>>,
}

impl EnvelopeWorkItem {
    pub async fn handle(self, ctx: &TempleState) {
        let format = PayloadFormat::try_from(self.envelope.format).unwrap_or(PayloadFormat::Flex);
        let metadata = self.envelope.metadata_or_empty();

        let result = self.envelope.process(ctx).await;

        if let Some(tx) = self.response_tx {
            let _ = tx.send(match result {
                Ok(env) => env,
                Err(e) => JediEnvelope::error_with_meta(
                    "EnvelopeWorker",
                    &e.to_string(),
                    metadata,
                    format,
                ),
            });
        }
    }

    pub fn with_response(envelope: JediEnvelope) -> (Self, oneshot::Receiver<JediEnvelope>) {
        let (tx, rx) = oneshot::channel();
        (
            EnvelopeWorkItem {
                envelope,
                response_tx: Some(tx),
            },
            rx,
        )
    }

    pub fn fire_and_forget(envelope: JediEnvelope) -> Self {
        EnvelopeWorkItem {
            envelope,
            response_tx: None,
        }
    }
}
