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

use bevy_kbve_net::{
    AuthMessage, AuthResponse, CollectRequest, DamageEvent, GameChannel, ObjectRemoved,
    ObjectRespawned, PositionUpdate, ProtocolPlugin, TileKey,
};

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

/// How long (in seconds) before a collected object respawns.
const RESPAWN_COOLDOWN_SECS: f64 = 300.0; // 5 minutes

/// Maximum distance (world units) a player can be from an object to collect it.
const MAX_COLLECT_DISTANCE: f32 = 3.0;

/// Tracks collected world objects with the time they were collected.
/// When enough time passes, the object respawns (entry removed).
#[derive(Resource, Default)]
struct CollectedObjects(HashMap<TileKey, f64>);

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
    app.init_resource::<CollectedObjects>();

    // Spawn the server listener on startup
    let startup_addr = ws_addr;
    app.add_systems(Startup, move |mut commands: Commands| {
        start_server(&mut commands, startup_addr);
    });

    // Handle new client connections (mark as pending auth)
    app.add_observer(handle_new_connection);

    // Debug observers for connection lifecycle
    app.add_observer(on_server_connecting);
    app.add_observer(on_server_connected);
    app.add_observer(on_server_disconnected);

    // Process auth messages from clients
    app.add_systems(Update, process_auth_messages);

    // Receive position updates from clients and apply to their player entities
    app.add_systems(Update, process_position_updates);

    // Process damage events from clients
    app.add_systems(Update, process_damage_events);

    // Process collect requests from clients
    app.add_systems(Update, process_collect_requests);

    // Tick respawn timer for collected objects
    app.add_systems(Update, tick_respawns);

    // Send collected objects state to newly connected clients
    app.add_systems(Update, send_collected_state_to_new_clients);

    // Periodic debug heartbeat
    app.add_systems(Update, server_debug_heartbeat);

    tracing::info!("game server Bevy app running");
    app.run();
}

/// Spawn the lightyear WebSocket server entity and trigger it to start listening.
fn start_server(commands: &mut Commands, ws_addr: SocketAddr) {
    use lightyear::websocket::prelude::server::*;

    tracing::info!("[gameserver] start_server — binding to {ws_addr}");

    let config = ServerConfig::builder()
        .with_bind_address(ws_addr)
        .with_no_encryption();

    let server_entity = commands
        .spawn((
            lightyear::prelude::server::RawServer,
            Server::default(),
            LocalAddr(ws_addr),
            WebSocketServerIo { config },
        ))
        .id();

    tracing::info!("[gameserver] server entity spawned: {server_entity:?} — triggering LinkStart");

    commands.trigger(LinkStart {
        entity: server_entity,
    });
    tracing::info!("[gameserver] lightyear WebSocket server listening on {ws_addr}");
}

/// Debug observer: fires when lightyear adds `Connecting` to a client entity on the server side.
fn on_server_connecting(trigger: On<Add, Connecting>) {
    let entity = trigger.entity;
    tracing::info!(
        "[gameserver][lifecycle] CONNECTING — client entity {entity:?} starting handshake"
    );
}

/// Debug observer: fires when lightyear adds `Connected` to a client entity on the server side.
fn on_server_connected(trigger: On<Add, Connected>) {
    let entity = trigger.entity;
    tracing::info!(
        "[gameserver][lifecycle] CONNECTED — client entity {entity:?} handshake complete"
    );
}

/// When a client disconnects, clean up their player entity and auth state.
/// Despawning the replicated player entity triggers lightyear's built-in
/// despawn replication, notifying all remaining clients automatically.
fn on_server_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    mut authenticated: ResMut<AuthenticatedClients>,
    mut client_player_map: ResMut<ClientPlayerMap>,
) {
    let client_entity = trigger.entity;
    let user_id = authenticated.0.remove(&client_entity);
    let player_entity = client_player_map.0.remove(&client_entity);

    tracing::warn!(
        "[gameserver][lifecycle] DISCONNECTED — client {client_entity:?} user={user_id:?} player={player_entity:?}"
    );

    if let Some(player_entity) = player_entity {
        commands.entity(player_entity).despawn();
        tracing::info!(
            "[gameserver] despawned player entity {player_entity:?} for disconnected client {client_entity:?}"
        );
    }
}

/// Periodic heartbeat logging connected/pending clients every ~5 seconds.
fn server_debug_heartbeat(
    time: Res<Time>,
    mut timer: Local<Option<Timer>>,
    pending_q: Query<Entity, With<PendingAuth>>,
    connected_q: Query<Entity, With<Connected>>,
    authenticated: Res<AuthenticatedClients>,
) {
    let t = timer.get_or_insert_with(|| Timer::from_seconds(5.0, TimerMode::Repeating));
    t.tick(time.delta());
    if !t.just_finished() {
        return;
    }

    let pending: Vec<_> = pending_q.iter().collect();
    let connected: Vec<_> = connected_q.iter().collect();
    let auth_count = authenticated.0.len();

    if !pending.is_empty() || !connected.is_empty() || auth_count > 0 {
        tracing::info!(
            "[gameserver][heartbeat] connected={connected:?} pending_auth={pending:?} authenticated_count={auth_count}"
        );
    }
}

/// When a new client connects, add ReplicationSender so lightyear can replicate
/// entities to this client, and mark as pending authentication.
fn handle_new_connection(trigger: On<Add, Connected>, mut commands: Commands) {
    let client_entity = trigger.entity;
    tracing::info!(
        "[gameserver] NEW CLIENT — entity {client_entity:?} connected, inserting PendingAuth + ReplicationSender"
    );
    commands.entity(client_entity).insert((
        PendingAuth,
        ReplicationSender::new(
            REPLICATION_SEND_INTERVAL,
            SendUpdatesMode::SinceLastAck,
            false,
        ),
    ));
    tracing::info!(
        "[gameserver] ReplicationSender inserted for {client_entity:?} (interval={REPLICATION_SEND_INTERVAL:?})"
    );
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
                let (player_entity, player_id) = spawn_player(&mut commands, entity);
                sender.send::<GameChannel>(AuthResponse {
                    success: true,
                    user_id: "anonymous".to_string(),
                    player_id,
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
                    let (player_entity, player_id) = spawn_player(&mut commands, entity);
                    sender.send::<GameChannel>(AuthResponse {
                        success: true,
                        user_id: user_id.clone(),
                        player_id,
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
/// Returns (player_entity, player_id) where player_id = player_entity.to_bits()
/// so it matches PlayerId.0 and can be sent in AuthResponse.
fn spawn_player(commands: &mut Commands, _client_entity: Entity) -> (Entity, u64) {
    let idx = PLAYER_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Spread players apart so they don't collide on spawn
    let offset_x = (idx as f32) * 2.0;
    let spawn_x = 2.0 + offset_x;
    let spawn_y = 2.0;
    let spawn_z = 2.0;

    let (r, g, b) = PLAYER_COLORS[idx as usize % PLAYER_COLORS.len()];

    let player_entity = commands
        .spawn((
            // PlayerId is set below after we know the entity ID
            bevy_kbve_net::PlayerColor(Color::srgb(r, g, b)),
            bevy_kbve_net::PlayerVitals::default(),
            Transform::from_xyz(spawn_x, spawn_y, spawn_z),
            RigidBody::Kinematic,
            Position(Vec3::new(spawn_x, spawn_y, spawn_z)),
            Rotation::default(),
            LinearVelocity::default(),
            Collider::cuboid(0.6, 1.2, 0.6),
            // Mark for lightyear replication to all connected clients
            Replicate::to_clients(NetworkTarget::All),
        ))
        .id();

    // Use player_entity.to_bits() so PlayerId matches AuthResponse.player_id
    let player_id = player_entity.to_bits();
    commands
        .entity(player_entity)
        .insert(bevy_kbve_net::PlayerId(player_id));

    tracing::info!(
        "spawned player entity {player_entity:?} (player_id={player_id}) at ({spawn_x}, {spawn_y}, {spawn_z})"
    );

    (player_entity, player_id)
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

/// Process damage events from clients and apply to their PlayerVitals.
fn process_damage_events(
    client_player_map: Res<ClientPlayerMap>,
    mut receivers: Query<(Entity, &mut MessageReceiver<DamageEvent>), Without<PendingAuth>>,
    mut vitals: Query<&mut bevy_kbve_net::PlayerVitals>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(mut v) = vitals.get_mut(player_entity) {
                    let old_hp = v.health;
                    v.health = (v.health - msg.amount).max(0.0);
                    tracing::info!(
                        "[gameserver] damage applied to {player_entity:?}: {:.1} → {:.1} (source={:?})",
                        old_hp,
                        v.health,
                        msg.source
                    );
                }
            }
        }
    }
}

/// Process collect requests: validate proximity + object existence, track removal, broadcast.
fn process_collect_requests(
    time: Res<Time>,
    client_player_map: Res<ClientPlayerMap>,
    mut collected: ResMut<CollectedObjects>,
    mut receivers: Query<(Entity, &mut MessageReceiver<CollectRequest>), Without<PendingAuth>>,
    positions: Query<&Position>,
    mut senders: Query<&mut MessageSender<ObjectRemoved>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let tile = msg.tile;

            // Already collected?
            if collected.0.contains_key(&tile) {
                continue;
            }

            // Verify an object actually exists at this tile
            let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) else {
                tracing::warn!(
                    "[gameserver] no object at tile ({},{}) — ignoring collect",
                    tile.tx,
                    tile.tz
                );
                continue;
            };

            // Proximity check: player must be near the tile
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(pos) = positions.get(player_entity) {
                    let tile_world = Vec3::new(tile.tx as f32, pos.0.y, tile.tz as f32);
                    let dist = (pos.0 - tile_world).length();
                    if dist > MAX_COLLECT_DISTANCE {
                        tracing::warn!(
                            "[gameserver] player too far ({dist:.1}) from tile ({},{}) — ignoring collect",
                            tile.tx,
                            tile.tz
                        );
                        continue;
                    }
                }
            }

            // Track the collection with current elapsed time
            collected.0.insert(tile, time.elapsed_secs_f64());
            tracing::info!(
                "[gameserver] object collected: {kind:?} at ({},{})",
                tile.tx,
                tile.tz
            );

            // Broadcast ObjectRemoved to all connected clients
            let collector_id = client_player_map
                .0
                .get(&client_entity)
                .map(|e| e.to_bits())
                .unwrap_or(0);
            let removal = ObjectRemoved {
                tile,
                kind,
                collector_id,
            };
            for mut sender in &mut senders {
                sender.send::<bevy_kbve_net::GameChannel>(removal.clone());
            }
        }
    }
}

/// Periodically check for collected objects whose respawn cooldown has elapsed.
fn tick_respawns(
    time: Res<Time>,
    mut collected: ResMut<CollectedObjects>,
    mut senders: Query<&mut MessageSender<ObjectRespawned>, With<Connected>>,
) {
    let now = time.elapsed_secs_f64();
    let mut respawned = Vec::new();

    for (&tile, &collected_at) in collected.0.iter() {
        if now - collected_at >= RESPAWN_COOLDOWN_SECS {
            respawned.push(tile);
        }
    }

    for tile in respawned {
        collected.0.remove(&tile);

        if let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) {
            tracing::info!(
                "[gameserver] object respawned: {kind:?} at ({},{})",
                tile.tx,
                tile.tz
            );

            let msg = ObjectRespawned { tile, kind };
            for mut sender in &mut senders {
                sender.send::<bevy_kbve_net::GameChannel>(msg.clone());
            }
        }
    }
}

/// When a new client authenticates, send them all currently collected objects
/// so they know which ones to skip when loading chunks.
fn send_collected_state_to_new_clients(
    authenticated: Res<AuthenticatedClients>,
    collected: Res<CollectedObjects>,
    mut senders: Query<(Entity, &mut MessageSender<ObjectRemoved>), Added<ReplicationSender>>,
) {
    if collected.0.is_empty() {
        return;
    }

    for (entity, mut sender) in &mut senders {
        if !authenticated.0.contains_key(&entity) {
            continue;
        }

        tracing::info!(
            "[gameserver] sending {} collected objects to new client {entity:?}",
            collected.0.len()
        );

        for &tile in collected.0.keys() {
            if let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) {
                // collector_id=0 for catch-up messages — new client just skips spawning,
                // no loot is granted.
                sender.send::<bevy_kbve_net::GameChannel>(ObjectRemoved {
                    tile,
                    kind,
                    collector_id: 0,
                });
            }
        }
    }
}
