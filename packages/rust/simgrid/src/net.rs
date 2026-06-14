use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use tokio::sync::{broadcast, mpsc, watch};

use crate::proto::{self, ClientMessage, Input, ServerEvent};

pub type SlotInput = (proto::PlayerSlot, Input);

#[derive(Clone)]
struct RosterEntry {
    kbve_username: String,
}

#[derive(Default)]
pub struct Roster {
    slots: Vec<Option<RosterEntry>>,
}

impl Roster {
    pub fn new(capacity: usize) -> Self {
        Self {
            slots: vec![None; capacity.max(1)],
        }
    }

    pub fn capacity(&self) -> usize {
        self.slots.len()
    }

    pub(crate) fn claim(&mut self, kbve_username: String) -> Option<proto::PlayerSlot> {
        for (i, s) in self.slots.iter_mut().enumerate() {
            if s.is_none() {
                *s = Some(RosterEntry { kbve_username });
                return Some(proto::PlayerSlot(i as u16));
            }
        }
        None
    }

    pub(crate) fn release(&mut self, slot: proto::PlayerSlot) {
        if let Some(s) = self.slots.get_mut(slot.0 as usize) {
            *s = None;
        }
    }

    pub fn username(&self, slot: proto::PlayerSlot) -> Option<String> {
        self.slots
            .get(slot.0 as usize)
            .and_then(|s| s.as_ref())
            .map(|e| e.kbve_username.clone())
    }

    /// Slots already held by this username — used to evict prior sessions so a
    /// player can't appear as two ghosts of the same name.
    pub(crate) fn slots_for_username(&self, name: &str) -> Vec<proto::PlayerSlot> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                s.as_ref()
                    .filter(|e| e.kbve_username == name)
                    .map(|_| proto::PlayerSlot(i as u16))
            })
            .collect()
    }

    pub fn snapshot(&self) -> Vec<proto::PlayerView> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                s.as_ref().map(|e| proto::PlayerView {
                    slot: proto::PlayerSlot(i as u16),
                    kbve_username: e.kbve_username.clone(),
                    connected: true,
                })
            })
            .collect()
    }

    pub fn active_slots(&self) -> Vec<proto::PlayerSlot> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| s.as_ref().map(|_| proto::PlayerSlot(i as u16)))
            .collect()
    }
}

#[derive(Clone)]
pub struct ServerState {
    pub broadcast: Option<broadcast::Sender<ServerEvent>>,
    pub input_tx: Option<mpsc::UnboundedSender<SlotInput>>,
    pub seed: u64,
    pub jwt_secret: Vec<u8>,
    pub require_username: bool,
    pub roster: Arc<RwLock<Roster>>,
    pub registry: Vec<proto::KindEntry>,
    /// Per-slot eviction signal: a reconnecting username kicks its prior
    /// session(s) so the same player never lingers as two ghosts.
    kicks: Arc<Mutex<HashMap<u16, watch::Sender<bool>>>>,
}

impl ServerState {
    pub fn new(
        broadcast: broadcast::Sender<ServerEvent>,
        input_tx: mpsc::UnboundedSender<SlotInput>,
        seed: u64,
        jwt_secret: Vec<u8>,
        require_username: bool,
        capacity: usize,
    ) -> Self {
        Self {
            broadcast: Some(broadcast),
            input_tx: Some(input_tx),
            seed,
            jwt_secret,
            require_username,
            roster: Arc::new(RwLock::new(Roster::new(capacity))),
            registry: Vec::new(),
            kicks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn with_registry(mut self, registry: Vec<proto::KindEntry>) -> Self {
        self.registry = registry;
        self
    }
}

#[derive(Clone, Copy)]
enum WireFormat {
    Postcard,
    Json,
}

struct AdmittedPlayer {
    slot: proto::PlayerSlot,
    format: WireFormat,
    kick_rx: watch::Receiver<bool>,
}

fn decode_client(msg: &Message) -> Option<(ClientMessage, WireFormat)> {
    match msg {
        Message::Binary(bytes) => {
            let mut buf = bytes.clone();
            proto::decode::<ClientMessage>(&mut buf)
                .ok()
                .map(|m| (m, WireFormat::Postcard))
        }
        Message::Text(text) => proto::decode_json::<ClientMessage>(text.as_str())
            .ok()
            .map(|m| (m, WireFormat::Json)),
        _ => None,
    }
}

fn encode_event(evt: &ServerEvent, format: WireFormat) -> Option<Message> {
    match format {
        WireFormat::Postcard => proto::encode(evt).ok().map(Message::Binary),
        WireFormat::Json => proto::encode_json(evt).ok().map(Message::Text),
    }
}

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
    let format = admitted.format;
    let mut kick_rx = admitted.kick_rx;
    let roster_handle = state.roster.clone();

    let welcome = ServerEvent::Welcome {
        protocol: proto::PROTOCOL_VERSION,
        your_slot: slot,
        seed: state.seed,
        registry: state.registry.clone(),
    };
    if let Some(msg) = encode_event(&welcome, format)
        && socket.send(msg).await.is_err()
    {
        release_slot(&roster_handle, slot);
        return;
    }

    let mut rx = state.broadcast.as_ref().map(|tx| tx.subscribe());

    loop {
        tokio::select! {
            biased;
            _ = kick_rx.changed() => {
                tracing::info!(slot = slot.0, "session evicted by a newer login");
                break;
            }
            evt = async {
                match &mut rx {
                    Some(r) => r.recv().await.ok(),
                    None => futures_util::future::pending::<Option<ServerEvent>>().await,
                }
            } => {
                let Some(evt) = evt else { break };
                if let ServerEvent::Ephemeral { to, .. } = &evt
                    && *to != proto::PLAYER_SLOT_NONE
                    && *to != slot
                {
                    continue;
                }
                let evt = inject_roster(evt, &state.roster);
                let Some(msg) = encode_event(&evt, format) else { continue };
                if socket.send(msg).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                if matches!(msg, Message::Close(_)) {
                    break;
                }
                if let Some((ClientMessage::Frame(frame), _)) = decode_client(&msg)
                    && let Some(tx) = state.input_tx.as_ref()
                {
                    for input in frame.inputs {
                        let _ = tx.send((slot, input));
                    }
                }
            }
        }
    }

    // Drop our kick channel before freeing the slot: while the slot is still
    // claimed no other join can take it, so we can't clobber a reused slot's
    // fresh kick sender.
    if let Ok(mut kicks) = state.kicks.lock() {
        kicks.remove(&slot.0);
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
        if matches!(msg, Message::Ping(_) | Message::Pong(_)) {
            continue;
        }
        let Some((client_msg, format)) = decode_client(&msg) else {
            send_reject(
                socket,
                WireFormat::Json,
                "expected JoinMatch as first frame",
            )
            .await;
            return None;
        };
        let ClientMessage::JoinMatch(jm) = client_msg else {
            send_reject(socket, format, "expected JoinMatch as first frame").await;
            return None;
        };
        if jm.protocol != proto::PROTOCOL_VERSION {
            send_reject(
                socket,
                format,
                &format!(
                    "protocol mismatch: client={}, server={} — refresh your browser to update the game client",
                    jm.protocol,
                    proto::PROTOCOL_VERSION
                ),
            )
            .await;
            return None;
        }
        return admit(state, socket, jm, format).await;
    }
}

#[cfg(feature = "supabase-auth")]
async fn admit(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    jm: proto::JoinMatch,
    format: WireFormat,
) -> Option<AdmittedPlayer> {
    let raw = if state.jwt_secret.is_empty() {
        jm.kbve_username
    } else {
        match crate::auth::verify_supabase_jwt(&jm.jwt, &state.jwt_secret) {
            Ok(claims) => claims.kbve_username,
            Err(e) => {
                send_reject(socket, format, &format!("auth rejected: {e}")).await;
                return None;
            }
        }
    };
    let Some(username) = resolve_username(state.require_username, raw) else {
        send_reject(
            socket,
            format,
            "username required — set a KBVE username first",
        )
        .await;
        return None;
    };
    claim_slot(state, socket, username, format).await
}

#[cfg(not(feature = "supabase-auth"))]
async fn admit(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    jm: proto::JoinMatch,
    format: WireFormat,
) -> Option<AdmittedPlayer> {
    let Some(username) = resolve_username(state.require_username, jm.kbve_username) else {
        send_reject(
            socket,
            format,
            "username required — set a KBVE username first",
        )
        .await;
        return None;
    };
    claim_slot(state, socket, username, format).await
}

fn resolve_username(require_username: bool, name: String) -> Option<String> {
    if !name.is_empty() {
        Some(name)
    } else if require_username {
        None
    } else {
        Some("guest".into())
    }
}

async fn claim_slot(
    state: &Arc<ServerState>,
    socket: &mut WebSocket,
    kbve_username: String,
    format: WireFormat,
) -> Option<AdmittedPlayer> {
    let name = kbve_username.clone();
    // Find any prior session(s) for this username, then claim a fresh slot —
    // both under one write lock so two simultaneous joins can't race.
    let (slot, prior) = match state.roster.write() {
        Ok(mut r) => {
            let prior = r.slots_for_username(&name);
            (r.claim(kbve_username), prior)
        }
        Err(_) => (None, Vec::new()),
    };
    let Some(slot) = slot else {
        let capacity = state
            .roster
            .read()
            .map(|r| r.capacity())
            .unwrap_or_default();
        send_reject(socket, format, &format!("match full ({capacity} players)")).await;
        return None;
    };

    // Newest wins: kick prior sessions so this player isn't two ghosts. Each
    // kicked session breaks its loop and releases its own slot (the sim then
    // despawns that ghost and persists its state by username).
    if !prior.is_empty()
        && let Ok(kicks) = state.kicks.lock()
    {
        for old in &prior {
            if let Some(tx) = kicks.get(&old.0) {
                let _ = tx.send(true);
            }
        }
        tracing::info!(username = %name, evicted = prior.len(), "evicted prior session(s)");
    }

    let (kick_tx, kick_rx) = watch::channel(false);
    if let Ok(mut kicks) = state.kicks.lock() {
        kicks.insert(slot.0, kick_tx);
    }
    tracing::info!(slot = slot.0, username = %name, "player joined");
    Some(AdmittedPlayer {
        slot,
        format,
        kick_rx,
    })
}

async fn send_reject(socket: &mut WebSocket, format: WireFormat, reason: &str) {
    tracing::info!(reason, "join rejected");
    let evt = ServerEvent::Reject {
        reason: reason.to_string(),
    };
    if let Some(msg) = encode_event(&evt, format) {
        let _ = socket.send(msg).await;
    }
    let _ = socket
        .send(Message::Close(Some(axum::extract::ws::CloseFrame {
            code: 1000,
            reason: reason.to_string().into(),
        })))
        .await;
}

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

#[cfg(test)]
mod tests {
    use super::{Roster, resolve_username};

    #[test]
    fn roster_dedups_username_for_eviction() {
        let mut r = Roster::new(4);
        let s0 = r.claim("ann".into()).unwrap();
        let _s1 = r.claim("bob".into()).unwrap();

        // ann reconnects: her prior slot is found, a fresh slot is claimed.
        let prior: Vec<u16> = r.slots_for_username("ann").iter().map(|s| s.0).collect();
        assert_eq!(prior, vec![s0.0]);
        let s2 = r.claim("ann".into()).unwrap();
        assert_ne!(s2.0, s0.0);
        assert_eq!(r.slots_for_username("ann").len(), 2);

        // After the old session releases, only the new one remains.
        r.release(s0);
        let after: Vec<u16> = r.slots_for_username("ann").iter().map(|s| s.0).collect();
        assert_eq!(after, vec![s2.0]);
    }

    #[test]
    fn require_username_rejects_empty() {
        assert_eq!(resolve_username(true, String::new()), None);
        assert_eq!(
            resolve_username(true, "h0lybyte".into()),
            Some("h0lybyte".into())
        );
    }

    #[test]
    fn guest_allowed_when_not_required() {
        assert_eq!(resolve_username(false, String::new()), Some("guest".into()));
        assert_eq!(resolve_username(false, "ann".into()), Some("ann".into()));
    }
}
