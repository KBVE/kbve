//! Shared wire types between the Godot client and the bevy/axum server.
//!
//! Encoded with `postcard` (COBS-framed) for snapshots and inputs. Keep this
//! module pure — no Godot, no Bevy, no I/O — so both sides can reuse it.

use serde::{Deserialize, Serialize};

/// Bump on any breaking wire change. Server rejects mismatched clients.
pub const PROTOCOL_VERSION: u32 = 2;

/// Maximum players per match (parallel-race default per #11294).
pub const MAX_PLAYERS: usize = 4;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct EntityId(pub u32);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub struct PlayerSlot(pub u8);

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum BuildKind {
    Tower = 0,
    Generator = 1,
    Battery = 2,
    Repair = 3,
    Armoury = 4,
    Village = 5,
    Town = 6,
    Castle = 7,
    Nexus = 8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum EnemyKind {
    Runner = 0,
    Brute = 1,
    Scout = 2,
    Boss = 3,
    Flying = 4,
    Shielded = 5,
    Regen = 6,
}

// -----------------------------------------------------------------------------
// Client -> Server
// -----------------------------------------------------------------------------

/// First message client sends after WS upgrade. Server validates protocol +
/// JWT then admits the player into a slot.
///
/// `jwt` is a Supabase GoTrue access token issued by supabase.kbve.com. The
/// `kbve_username` field is informational only; the server trusts the claim
/// inside the JWT (injected by the Custom Access Token hook), not the field.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinMatch {
    pub protocol: u32,
    pub jwt: String,
    pub kbve_username: String,
}

/// Top-level client-to-server envelope. The first frame on every connection
/// must be `JoinMatch`; subsequent frames are `Frame`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ClientMessage {
    JoinMatch(JoinMatch),
    Frame(ClientFrame),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Input {
    PlaceBuilding {
        col: i32,
        row: i32,
        kind: BuildKind,
    },
    UpgradeBuilding {
        eid: EntityId,
        kind_idx: u8,
    },
    SellBuilding {
        eid: EntityId,
    },
    SkipWave,
    TogglePause,
    UseItem {
        item_id: u32,
        target_eid: Option<EntityId>,
    },
    Retarget {
        eid: EntityId,
        target: Option<Vec2>,
    },
    Leave,
    /// Wall-clock round-trip echo. Server replies via `Snapshot.input_ack`.
    Heartbeat {
        client_tick: u32,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClientFrame {
    pub client_tick: u32,
    pub inputs: Vec<Input>,
}

// -----------------------------------------------------------------------------
// Server -> Client
// -----------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerView {
    pub slot: PlayerSlot,
    pub kbve_username: String,
    pub connected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BuildingDelta {
    pub eid: EntityId,
    pub kind: BuildKind,
    pub col: i32,
    pub row: i32,
    pub hp: f32,
    pub max_hp: f32,
    pub online: bool,
    pub destroyed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EnemyDelta {
    pub eid: EntityId,
    pub kind: EnemyKind,
    pub pos: Vec2,
    pub hp: f32,
    pub max_hp: f32,
    pub status_bits: u32,
    pub destroyed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectileDelta {
    pub eid: EntityId,
    pub pos: Vec2,
    pub vel: Vec2,
    pub destroyed: bool,
}

/// Per-slot match phase — drives the client HUD's pacing chip + banner.
/// Mapped to u8 on the wire so older clients can ignore unknown variants
/// without crashing the decoder.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum MatchPhase {
    /// Inter-wave breather + initial countdown before the first enemy
    /// spawn. Towers can be placed; no enemies on the field yet.
    #[default]
    Prepare = 0,
    /// Spawn window is open — enemies are being added each spawn-tick.
    Wave = 1,
    /// Spawning is done; remaining enemies still walking the path. Wave
    /// counter has not yet ticked over to the next number.
    Intermission = 2,
    /// Player ran out of lives. No more enemies will be spawned for them.
    GameOver = 3,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FieldDelta {
    pub owner: PlayerSlot,
    pub buildings: Vec<BuildingDelta>,
    pub enemies: Vec<EnemyDelta>,
    pub projectiles: Vec<ProjectileDelta>,
    pub gold: i32,
    pub lives: i32,
    pub wave: u16,
    /// Current pacing state for this slot.
    pub phase: MatchPhase,
    /// Milliseconds remaining in the current phase (countdown for
    /// Prepare/Intermission; 0 for Wave/GameOver).
    pub phase_remaining_ms: u32,
    /// Cumulative enemy kills for this slot since the match started.
    pub kills: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    /// Sim tick on the server. Monotonic.
    pub tick: u32,
    /// Milliseconds since match start. Lets the client tune interpolation.
    pub server_time_ms: u32,
    /// Echo of the highest client_tick the server has consumed for this player.
    pub input_ack: u32,
    /// Roster + connection status, broadcast on every snapshot for simplicity.
    pub players: Vec<PlayerView>,
    /// One entry per player field; delta'd against the last ack'd snapshot.
    pub fields: Vec<FieldDelta>,
    /// `true` once every N seconds — drops the delta base and re-syncs.
    pub keyframe: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ServerEvent {
    /// Bidirectional handshake — server confirms the JoinMatch.
    Welcome {
        protocol: u32,
        your_slot: PlayerSlot,
        seed: u64,
    },
    Snapshot(Snapshot),
    /// One-shot effects that shouldn't be replayed from a keyframe (sfx, splashes).
    Ephemeral {
        kind: u16,
        payload: Vec<u8>,
    },
    GameOver {
        winner: Option<PlayerSlot>,
    },
    Reject {
        reason: String,
    },
}

// -----------------------------------------------------------------------------
// Codec helpers — postcard with COBS framing so each WS binary message is one
// independent frame and partial reads can resynchronize.
// -----------------------------------------------------------------------------

#[cfg(feature = "proto-shared")]
pub fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, postcard::Error> {
    postcard::to_allocvec_cobs(value)
}

#[cfg(feature = "proto-shared")]
pub fn decode<T: for<'de> Deserialize<'de>>(buf: &mut [u8]) -> Result<T, postcard::Error> {
    postcard::from_bytes_cobs(buf)
}

#[cfg(all(test, feature = "proto-shared"))]
mod tests {
    use super::*;

    #[test]
    fn input_round_trips() {
        let msg = ClientMessage::Frame(ClientFrame {
            client_tick: 42,
            inputs: vec![
                Input::PlaceBuilding {
                    col: 3,
                    row: 4,
                    kind: BuildKind::Tower,
                },
                Input::SkipWave,
            ],
        });
        let mut buf = encode(&msg).expect("encode");
        let back: ClientMessage = decode(&mut buf).expect("decode");
        match back {
            ClientMessage::Frame(frame) => {
                assert_eq!(frame.client_tick, 42);
                assert_eq!(frame.inputs.len(), 2);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn join_match_round_trips() {
        let msg = ClientMessage::JoinMatch(JoinMatch {
            protocol: PROTOCOL_VERSION,
            jwt: "header.payload.signature".into(),
            kbve_username: "h0lybyte".into(),
        });
        let mut buf = encode(&msg).expect("encode");
        let back: ClientMessage = decode(&mut buf).expect("decode");
        match back {
            ClientMessage::JoinMatch(jm) => {
                assert_eq!(jm.protocol, PROTOCOL_VERSION);
                assert_eq!(jm.kbve_username, "h0lybyte");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn server_event_round_trips() {
        let evt = ServerEvent::Welcome {
            protocol: PROTOCOL_VERSION,
            your_slot: PlayerSlot(1),
            seed: 0xDEADBEEFCAFEu64,
        };
        let mut buf = encode(&evt).expect("encode");
        let back: ServerEvent = decode(&mut buf).expect("decode");
        match back {
            ServerEvent::Welcome {
                protocol,
                your_slot,
                seed,
            } => {
                assert_eq!(protocol, PROTOCOL_VERSION);
                assert_eq!(your_slot, PlayerSlot(1));
                assert_eq!(seed, 0xDEADBEEFCAFEu64);
            }
            _ => panic!("wrong variant"),
        }
    }
}
