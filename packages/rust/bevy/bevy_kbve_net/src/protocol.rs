use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::*;
use serde::{Deserialize, Serialize};

use crate::inputs::PlayerInput;
use crate::worldgen::{TileKey, WorldObjectKind};

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
    /// Canonical itemdb `ref` (e.g. "log", "copper-ore") — server-authoritative.
    /// Empty string means "no item" (e.g. world-sync replays where loot was already claimed).
    pub item_ref: String,
    /// Server-rolled quantity. 0 when `item_ref` is empty.
    pub quantity: u32,
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

/// One slot in a server-authoritative inventory snapshot.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InventorySlotState {
    pub slot_index: u32,
    /// itemdb `ref`. Empty string means the slot is empty.
    pub item_ref: String,
    pub quantity: u32,
}

/// Server pushes a single-slot delta after an authoritative inventory mutation
/// (loot grant, consume, equip-move). Targeted at the owning client only.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InventoryUpdate {
    /// Owning player — clients use it to filter foreign updates and to ignore
    /// stale messages addressed at a previous session.
    pub player_id: u64,
    pub slot: InventorySlotState,
}

/// Server pushes the full inventory snapshot on connect / reconnect so the
/// client can replace its local state in one shot before any deltas land.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InventorySync {
    pub player_id: u64,
    /// Sparse list: only occupied slots are included.
    pub slots: Vec<InventorySlotState>,
    /// Total capacity (max_slots) the server expects the client to mirror.
    pub max_slots: u32,
}

/// Server pushes a skill-XP grant after an authoritative skilling action
/// (collect, craft, etc.) so the owning client can mirror its `SkillProfile`
/// and run client-side level-up effects (toasts, audio). The grant is
/// idempotent at the message level — if the client misses one, the next
/// `InventorySync` round-trip will not heal it, so prefer reliable channel.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillXpGrant {
    pub player_id: u64,
    /// Skill ref slug (e.g. "woodcutting"). Matches the SkillRegistry on
    /// both sides.
    pub skill_ref: String,
    pub amount: u64,
}

/// Equip an item already in the player's inventory. The server resolves
/// the proto EquipSlot from the item's EquipmentInfo, so the client only
/// needs to identify which inventory slot to equip from.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EquipRequest {
    pub inventory_slot: u32,
}

/// Unequip whatever currently occupies an equipment slot, returning it to
/// inventory. `equip_slot` mirrors the proto `EquipSlot` enum's i32 value.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UnequipRequest {
    pub equip_slot: i32,
}

/// Server pushes the canonical state of one equipment slot after any mutation
/// (equip / unequip / loss-on-death). Empty `item_ref` means the slot is now
/// empty.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EquipmentUpdate {
    pub player_id: u64,
    pub equip_slot: i32,
    pub item_ref: String,
}

/// Full equipment snapshot for join / reconnect.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EquipmentSync {
    pub player_id: u64,
    pub slots: Vec<(i32, String)>,
}

/// Ask the server to craft `output_item_ref`. Server resolves the recipe
/// from the item's `CraftingRecipe` list, validates ingredients + skill +
/// (eventually) facility/tool, then consumes ingredients and grants the
/// output. Multiple recipes may exist per output — `recipe_index` picks one.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CraftRequest {
    pub output_item_ref: String,
    pub recipe_index: u32,
    pub batches: u32,
}

/// Reason a craft failed; emitted server → owning client so the UI can
/// surface a meaningful error toast.
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum CraftFailureReason {
    UnknownItem,
    InvalidRecipe,
    MissingIngredients,
    SkillTooLow,
    InventoryFull,
    MissingFacility,
}

/// Server response to a craft attempt — covers both success and failure.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CraftResult {
    pub player_id: u64,
    pub output_item_ref: String,
    pub success: bool,
    pub failure_reason: Option<CraftFailureReason>,
    /// Total quantity produced (0 on failure).
    pub produced: u32,
}

/// Client asks to use a consumable from a given inventory slot. Server
/// validates `consumable=true`, applies the UseEffect list (heal/buff/
/// damage), decrements the stack, and broadcasts inventory + vital updates.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UseItemRequest {
    pub inventory_slot: u32,
}

/// Client asks to deploy an item at a world tile (campfire, fence, etc.).
/// Server validates the item carries `DeployableInfo`, removes one from
/// inventory, and replicates a placement to all clients via
/// `ItemDeployed`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeployRequest {
    pub inventory_slot: u32,
    pub tile: TileKey,
}

/// Server broadcasts that a deployable item was placed at a world tile so
/// every client can spawn a matching visual entity.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ItemDeployed {
    pub owner_id: u64,
    pub tile: TileKey,
    pub item_ref: String,
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
    /// Server-assigned ULID identifying the creature instance.
    pub creature_id: u128,
    pub kind: CreatureKind,
}

/// Server broadcasts that a creature was captured.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureCaptured {
    /// Server-assigned ULID identifying the creature instance.
    pub creature_id: u128,
    pub kind: CreatureKind,
    pub captor_player_id: u64,
}

/// Compact entry inside a [`CreatureCapturedBatch`].
///
/// Sent on initial join only — `captor_player_id` is omitted because catch-up
/// state never grants loot to the joining client.
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct CapturedCreatureEntry {
    pub creature_id: u128,
    pub kind: CreatureKind,
}

/// Server sends the full set of currently-captured creatures to a newly
/// connected client in a **single** message.
///
/// Replaces N individual [`CreatureCaptured`] sends per join, eliminating the
/// O(captured × joins) message storm noted in issue #8189.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CreatureCapturedBatch {
    pub entries: Vec<CapturedCreatureEntry>,
}

/// Client requests to attack/interact with a creature.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureAttackRequest {
    /// Server-assigned ULID identifying the creature instance.
    pub creature_id: u128,
    /// NPC ref string (e.g. "wild-boar") to identify the creature type.
    pub npc_ref: String,
    /// Damage amount (server validates).
    pub damage: f32,
}

/// Server broadcasts a creature state correction to all clients.
/// Overrides local deterministic behavior when external events occur.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureStateEvent {
    /// Server-assigned ULID identifying the creature instance.
    pub creature_id: u128,
    /// NPC ref string identifying the creature type.
    pub npc_ref: String,
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

/// Unreliable unordered channel for creature position sync.
/// Separate from TimeChannel so large batches don't block time sync.
pub struct CreatureSyncChannel;

/// Single creature's server-authoritative state snapshot.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatureSnapshot {
    /// Server-assigned ULID for this creature instance.
    pub creature_id: u128,
    /// World-space anchor position.
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Current hop state discriminant (0=Idle, 1=Emote, 2=JumpWindup, 3=Airborne, 4=Landing).
    pub hop_state: u8,
    /// Patrol step counter (for deterministic re-sync).
    pub patrol_step: u32,
    /// Facing left flag.
    pub facing_left: bool,
}

/// Server periodically broadcasts creature position snapshots.
/// Sent per creature type to keep packets manageable.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreaturePositionSync {
    /// NPC ref key (e.g. "wild-boar").
    pub npc_ref: String,
    /// Snapshots for all creatures of this type.
    pub snapshots: Vec<CreatureSnapshot>,
}

/// Ordered-reliable channel for important game events.
pub struct GameChannel;

pub struct ProtocolPlugin;

impl Plugin for ProtocolPlugin {
    fn build(&self, app: &mut App) {
        // Workaround: lightyear 0.26.4 SharedPlugins adds the empty
        // lightyear_connection::ConnectionPlugin instead of the client-side
        // one that inits PeerMetadata. Without this resource the server's
        // receive_input_message system panics on the first tick.
        app.init_resource::<PeerMetadata>();

        app.add_plugins(lightyear::input::native::prelude::InputPlugin::<PlayerInput>::default());

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

        app.add_channel::<CreatureSyncChannel>(ChannelSettings {
            mode: ChannelMode::UnorderedUnreliable,
            ..default()
        })
        .add_direction(NetworkDirection::ServerToClient);

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
        // InventoryUpdate: server → owning client (loot delta)
        app.register_message::<InventoryUpdate>()
            .add_direction(NetworkDirection::ServerToClient);
        // InventorySync: server → owning client (full snapshot on join)
        app.register_message::<InventorySync>()
            .add_direction(NetworkDirection::ServerToClient);
        // SkillXpGrant: server → owning client (mirrored skill XP delta)
        app.register_message::<SkillXpGrant>()
            .add_direction(NetworkDirection::ServerToClient);

        // Equipment
        app.register_message::<EquipRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        app.register_message::<UnequipRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        app.register_message::<EquipmentUpdate>()
            .add_direction(NetworkDirection::ServerToClient);
        app.register_message::<EquipmentSync>()
            .add_direction(NetworkDirection::ServerToClient);

        // Crafting
        app.register_message::<CraftRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        app.register_message::<CraftResult>()
            .add_direction(NetworkDirection::ServerToClient);

        // Consumables
        app.register_message::<UseItemRequest>()
            .add_direction(NetworkDirection::ClientToServer);

        // Deployables
        app.register_message::<DeployRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        app.register_message::<ItemDeployed>()
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
        // CreatureCapturedBatch: server → newly joined client (catch-up snapshot)
        app.register_message::<CreatureCapturedBatch>()
            .add_direction(NetworkDirection::ServerToClient);

        // CreatureAttackRequest: client → server
        app.register_message::<CreatureAttackRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // CreatureStateEvent: server → all clients (determinism corrections)
        app.register_message::<CreatureStateEvent>()
            .add_direction(NetworkDirection::ServerToClient);

        // CreaturePositionSync: server → all clients (periodic position corrections)
        app.register_message::<CreaturePositionSync>()
            .add_direction(NetworkDirection::ServerToClient);

        // PlayerId: synced once on spawn, predicted + rollback
        app.component::<PlayerId>().replicate().predict();

        // PlayerColor: synced once on spawn, predicted
        app.component::<PlayerColor>().replicate().predict();

        // PlayerVitals: server-authoritative, replicated to all clients
        app.component::<PlayerVitals>().replicate().predict();

        // PlayerName: replicated to all clients
        app.component::<PlayerName>().replicate().predict();

        // SetUsernameRequest: client → server
        app.register_message::<SetUsernameRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        // SetUsernameResponse: server → client
        app.register_message::<SetUsernameResponse>()
            .add_direction(NetworkDirection::ServerToClient);

        // Position: full sync with rollback
        app.component::<Position>().replicate().predict();

        // Rotation: full sync with rollback
        app.component::<Rotation>().replicate().predict();

        // LinearVelocity: predicted with rollback
        app.component::<LinearVelocity>().replicate().predict();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creature_captured_batch_default_is_empty() {
        let batch = CreatureCapturedBatch::default();
        assert!(batch.entries.is_empty());
    }

    #[test]
    fn captured_creature_entry_holds_full_id() {
        // u128 must round-trip without truncation (catches accidental u64 swap).
        let entry = CapturedCreatureEntry {
            creature_id: u128::MAX,
            kind: CreatureKind::Firefly,
        };
        assert_eq!(entry.creature_id, u128::MAX);
        assert_eq!(entry.kind, CreatureKind::Firefly);
    }

    #[test]
    fn creature_kind_equality() {
        assert_eq!(CreatureKind::Firefly, CreatureKind::Firefly);
        assert_ne!(CreatureKind::Firefly, CreatureKind::Frog);
    }
}
