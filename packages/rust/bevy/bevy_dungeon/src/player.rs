use std::fmt;

/// Opaque identity for one player in a dungeon session.
///
/// The rules engine never learns where a player came from. The Discord bot
/// carries a snowflake in here, the BBS carries its own caller id, and both
/// convert at their own boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PlayerId(pub u64);

impl PlayerId {
    pub const fn new(raw: u64) -> Self {
        Self(raw)
    }

    pub const fn get(self) -> u64 {
        self.0
    }
}

impl From<u64> for PlayerId {
    fn from(raw: u64) -> Self {
        Self(raw)
    }
}

impl From<PlayerId> for u64 {
    fn from(id: PlayerId) -> u64 {
        id.0
    }
}

impl fmt::Display for PlayerId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl serde::Serialize for PlayerId {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0.to_string())
    }
}
