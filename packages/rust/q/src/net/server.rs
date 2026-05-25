//! Server-side WebSocket transport — axum router + per-match session loop.
//!
//! Every connection sends a `ClientMessage::JoinMatch` first; the server
//! verifies the Supabase JWT (HS256 against `SUPABASE_JWT_SECRET`) and then
//! claims a free slot from the shared roster. When `SUPABASE_JWT_SECRET` is
//! unset the server runs in dev-accept mode and trusts the username field at
//! face value — handy for local smoke runs, never for production.

use std::sync::{Arc, RwLock};

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use tokio::sync::{broadcast, mpsc};

#[cfg(feature = "supabase-auth")]
use crate::auth;
use crate::proto::{self, ClientMessage, Input, ServerEvent};

/// One input as it crosses from a WS session into the bevy sim. Slot is the
/// authenticated source; trust this, never the wire.
pub type SlotInput = (proto::PlayerSlot, Input);

/// Match-wide roster of admitted players, indexed by slot.
/// Holds `MAX_PLAYERS` slots; `None` = free.
#[derive(Default)]
pub struct Roster {
    slots: Vec<Option<RosterEntry>>,
}

#[derive(Clone)]
struct RosterEntry {
    kbve_username: String,
}

impl Roster {
    pub fn new(capacity: usize) -> Self {
        Self {
            slots: vec![None; capacity.max(1)],
        }
    }

    /// Claim the lowest free slot. Returns `None` when full.
    fn claim(&mut self, kbve_username: String) -> Option<proto::PlayerSlot> {
        for (i, s) in self.slots.iter_mut().enumerate() {
            if s.is_none() {
                *s = Some(RosterEntry { kbve_username });
                return Some(proto::PlayerSlot(i as u8));
            }
        }
        None
    }

    fn release(&mut self, slot: proto::PlayerSlot) {
        if let Some(s) = self.slots.get_mut(slot.0 as usize) {
            *s = None;
        }
    }

    /// Snapshot the roster as a `PlayerView` list for the wire.
    fn snapshot(&self) -> Vec<proto::PlayerView> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                s.as_ref().map(|e| proto::PlayerView {
                    slot: proto::PlayerSlot(i as u8),
                    kbve_username: e.kbve_username.clone(),
                    connected: true,
                })
            })
            .collect()
    }

    /// Enumerate every claimed slot. Used by the sim to size per-player
    /// fields (`Snapshot.fields[]`) and per-player wave spawners.
    pub fn active_slots(&self) -> Vec<proto::PlayerSlot> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| s.as_ref().map(|_| proto::PlayerSlot(i as u8)))
            .collect()
    }
}

#[derive(Clone)]
pub struct ServerState {
    /// Broadcast bus shared with the bevy sim. WS sessions subscribe a
    /// receiver per connection.
    pub broadcast: Option<broadcast::Sender<ServerEvent>>,
    /// Inputs from authenticated WS sessions → sim. None = no sim wired,
    /// inputs are silently dropped (smoke/test path).
    pub input_tx: Option<mpsc::UnboundedSender<SlotInput>>,
    /// Seed echoed back to clients in the Welcome frame.
    pub seed: u64,
    /// Supabase JWT secret. Empty = dev-accept mode (any token admitted).
    pub jwt_secret: Vec<u8>,
    /// Shared roster — multiple WS sessions race for free slots.
    pub roster: Arc<RwLock<Roster>>,
}

impl ServerState {
    pub fn new(
        broadcast: broadcast::Sender<ServerEvent>,
        input_tx: mpsc::UnboundedSender<SlotInput>,
        seed: u64,
        jwt_secret: Vec<u8>,
    ) -> Self {
        Self {
            broadcast: Some(broadcast),
            input_tx: Some(input_tx),
            seed,
            jwt_secret,
            roster: Arc::new(RwLock::new(Roster::new(proto::MAX_PLAYERS))),
        }
    }

    pub fn empty() -> Self {
        Self {
            broadcast: None,
            input_tx: None,
            seed: 0,
            jwt_secret: Vec::new(),
            roster: Arc::new(RwLock::new(Roster::new(proto::MAX_PLAYERS))),
        }
    }
}

struct AdmittedPlayer {
    slot: proto::PlayerSlot,
    kbve_username: String,
}

/// Build the axum router with the supplied shared state.
pub fn router(state: ServerState) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(ws_upgrade))
        .with_state(Arc::new(state))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<ServerState>) {
    let admitted = match await_join_match(&mut socket, &state).await {
        Some(a) => a,
        None => return,
    };
    let slot = admitted.slot;
    let roster_handle = state.roster.clone();

    let welcome = ServerEvent::Welcome {
        protocol: proto::PROTOCOL_VERSION,
        your_slot: admitted.slot,
        seed: state.seed,
    };
    if let Ok(buf) = proto::encode(&welcome)
        && socket.send(Message::Binary(buf)).await.is_err()
    {
        release_slot(&roster_handle, slot);
        return;
    }

    let mut rx = state.broadcast.as_ref().map(|tx| tx.subscribe());

    loop {
        tokio::select! {
            biased;
            evt = async {
                match &mut rx {
                    Some(r) => r.recv().await.ok(),
                    None => futures_util::future::pending::<Option<ServerEvent>>().await,
                }
            } => {
                let Some(evt) = evt else { break };
                let evt = inject_roster(evt, &state.roster);
                let Ok(buf) = proto::encode(&evt) else { continue };
                if socket.send(Message::Binary(buf)).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                match msg {
                    Message::Binary(bytes) => {
                        let mut buf = bytes;
                        if let Ok(ClientMessage::Frame(frame)) =
                            proto::decode::<ClientMessage>(&mut buf)
                            && let Some(tx) = state.input_tx.as_ref()
                        {
                            for input in frame.inputs {
                                let _ = tx.send((slot, input));
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }

    release_slot(&roster_handle, slot);
}

fn release_slot(roster: &Arc<RwLock<Roster>>, slot: proto::PlayerSlot) {
    if let Ok(mut r) = roster.write() {
        r.release(slot);
    }
}

async fn await_join_match(
    socket: &mut WebSocket,
    state: &Arc<ServerState>,
) -> Option<AdmittedPlayer> {
    loop {
        let msg = socket.recv().await?.ok()?;
        let Message::Binary(bytes) = msg else {
            continue;
        };
        let mut buf = bytes;
        let Ok(ClientMessage::JoinMatch(jm)) = proto::decode::<ClientMessage>(&mut buf) else {
            send_reject(socket, "expected JoinMatch as first frame").await;
            return None;
        };
        if jm.protocol != proto::PROTOCOL_VERSION {
            send_reject(
                socket,
                &format!(
                    "protocol mismatch: client={}, server={}",
                    jm.protocol,
                    proto::PROTOCOL_VERSION
                ),
            )
            .await;
            return None;
        }
        return admit(state, socket, jm).await;
    }
}

#[cfg(feature = "supabase-auth")]
async fn admit(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    jm: proto::JoinMatch,
) -> Option<AdmittedPlayer> {
    let kbve_username = if state.jwt_secret.is_empty() {
        if jm.kbve_username.is_empty() {
            "guest".into()
        } else {
            jm.kbve_username
        }
    } else {
        match auth::verify_supabase_jwt(&jm.jwt, &state.jwt_secret) {
            Ok(claims) => claims.kbve_username,
            Err(e) => {
                send_reject(socket, &format!("auth rejected: {e}")).await;
                return None;
            }
        }
    };
    claim_slot(state, socket, kbve_username).await
}

#[cfg(not(feature = "supabase-auth"))]
async fn admit(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    jm: proto::JoinMatch,
) -> Option<AdmittedPlayer> {
    let kbve_username = if jm.kbve_username.is_empty() {
        "guest".into()
    } else {
        jm.kbve_username
    };
    claim_slot(state, socket, kbve_username).await
}

async fn claim_slot(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    kbve_username: String,
) -> Option<AdmittedPlayer> {
    let slot = match state.roster.write() {
        Ok(mut r) => r.claim(kbve_username.clone()),
        Err(_) => None,
    };
    match slot {
        Some(slot) => Some(AdmittedPlayer {
            slot,
            kbve_username,
        }),
        None => {
            send_reject(socket, "match full").await;
            None
        }
    }
}

async fn send_reject(socket: &mut WebSocket, reason: &str) {
    let evt = ServerEvent::Reject {
        reason: reason.to_string(),
    };
    if let Ok(buf) = proto::encode(&evt) {
        let _ = socket.send(Message::Binary(buf)).await;
    }
    // Issue a clean WS Close so the client tears down without surfacing a
    // protocol-error disconnect on top of the Reject payload.
    let _ = socket
        .send(Message::Close(Some(axum::extract::ws::CloseFrame {
            code: 1000,
            reason: reason.to_string().into(),
        })))
        .await;
}

/// Patches Snapshot frames so every connected slot shows up in `players[]`.
fn inject_roster(evt: ServerEvent, roster: &Arc<RwLock<Roster>>) -> ServerEvent {
    match evt {
        ServerEvent::Snapshot(mut snap) => {
            if snap.players.is_empty()
                && let Ok(r) = roster.read()
            {
                snap.players = r.snapshot();
            }
            ServerEvent::Snapshot(snap)
        }
        other => other,
    }
}
