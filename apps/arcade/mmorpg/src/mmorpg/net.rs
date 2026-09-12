//! Joining the dedicated server.
//!
//! Three steps, in order, because each needs the one before it:
//!
//! 1. ask the server's HTTP door for a `ConnectToken`, presenting a Supabase
//!    access token if the player has one and nothing if they do not;
//! 2. open the WebSocket lightyear connects over, using that token;
//! 3. send held keys every tick, and give every other player a body.
//!
//! The token step exists because a browser cannot put an Authorization header
//! on a WebSocket. It is also where guest play comes from: the same request
//! with the account half missing.
//!
//! Behind the `net` feature. Without it this module is not compiled and the
//! game is the single-player build it was before a server existed.

use std::sync::{Arc, Mutex};

use bevy::prelude::*;
use bevy_kbve_net::client::{ClientTransport, GameClient};
use lightyear::input::native::prelude::ActionState;
use mmorpg_net::{Guest, MoveIntent, PlayerInput, PlayerName};

/// Where to ask for a token. Overridden with `MMORPG_SERVER` for a local
/// server, which is the only way to point a native build at a laptop.
const DEFAULT_TOKEN_URL: &str = "https://mmorpg.kbve.com/token";

/// How far apart a remote player's capsule stands from the ground plane.
const REMOTE_CAPSULE_HALF_HEIGHT: f32 = 0.55;
const REMOTE_CAPSULE_RADIUS: f32 = 0.35;

pub struct NetPlugin;

impl Plugin for NetPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(mmorpg_net::MmorpgProtocolPlugin);
        app.init_resource::<Session>();
        app.add_systems(Startup, request_token);
        app.add_systems(
            Update,
            (
                connect_when_token_arrives,
                give_remote_players_a_body,
                send_input,
            ),
        );
    }
}

/// What the token endpoint said, once it has said it.
///
/// A mutex rather than a channel because the reply arrives on whatever thread
/// `ehttp` finished on -- the browser's callback on wasm, a worker thread
/// natively -- and bevy reads it from the main one.
#[derive(Resource, Default)]
pub struct Session {
    pending: Arc<Mutex<Option<Result<Credential, String>>>>,
    /// Set once the socket has been asked for, so the connect system does not
    /// spawn a second client on the next frame.
    connecting: bool,
    /// The name the server gave this player, for the HUD.
    pub name: Option<String>,
    pub guest: bool,
}

/// The parts of the token response this client acts on.
#[derive(Clone)]
pub struct Credential {
    token: Vec<u8>,
    url: String,
    name: String,
    guest: bool,
}

fn token_url() -> String {
    std::env::var("MMORPG_SERVER").unwrap_or_else(|_| DEFAULT_TOKEN_URL.to_owned())
}

/// Ask for a token.
///
/// No account token is attached yet: signing in happens in the browser shell and
/// is not wired to this build, so every player currently arrives as a guest --
/// which is what a public playtest wants. The server accepts both, so adding a
/// bearer header here later changes nothing else.
fn request_token(session: Res<Session>) {
    let slot = session.pending.clone();
    let url = token_url();
    info!("[mmorpg/net] asking {url} for a connect token");

    let mut request = ehttp::Request::post(&url, Vec::new());
    request
        .headers
        .insert("Content-Type".to_owned(), "application/json".to_owned());

    ehttp::fetch(request, move |result| {
        let parsed = match result {
            Ok(response) if response.ok => parse_token(&response.bytes),
            Ok(response) => Err(format!(
                "the server refused to issue a token ({})",
                response.status
            )),
            Err(e) => Err(format!("could not reach the server: {e}")),
        };
        if let Ok(mut guard) = slot.lock() {
            *guard = Some(parsed);
        }
    });
}

fn parse_token(body: &[u8]) -> Result<Credential, String> {
    let value: serde_json::Value =
        serde_json::from_slice(body).map_err(|e| format!("unreadable token response: {e}"))?;
    let token = value
        .get("token")
        .and_then(|t| t.as_str())
        .ok_or("the token response carried no token")?;
    let url = value
        .get("server_url")
        .and_then(|u| u.as_str())
        .ok_or("the token response carried no server url")?;
    let bytes = bevy_kbve_net::net_config::base64_to_token_bytes(token)?;
    Ok(Credential {
        token: bytes.to_vec(),
        url: url.to_owned(),
        name: value
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("player")
            .to_owned(),
        guest: value
            .get("guest")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(true),
    })
}

/// Open the socket once the token is in hand.
fn connect_when_token_arrives(mut commands: Commands, mut session: ResMut<Session>) {
    if session.connecting {
        return;
    }
    let taken = session.pending.lock().ok().and_then(|mut g| g.take());
    let Some(result) = taken else {
        return;
    };

    match result {
        Ok(credential) => {
            let mut token_bytes = [0u8; 2048];
            let len = credential.token.len().min(token_bytes.len());
            token_bytes[..len].copy_from_slice(&credential.token[..len]);

            info!(
                "[mmorpg/net] joining {} as {}{}",
                credential.url,
                credential.name,
                if credential.guest { " (guest)" } else { "" }
            );
            session.name = Some(credential.name);
            session.guest = credential.guest;
            session.connecting = true;

            commands.spawn(GameClient {
                transport: ClientTransport::WebSocket {
                    url: credential.url,
                },
                token_bytes,
            });
        }
        Err(reason) => {
            // Not fatal. The world is already running single-player, and a
            // player who cannot reach the server should get a world they can
            // walk around rather than a black screen.
            warn!("[mmorpg/net] playing offline: {reason}");
            session.connecting = true;
        }
    }
}

/// Give every replicated player something visible.
///
/// A capsule, not the full character rig: the rig is driven by the local
/// animation and IK systems, and pointing those at a replicated transform is its
/// own piece of work. A capsule with a name over it is enough to see that two
/// people are in the same world, which is what a playtest is asking.
fn give_remote_players_a_body(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    arrivals: Query<(Entity, &PlayerName, &Guest), Added<PlayerName>>,
) {
    for (entity, name, guest) in &arrivals {
        // Guests are tinted so a playtest can tell at a glance who is signed in.
        let colour = if guest.0 {
            Color::srgb(0.55, 0.62, 0.78)
        } else {
            Color::srgb(0.86, 0.72, 0.36)
        };
        commands.entity(entity).insert((
            Mesh3d(meshes.add(Capsule3d::new(
                REMOTE_CAPSULE_RADIUS,
                REMOTE_CAPSULE_HALF_HEIGHT * 2.0,
            ))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: colour,
                perceptual_roughness: 0.9,
                ..default()
            })),
            Visibility::default(),
        ));
        info!("[mmorpg/net] {} joined", name.0);
    }
}

/// Ship the keys being held, once per tick.
///
/// The camera's yaw travels with them: the server resolves `forward` into world
/// space and has no other way to know which way the player is looking.
fn send_input(
    keys: Res<ButtonInput<KeyCode>>,
    camera: Query<&Transform, With<Camera3d>>,
    mut action: Query<&mut ActionState<PlayerInput>>,
) {
    let Ok(mut action) = action.single_mut() else {
        return;
    };
    let yaw = camera
        .single()
        .map(|t| t.rotation.to_euler(EulerRot::YXZ).0)
        .unwrap_or(0.0);

    let intent = MoveIntent {
        forward: keys.pressed(KeyCode::KeyW),
        back: keys.pressed(KeyCode::KeyS),
        left: keys.pressed(KeyCode::KeyA),
        right: keys.pressed(KeyCode::KeyD),
        jump: keys.pressed(KeyCode::Space),
        sprint: keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight),
        yaw,
    };

    action.0 = if intent.forward || intent.back || intent.left || intent.right || intent.jump {
        PlayerInput::Move(intent)
    } else {
        // Idle rather than a zeroed Move: the server stops a character on Idle,
        // and sending Move(zero) every frame a player stands still would make
        // every one of those frames a rollback candidate.
        PlayerInput::Idle
    };
}
