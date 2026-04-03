//! Client-side transport and connection lifecycle.
//!
//! Follows lightyear's example pattern: spawn a [`GameClient`] entity with a
//! [`ClientTransport`] variant, and the `on_add` hook inserts the correct
//! `NetcodeClient` + IO component. The game never imports lightyear transport
//! types directly.
//!
//! # Usage
//!
//! ```ignore
//! let entity = commands.spawn(GameClient {
//!     transport: ClientTransport::WebSocket {
//!         url: "wss://example.com/ws".into(),
//!     },
//!     token_bytes: token,
//! }).id();
//! ```
//!
//! The `on_add` hook handles the rest — inserts `NetcodeClient` + IO component
//! and triggers `Connect`. If the connection fails, the game observes
//! `Disconnected` and decides what to do (retry with a different transport,
//! return to title screen, etc.). **No fallback logic lives in this crate.**

use bevy::ecs::lifecycle::HookContext;
use bevy::ecs::world::DeferredWorld;
use bevy::prelude::*;
use lightyear::netcode::ConnectToken;
use lightyear::netcode::NetcodeClient;
use lightyear::netcode::client_plugin::NetcodeConfig;
use lightyear::prelude::client::*;
use lightyear::prelude::*;

// ---------------------------------------------------------------------------
// Transport enum — each variant is fully self-contained, no mixing.
// ---------------------------------------------------------------------------

/// Transport selection — one variant per connection attempt.
/// Mirrors lightyear's `ClientTransports` enum from the examples.
/// Each variant maps 1:1 to a lightyear IO component.
#[derive(Clone, Debug)]
#[non_exhaustive]
pub enum ClientTransport {
    /// Connect via UDP (native only — not available on WASM).
    /// Uses `PeerAddr` on the entity to find the server.
    #[cfg(not(target_family = "wasm"))]
    Udp,
    /// Connect via WebSocket (works on all platforms).
    WebSocket { url: String },
    /// Connect via WebTransport (QUIC).
    WebTransport {
        url: String,
        /// SHA-256 cert digest (hex). Empty for CA-signed ("trusted") certs.
        cert_digest: String,
        /// "trusted" (CA-signed, no pinning) or "self-signed" (hash pinning).
        cert_type: String,
    },
}

// ---------------------------------------------------------------------------
// GameClient component — spawn this to initiate a connection.
// ---------------------------------------------------------------------------

/// Spawn this component on an entity to connect to a game server.
///
/// The `on_add` hook reads the transport + token, inserts the correct
/// lightyear `NetcodeClient` + IO component, then triggers `Connect`.
/// Follows the exact pattern from lightyear's `ExampleClient`.
///
/// If the connection fails (Disconnected/Unlinked), the **game** is
/// responsible for deciding what to do — despawn the entity and spawn a
/// new `GameClient` with a different transport, return to the title
/// screen, etc. This crate does not own fallback logic because the
/// server keeps entity IDs isolated per transport.
#[derive(Component)]
#[component(on_add = GameClient::on_add)]
pub struct GameClient {
    pub transport: ClientTransport,
    pub token_bytes: [u8; 2048],
}

impl GameClient {
    fn on_add(mut world: DeferredWorld, context: HookContext) {
        let entity = context.entity;
        world.commands().queue(move |world: &mut World| {
            let mut entity_mut = world.entity_mut(entity);
            let Some(settings) = entity_mut.take::<GameClient>() else {
                return;
            };

            // Parse token + create NetcodeClient (shared across all transports)
            let token = match ConnectToken::try_from_bytes(&settings.token_bytes) {
                Ok(t) => t,
                Err(e) => {
                    error!("[GameClient] invalid ConnectToken: {e}");
                    return;
                }
            };
            let netcode =
                match NetcodeClient::new(Authentication::Token(token), NetcodeConfig::default()) {
                    Ok(n) => n,
                    Err(e) => {
                        error!("[GameClient] NetcodeClient init failed: {e}");
                        return;
                    }
                };

            // Insert shared components
            entity_mut.insert((netcode, ReplicationReceiver::default()));

            // Insert transport-specific IO component — one match arm per
            // transport, each inserts exactly one IO component.
            match settings.transport {
                #[cfg(not(target_family = "wasm"))]
                ClientTransport::Udp => {
                    info!("[GameClient] UDP (uses PeerAddr for server address)");
                    entity_mut.insert(UdpIo::default());
                }
                ClientTransport::WebTransport {
                    url,
                    cert_digest,
                    cert_type,
                } => {
                    use lightyear::webtransport::prelude::client::*;

                    let is_trusted = cert_type == "trusted";
                    let addr_str = url
                        .trim_start_matches("https://")
                        .trim_start_matches("http://");

                    let server_addr: std::net::SocketAddr =
                        if let Ok(addr) = addr_str.parse::<std::net::SocketAddr>() {
                            addr
                        } else {
                            use std::net::ToSocketAddrs;
                            addr_str
                                .to_socket_addrs()
                                .ok()
                                .and_then(|mut addrs| addrs.find(|a| a.is_ipv4()))
                                .unwrap_or_else(|| "127.0.0.1:5001".parse().unwrap())
                        };

                    let digest = if is_trusted {
                        String::new()
                    } else {
                        cert_digest
                    };

                    info!(
                        "[GameClient] WebTransport → {url} (cert={cert_type}, addr={server_addr})"
                    );
                    entity_mut.insert((
                        PeerAddr(server_addr),
                        WebTransportClientIo {
                            certificate_digest: digest,
                        },
                    ));
                }
                ClientTransport::WebSocket { url } => {
                    use lightyear::websocket::prelude::client::*;

                    info!("[GameClient] WebSocket → {url}");

                    #[cfg(not(target_arch = "wasm32"))]
                    let ws_config = lightyear::websocket::prelude::client::ClientConfig::builder()
                        .with_no_cert_validation();
                    #[cfg(target_arch = "wasm32")]
                    let ws_config = lightyear::websocket::prelude::client::ClientConfig::default();

                    entity_mut.insert(WebSocketClientIo::from_url(ws_config, url));
                }
            }

            // Trigger the connection — same as examples
            world.trigger(Connect { entity });
            info!("[GameClient] Connect triggered for entity {entity:?}");
        });
    }
}

// ---------------------------------------------------------------------------
// Connection lifecycle markers
// ---------------------------------------------------------------------------

/// Marker: a connection attempt has begun (Connecting was reached).
/// Distinguishes "initial Disconnected from #[require]" vs "real disconnect".
#[derive(Component)]
pub struct ConnectionAttempted;

/// Timestamp when the connection attempt started (for handshake timeout).
/// Uses `Time::elapsed_secs_f64()` instead of `Instant` (WASM-safe).
#[derive(Component)]
pub struct HandshakeStartedAt(pub f64);

/// Marker: the client reached Connected at least once.
#[derive(Component)]
pub struct WasConnected;

/// Marker: entity should be despawned next frame (deferred cleanup).
#[derive(Component)]
pub struct PendingDespawn;

/// Maximum seconds to wait for the netcode handshake before aborting.
pub const HANDSHAKE_TIMEOUT_SECS: f64 = 10.0;

// ---------------------------------------------------------------------------
// Lifecycle observers — follows lightyear example patterns
// ---------------------------------------------------------------------------

/// Linking started.
pub fn on_linking(trigger: On<Add, Linking>) {
    info!(
        "[net][link] LINKING — entity {:?} transport connection starting",
        trigger.entity
    );
}

/// Connection established — mark entity so we can distinguish real
/// disconnects from the initial Disconnected state.
pub fn on_connected(trigger: On<Add, Connected>, mut commands: Commands) {
    let entity = trigger.entity;
    commands.entity(entity).insert(WasConnected);
    info!("[net][lifecycle] CONNECTED — entity {entity:?} fully connected!");
}

/// Connecting started — record attempt time for handshake timeout.
pub fn on_connecting(trigger: On<Add, Connecting>, mut commands: Commands, time: Res<Time>) {
    let entity = trigger.entity;
    commands.entity(entity).insert((
        ConnectionAttempted,
        HandshakeStartedAt(time.elapsed_secs_f64()),
    ));
    info!("[net][lifecycle] CONNECTING — entity {entity:?} lightyear handshake in progress");
}

/// Link layer failed or closed.
pub fn on_unlinked(trigger: On<Add, Unlinked>) {
    warn!(
        "[net][link] UNLINKED — entity {:?} transport failed or closed",
        trigger.entity
    );
}

/// Handshake timeout — abort if netcode doesn't complete in time.
pub fn check_handshake_timeout(
    mut commands: Commands,
    time: Res<Time>,
    query: Query<(Entity, &HandshakeStartedAt), (With<Connecting>, Without<Connected>)>,
) {
    for (entity, started) in &query {
        let elapsed = time.elapsed_secs_f64() - started.0;
        if elapsed >= HANDSHAKE_TIMEOUT_SECS {
            warn!("[net] handshake timeout after {elapsed:.1}s — aborting entity {entity:?}");
            commands.entity(entity).insert(PendingDespawn);
        }
    }
}

/// Deferred cleanup: despawn PendingDespawn entities after one frame so
/// lightyear's deferred commands have time to flush.
pub fn cleanup_pending_despawn(mut commands: Commands, query: Query<Entity, With<PendingDespawn>>) {
    for entity in &query {
        commands.entity(entity).despawn();
        info!("[net] deferred despawn of client entity {entity:?}");
    }
}
