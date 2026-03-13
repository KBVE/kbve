//! Game server module — headless Bevy app with lightyear ServerPlugin + avian3d.
//!
//! Runs the authoritative physics simulation and lightyear replication in a
//! dedicated thread alongside the existing Axum REST API.

use std::net::SocketAddr;
use std::time::Duration;

use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::server::*;
use lightyear::prelude::*;

use bevy_kbve_net::ProtocolPlugin;

/// Server tick rate: 20 Hz (matching client).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Default WebSocket listen address for the game server.
const DEFAULT_WS_ADDR: &str = "0.0.0.0:5000";

/// Initialize and spawn the headless Bevy game server in a background thread.
///
/// Lightyear's WebSocket server binds its own port (default 5000), separate
/// from the Axum HTTP server. The Bevy app runs its own event loop.
pub fn init_gameserver() {
    let ws_addr: SocketAddr = std::env::var("GAME_WS_ADDR")
        .unwrap_or_else(|_| DEFAULT_WS_ADDR.to_string())
        .parse()
        .expect("invalid GAME_WS_ADDR");

    std::thread::spawn(move || {
        tracing::info!("game server starting on ws://{ws_addr}");
        run_bevy_app(ws_addr);
    });
}

fn run_bevy_app(ws_addr: SocketAddr) {
    let mut app = App::new();

    // Minimal headless Bevy — no window, no renderer
    app.add_plugins(MinimalPlugins);

    // avian3d physics (headless — disable transform sync plugins,
    // lightyear_avian handles that)
    app.add_plugins(
        PhysicsPlugins::default()
            .build()
            .disable::<PhysicsTransformPlugin>()
            .disable::<PhysicsInterpolationPlugin>(),
    );

    // lightyear server networking
    app.add_plugins(ServerPlugins {
        tick_duration: TICK_DURATION,
    });

    // Shared protocol (components, inputs, channels)
    app.add_plugins(ProtocolPlugin);

    // lightyear–avian3d bridge
    app.add_plugins(lightyear_avian3d::prelude::LightyearAvianPlugin::default());

    // Spawn the server listener on startup
    let startup_addr = ws_addr;
    app.add_systems(Startup, move |mut commands: Commands| {
        start_server(&mut commands, startup_addr);
    });

    // Handle new client connections
    app.add_observer(handle_new_connection);

    // Shared movement system (server-authoritative)
    app.add_systems(FixedUpdate, apply_player_inputs);

    tracing::info!("game server Bevy app running");
    app.run();
}

/// Spawn the lightyear WebSocket server entity and trigger it to start listening.
fn start_server(commands: &mut Commands, ws_addr: SocketAddr) {
    use lightyear::websocket::prelude::server::*;

    let config = ServerConfig::builder()
        .with_bind_address(ws_addr)
        .with_no_encryption();

    let server_entity = commands
        .spawn((
            Server::default(),
            LocalAddr(ws_addr),
            WebSocketServerIo { config },
        ))
        .id();

    commands.trigger(LinkStart {
        entity: server_entity,
    });
    tracing::info!("lightyear WebSocket server listening on {ws_addr}");
}

/// When a new client connects, spawn their player entity with replicated components.
fn handle_new_connection(trigger: On<Add, Connected>, mut commands: Commands) {
    let client_entity = trigger.entity;
    tracing::info!("new game client connected: {client_entity:?}");

    // Spawn a player entity owned by this client
    commands.spawn((
        bevy_kbve_net::protocol::PlayerId(client_entity.to_bits()),
        bevy_kbve_net::protocol::PlayerColor(Color::srgb(0.2, 0.4, 0.8)),
        Transform::from_xyz(2.0, 2.0, 2.0),
        RigidBody::Kinematic,
        Position::default(),
        Rotation::default(),
        LinearVelocity::default(),
        Collider::cuboid(0.6, 1.2, 0.6),
    ));
}

/// Server-authoritative movement: read inputs from all predicted players and apply physics.
fn apply_player_inputs(
    mut query: Query<(&mut Transform, &bevy_kbve_net::protocol::PlayerId)>,
    // TODO: read lightyear ActionState<PlayerInput> from connected clients
    // and apply movement here
) {
    for (_transform, _id) in &mut query {
        // Phase 3 stub: server reads buffered inputs from lightyear and
        // applies the shared movement logic. Full implementation comes when
        // client input buffering is wired up.
    }
}
