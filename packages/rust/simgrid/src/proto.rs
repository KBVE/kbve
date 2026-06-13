use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 5;
pub const DEFAULT_MAX_PLAYERS: usize = 64;

pub const ACTION_ATTACK: u16 = 1;
pub const ACTION_PICKUP: u16 = 2;

pub const EPHEMERAL_INVENTORY: u16 = 1;
pub const EPHEMERAL_COMBAT: u16 = 2;
pub const EPHEMERAL_PICKUP: u16 = 3;
pub const EPHEMERAL_ITEM_USED: u16 = 5;
pub const EPHEMERAL_EQUIPPED: u16 = 6;
pub const EPHEMERAL_STATS: u16 = 7;

pub const KIND_CAT_PLAYER: u8 = 0;
pub const KIND_CAT_NPC: u8 = 1;
pub const KIND_CAT_ITEM: u8 = 2;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct EntityId(pub u32);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct PlayerSlot(pub u16);

pub const PLAYER_SLOT_NONE: PlayerSlot = PlayerSlot(u16::MAX);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct Tile {
    pub x: i32,
    pub y: i32,
}

impl Tile {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    pub fn chebyshev(self, other: Tile) -> i32 {
        (self.x - other.x).abs().max((self.y - other.y).abs())
    }

    pub fn manhattan(self, other: Tile) -> i32 {
        (self.x - other.x).abs() + (self.y - other.y).abs()
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Facing {
    #[default]
    Down = 0,
    Up = 1,
    Left = 2,
    Right = 3,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum Dir {
    Up = 0,
    Down = 1,
    Left = 2,
    Right = 3,
}

impl Dir {
    pub fn delta(self) -> (i32, i32) {
        match self {
            Dir::Up => (0, -1),
            Dir::Down => (0, 1),
            Dir::Left => (-1, 0),
            Dir::Right => (1, 0),
        }
    }

    pub fn facing(self) -> Facing {
        match self {
            Dir::Up => Facing::Up,
            Dir::Down => Facing::Down,
            Dir::Left => Facing::Left,
            Dir::Right => Facing::Right,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinMatch {
    pub protocol: u32,
    pub jwt: String,
    pub kbve_username: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ClientMessage {
    JoinMatch(JoinMatch),
    Frame(ClientFrame),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Input {
    Step { dir: Dir },
    MoveTo { tile: Tile },
    Face { facing: Facing },
    Action { id: u16, target: Option<EntityId> },
    UseItem { item_ref: String },
    EquipItem { item_ref: String },
    Heartbeat { client_tick: u32 },
    Leave,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClientFrame {
    pub client_tick: u32,
    pub inputs: Vec<Input>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerView {
    pub slot: PlayerSlot,
    pub kbve_username: String,
    pub connected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntityDelta {
    pub eid: EntityId,
    pub kind: u16,
    pub owner: PlayerSlot,
    pub tile: Tile,
    pub facing: Facing,
    pub sub: u8,
    pub hp: i32,
    pub max_hp: i32,
    pub destroyed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub tick: u32,
    pub server_time_ms: u32,
    pub input_ack: u32,
    pub players: Vec<PlayerView>,
    pub entities: Vec<EntityDelta>,
    pub keyframe: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KindEntry {
    pub kind: u16,
    #[serde(rename = "ref")]
    pub ref_id: String,
    pub cat: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ServerEvent {
    Welcome {
        protocol: u32,
        your_slot: PlayerSlot,
        seed: u64,
        registry: Vec<KindEntry>,
    },
    Snapshot(Snapshot),
    Ephemeral {
        kind: u16,
        to: PlayerSlot,
        payload: Vec<u8>,
    },
    Reject {
        reason: String,
    },
}

pub fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, postcard::Error> {
    postcard::to_allocvec_cobs(value)
}

pub fn decode<T: for<'de> Deserialize<'de>>(buf: &mut [u8]) -> Result<T, postcard::Error> {
    postcard::from_bytes_cobs(buf)
}

pub fn encode_json<T: Serialize>(value: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string(value)
}

pub fn decode_json<T: for<'de> Deserialize<'de>>(text: &str) -> Result<T, serde_json::Error> {
    serde_json::from_str(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_frame_round_trips() {
        let msg = ClientMessage::Frame(ClientFrame {
            client_tick: 7,
            inputs: vec![Input::Step { dir: Dir::Up }, Input::Leave],
        });
        let mut buf = encode(&msg).expect("encode");
        let back: ClientMessage = decode(&mut buf).expect("decode");
        match back {
            ClientMessage::Frame(f) => {
                assert_eq!(f.client_tick, 7);
                assert_eq!(f.inputs.len(), 2);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn welcome_round_trips() {
        let evt = ServerEvent::Welcome {
            protocol: PROTOCOL_VERSION,
            your_slot: PlayerSlot(3),
            seed: 0xC0FFEE,
            registry: vec![KindEntry {
                kind: 1,
                ref_id: "cleric".into(),
                cat: KIND_CAT_NPC,
            }],
        };
        let mut buf = encode(&evt).expect("encode");
        let back: ServerEvent = decode(&mut buf).expect("decode");
        match back {
            ServerEvent::Welcome {
                your_slot, seed, ..
            } => {
                assert_eq!(your_slot, PlayerSlot(3));
                assert_eq!(seed, 0xC0FFEE);
            }
            _ => panic!("wrong variant"),
        }
    }
}
