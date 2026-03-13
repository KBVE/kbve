//! Lightyear client-side networking plugin.
//!
//! Adds `ClientPlugins` (lightyear transport + replication) and the shared
//! `ProtocolPlugin` so the game can connect to the authoritative server.
//!
//! Connection is NOT established automatically — the player triggers it
//! via the "Go Online" UI button, which calls the `go_online` WASM export.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use bevy::prelude::*;
use lightyear::prelude::client::*;
use lightyear::prelude::*;

use bevy_kbve_net::{AuthMessage, GameChannel, ProtocolPlugin};

/// Default server address (localhost for development).
const DEFAULT_SERVER_ADDR: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 5000);

/// Tick rate matching the server (20 Hz).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Atomic flag set by JS `go_online()` call, consumed by Bevy system.
static GO_ONLINE_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Optional server address override from JS (e.g. "1.2.3.4:5000").
static SERVER_ADDR_OVERRIDE: Mutex<Option<String>> = Mutex::new(None);

/// JWT token passed from JS for server authentication.
static AUTH_JWT: Mutex<Option<String>> = Mutex::new(None);

/// Atomic flag indicating whether we are currently connected.
static IS_CONNECTED: AtomicBool = AtomicBool::new(false);

/// Called from JS/WASM to request a connection to the game server.
/// `server_addr` can be empty to use the default, or "host:port" format.
/// `jwt` is the Supabase access token for authentication.
pub fn request_go_online(server_addr: &str, jwt: &str) {
    if !server_addr.is_empty() {
        if let Ok(mut guard) = SERVER_ADDR_OVERRIDE.lock() {
            *guard = Some(server_addr.to_owned());
        }
    }
    if !jwt.is_empty() {
        if let Ok(mut guard) = AUTH_JWT.lock() {
            *guard = Some(jwt.to_owned());
        }
    }
    GO_ONLINE_REQUESTED.store(true, Ordering::Release);
}

/// Returns whether the client is currently connected to a game server.
pub fn is_online() -> bool {
    IS_CONNECTED.load(Ordering::Relaxed)
}

/// Bevy resource holding the resolved game server address.
#[derive(Resource)]
pub struct GameServerAddr(pub SocketAddr);

impl Default for GameServerAddr {
    fn default() -> Self {
        let override_addr = SERVER_ADDR_OVERRIDE
            .lock()
            .ok()
            .and_then(|g| g.as_ref().and_then(|s| s.parse().ok()));

        let addr = override_addr
            .or_else(|| {
                std::env::var("GAME_SERVER_ADDR")
                    .ok()
                    .and_then(|s| s.parse().ok())
            })
            .unwrap_or(DEFAULT_SERVER_ADDR);
        Self(addr)
    }
}

/// Tracks pending JWT that needs to be sent after connection is established.
#[derive(Resource, Default)]
struct PendingAuth {
    jwt: Option<String>,
    sent: bool,
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
        app.init_resource::<PendingAuth>();

        // Watch for go-online requests from JS
        app.add_systems(Update, poll_go_online_request);

        // Send auth message once connected
        app.add_systems(Update, send_auth_on_connect.after(poll_go_online_request));
    }
}

/// Bevy system that checks the atomic flag each frame and connects when requested.
fn poll_go_online_request(
    mut commands: Commands,
    addr: Res<GameServerAddr>,
    mut pending_auth: ResMut<PendingAuth>,
) {
    if !GO_ONLINE_REQUESTED.swap(false, Ordering::AcqRel) {
        return;
    }

    if IS_CONNECTED.load(Ordering::Relaxed) {
        info!("already connected — ignoring go-online request");
        return;
    }

    // Grab the JWT before connecting
    let jwt = AUTH_JWT.lock().ok().and_then(|mut g| g.take());
    pending_auth.jwt = jwt;
    pending_auth.sent = false;

    connect_to_server(&mut commands, &addr);
}

/// Send AuthMessage to server once the connection is established.
fn send_auth_on_connect(
    mut pending_auth: ResMut<PendingAuth>,
    mut query: Query<&mut MessageSender<AuthMessage>, Added<Connected>>,
) {
    if pending_auth.sent || pending_auth.jwt.is_none() {
        return;
    }

    for mut sender in &mut query {
        let jwt = pending_auth.jwt.take().unwrap();
        sender.send::<GameChannel>(AuthMessage { jwt });
        pending_auth.sent = true;
        info!("sent auth message to server");
        break;
    }
}

/// Initiate a WebSocket connection to the game server.
fn connect_to_server(commands: &mut Commands, addr: &GameServerAddr) {
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
    IS_CONNECTED.store(true, Ordering::Release);
    info!("connecting to game server at ws://{server_addr}");
}
