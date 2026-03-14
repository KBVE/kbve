//! Game server module — headless Bevy app with lightyear ServerPlugin + avian3d.
//!
//! Runs the authoritative physics simulation and lightyear replication in a
//! dedicated thread alongside the existing Axum REST API.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;

use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::server::*;
use lightyear::prelude::*;

use bevy_kbve_net::{AuthMessage, AuthResponse, GameChannel, PositionUpdate, ProtocolPlugin};

/// Server tick rate: 20 Hz (matching client).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Replication send interval — how often the server sends entity updates.
const REPLICATION_SEND_INTERVAL: Duration = Duration::from_millis(100);

/// Default WebSocket listen address for the game server.
const DEFAULT_WS_ADDR: &str = "0.0.0.0:5000";

/// Supabase JWT secret for token validation (read from env at startup).
#[derive(Resource)]
struct JwtSecret(String);

/// Maps client entities to authenticated user IDs (Supabase `sub` UUID).
#[derive(Resource, Default)]
struct AuthenticatedClients(HashMap<Entity, String>);

/// Maps client connection entities to their spawned player entities.
#[derive(Resource, Default)]
struct ClientPlayerMap(HashMap<Entity, Entity>);

/// Marker: client has not yet sent a valid AuthMessage.
#[derive(Component)]
struct PendingAuth;

/// Initialize and spawn the headless Bevy game server in a background thread.
///
/// Lightyear's WebSocket server binds its own port (default 5000), separate
/// from the Axum HTTP server. The Bevy app runs its own event loop.
pub fn init_gameserver() {
    let ws_addr: SocketAddr = std::env::var("GAME_WS_ADDR")
        .unwrap_or_else(|_| DEFAULT_WS_ADDR.to_string())
        .parse()
        .expect("invalid GAME_WS_ADDR");

    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();

    std::thread::spawn(move || {
        tracing::info!("game server starting on ws://{ws_addr}");
        run_bevy_app(ws_addr, jwt_secret);
    });
}

fn run_bevy_app(ws_addr: SocketAddr, jwt_secret: String) {
    let mut app = App::new();

    // Minimal headless Bevy — no window, no renderer
    app.add_plugins(MinimalPlugins);
    app.add_plugins(bevy::transform::TransformPlugin::default());

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

    // Auth resources
    app.insert_resource(JwtSecret(jwt_secret));
    app.init_resource::<AuthenticatedClients>();
    app.init_resource::<ClientPlayerMap>();

    // Spawn the server listener on startup
    let startup_addr = ws_addr;
    app.add_systems(Startup, move |mut commands: Commands| {
        start_server(&mut commands, startup_addr);
    });

    // Handle new client connections (mark as pending auth)
    app.add_observer(handle_new_connection);

    // Process auth messages from clients
    app.add_systems(Update, process_auth_messages);

    // Receive position updates from clients and apply to their player entities
    app.add_systems(Update, process_position_updates);

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

/// When a new client connects, add ReplicationSender so lightyear can replicate
/// entities to this client, and mark as pending authentication.
fn handle_new_connection(trigger: On<Add, Connected>, mut commands: Commands) {
    let client_entity = trigger.entity;
    tracing::info!("new game client connected (pending auth): {client_entity:?}");
    commands.entity(client_entity).insert((
        PendingAuth,
        ReplicationSender::new(
            REPLICATION_SEND_INTERVAL,
            SendUpdatesMode::SinceLastAck,
            false,
        ),
    ));
}

/// Check for AuthMessage from connected clients and validate their JWT.
fn process_auth_messages(
    mut commands: Commands,
    jwt_secret: Res<JwtSecret>,
    mut authenticated: ResMut<AuthenticatedClients>,
    mut client_player_map: ResMut<ClientPlayerMap>,
    mut query: Query<
        (
            Entity,
            &mut MessageReceiver<AuthMessage>,
            &mut MessageSender<AuthResponse>,
        ),
        With<PendingAuth>,
    >,
) {
    for (entity, mut receiver, mut sender) in &mut query {
        for msg in receiver.receive() {
            if jwt_secret.0.is_empty() {
                tracing::warn!(
                    "SUPABASE_JWT_SECRET not set — skipping JWT validation for {entity:?}"
                );
                let player_entity = spawn_player(&mut commands, entity);
                sender.send::<GameChannel>(AuthResponse {
                    success: true,
                    user_id: "anonymous".to_string(),
                    player_id: player_entity.to_bits(),
                });
                commands.entity(entity).remove::<PendingAuth>();
                authenticated.0.insert(entity, "anonymous".to_string());
                client_player_map.0.insert(entity, player_entity);
                continue;
            }

            match crate::auth::validate_token(&msg.jwt, &jwt_secret.0) {
                Ok(token_data) => {
                    let user_id = token_data.claims.sub.clone();
                    tracing::info!("client {entity:?} authenticated as user {user_id}");
                    let player_entity = spawn_player(&mut commands, entity);
                    sender.send::<GameChannel>(AuthResponse {
                        success: true,
                        user_id: user_id.clone(),
                        player_id: player_entity.to_bits(),
                    });
                    commands.entity(entity).remove::<PendingAuth>();
                    authenticated.0.insert(entity, user_id);
                    client_player_map.0.insert(entity, player_entity);
                }
                Err(e) => {
                    tracing::warn!("client {entity:?} auth failed: {e}");
                    sender.send::<GameChannel>(AuthResponse {
                        success: false,
                        user_id: String::new(),
                        player_id: 0,
                    });
                }
            }
        }
    }
}

/// Counter for assigning spread-out spawn positions.
static PLAYER_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Player colors for distinguishing remote players.
const PLAYER_COLORS: &[(f32, f32, f32)] = &[
    (0.2, 0.4, 0.8), // blue
    (0.8, 0.2, 0.2), // red
    (0.2, 0.8, 0.3), // green
    (0.8, 0.6, 0.1), // orange
    (0.6, 0.2, 0.8), // purple
    (0.1, 0.8, 0.8), // cyan
];

/// Spawn a player entity for an authenticated client, marked for replication.
fn spawn_player(commands: &mut Commands, client_entity: Entity) -> Entity {
    let player_id = client_entity.to_bits();
    let idx = PLAYER_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Spread players apart so they don't collide on spawn
    let offset_x = (idx as f32) * 2.0;
    let spawn_x = 2.0 + offset_x;
    let spawn_y = 2.0;
    let spawn_z = 2.0;

    let (r, g, b) = PLAYER_COLORS[idx as usize % PLAYER_COLORS.len()];

    tracing::info!(
        "spawning player entity for client {client_entity:?} (player_id={player_id}) at ({spawn_x}, {spawn_y}, {spawn_z})"
    );

    commands
        .spawn((
            bevy_kbve_net::PlayerId(player_id),
            bevy_kbve_net::PlayerColor(Color::srgb(r, g, b)),
            Transform::from_xyz(spawn_x, spawn_y, spawn_z),
            RigidBody::Kinematic,
            Position(Vec3::new(spawn_x, spawn_y, spawn_z)),
            Rotation::default(),
            LinearVelocity::default(),
            Collider::cuboid(0.6, 1.2, 0.6),
            // Mark for lightyear replication to all connected clients
            Replicate::to_clients(NetworkTarget::All),
        ))
        .id()
}

/// Receive PositionUpdate messages from authenticated clients and apply to their player entities.
fn process_position_updates(
    client_player_map: Res<ClientPlayerMap>,
    mut receivers: Query<(Entity, &mut MessageReceiver<PositionUpdate>), Without<PendingAuth>>,
    mut positions: Query<&mut Position>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(mut pos) = positions.get_mut(player_entity) {
                    pos.0 = Vec3::new(msg.x, msg.y, msg.z);
                }
            }
        }
    }
}
