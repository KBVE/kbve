use crate::error::JediError;
use crate::proto::redis::{
    Field, RedisStream, StreamEntry, StreamMessages, XAddPayload, XReadPayload, XReadResponse,
    redis_stream::Payload as ProtoPayload,
};
use bytes::Bytes;
use flexbuffers::FlexbufferSerializer;
use flexbuffers::{MapReader, Reader, VectorReader};
use std::sync::Arc;

/// This module defines structures and functions to parse and represent Redis Stream data.
/// TODO: Add the RSDocs Test Casing for this module.

#[derive(Debug)]
pub struct RedisStreamData<'a> {
    pub payload: RedisStreamPayload<'a>,
}

#[derive(Debug)]
pub enum RedisStreamPayload<'a> {
    XAdd(XAddData<'a>),
    XRead(XReadData<'a>),
    XReadResponse(XReadResponseData<'a>),
}

#[derive(Debug)]
pub struct XAddData<'a> {
    pub stream: &'a str,
    pub fields: Vec<FieldData<'a>>,
    pub id: Option<&'a str>,
}

impl<'a> XAddData<'a> {
    /// Converts XAddData to Redis XADD command arguments with owned Bytes.
    /// - stream: Stream key as Bytes.
    /// - id: Message ID as Option<Bytes> (None for "*").
    /// - fields: Vec of (key, value) pairs as (Bytes, Bytes).
    pub fn to_xadd_args_bytes(&self) -> (Bytes, Option<Bytes>, Vec<(Bytes, Bytes)>) {
        let stream = Bytes::copy_from_slice(self.stream.as_bytes());
        let id = self.id.map(|id| Bytes::copy_from_slice(id.as_bytes()));
        let fields = self
            .fields
            .iter()
            .map(|f| (f.key.to_bytes(), f.value.to_bytes()))
            .collect();
        (stream, id, fields)
    }
    /// Converts XAddData to Redis XADD command arguments: (stream, id, fields).
    /// - stream: Stream key as &[u8].
    /// - id: Message ID as Option<&[u8]> ("*" if None).
    /// - fields: Vec of (key, value) pairs as (&[u8], &[u8]).
    #[allow(clippy::type_complexity)]
    pub fn to_xadd_args(&self) -> (&[u8], Option<&[u8]>, Vec<(&[u8], &[u8])>) {
        let stream = self.stream.as_bytes();
        let id = self.id.map(|id| id.as_bytes());
        let fields = self
            .fields
            .iter()
            .map(|f| (f.key.as_slice(), f.value.as_slice()))
            .collect();
        (stream, id, fields)
    }
}

#[derive(Debug)]
pub struct XReadData<'a> {
    pub streams: Vec<StreamReadRequestData<'a>>,
    pub count: Option<u64>,
    pub block: Option<u64>,
}

#[derive(Debug)]
pub struct XReadResponseData<'a> {
    pub streams: Vec<StreamMessagesData<'a>>,
}

#[derive(Debug)]
pub struct StreamReadRequestData<'a> {
    pub stream: &'a str,
    pub id: &'a str,
}

#[derive(Debug)]
pub struct StreamMessagesData<'a> {
    pub stream: &'a str,
    pub entries: Vec<StreamEntryData<'a>>,
}

#[derive(Debug)]
pub struct StreamEntryData<'a> {
    pub id: &'a str,
    pub fields: Vec<FieldData<'a>>,
}

#[derive(Debug, Clone)]
pub struct FieldData<'a> {
    pub key: BytesCow<'a>,
    pub value: BytesCow<'a>,
}

#[derive(Debug, Clone)]
pub enum BytesCow<'a> {
    Borrowed(&'a [u8]),
    Owned(Bytes),
}

impl<'a> BytesCow<'a> {
    #[inline]
    pub fn to_bytes(&self) -> Bytes {
        match self {
            BytesCow::Borrowed(slice) => Bytes::copy_from_slice(slice),
            BytesCow::Owned(b) => b.clone(),
        }
    }

    #[inline]
    pub fn as_slice(&self) -> &[u8] {
        match self {
            BytesCow::Borrowed(slice) => slice,
            BytesCow::Owned(b) => b.as_ref(),
        }
    }

    #[inline]
    pub fn into_static(self) -> BytesCow<'static> {
        BytesCow::Owned(self.to_bytes())
    }

    #[inline]
    pub fn to_vec(&self) -> Vec<u8> {
        match self {
            BytesCow::Borrowed(slice) => slice.to_vec(),
            BytesCow::Owned(bytes) => bytes.to_vec(),
        }
    }
}

impl<'a> From<Bytes> for BytesCow<'a> {
    fn from(bytes: Bytes) -> Self {
        BytesCow::Owned(bytes)
    }
}

impl<'a> From<Arc<[u8]>> for BytesCow<'a> {
    fn from(arc: Arc<[u8]>) -> Self {
        BytesCow::Owned(Bytes::copy_from_slice(arc.as_ref()))
    }
}

impl<'a> RedisStreamData<'a> {
    pub fn serialize(&self) -> Result<Bytes, JediError> {
        serialize_to_flex_bytes(&RedisStream::from(self))
    }

    pub fn from_flex(map: &MapReader<&'a [u8]>) -> Result<Self, JediError> {
        if !map.idx("xadd").flexbuffer_type().is_null() {
            let payload = XAddData::from_flex(map.idx("xadd").get_map()?)?;
            Ok(Self {
                payload: RedisStreamPayload::XAdd(payload),
            })
        } else if !map.idx("xread").flexbuffer_type().is_null() {
            let payload = XReadData::from_flex(map.idx("xread").get_map()?)?;
            Ok(Self {
                payload: RedisStreamPayload::XRead(payload),
            })
        } else if !map.idx("xread_response").flexbuffer_type().is_null() {
            let payload = XReadResponseData::from_flex(map.idx("xread_response").get_map()?)?;
            Ok(Self {
                payload: RedisStreamPayload::XReadResponse(payload),
            })
        } else {
            Err(JediError::Parse("Unknown RedisStream payload type".into()))
        }
    }
}

impl<'a> XAddData<'a> {
    pub fn from_flex(map: MapReader<&'a [u8]>) -> Result<Self, JediError> {
        Ok(Self {
            stream: map.idx("stream").get_str()?,
            id: if map.idx("id").flexbuffer_type().is_null() {
                None
            } else {
                Some(map.idx("id").get_str()?)
            },
            fields: parse_fields(map.idx("fields").get_vector()?),
        })
    }
}

impl<'a> XReadData<'a> {
    pub fn from_flex(map: MapReader<&'a [u8]>) -> Result<Self, JediError> {
        Ok(Self {
            streams: parse_stream_read_requests(map.idx("streams").get_vector()?),
            count: map.idx("count").get_u64().ok(),
            block: map.idx("block").get_u64().ok(),
        })
    }
}

impl<'a> XReadResponseData<'a> {
    pub fn from_flex(map: MapReader<&'a [u8]>) -> Result<Self, JediError> {
        Ok(Self {
            streams: parse_stream_messages(map.idx("streams").get_vector()?),
        })
    }
}

#[inline]
pub fn parse_fields<'a>(vec: VectorReader<&'a [u8]>) -> Vec<FieldData<'a>> {
    let mut fields = Vec::with_capacity(vec.len());

    for reader in vec.iter() {
        let map = match reader.get_map() {
            Ok(map) => map,
            Err(_) => continue,
        };

        let key = extract_bytescow(map.idx("key"));
        let value = extract_bytescow(map.idx("value"));

        match (key, value) {
            (Some(k), Some(v)) => fields.push(FieldData { key: k, value: v }),
            _ => continue,
        }
    }

    fields
}

#[inline]
fn extract_bytescow<'a>(reader: Reader<&'a [u8]>) -> Option<BytesCow<'a>> {
    if let Ok(blob) = reader.get_blob() {
        return Some(BytesCow::Borrowed(blob.0));
    }

    if let Ok(vec_reader) = reader.get_vector() {
        let bytes =
            Bytes::copy_from_slice(&vec_reader.iter().map(|r| r.as_u8()).collect::<Vec<u8>>());
        return Some(BytesCow::Owned(bytes));
    }

    if let Ok(string) = reader.get_str() {
        return Some(BytesCow::Owned(Bytes::copy_from_slice(string.as_bytes())));
    }

    None
}

fn parse_stream_read_requests<'a>(vec: VectorReader<&'a [u8]>) -> Vec<StreamReadRequestData<'a>> {
    vec.iter()
        .filter_map(|r| {
            let m = r.get_map().ok()?;
            Some(StreamReadRequestData {
                stream: m.idx("stream").get_str().ok()?,
                id: m.idx("id").get_str().ok()?,
            })
        })
        .collect()
}

fn parse_stream_messages<'a>(vec: VectorReader<&'a [u8]>) -> Vec<StreamMessagesData<'a>> {
    vec.iter()
        .filter_map(|r| {
            let m = r.get_map().ok()?;
            Some(StreamMessagesData {
                stream: m.idx("stream").get_str().ok()?,
                entries: parse_stream_entries(m.idx("entries").get_vector().ok()?),
            })
        })
        .collect()
}

fn parse_stream_entries<'a>(vec: VectorReader<&'a [u8]>) -> Vec<StreamEntryData<'a>> {
    vec.iter()
        .filter_map(|r| {
            let m = r.get_map().ok()?;
            Some(StreamEntryData {
                id: m.idx("id").get_str().ok()?,
                fields: parse_fields(m.idx("fields").get_vector().ok()?),
            })
        })
        .collect()
}

impl<'a> From<XAddData<'a>> for XAddPayload {
    fn from(data: XAddData<'a>) -> Self {
        XAddPayload {
            stream: data.stream.as_bytes().to_vec(),
            fields: data
                .fields
                .into_iter()
                .map(|f| Field {
                    key: f.key.to_vec(),
                    value: f.value.to_vec(),
                })
                .collect(),
            id: data.id.map(|id| id.as_bytes().to_vec()),
        }
    }
}

impl<'a> From<XReadData<'a>> for XReadPayload {
    fn from(data: XReadData<'a>) -> Self {
        XReadPayload {
            streams: data
                .streams
                .into_iter()
                .map(|s| crate::proto::redis::StreamReadRequest {
                    stream: s.stream.as_bytes().to_vec(),
                    id: s.id.as_bytes().to_vec(),
                })
                .collect(),
            count: data.count,
            block: data.block,
        }
    }
}

impl<'a> From<RedisStreamData<'a>> for RedisStream {
    fn from(data: RedisStreamData<'a>) -> Self {
        RedisStream {
            payload: Some(match data.payload {
                RedisStreamPayload::XAdd(inner) => ProtoPayload::Xadd(inner.into()),
                RedisStreamPayload::XRead(inner) => ProtoPayload::Xread(inner.into()),
                RedisStreamPayload::XReadResponse(inner) => {
                    ProtoPayload::XreadResponse(inner.into())
                }
            }),
        }
    }
}

impl<'a> From<XReadResponseData<'a>> for XReadResponse {
    fn from(data: XReadResponseData<'a>) -> Self {
        XReadResponse {
            streams: data
                .streams
                .into_iter()
                .map(|s| StreamMessages {
                    stream: s.stream.as_bytes().to_vec(),
                    entries: s
                        .entries
                        .into_iter()
                        .map(|e| StreamEntry {
                            id: e.id.as_bytes().to_vec(),
                            fields: e
                                .fields
                                .into_iter()
                                .map(|f| Field {
                                    key: f.key.to_vec(),
                                    value: f.value.to_vec(),
                                })
                                .collect(),
                        })
                        .collect(),
                })
                .collect(),
        }
    }
}

impl<'a> From<&RedisStreamData<'a>> for RedisStream {
    fn from(data: &RedisStreamData<'a>) -> Self {
        RedisStream {
            payload: Some(match &data.payload {
                RedisStreamPayload::XAdd(inner) => ProtoPayload::Xadd(XAddPayload {
                    stream: inner.stream.as_bytes().to_vec(),
                    fields: inner
                        .fields
                        .iter()
                        .map(|f| Field {
                            key: f.key.to_vec(),
                            value: f.value.to_vec(),
                        })
                        .collect(),
                    id: inner.id.map(|id| id.as_bytes().to_vec()),
                }),
                RedisStreamPayload::XRead(inner) => ProtoPayload::Xread(XReadPayload {
                    streams: inner
                        .streams
                        .iter()
                        .map(|s| crate::proto::redis::StreamReadRequest {
                            stream: s.stream.as_bytes().to_vec(),
                            id: s.id.as_bytes().to_vec(),
                        })
                        .collect(),
                    count: inner.count,
                    block: inner.block,
                }),
                RedisStreamPayload::XReadResponse(inner) => {
                    ProtoPayload::XreadResponse(XReadResponse {
                        streams: inner
                            .streams
                            .iter()
                            .map(|s| StreamMessages {
                                stream: s.stream.as_bytes().to_vec(),
                                entries: s
                                    .entries
                                    .iter()
                                    .map(|e| StreamEntry {
                                        id: e.id.as_bytes().to_vec(),
                                        fields: e
                                            .fields
                                            .iter()
                                            .map(|f| Field {
                                                key: f.key.to_vec(),
                                                value: f.value.to_vec(),
                                            })
                                            .collect(),
                                    })
                                    .collect(),
                            })
                            .collect(),
                    })
                }
            }),
        }
    }
}

/// Function to serialize a value to Flexbuffer bytes
pub fn serialize_to_flex_bytes<T: serde::Serialize>(value: &T) -> Result<Bytes, JediError> {
    let mut serializer = FlexbufferSerializer::new();
    value
        .serialize(&mut serializer)
        .map_err(|e| JediError::Parse(format!("Flexbuffer serialization failed: {e}")))?;
    Ok(Bytes::from(serializer.take_buffer()))
}

pub fn deserialize_from_flex_bytes<'a, T: serde::de::Deserialize<'a>>(
    bytes: &'a [u8],
) -> Result<T, JediError> {
    let reader = flexbuffers::Reader::get_root(bytes)
        .map_err(|e| JediError::Parse(format!("Flexbuffer root parse failed: {e}")))?;
    T::deserialize(reader)
        .map_err(|e| JediError::Parse(format!("Flexbuffer deserialization failed: {e}")))
}
