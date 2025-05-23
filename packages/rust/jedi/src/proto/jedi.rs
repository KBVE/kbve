// This file is @generated by prost-build.
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JediEnvelope {
    #[prost(int32, tag = "1")]
    pub version: i32,
    #[prost(enumeration = "MessageKind", tag = "2")]
    pub kind: i32,
    #[prost(enumeration = "PayloadFormat", tag = "3")]
    pub format: i32,
    #[prost(bytes = "bytes", tag = "4")]
    pub payload: ::prost::bytes::Bytes,
    #[prost(bytes = "bytes", tag = "5")]
    pub metadata: ::prost::bytes::Bytes,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct FlagEnvelope {
    #[prost(int32, tag = "1")]
    pub flag: i32,
    #[prost(bytes = "bytes", tag = "2")]
    pub payload: ::prost::bytes::Bytes,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct FlexEnvelope {
    #[prost(enumeration = "MessageKind", tag = "1")]
    pub kind: i32,
    #[prost(bytes = "bytes", tag = "2")]
    pub payload: ::prost::bytes::Bytes,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RawEnvelope {
    #[prost(bytes = "bytes", tag = "1")]
    pub key: ::prost::bytes::Bytes,
    #[prost(bytes = "bytes", tag = "2")]
    pub payload: ::prost::bytes::Bytes,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JediMessage {
    #[prost(oneof = "jedi_message::Envelope", tags = "1, 2, 3, 4")]
    pub envelope: ::core::option::Option<jedi_message::Envelope>,
}
/// Nested message and enum types in `JediMessage`.
pub mod jedi_message {
    #[derive(serde::Serialize, serde::Deserialize)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Envelope {
        #[prost(message, tag = "1")]
        Hybrid(super::JediEnvelope),
        #[prost(message, tag = "2")]
        Flex(super::FlexEnvelope),
        #[prost(message, tag = "3")]
        Raw(super::RawEnvelope),
        #[prost(message, tag = "4")]
        Flag(super::FlagEnvelope),
    }
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
#[repr(i32)]
pub enum PayloadFormat {
    PayloadUnknown = 0,
    Json = 1,
    Flex = 2,
    Protobuf = 3,
    Flatbuffer = 4,
}
impl PayloadFormat {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Self::PayloadUnknown => "PAYLOAD_UNKNOWN",
            Self::Json => "JSON",
            Self::Flex => "FLEX",
            Self::Protobuf => "PROTOBUF",
            Self::Flatbuffer => "FLATBUFFER",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "PAYLOAD_UNKNOWN" => Some(Self::PayloadUnknown),
            "JSON" => Some(Self::Json),
            "FLEX" => Some(Self::Flex),
            "PROTOBUF" => Some(Self::Protobuf),
            "FLATBUFFER" => Some(Self::Flatbuffer),
            _ => None,
        }
    }
}
#[derive(serde::Serialize, serde::Deserialize)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
#[repr(i32)]
pub enum MessageKind {
    /// ───── Verbs (Bits 0–7)
    Unknown = 0,
    Add = 1,
    Read = 2,
    Get = 4,
    Set = 8,
    Del = 16,
    Stream = 32,
    Group = 64,
    List = 128,
    /// ───── Intent / Message Metadata (Bits 8–15)
    Action = 256,
    Message = 512,
    Info = 1024,
    Debug = 2048,
    Error = 4096,
    Auth = 8192,
    Heartbeat = 16384,
    /// ───── System Targets / Routing (Bits 16–23)
    ConfigUpdate = 32768,
    Redis = 65536,
    Supabase = 131072,
    Filesystem = 262144,
    Websocket = 524288,
    HttpApi = 1048576,
    LocalCache = 2097152,
    Ai = 4194304,
    /// ───── Reserved / Future Use (Bits 24–31)
    External = 8388608,
    Reserved25 = 16777216,
    Reserved26 = 33554432,
    Reserved27 = 67108864,
    Reserved28 = 134217728,
    Reserved29 = 268435456,
    Reserved30 = 536870912,
    Reserved31 = 1073741824,
}
impl MessageKind {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Self::Unknown => "UNKNOWN",
            Self::Add => "ADD",
            Self::Read => "READ",
            Self::Get => "GET",
            Self::Set => "SET",
            Self::Del => "DEL",
            Self::Stream => "STREAM",
            Self::Group => "GROUP",
            Self::List => "LIST",
            Self::Action => "ACTION",
            Self::Message => "MESSAGE",
            Self::Info => "INFO",
            Self::Debug => "DEBUG",
            Self::Error => "ERROR",
            Self::Auth => "AUTH",
            Self::Heartbeat => "HEARTBEAT",
            Self::ConfigUpdate => "CONFIG_UPDATE",
            Self::Redis => "REDIS",
            Self::Supabase => "SUPABASE",
            Self::Filesystem => "FILESYSTEM",
            Self::Websocket => "WEBSOCKET",
            Self::HttpApi => "HTTP_API",
            Self::LocalCache => "LOCAL_CACHE",
            Self::Ai => "AI",
            Self::External => "EXTERNAL",
            Self::Reserved25 => "RESERVED_25",
            Self::Reserved26 => "RESERVED_26",
            Self::Reserved27 => "RESERVED_27",
            Self::Reserved28 => "RESERVED_28",
            Self::Reserved29 => "RESERVED_29",
            Self::Reserved30 => "RESERVED_30",
            Self::Reserved31 => "RESERVED_31",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "UNKNOWN" => Some(Self::Unknown),
            "ADD" => Some(Self::Add),
            "READ" => Some(Self::Read),
            "GET" => Some(Self::Get),
            "SET" => Some(Self::Set),
            "DEL" => Some(Self::Del),
            "STREAM" => Some(Self::Stream),
            "GROUP" => Some(Self::Group),
            "LIST" => Some(Self::List),
            "ACTION" => Some(Self::Action),
            "MESSAGE" => Some(Self::Message),
            "INFO" => Some(Self::Info),
            "DEBUG" => Some(Self::Debug),
            "ERROR" => Some(Self::Error),
            "AUTH" => Some(Self::Auth),
            "HEARTBEAT" => Some(Self::Heartbeat),
            "CONFIG_UPDATE" => Some(Self::ConfigUpdate),
            "REDIS" => Some(Self::Redis),
            "SUPABASE" => Some(Self::Supabase),
            "FILESYSTEM" => Some(Self::Filesystem),
            "WEBSOCKET" => Some(Self::Websocket),
            "HTTP_API" => Some(Self::HttpApi),
            "LOCAL_CACHE" => Some(Self::LocalCache),
            "AI" => Some(Self::Ai),
            "EXTERNAL" => Some(Self::External),
            "RESERVED_25" => Some(Self::Reserved25),
            "RESERVED_26" => Some(Self::Reserved26),
            "RESERVED_27" => Some(Self::Reserved27),
            "RESERVED_28" => Some(Self::Reserved28),
            "RESERVED_29" => Some(Self::Reserved29),
            "RESERVED_30" => Some(Self::Reserved30),
            "RESERVED_31" => Some(Self::Reserved31),
            _ => None,
        }
    }
}
