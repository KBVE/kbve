use std::borrow::Cow;
use ulid::Ulid;
use chrono::{DateTime, Utc};
use std::fmt;
use std::str::FromStr;
use serde::{Serialize, Deserialize};


impl fmt::Display for ConnectionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for ConnectionId {
    type Err = ulid::DecodeError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        s.parse::<Ulid>().map(Self)
    }
}

impl From<Ulid> for ConnectionId {
    fn from(ulid: Ulid) -> Self {
        Self(ulid)
    }
}

impl From<ConnectionId> for Ulid {
    fn from(conn: ConnectionId) -> Self {
        conn.0
    }
}

impl PartialOrd for ConnectionId {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl Ord for ConnectionId {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

pub fn new_ulid_string() -> String {
    Ulid::new().to_string()
}

pub fn new_ulid_cow() -> Cow<'static, str> {
    Cow::Owned(Ulid::new().to_string())
}

pub fn parse_ulid(s: &str) -> Option<Ulid> {
    s.parse().ok()
}

pub fn ulid_to_bytes(ulid: Ulid) -> [u8; 16] {
    ulid.to_bytes()
}

pub fn ulid_from_bytes(bytes: [u8; 16]) -> Ulid {
    Ulid::from_bytes(bytes)
}

pub fn ulid_bytes(ulid: &Ulid) -> [u8; 16] {
    ulid.to_bytes()
}

pub fn ulid_to_vec(ulid: Ulid) -> Vec<u8> {
    ulid.to_bytes().to_vec()
}

pub fn ulid_to_cow_bytes(ulid: &Ulid) -> Cow<[u8]> {
    Cow::Owned(ulid.to_bytes().to_vec())
}

pub fn tagged_ulid(prefix: &str) -> String {
    format!("{}_{}", prefix, Ulid::new())
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ConnectionId(pub Ulid);

impl ConnectionId {
    pub fn new() -> Self {
        Self(Ulid::new())
    }

    pub fn from_str(s: &str) -> Option<Self> {
        s.parse().ok().map(Self)
    }

    pub fn as_str(&self) -> String {
        self.0.to_string()
    }

    pub fn timestamp(&self) -> u64 {
        let system_time = self.0.datetime();
        let chrono_time: DateTime<Utc> = system_time.into();
        chrono_time.timestamp_millis() as u64
    }
    
}
