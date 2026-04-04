use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::*;
use serde::{Deserialize, Serialize};

use crate::inputs::PlayerInput;
use crate::worldgen::{TileKey, WorldObjectKind};

// ---------------------------------------------------------------------------
// Replicated components
// ---------------------------------------------------------------------------

/// Unique player identifier assigned by the server.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerId(pub u64);

/// Player color for rendering — assigned by server, synced once.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerColor(pub Color);

/// Player display name — looked up from database on auth, replicated to all clients.
/// Empty string means the player has no username set yet.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerName(pub String);

/// Player vitals (health, mana, energy) — server-authoritative, replicated to all clients.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerVitals {
    pub health: f32,
    pub max_health: f32,
    pub mana: f32,
    pub max_mana: f32,
    pub energy: f32,
    pub max_energy: f32,
}

impl Default for PlayerVitals {
    fn default() -> Self {
        Self {
            health: 100.0,
            max_health: 100.0,
            mana: 50.0,
            max_mana: 50.0,
            energy: 75.0,
            max_energy: 75.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/// Client sends JWT after connecting so the server can identify the user.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthMessage {
    pub jwt: String,
}

/// Server response to an auth attempt (step 3 of 4-step handshake).
/// Includes `server_time` as a challenge — client must echo it back in `AuthAck`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthResponse {
    pub success: bool,
    pub user_id: String,
    /// Server-assigned player entity ID so the client knows which replicated entity is theirs.
    pub player_id: u64,
    /// Server timestamp (millis since UNIX epoch) — client echoes in AuthAck to prove receipt.
    pub server_time: u64,
}

/// Client echoes the server_time from AuthResponse to complete the 4-step handshake.
/// ```text
/// 1. client → server  (get JWT)
/// 2. game   → server  AuthMessage { jwt }
/// 3. server → game    AuthResponse { server_time, … }
/// 4. game   → server  AuthAck { server_time }   ← this message
/// ```
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthAck {
    /// Must match the `server_time` from the AuthResponse.
    pub server_time: u64,
}

/// Client sends its position to the server each tick (client-authoritative movement).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PositionUpdate {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Client reports damage to the server (fall damage, combat, etc.).
/// Server validates and applies to PlayerVitals.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DamageEvent {
    pub amount: f32,
    pub source: DamageSource,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum DamageSource {
    Fall,
    Combat,
}

/// Client requests to collect a world object at a tile.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CollectRequest {
    pub tile: TileKey,
}

/// Server broadcasts that a world object was removed (collected by a player).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ObjectRemoved {
    pub tile: TileKey,
    pub kind: WorldObjectKind,
    /// Player ID of the collector — client uses this to grant loot only to the right player.
    pub collector_id: u64,
}

/// Client requests to set their username (when they don't have one).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetUsernameRequest {
    pub username: String,
}

/// Server responds to a username change attempt.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetUsernameResponse {
    pub success: bool,
    /// The canonical username (lowercased/trimmed) on success, empty on failure.
    pub username: String,
    /// Error message on failure, empty on success.
    pub error: String,
}

/// Server broadcasts that a previously collected object has respawned.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ObjectRespawned {
    pub tile: TileKey,
    pub kind: WorldObjectKind,
}

/// Server periodically broadcasts canonical game time and creature seed.
/// Clients use this to keep DayCycle, wind, and creature behavior in sync.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimeSyncMessage {
    /// Current game hour (0.0–24.0).
    pub game_hour: f32,
    /// Game-hours per real-second.
    pub day_speed: f32,
    /// Global seed for deterministic creature spawning.
    pub creature_seed: u64,
    /// Wind speed in mph.
    pub wind_speed_mph: f32,
    /// Wind direction (x, z) normalized.
    pub wind_direction: (f32, f32),
}

/// Creature types that can be captured.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CreatureKind {
    Frog,
    Butterfly,
    Firefly,
}

/// Client requests to capture a creature.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureCaptureRequest {
    pub kind: CreatureKind,
    /// Index in the deterministic creature pool (0..N).
    pub creature_index: u32,
}

/// Server broadcasts that a creature was captured.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureCaptured {
    pub kind: CreatureKind,
    pub creature_index: u32,
    pub captor_player_id: u64,
}

// ---------------------------------------------------------------------------
// Creature interaction messages
// ---------------------------------------------------------------------------

/// Client requests to attack/interact with a creature.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureAttackRequest {
    /// NPC ref string (e.g. "wild-boar") to identify the creature type.
    pub npc_ref: String,
    /// Pool index of the targeted creature.
    pub creature_index: u32,
    /// Damage amount (server validates).
    pub damage: f32,
}

/// Server broadcasts a creature state correction to all clients.
/// Overrides local deterministic behavior when external events occur.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureStateEvent {
    /// NPC ref string identifying the creature type.
    pub npc_ref: String,
    /// Pool index of the affected creature.
    pub creature_index: u32,
    /// What happened to the creature.
    pub event: CreatureEventKind,
}

/// The kind of state correction for a creature.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum CreatureEventKind {
    /// Creature took damage. Client should trigger flee/flinch behavior.
    TakeDamage { amount: f32, attacker_id: u64 },
    /// Creature died. Client should play death animation and despawn.
    Die,
    /// Creature forced to flee from a position (e.g. AoE, loud noise).
    ForceFlee { from_x: f32, from_z: f32 },
    /// Creature was captured by a player.
    Captured { by_player_id: u64 },
}

/// Unreliable sequenced channel for time sync (avoids clogging ordered-reliable GameChannel).
pub struct TimeChannel;

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/// Ordered-reliable channel for important game events.
pub struct GameChannel;

// ---------------------------------------------------------------------------
// Protocol plugin — registers everything with lightyear
// ---------------------------------------------------------------------------

pub struct ProtocolPlugin;

impl Plugin for ProtocolPlugin {
    fn build(&self, app: &mut App) {
        // Workaround: lightyear 0.26.4 SharedPlugins adds the empty
        // lightyear_connection::ConnectionPlugin instead of the client-side
        // one that inits PeerMetadata. Without this resource the server's
        // receive_input_message system panics on the first tick.
        app.init_resource::<PeerMetadata>();

        // --- Inputs ---
        app.add_plugins(lightyear::input::native::prelude::InputPlugin::<PlayerInput>::default());

        // --- Channels ---
        app.add_channel::<GameChannel>(ChannelSettings {
            mode: ChannelMode::OrderedReliable(ReliableSettings::default()),
            ..default()
        })
        .add_direction(NetworkDirection::Bidirectional);

        app.add_channel::<TimeChannel>(ChannelSettings {
            mode: ChannelMode::UnorderedUnreliable,
            ..default()
        })
        .add_direction(NetworkDirection::ServerToClient);

        // --- Messages ---
        // AuthMessage: client → server
        app.register_message::<AuthMessage>()
            .add_direction(NetworkDirection::ClientToServer);
        // AuthResponse: server → client
        app.register_message::<AuthResponse>()
            .add_direction(NetworkDirection::ServerToClient);
        // AuthAck: client → server (step 4 of handshake)
        app.register_message::<AuthAck>()
            .add_direction(NetworkDirection::ClientToServer);
        // PositionUpdate: client → server
        app.register_message::<PositionUpdate>()
            .add_direction(NetworkDirection::ClientToServer);
        // DamageEvent: client → server
        app.register_message::<DamageEvent>()
            .add_direction(NetworkDirection::ClientToServer);
        // CollectRequest: client → server
        app.register_message::<CollectRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // ObjectRemoved: server → all clients
        app.register_message::<ObjectRemoved>()
            .add_direction(NetworkDirection::ServerToClient);
        // ObjectRespawned: server → all clients
        app.register_message::<ObjectRespawned>()
            .add_direction(NetworkDirection::ServerToClient);

        // TimeSyncMessage: server → all clients (unreliable, periodic)
        app.register_message::<TimeSyncMessage>()
            .add_direction(NetworkDirection::ServerToClient);
        // CreatureCaptureRequest: client → server
        app.register_message::<CreatureCaptureRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // CreatureCaptured: server → all clients
        app.register_message::<CreatureCaptured>()
            .add_direction(NetworkDirection::ServerToClient);

        // CreatureAttackRequest: client → server
        app.register_message::<CreatureAttackRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // CreatureStateEvent: server → all clients (determinism corrections)
        app.register_message::<CreatureStateEvent>()
            .add_direction(NetworkDirection::ServerToClient);

        // --- Replicated components (custom game components) ---

        // PlayerId: synced once on spawn, predicted + rollback
        app.register_component::<PlayerId>().add_prediction();

        // PlayerColor: synced once on spawn, predicted
        app.register_component::<PlayerColor>().add_prediction();

        // PlayerVitals: server-authoritative, replicated to all clients
        app.register_component::<PlayerVitals>().add_prediction();

        // PlayerName: replicated to all clients
        app.register_component::<PlayerName>().add_prediction();

        // SetUsernameRequest: client → server
        app.register_message::<SetUsernameRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // SetUsernameResponse: server → client
        app.register_message::<SetUsernameResponse>()
            .add_direction(NetworkDirection::ServerToClient);

        // --- Replicated avian3d physics components ---

        // Position: full sync with rollback
        app.register_component::<Position>().add_prediction();

        // Rotation: full sync with rollback
        app.register_component::<Rotation>().add_prediction();

        // LinearVelocity: predicted with rollback
        app.register_component::<LinearVelocity>().add_prediction();
    }
}
