//! Lightyear client-side networking plugin.
//!
//! Adds `ClientPlugins` (lightyear transport + replication) and the shared
//! `ProtocolPlugin` so the game can connect to the authoritative server.
//!
//! Connection is NOT established automatically — call `connect_to_server`
//! (or trigger `Connect`) when the player chooses to go online.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use bevy::prelude::*;
use lightyear::prelude::client::*;
use lightyear::prelude::*;

use bevy_kbve_net::ProtocolPlugin;

/// Default server address (localhost for development).
const DEFAULT_SERVER_ADDR: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 5000);

/// Tick rate matching the server (20 Hz).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Bevy resource holding the resolved game server address.
/// Set from `GAME_SERVER_ADDR` env var at startup, falls back to localhost:5000.
#[derive(Resource)]
pub struct GameServerAddr(pub SocketAddr);

impl Default for GameServerAddr {
    fn default() -> Self {
        let addr = std::env::var("GAME_SERVER_ADDR")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_SERVER_ADDR);
        Self(addr)
    }
}

pub struct NetPlugin;

impl Plugin for NetPlugin {
    fn build(&self, app: &mut App) {
        // Lightyear client transport + replication machinery
        app.add_plugins(ClientPlugins {
            tick_duration: TICK_DURATION,
        });

        // Shared protocol: replicated components, inputs, channels
        app.add_plugins(ProtocolPlugin);

        // Store resolved server address
        app.init_resource::<GameServerAddr>();
    }
}

/// System that can be called to initiate a WebSocket connection to the game server.
/// Reads the server address from the `GameServerAddr` resource.
/// Spawns the client networking entity and triggers the `Connect` event.
#[allow(dead_code)]
pub fn connect_to_server(mut commands: Commands, addr: Res<GameServerAddr>) {
    use lightyear::websocket::prelude::client::*;

    let server_addr = addr.0;

    let client_entity = commands
        .spawn((
            Client::default(),
            PeerAddr(server_addr),
            WebSocketClientIo::from_addr(ClientConfig::default(), WebSocketScheme::Plain),
        ))
        .id();

    commands.trigger(Connect {
        entity: client_entity,
    });
    info!("connecting to game server at ws://{server_addr}");
}
