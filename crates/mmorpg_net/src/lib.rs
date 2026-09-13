//! Wire protocol for the mmorpg: what a client may say, what the server
//! replicates back, and over which channel.
//!
//! Separate from `bevy_kbve_net`, which is isometric's protocol. That crate
//! replicates tiles, creatures and a worldgen seed over a grid; this game is a
//! 3D character on a heightfield and shares none of those types. What the two
//! do share -- netcode token helpers -- stays in `bevy_kbve_net::net_config`
//! rather than being copied here.
//!
//! Linked by both the dedicated server and the wasm client, so it stays free of
//! anything that only one of them can build: no renderer, no tokio, no axum.
#![deny(missing_docs)]

use avian3d::prelude::{LinearVelocity, Position, Rotation};
use bevy::prelude::*;
use lightyear::prelude::*;
use serde::{Deserialize, Serialize};

/// Bumped whenever a type below changes shape. netcode refuses a client whose
/// id differs, which turns a wire mismatch into a clean rejection at connect
/// rather than a deserialize panic three messages in.
pub const MMORPG_PROTOCOL_ID: u64 = 0x4B42_5645_4D4D_4F01;

/// The server's simulation rate. The client ticks at the same rate; lightyear
/// interpolates the remainder for a browser running at whatever the compositor
/// gives it.
pub const TICK_HZ: u16 = 30;

/// Who a replicated entity belongs to, as the server sees it.
///
/// Carries the netcode client id rather than an account id: a guest has no
/// account, and the pairing of connection to character has to work the same for
/// both. `PlayerName` is what a human reads.
#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Reflect)]
pub struct PlayerId(pub u64);

/// Display name above a character.
///
/// Server-assigned, never client-assigned: a guest gets `guest-<6 chars>` and a
/// signed-in player gets their KBVE username, and neither is negotiable from
/// the client side.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Reflect)]
pub struct PlayerName(pub String);

/// Whether this character is a guest, so the client can badge it.
#[derive(Component, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Reflect)]
pub struct Guest(pub bool);

/// One tick of intent from a client.
///
/// Intent, not position. The server owns where a character ends up -- a client
/// that sends a position is asking to be believed, and this one is not asked.
/// `yaw` rides along because the camera is the client's and the server needs the
/// facing to resolve movement into world space.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Reflect)]
pub struct MoveIntent {
    /// Away from the camera along `yaw`.
    pub forward: bool,
    /// Toward the camera along `yaw`.
    pub back: bool,
    /// Strafe left, perpendicular to `yaw`.
    pub left: bool,
    /// Strafe right, perpendicular to `yaw`.
    pub right: bool,
    /// Held this tick. The server decides whether it is grounded enough to
    /// matter; a client holding jump in midair is not airborne twice.
    pub jump: bool,
    /// Held this tick, scaling ground speed server-side.
    pub sprint: bool,
    /// Camera yaw in radians, the direction `forward` means this tick.
    pub yaw: f32,
}

impl MoveIntent {
    /// The intent as a world-space direction on the ground plane.
    ///
    /// Returns `Vec3::ZERO` for no keys and for opposed keys, so a player
    /// holding left and right together stands still rather than drifting on a
    /// rounding error.
    pub fn to_world_dir(&self) -> Vec3 {
        let x = f32::from(self.right) - f32::from(self.left);
        let z = f32::from(self.back) - f32::from(self.forward);
        if x == 0.0 && z == 0.0 {
            return Vec3::ZERO;
        }
        let (sin, cos) = self.yaw.sin_cos();
        // Yaw rotation of (x, z) about +Y, written out rather than built from a
        // Quat: this runs per player per tick on the server.
        let dir = Vec3::new(x * cos - z * sin, 0.0, x * sin + z * cos);
        dir.normalize_or_zero()
    }
}

/// The input lightyear ships each tick.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Reflect)]
pub enum PlayerInput {
    /// Keys and facing for this tick.
    Move(MoveIntent),
    /// No input. The default, and what a dropped tick is treated as rather
    /// than repeating the last one -- a stalled client should stop, not run on.
    #[default]
    Idle,
}

impl bevy::ecs::entity::MapEntities for PlayerInput {
    fn map_entities<M: EntityMapper>(&mut self, _mapper: &mut M) {
        // No entity references travel in an input.
    }
}

/// Ordered and reliable: joins, names, chat. Everything that is a fact rather
/// than a sample.
pub struct GameChannel;

/// The client's one-shot hello, sent once the netcode connection is up.
///
/// The `ConnectToken` already proved who the player is -- it was minted by the
/// token endpoint against a Supabase JWT, or minted anonymously for a guest --
/// so this carries no credential. It exists so the server knows the client is
/// ready to be given a character.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JoinRequest;

/// The server's answer: who you are and which entity is yours.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JoinAccepted {
    /// Server-assigned id for this session, matching the [`PlayerId`] on the
    /// replicated character.
    pub player_id: u64,
    /// Display name the server settled on, which is the one to render: a
    /// guest's is minted server-side and a signed-in player's comes from the
    /// token, so neither is the client's to choose.
    pub name: String,
    /// Whether the session is anonymous, so the client can badge it.
    pub guest: bool,
}

/// Registers everything both ends must agree on.
///
/// Added by the server and by the client, from the same crate, because the two
/// disagreeing is the failure this crate exists to prevent.
pub struct MmorpgProtocolPlugin;

impl Plugin for MmorpgProtocolPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(lightyear::input::native::prelude::InputPlugin::<PlayerInput>::default());

        app.add_channel::<GameChannel>(ChannelSettings {
            mode: ChannelMode::OrderedReliable(ReliableSettings::default()),
            ..default()
        })
        .add_direction(NetworkDirection::Bidirectional);

        app.register_message::<JoinRequest>()
            .add_direction(NetworkDirection::ClientToServer);
        app.register_message::<JoinAccepted>()
            .add_direction(NetworkDirection::ServerToClient);

        // Identity. Replicated but not predicted: a name does not move, and
        // predicting one only creates a rollback that can disagree with itself.
        app.component::<PlayerId>().replicate();
        app.component::<PlayerName>().replicate();
        app.component::<Guest>().replicate();

        // Movement. Predicted, so the local player turns on the frame the key
        // is pressed instead of a round trip later; avian owns these types and
        // `lightyear_avian3d` does the transform sync on both ends.
        app.component::<Position>().replicate().predict();
        app.component::<Rotation>().replicate().predict();
        app.component::<LinearVelocity>().replicate().predict();
    }
}
