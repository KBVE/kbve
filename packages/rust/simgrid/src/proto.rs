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
/// Loot a corpse (target = corpse entity): transfer all its held items to the
/// looter if adjacent, then despawn it.
pub const ACTION_LOOT: u16 = 4;

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
pub const EPHEMERAL_CORPSE: u16 = 16;

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
        /// Client sim tick this intent was sampled at. The server consumes one
        /// input per tick in client-tick order (FIFO jitter buffer), so the
        /// release stops exactly when the client did — no held-intent over-travel.
        tick: u32,
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
        /// Furniture facing 0..=3 (R cycles it during placement). 0 for props with
        /// no rotation (campfire). Rides the placed env's `EntityDelta.sub`.
        rot: u8,
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
    /// Board `ship` and become its pilot. Server validates the player is in range,
    /// the ship is parked (phase Off) and unoccupied. Appended last so serde variant
    /// indices of the existing inputs are unchanged.
    EnterShip {
        ship: EntityId,
    },
    /// Leave the ship the player is piloting (lands it, returns the player on foot).
    ExitShip,
    /// Open a corpse to inspect its loot: the server replies with `CorpseContents`
    /// (its current items) if the player is adjacent. Appended last so serde
    /// variant indices of the existing inputs are unchanged.
    OpenCorpse {
        corpse: EntityId,
    },
    /// Take ONE stack (slot index into the corpse's item list) from a corpse, if
    /// adjacent. The server transfers it, re-sends the updated `CorpseContents`,
    /// and despawns the corpse once empty.
    TakeFromCorpse {
        corpse: EntityId,
        slot: u32,
    },
    /// Pilot launches the ship they're flying off the planet into the solo 3D
    /// "space" instance. Valid only while the ship is flying (phase Fly); the
    /// server plays the leaving cutscene then takes the ship + pilot off-grid so
    /// every other client sees them rise and vanish. Appended last so serde
    /// variant indices of the existing inputs are unchanged.
    LaunchSpace,
    /// Pilot returns from the 3D space instance: the server re-materialises the
    /// ship + pilot at the launch tile and plays the entering cutscene back into
    /// flight. Appended last so serde variant indices are unchanged.
    ReturnSpace,
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
    /// For a PLAYER entity: the eid of the ship it is piloting, or 0 when on foot.
    /// Lets every client hide that player's body and float its nameplate over the
    /// ship — so others see who is flying it. Appended last (postcard is positional).
    #[serde(default)]
    pub piloting: u32,
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

/// The local player took a stair: the client re-streams floor `z` and snaps to
/// `tile`. Typed for the postcard payload path (mirrors TS `FloorChangeEvent`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FloorChangeEvent {
    pub z: i32,
    pub tile: Tile,
}

/// A player picked up `count` of `item_ref`. Mirrors TS `PickupEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PickupEvent {
    pub item_ref: String,
    pub count: u32,
}

/// A corpse's current loot, sent to a player who opened it (and re-sent after each
/// take so the open loot panel stays live). `items` are (item_ref, count) in slot
/// order — the client takes a slot by its index. Mirrors TS `CorpseContents`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CorpseContents {
    pub corpse: u32,
    pub items: Vec<(String, u32)>,
}

/// A consumable was used, healing `heal`. Mirrors TS `ItemUsedEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ItemUsedEvent {
    pub item_ref: String,
    pub heal: i32,
}

/// A resolved attack. `target_ref` is the victim's kind ref (None for players).
/// Mirrors TS `CombatEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CombatEvent {
    pub attacker: u32,
    pub target: u32,
    pub target_ref: Option<String>,
    pub dmg: i32,
    pub crit: bool,
    pub died: bool,
}

/// An equip slot changed. `item_ref` None = slot cleared. Mirrors TS `EquippedEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EquippedEvent {
    pub item_ref: Option<String>,
    pub slot: String,
    pub attack: i32,
    pub defense: i32,
}

/// Player stat block pushed to the HUD. Mirrors TS `StatsEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StatsEvent {
    pub level: i32,
    pub xp: i32,
    pub xp_next: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub kills: u32,
    pub mp: i32,
    pub max_mp: i32,
}

/// Result of a deploy/place attempt. `reason` set only on failure. Mirrors TS
/// `ItemPlacedEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ItemPlacedEvent {
    pub item_ref: String,
    pub tile: Tile,
    pub ok: bool,
    pub reason: Option<String>,
}

/// A status-effect change pushed to the HUD. `kind` is the `StatusKind` byte.
/// Mirrors TS `StatusEvent`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StatusEvent {
    pub kind: u8,
    pub magnitude: i32,
    pub remaining: u32,
}

/// One inventory line. Mirrors TS `InventoryItem`. `id` is the stack's ULID instance
/// identity (stable across moves; the mint timestamp is embedded in the first 48 bits).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InventoryItem {
    pub id: String,
    pub item_ref: String,
    pub count: u32,
}

/// Full inventory snapshot. Mirrors TS `InventorySync`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InventorySync {
    pub items: Vec<InventoryItem>,
}

/// Result of a shop buy/sell. Mirrors TS `ShopResult`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShopResult {
    pub action: String,
    pub item_ref: String,
    pub qty: u32,
    pub ok: bool,
    pub reason: String,
    pub balance: u32,
}

/// One blackjack hand. Mirrors TS `BlackjackHandView`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlackjackHandView {
    pub cards: Vec<u8>,
    pub bet: u32,
    pub value: u32,
    pub soft: bool,
    pub doubled: bool,
    pub surrendered: bool,
    pub done: bool,
    pub outcome: Option<String>,
}

/// One seat at a blackjack table. Mirrors TS `BlackjackSeatView`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlackjackSeatView {
    pub slot: u16,
    pub username: String,
    pub bet: u32,
    pub insurance: u32,
    pub hands: Vec<BlackjackHandView>,
    pub disconnected: bool,
}

/// Full blackjack table state pushed to a seated player. Mirrors TS
/// `BlackjackStateView`. `seed` is revealed only after the round settles.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlackjackStateView {
    pub table_ref: String,
    pub phase: String,
    pub seats: Vec<BlackjackSeatView>,
    pub dealer_hand: Vec<u8>,
    pub dealer_hidden: bool,
    pub active_slot: Option<u16>,
    pub active_hand: Option<u32>,
    pub your_balance: u32,
    pub deadline_ms: u32,
    pub commitment: String,
    pub seed: Option<String>,
}

/// One side of a trade window. Mirrors TS `TradeSide`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TradeSide {
    pub items: Vec<InventoryItem>,
    pub accepted: bool,
}

/// Trade window state pushed to both participants. A closed trade sends `status`
/// with empty sides. Mirrors TS `TradeStateView`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TradeStateView {
    pub status: String,
    pub with: u16,
    pub you: TradeSide,
    pub them: TradeSide,
}

/// Result of a spell cast. `reason` set only on failure. Mirrors TS `SpellResult`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpellResult {
    pub caster: u32,
    pub target: Option<u32>,
    pub spell_ref: String,
    pub effect: String,
    pub amount: i32,
    pub ok: bool,
    pub reason: String,
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

/// Encode an Ephemeral payload as raw postcard (NOT COBS-framed): the outer
/// ServerEvent already COBS-frames the whole message and length-prefixes the
/// payload `Vec<u8>`, so the inner bytes need no delimiter. Pairs with the TS
/// `PostcardReader` reading the payload directly. This is the typed-binary path
/// JSON event payloads migrate onto, starting with ProjectileEvent.
pub fn encode_inner<T: Serialize>(value: &T) -> Result<Vec<u8>, postcard::Error> {
    postcard::to_allocvec(value)
}

pub fn decode_inner<T: for<'de> Deserialize<'de>>(buf: &[u8]) -> Result<T, postcard::Error> {
    postcard::from_bytes(buf)
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
                    tick: 9,
                },
                Input::Fell {
                    tile: Tile::new(5, -3),
                },
                Input::Leave,
            ],
        });
        let bytes = encode(&msg).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "0e01070301037fff0109180a050d00");

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

    // Cross-language wire fixtures: the TS postcard decoder pins the SAME hex
    // (laser postcard-wire.spec.ts) and asserts the decoded fields.
    #[test]
    fn server_event_fixtures() {
        let welcome = ServerEvent::Welcome {
            protocol: 15,
            your_slot: PlayerSlot(3),
            seed: 0xC0FFEE,
            registry: vec![KindEntry {
                kind: 1,
                ref_id: "wyvern_fire".into(),
                cat: 1,
            }],
        };
        let snap = ServerEvent::Snapshot(Snapshot {
            tick: 9,
            server_time_ms: 100,
            input_ack: 0,
            players: vec![],
            entities: vec![EntityDelta {
                eid: EntityId(2),
                kind: 7,
                owner: PLAYER_SLOT_NONE,
                tile: Tile::new(5, -3),
                facing: Facing::Down,
                sub: 0x81,
                qx: 160,
                qy: -96,
                qvx: 12,
                qvy: -7,
                input_ack: 0,
                hp: 30,
                max_hp: 40,
                destroyed: false,
                z: -1,
                effects: vec![StatusView {
                    kind: StatusKind::Burn,
                    remaining: 5,
                }],
                piloting: 0,
            }],
            keyframe: true,
        });
        let h = |e: &ServerEvent| -> String {
            encode(e)
                .unwrap()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect()
        };
        assert_eq!(
            h(&welcome),
            "01160f03eeff830601010b77797665726e5f666972650100"
        );
        assert_eq!(
            h(&snap),
            "040109640109010207ffff030a050881c002bf01180d033c500501010305020100"
        );
    }

    // Cross-language fixture for the raw-postcard Ephemeral payload path: the TS
    // decodeProjectile pins the SAME hex (laser postcard-wire.spec.ts). encode_inner
    // is plain postcard (no COBS), so no 0x00 framing byte appears here.
    #[test]
    fn projectile_event_fixture_is_stable() {
        let ev = ProjectileEvent {
            attacker: 2,
            from: Tile::new(5, -3),
            to: Tile::new(7, 2),
            kind: "arrow".into(),
            hit: true,
        };
        let bytes = encode_inner(&ev).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "020a050e04056172726f7701");
        let back: ProjectileEvent = decode_inner(&bytes).expect("decode");
        assert_eq!(back.attacker, 2);
        assert_eq!(back.from, Tile::new(5, -3));
        assert_eq!(back.to, Tile::new(7, 2));
        assert_eq!(back.kind, "arrow");
        assert!(back.hit);
    }

    #[test]
    fn floor_change_event_fixture_is_stable() {
        let ev = FloorChangeEvent {
            z: 2,
            tile: Tile::new(7, -3),
        };
        let bytes = encode_inner(&ev).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "040e05");
        let back: FloorChangeEvent = decode_inner(&bytes).expect("decode");
        assert_eq!(back.z, 2);
        assert_eq!(back.tile, Tile::new(7, -3));
    }

    #[test]
    fn pickup_event_fixture_is_stable() {
        let ev = PickupEvent {
            item_ref: "arrow".into(),
            count: 3,
        };
        let bytes = encode_inner(&ev).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "056172726f7703");
        let back: PickupEvent = decode_inner(&bytes).expect("decode");
        assert_eq!(back.item_ref, "arrow");
        assert_eq!(back.count, 3);
    }

    #[test]
    fn item_used_event_fixture_is_stable() {
        let ev = ItemUsedEvent {
            item_ref: "potion".into(),
            heal: 12,
        };
        let bytes = encode_inner(&ev).expect("encode");
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "06706f74696f6e18");
        let back: ItemUsedEvent = decode_inner(&bytes).expect("decode");
        assert_eq!(back.item_ref, "potion");
        assert_eq!(back.heal, 12);
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn combat_event_fixture_is_stable() {
        let ev = CombatEvent {
            attacker: 2,
            target: 7,
            target_ref: Some("goblin".into()),
            dmg: 5,
            crit: true,
            died: false,
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "02070106676f626c696e0a0100"
        );
    }

    #[test]
    fn equipped_event_fixture_is_stable() {
        let ev = EquippedEvent {
            item_ref: Some("sword".into()),
            slot: "weapon".into(),
            attack: 3,
            defense: 1,
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "010573776f726406776561706f6e0602"
        );
    }

    #[test]
    fn stats_event_fixture_is_stable() {
        let ev = StatsEvent {
            level: 2,
            xp: 50,
            xp_next: 100,
            max_hp: 40,
            attack: 7,
            kills: 3,
            mp: 10,
            max_mp: 20,
        };
        assert_eq!(hex(&encode_inner(&ev).unwrap()), "0464c801500e031428");
    }

    #[test]
    fn item_placed_event_fixture_is_stable() {
        let ev = ItemPlacedEvent {
            item_ref: "campfire".into(),
            tile: Tile::new(7, -3),
            ok: true,
            reason: None,
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "0863616d70666972650e050100"
        );
    }

    #[test]
    fn status_event_fixture_is_stable() {
        let ev = StatusEvent {
            kind: 3,
            magnitude: -2,
            remaining: 5,
        };
        assert_eq!(hex(&encode_inner(&ev).unwrap()), "030305");
    }

    #[test]
    fn inventory_sync_fixture_is_stable() {
        let ev = InventorySync {
            items: vec![
                InventoryItem {
                    id: String::new(),
                    item_ref: "arrow".into(),
                    count: 3,
                },
                InventoryItem {
                    id: String::new(),
                    item_ref: "potion".into(),
                    count: 1,
                },
            ],
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "0200056172726f77030006706f74696f6e01"
        );
    }

    #[test]
    fn shop_result_fixture_is_stable() {
        let ev = ShopResult {
            action: "buy".into(),
            item_ref: "arrow".into(),
            qty: 2,
            ok: true,
            reason: "".into(),
            balance: 90,
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "03627579056172726f770201005a"
        );
    }

    #[test]
    fn blackjack_state_view_fixture_is_stable() {
        let ev = BlackjackStateView {
            table_ref: "vip".into(),
            phase: "PlayerTurn".into(),
            seats: vec![BlackjackSeatView {
                slot: 1,
                username: "al".into(),
                bet: 10,
                insurance: 0,
                hands: vec![BlackjackHandView {
                    cards: vec![10, 7],
                    bet: 10,
                    value: 17,
                    soft: false,
                    doubled: false,
                    surrendered: false,
                    done: false,
                    outcome: None,
                }],
                disconnected: false,
            }],
            dealer_hand: vec![9],
            dealer_hidden: true,
            active_slot: Some(1),
            active_hand: Some(0),
            your_balance: 90,
            deadline_ms: 5000,
            commitment: "ab".into(),
            seed: None,
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "037669700a506c617965725475726e010102616c0a0001020a070a11000000000000010901010101005a882702616200"
        );
    }

    #[test]
    fn trade_state_view_fixture_is_stable() {
        let ev = TradeStateView {
            status: "open".into(),
            with: 2,
            you: TradeSide {
                items: vec![InventoryItem {
                    id: String::new(),
                    item_ref: "arrow".into(),
                    count: 3,
                }],
                accepted: false,
            },
            them: TradeSide {
                items: vec![],
                accepted: true,
            },
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "046f70656e020100056172726f7703000001"
        );
    }

    #[test]
    fn spell_result_fixture_is_stable() {
        let ev = SpellResult {
            caster: 2,
            target: Some(7),
            spell_ref: "heal".into(),
            effect: "heal".into(),
            amount: 10,
            ok: true,
            reason: "".into(),
        };
        assert_eq!(
            hex(&encode_inner(&ev).unwrap()),
            "020107046865616c046865616c140100"
        );
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
            piloting: 0,
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
            piloting: 7,
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
