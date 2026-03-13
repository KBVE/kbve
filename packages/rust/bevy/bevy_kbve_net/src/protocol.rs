use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::*;
use serde::{Deserialize, Serialize};

use crate::inputs::PlayerInput;

// ---------------------------------------------------------------------------
// Replicated components
// ---------------------------------------------------------------------------

/// Unique player identifier assigned by the server.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerId(pub u64);

/// Player color for rendering — assigned by server, synced once.
#[derive(Component, Serialize, Deserialize, Clone, Debug, PartialEq, Reflect)]
pub struct PlayerColor(pub Color);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/// Client sends JWT after connecting so the server can identify the user.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthMessage {
    pub jwt: String,
}

/// Server response to an auth attempt.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthResponse {
    pub success: bool,
    pub user_id: String,
}

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
        });

        // --- Messages ---
        app.register_message::<AuthMessage>();
        app.register_message::<AuthResponse>();

        // --- Replicated components (custom game components) ---

        // PlayerId: synced once on spawn, predicted + rollback
        app.register_component::<PlayerId>().add_prediction();

        // PlayerColor: synced once on spawn, predicted
        app.register_component::<PlayerColor>().add_prediction();

        // --- Replicated avian3d physics components ---

        // Position: full sync with rollback
        app.register_component::<Position>().add_prediction();

        // Rotation: full sync with rollback
        app.register_component::<Rotation>().add_prediction();

        // LinearVelocity: predicted with rollback
        app.register_component::<LinearVelocity>().add_prediction();
    }
}
