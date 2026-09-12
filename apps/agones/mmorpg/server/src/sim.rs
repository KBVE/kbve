//! The authoritative world.
//!
//! A headless bevy app with avian3d for bodies and lightyear for replication.
//! Movement is server-owned: a client sends what keys it is holding and which
//! way its camera faces, and this decides where the character ends up. The
//! client predicts the same step locally so the character turns on the frame the
//! key goes down, and lightyear rolls it back when the two disagree.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};

use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::input::native::prelude::ActionState;
use lightyear::netcode::prelude::server::TokenUserData;
use lightyear::prelude::server::*;
use lightyear::prelude::*;
use mmorpg_net::{Guest, MMORPG_PROTOCOL_ID, MmorpgProtocolPlugin, PlayerId, PlayerInput, PlayerName, TICK_HZ};

use crate::token::unpack_identity;

/// Ground speed. Mirrors the client's walk speed so prediction and the
/// authoritative step agree; a mismatch shows up as a character that rubber-bands
/// while running in a straight line.
const WALK_SPEED: f32 = 4.2;
const SPRINT_SPEED: f32 = 7.4;

/// Where a character stands before it has moved anywhere.
const SPAWN_HEIGHT: f32 = 2.0;

/// Players are spread on spawn so two joining at once do not start inside one
/// another and get pushed apart by the solver.
static SPAWN_INDEX: AtomicU32 = AtomicU32::new(0);

/// The netcode private key, kept so the sim and the token endpoint cannot drift.
#[derive(Resource, Clone, Copy)]
pub struct NetcodeKey(pub [u8; 32]);

/// Where the game socket listens.
#[derive(Resource, Clone, Copy)]
pub struct GameAddr(pub SocketAddr);

/// The lightyear server entity.
///
/// Held so that a spawn can tell whether the listener came up before the first
/// client did, and so that the day a second transport is added the replication
/// target can name this entity instead of being resolved by a `single()` that
/// would then panic.
#[derive(Resource, Clone, Copy)]
struct ServerEntity(#[allow(dead_code)] Entity);

/// The connection entity a character belongs to.
#[derive(Component, Clone, Copy)]
struct OwnedBy(Entity);

pub fn build(private_key: [u8; 32], game_addr: SocketAddr) -> App {
    let mut app = App::new();

    let tick = std::time::Duration::from_secs_f64(1.0 / f64::from(TICK_HZ));

    // Headless: no window, no renderer, no audio. `ScheduleRunnerPlugin` drives
    // the loop at the tick rate instead of a compositor doing it.
    app.add_plugins(
        MinimalPlugins.set(bevy::app::ScheduleRunnerPlugin::run_loop(tick)),
    );
    app.add_plugins(bevy::state::app::StatesPlugin);
    app.add_plugins(bevy::transform::TransformPlugin);

    // avian, with the two plugins lightyear_avian replaces. Leaving them on
    // means two systems writing `Transform` from `Position` on the same frame.
    app.add_plugins(
        PhysicsPlugins::default()
            .build()
            .disable::<PhysicsTransformPlugin>()
            .disable::<PhysicsInterpolationPlugin>(),
    );
    app.add_plugins(lightyear_avian3d::prelude::LightyearAvianPlugin::default());

    app.add_plugins(ServerPlugins { tick_duration: tick });
    app.add_plugins(MmorpgProtocolPlugin);

    app.insert_resource(NetcodeKey(private_key));
    app.insert_resource(GameAddr(game_addr));

    app.add_systems(Startup, (start_listening, spawn_ground));
    app.add_observer(on_link);
    app.add_observer(on_connected);
    app.add_observer(on_disconnected);
    app.add_systems(FixedUpdate, drive_players);

    app
}

/// Open the game port.
fn start_listening(mut commands: Commands, key: Res<NetcodeKey>, addr: Res<GameAddr>) {
    use lightyear::websocket::prelude::server::*;

    // Plaintext on purpose. The pod sits behind the Cilium gateway, which
    // terminates TLS and speaks `ws://` to the backend -- the same shape the
    // other game fleets use. A second certificate inside the pod would be one
    // more thing to rotate for no gain.
    let config = ServerConfig::builder()
        .with_bind_address(addr.0)
        .with_no_encryption();

    let server = commands
        .spawn((
            NetcodeServer::new(NetcodeConfig {
                protocol_id: MMORPG_PROTOCOL_ID,
                private_key: key.0,
                client_timeout_secs: 15,
                ..Default::default()
            }),
            LocalAddr(addr.0),
            WebSocketServerIo { config },
        ))
        .id();

    commands.trigger(Start { entity: server });
    commands.insert_resource(ServerEntity(server));
    info!("[mmorpg-server/sim] listening for players on ws://{}", addr.0);
}

/// A floor, so a character that spawns at head height lands instead of falling
/// forever. The real terrain is the client's heightfield; matching it server-side
/// is the next piece of work, and until then everyone stands on the same plane.
fn spawn_ground(mut commands: Commands) {
    commands.spawn((
        RigidBody::Static,
        Collider::cuboid(512.0, 1.0, 512.0),
        Position(Vec3::new(0.0, -0.5, 0.0)),
    ));
}

/// lightyear wants a `ReplicationSender` on the connection entity before the
/// connection completes; adding it when the link appears is the documented
/// order.
fn on_link(trigger: On<Add, LinkOf>, mut commands: Commands) {
    commands
        .entity(trigger.entity)
        .insert(ReplicationSender::default());
}

/// A client finished the netcode handshake: give it a character.
///
/// The name comes out of the token's signed `user_data`, so a client cannot ask
/// to be someone else, and a guest is simply a token that said so.
fn on_connected(
    trigger: On<Add, Connected>,
    mut commands: Commands,
    server: Option<Res<ServerEntity>>,
    tokens: Query<&TokenUserData>,
) {
    let client = trigger.entity;
    if server.is_none() {
        error!("[mmorpg-server/sim] a client connected before the server entity existed");
        return;
    }

    let who = tokens
        .get(client)
        .map(|data| unpack_identity(&data.0))
        .unwrap_or_else(|_| crate::auth::Identity::guest());

    let index = SPAWN_INDEX.fetch_add(1, Ordering::Relaxed);
    // A ring rather than a line: twenty testers in a row would put the last one
    // forty metres from the first.
    let angle = f32::from(index as u16) * 0.7;
    let radius = 3.0 + (index % 5) as f32;
    let spawn = Vec3::new(angle.cos() * radius, SPAWN_HEIGHT, angle.sin() * radius);

    let player = commands
        .spawn((
            PlayerId(index as u64),
            PlayerName(who.name.clone()),
            Guest(who.guest),
            OwnedBy(client),
            RigidBody::Kinematic,
            Collider::capsule(0.35, 1.1),
            Position(spawn),
            Rotation::default(),
            LinearVelocity::default(),
            ActionState::<PlayerInput>::default(),
            // `to_clients` resolves the single `Server` entity in the world,
            // which is exactly what this process has. Adding a second transport
            // later -- WebTransport beside the WebSocket -- turns that lookup
            // into a panic at the first spawn, and the fix then is
            // `ReplicationMode::Server(server, ...)` naming this entity, which
            // is why it is carried in a resource already.
            Replicate::to_clients(NetworkTarget::All),
            ControlledBy {
                owner: client,
                lifetime: Default::default(),
            },
        ))
        .id();

    info!(
        name = %who.name,
        guest = who.guest,
        "[mmorpg-server/sim] {player:?} joined"
    );
}

/// Remove the character when its connection goes.
///
/// Without this a tester who closes the tab leaves a body standing in the world
/// for everyone else, and the next join spawns beside a crowd of ghosts.
fn on_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    players: Query<(Entity, &OwnedBy, &PlayerName)>,
) {
    for (entity, owner, name) in &players {
        if owner.0 == trigger.entity {
            info!(name = %name.0, "[mmorpg-server/sim] {entity:?} left");
            commands.entity(entity).despawn();
        }
    }
}

/// Turn held keys into velocity, once per tick, for every character.
///
/// Kinematic bodies rather than dynamic: this is a character controller, and a
/// player should not be shoved off a ledge because someone ran into them. The
/// vertical component is left alone so gravity and the ground collider still
/// decide height.
fn drive_players(mut players: Query<(&ActionState<PlayerInput>, &mut LinearVelocity)>) {
    for (action, mut velocity) in &mut players {
        let PlayerInput::Move(intent) = action.0 else {
            velocity.0.x = 0.0;
            velocity.0.z = 0.0;
            continue;
        };
        let dir = intent.to_world_dir();
        let speed = if intent.sprint { SPRINT_SPEED } else { WALK_SPEED };
        velocity.0.x = dir.x * speed;
        velocity.0.z = dir.z * speed;
    }
}
