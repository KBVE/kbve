use crate::proto::redis::{
    RedisStream,
    redis_stream::Payload as ProtoPayload,
    XAddPayload,
    XReadPayload,
    XReadResponse,
    StreamEntry,
    StreamMessages,
    Field,
};
use flexbuffers::{Reader, MapReader, VectorReader, FlexBufferType};
use crate::error::JediError;


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

#[derive(Debug)]
pub struct FieldData<'a> {
    pub key: &'a str,
    pub value: &'a str,
}



impl<'a> RedisStreamData<'a> {
    pub fn from_flex(map: MapReader<&'a [u8]>) -> Result<Self, JediError> {
        if !map.idx("xadd").flexbuffer_type().is_null() {
            let payload = XAddData::from_flex(map.idx("xadd").get_map()?)?;
            Ok(Self { payload: RedisStreamPayload::XAdd(payload) })
        } else if !map.idx("xread").flexbuffer_type().is_null() {
            let payload = XReadData::from_flex(map.idx("xread").get_map()?)?;
            Ok(Self { payload: RedisStreamPayload::XRead(payload) })
        } else if !map.idx("xread_response").flexbuffer_type().is_null() {
            let payload = XReadResponseData::from_flex(map.idx("xread_response").get_map()?)?;
            Ok(Self { payload: RedisStreamPayload::XReadResponse(payload) })
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


fn parse_fields<'a>(vec: VectorReader<&'a [u8]>) -> Vec<FieldData<'a>> {
    vec.iter()
        .filter_map(|r| {
            let m = r.get_map().ok()?;
            Some(FieldData {
                key: m.idx("key").get_str().ok()?,
                value: m.idx("value").get_str().ok()?,
            })
        })
        .collect()
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
            fields: data.fields.into_iter()
                .map(|f| Field {
                    key: f.key.as_bytes().to_vec(),
                    value: f.value.as_bytes().to_vec(),
                })
                .collect(),
            id: data.id.map(|id| id.as_bytes().to_vec()),
        }
    }
}

impl<'a> From<XReadData<'a>> for XReadPayload {
    fn from(data: XReadData<'a>) -> Self {
        XReadPayload {
            streams: data.streams.into_iter()
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
                RedisStreamPayload::XReadResponse(inner) => ProtoPayload::XreadResponse(inner.into()),
            }),
        }
    }
}

impl<'a> From<XReadResponseData<'a>> for XReadResponse {
    fn from(data: XReadResponseData<'a>) -> Self {
        XReadResponse {
            streams: data.streams.into_iter()
                .map(|s| StreamMessages {
                    stream: s.stream.as_bytes().to_vec(),
                    entries: s.entries.into_iter()
                        .map(|e| StreamEntry {
                            id: e.id.as_bytes().to_vec(),
                            fields: e.fields.into_iter()
                                .map(|f| Field {
                                    key: f.key.as_bytes().to_vec(),
                                    value: f.value.as_bytes().to_vec(),
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
                    fields: inner.fields.iter().map(|f| Field {
                        key: f.key.as_bytes().to_vec(),
                        value: f.value.as_bytes().to_vec(),
                    }).collect(),
                    id: inner.id.map(|id| id.as_bytes().to_vec()),
                }),
                RedisStreamPayload::XRead(inner) => ProtoPayload::Xread(XReadPayload {
                    streams: inner.streams.iter().map(|s| crate::proto::redis::StreamReadRequest {
                        stream: s.stream.as_bytes().to_vec(),
                        id: s.id.as_bytes().to_vec(),
                    }).collect(),
                    count: inner.count,
                    block: inner.block,
                }),
                RedisStreamPayload::XReadResponse(inner) => ProtoPayload::XreadResponse(XReadResponse {
                    streams: inner.streams.iter().map(|s| StreamMessages {
                        stream: s.stream.as_bytes().to_vec(),
                        entries: s.entries.iter().map(|e| StreamEntry {
                            id: e.id.as_bytes().to_vec(),
                            fields: e.fields.iter().map(|f| Field {
                                key: f.key.as_bytes().to_vec(),
                                value: f.value.as_bytes().to_vec(),
                            }).collect(),
                        }).collect(),
                    }).collect(),
                }),
            }),
        }
    }
}
