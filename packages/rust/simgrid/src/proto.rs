use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 15;
pub const DEFAULT_MAX_PLAYERS: usize = 64;

pub const POS_SCALE: i32 = 32;
pub const VEL_SCALE: i32 = 256;

pub fn quantize_pos(v: f32) -> i32 {
    (v * POS_SCALE as f32).round() as i32
}

pub fn dequantize_pos(q: i32) -> f32 {
    q as f32 / POS_SCALE as f32
}

pub fn quantize_vel(v: f32) -> i16 {
    (v * VEL_SCALE as f32)
        .round()
        .clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

pub fn dequantize_vel(q: i16) -> f32 {
    q as f32 / VEL_SCALE as f32
}

pub const ACTION_ATTACK: u16 = 1;
pub const ACTION_PICKUP: u16 = 2;
pub const ACTION_SHOOT: u16 = 3;

pub const EPHEMERAL_INVENTORY: u16 = 1;
pub const EPHEMERAL_COMBAT: u16 = 2;
pub const EPHEMERAL_PICKUP: u16 = 3;
pub const EPHEMERAL_ITEM_USED: u16 = 5;
pub const EPHEMERAL_EQUIPPED: u16 = 6;
pub const EPHEMERAL_STATS: u16 = 7;
pub const EPHEMERAL_STATUS: u16 = 8;
pub const EPHEMERAL_TRADE: u16 = 9;
pub const EPHEMERAL_SHOP: u16 = 10;
pub const EPHEMERAL_BLACKJACK: u16 = 11;
pub const EPHEMERAL_PROJECTILE: u16 = 12;
pub const EPHEMERAL_FLOOR: u16 = 13;
pub const EPHEMERAL_ITEM_PLACED: u16 = 14;
pub const EPHEMERAL_SPELL: u16 = 15;

pub const KIND_CAT_PLAYER: u8 = 0;
pub const KIND_CAT_NPC: u8 = 1;
pub const KIND_CAT_ITEM: u8 = 2;
pub const KIND_CAT_ENV: u8 = 3;

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
    Step {
        dir: Dir,
    },
    Move {
        seq: u32,
        mx: i8,
        my: i8,
        run: bool,
    },
    MoveTo {
        tile: Tile,
    },
    Face {
        facing: Facing,
    },
    Action {
        id: u16,
        target: Option<EntityId>,
    },
    CastSpell {
        spell_ref: String,
        target: Option<EntityId>,
    },
    UseItem {
        item_ref: String,
    },
    DropItem {
        item_ref: String,
        qty: u32,
    },
    MoveItem {
        from: u32,
        to: u32,
    },
    EquipItem {
        item_ref: String,
    },
    PlaceItem {
        item_ref: String,
        tile: Tile,
    },
    PickupObject {
        tile: Tile,
    },
    Heartbeat {
        client_tick: u32,
    },
    Leave,
    TradeOffer {
        target: EntityId,
        items: Vec<(String, u32)>,
    },
    TradeAccept,
    TradeCancel,
    BuyItem {
        npc: EntityId,
        item_ref: String,
        qty: u32,
    },
    SellItem {
        npc: EntityId,
        item_ref: String,
        qty: u32,
    },
    JoinTable {
        table_ref: String,
    },
    LeaveTable,
    PlaceBet {
        amount: u32,
    },
    BjAction {
        kind: BjActionKind,
    },
    Insure {
        amount: u32,
    },
    Fell {
        tile: Tile,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum BjActionKind {
    Hit,
    Stand,
    Double,
    Split,
    Surrender,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum StatusKind {
    Poison = 0,
    Regen = 1,
    Haste = 2,
    Burn = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusView {
    pub kind: StatusKind,
    pub remaining: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntityDelta {
    pub eid: EntityId,
    pub kind: u16,
    pub owner: PlayerSlot,
    pub tile: Tile,
    pub facing: Facing,
    pub sub: u8,
    #[serde(default)]
    pub qx: i32,
    #[serde(default)]
    pub qy: i32,
    // No skip_serializing_if on any wire field: postcard is positional, so a
    // conditionally-omitted field shifts every following byte and desyncs the
    // decoder. serde(default) is kept so older/JSON encodings still decode.
    #[serde(default)]
    pub qvx: i16,
    #[serde(default)]
    pub qvy: i16,
    #[serde(default)]
    pub input_ack: u32,
    pub hp: i32,
    pub max_hp: i32,
    pub destroyed: bool,
    /// Dungeon floor (z-axis). 0 = ground floor.
    #[serde(default)]
    pub z: i32,
    #[serde(default)]
    pub effects: Vec<StatusView>,
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

/// A loosed projectile (arrow/bolt/…) broadcast to every client so remote
/// players see the shot, not just the shooter. Typed (not an ad-hoc `json!`)
/// so the payload codec can move from JSON to postcard in lockstep with the TS
/// `ProjectileEvent` — the same path PvP combat events will take. `attacker` is
/// the entity index; `from`/`to` are the muzzle and impact tiles.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectileEvent {
    pub attacker: u32,
    pub from: Tile,
    pub to: Tile,
    pub kind: String,
    pub hit: bool,
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

    #[test]
    fn status_kind_serializes_by_name() {
        assert_eq!(
            serde_json::to_string(&StatusKind::Burn).unwrap(),
            "\"Burn\""
        );
        assert_eq!(
            serde_json::to_string(&StatusKind::Poison).unwrap(),
            "\"Poison\""
        );
        let back: StatusKind = serde_json::from_str("\"Burn\"").unwrap();
        assert_eq!(back, StatusKind::Burn);
    }

    // Cross-language wire fixture: the TS postcard encoder pins the SAME hex
    // (laser postcard-wire.spec.ts). If this breaks after a proto change, update
    // both sides in lockstep — postcard is positional, so they must match.
    #[test]
    fn client_message_fixture_is_stable() {
        let msg = ClientMessage::Frame(ClientFrame {
            client_tick: 7,
            inputs: vec![
                Input::Move {
                    seq: 3,
                    mx: 127,
                    my: -1,
                    run: true,
                },
                Input::Fell {
                    tile: Tile::new(5, -3),
                },
                Input::Leave,
            ],
        });
        let bytes = encode(&msg).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "0d01070301037fff01180a050d00");

        // JoinMatch: leading 0x00 discriminant exercises COBS restuffing.
        let join = ClientMessage::JoinMatch(JoinMatch {
            protocol: 15,
            jwt: "tok".into(),
            kbve_username: "h0ly".into(),
        });
        let hex2: String = encode(&join)
            .expect("encode")
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(hex2, "010b0f03746f6b0468306c7900");
    }

    #[test]
    fn snapshot_with_zeroed_fields_round_trips_postcard() {
        // Postcard is positional: a zero in a former skip_serializing_if field must
        // still serialize, or the decoder desyncs on the following bytes. This pins
        // that an all-zero entity and a populated one round-trip together.
        let zero = EntityDelta {
            eid: EntityId(1),
            kind: 2,
            owner: PlayerSlot(0),
            tile: Tile::new(0, 0),
            facing: Facing::Up,
            sub: 0,
            qx: 0,
            qy: 0,
            qvx: 0,
            qvy: 0,
            input_ack: 0,
            hp: 0,
            max_hp: 0,
            destroyed: false,
            z: 0,
            effects: vec![],
        };
        let full = EntityDelta {
            eid: EntityId(2),
            kind: 3,
            owner: PlayerSlot(1),
            tile: Tile::new(5, -3),
            facing: Facing::Down,
            sub: 0x81,
            qx: 160,
            qy: -96,
            qvx: 12,
            qvy: -7,
            input_ack: 42,
            hp: 30,
            max_hp: 40,
            destroyed: false,
            z: -1,
            effects: vec![StatusView {
                kind: StatusKind::Burn,
                remaining: 5,
            }],
        };
        let evt = ServerEvent::Snapshot(Snapshot {
            tick: 9,
            server_time_ms: 100,
            input_ack: 0,
            players: vec![],
            entities: vec![zero, full],
            keyframe: true,
        });
        let mut buf = encode(&evt).expect("encode");
        let back: ServerEvent = decode(&mut buf).expect("decode");
        match back {
            ServerEvent::Snapshot(s) => {
                assert_eq!(s.entities.len(), 2);
                assert_eq!(s.entities[0].qx, 0);
                assert_eq!(s.entities[0].qvx, 0);
                assert_eq!(s.entities[0].z, 0);
                assert_eq!(s.entities[1].qx, 160);
                assert_eq!(s.entities[1].qvy, -7);
                assert_eq!(s.entities[1].z, -1);
                assert_eq!(s.entities[1].effects.len(), 1);
            }
            _ => panic!("wrong variant"),
        }
    }
}
