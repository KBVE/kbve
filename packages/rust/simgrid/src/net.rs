use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use dashmap::DashMap;
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, watch};
use ulid::Ulid;

use crate::proto::{self, ClientMessage, Input, ServerEvent};

pub type SlotInput = (proto::PlayerSlot, Input);

const CONN_CHANNEL_CAPACITY: usize = 256;

#[derive(Clone)]
struct RosterEntry {
    kbve_username: String,
    ulid: Ulid,
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

    pub(crate) fn claim(&mut self, kbve_username: String, ulid: Ulid) -> Option<proto::PlayerSlot> {
        for (i, s) in self.slots.iter_mut().enumerate() {
            if s.is_none() {
                *s = Some(RosterEntry {
                    kbve_username,
                    ulid,
                });
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

    pub fn ulid(&self, slot: proto::PlayerSlot) -> Option<Ulid> {
        self.slots
            .get(slot.0 as usize)
            .and_then(|s| s.as_ref())
            .map(|e| e.ulid)
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

/// A broadcast event encoded once per live wire format, shared across every
/// recipient via `Arc` so a snapshot is serialized once per tick instead of
/// once per client. axum 0.7's `Message` owns its buffer, so each writer still
/// pays one flat memcpy to hand the socket an owned copy — but the expensive
/// serialization + the deep `ServerEvent` clone happen a single time.
#[derive(Default)]
struct EncodedFrame {
    postcard: Option<Vec<u8>>,
    json: Option<String>,
}

impl EncodedFrame {
    fn message(&self, format: WireFormat) -> Option<Message> {
        match format {
            WireFormat::Postcard => self.postcard.clone().map(Message::Binary),
            WireFormat::Json => self.json.clone().map(Message::Text),
        }
    }
}

struct ConnHandle {
    tx: mpsc::Sender<Arc<EncodedFrame>>,
    slot: proto::PlayerSlot,
    format: WireFormat,
}

#[derive(Clone)]
pub struct ServerState {
    pub input_tx: Option<mpsc::UnboundedSender<SlotInput>>,
    pub seed: u64,
    pub jwt_secret: Vec<u8>,
    pub require_username: bool,
    pub roster: Arc<RwLock<Roster>>,
    pub registry: Vec<proto::KindEntry>,
    /// Optional external token verifier (e.g. Supabase GoTrue via the jedi cache).
    /// Takes precedence over local HS256 when set.
    #[cfg(feature = "supabase-auth")]
    pub verifier: Option<Arc<dyn crate::auth::TokenVerifier>>,
    conns: Arc<DashMap<Ulid, ConnHandle>>,
    slot2id: Arc<DashMap<proto::PlayerSlot, Ulid>>,
    kicks: Arc<Mutex<HashMap<u16, watch::Sender<bool>>>>,
}

impl ServerState {
    pub fn new(
        input_tx: mpsc::UnboundedSender<SlotInput>,
        seed: u64,
        jwt_secret: Vec<u8>,
        require_username: bool,
        capacity: usize,
    ) -> Self {
        Self {
            input_tx: Some(input_tx),
            seed,
            jwt_secret,
            require_username,
            roster: Arc::new(RwLock::new(Roster::new(capacity))),
            registry: Vec::new(),
            #[cfg(feature = "supabase-auth")]
            verifier: None,
            conns: Arc::new(DashMap::new()),
            slot2id: Arc::new(DashMap::new()),
            kicks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn with_registry(mut self, registry: Vec<proto::KindEntry>) -> Self {
        self.registry = registry;
        self
    }

    /// Attach an external token verifier (Supabase GoTrue + cache). When set it
    /// authenticates joins ahead of the local HS256 secret.
    #[cfg(feature = "supabase-auth")]
    pub fn with_verifier(mut self, verifier: Arc<dyn crate::auth::TokenVerifier>) -> Self {
        self.verifier = Some(verifier);
        self
    }

    /// Drain the sim's outbound event stream and dispatch each event to the
    /// connection(s) it names. Delivery requires naming a recipient, so a
    /// targeted event can no longer leak to every socket. Call inside the net
    /// runtime that owns the connections.
    pub fn spawn_event_router(&self, mut out_rx: mpsc::UnboundedReceiver<ServerEvent>) {
        let conns = self.conns.clone();
        let slot2id = self.slot2id.clone();
        let roster = self.roster.clone();
        tokio::spawn(async move {
            while let Some(evt) = out_rx.recv().await {
                route_event(&conns, &slot2id, &roster, evt);
            }
        });
    }
}

fn route_event(
    conns: &DashMap<Ulid, ConnHandle>,
    slot2id: &DashMap<proto::PlayerSlot, Ulid>,
    roster: &Arc<RwLock<Roster>>,
    evt: ServerEvent,
) {
    if let ServerEvent::Ephemeral { to, .. } = &evt
        && *to != proto::PLAYER_SLOT_NONE
    {
        if let Some(id) = slot2id.get(to).map(|e| *e.value())
            && let Some(h) = conns.get(&id)
        {
            let frame = Arc::new(encode_frame(&evt, &[h.format]));
            deliver(h.value(), frame);
        }
        return;
    }

    // Broadcast: fill the roster + serialize once per live format, then fan the
    // shared `Arc` out to every connection.
    let evt = inject_roster(evt, roster);
    let mut formats: Vec<WireFormat> = Vec::new();
    for h in conns.iter() {
        if !formats.contains(&h.format) {
            formats.push(h.format);
        }
    }
    if formats.is_empty() {
        return;
    }
    let frame = Arc::new(encode_frame(&evt, &formats));
    for h in conns.iter() {
        deliver(h.value(), frame.clone());
    }
}

fn encode_frame(evt: &ServerEvent, formats: &[WireFormat]) -> EncodedFrame {
    let mut frame = EncodedFrame::default();
    for f in formats {
        match f {
            WireFormat::Postcard if frame.postcard.is_none() => {
                frame.postcard = proto::encode(evt).ok();
            }
            WireFormat::Json if frame.json.is_none() => {
                frame.json = proto::encode_json(evt).ok();
            }
            _ => {}
        }
    }
    frame
}

fn deliver(handle: &ConnHandle, frame: Arc<EncodedFrame>) {
    match handle.tx.try_send(frame) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(_)) => {
            tracing::warn!(
                slot = handle.slot.0,
                "conn channel saturated; dropping event"
            );
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

fn ulid_from_identity(identity: &str) -> Ulid {
    let hi = fnv1a64(identity.as_bytes());
    let mut salted = Vec::with_capacity(identity.len() + 1);
    salted.push(0x01);
    salted.extend_from_slice(identity.as_bytes());
    let lo = fnv1a64(&salted);
    Ulid::from(((hi as u128) << 64) | lo as u128)
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WireFormat {
    Postcard,
    Json,
}

struct AdmittedPlayer {
    slot: proto::PlayerSlot,
    ulid: Ulid,
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
    let ulid = admitted.ulid;
    let format = admitted.format;
    let mut kick_rx = admitted.kick_rx;

    let welcome = ServerEvent::Welcome {
        protocol: proto::PROTOCOL_VERSION,
        your_slot: slot,
        seed: state.seed,
        registry: state.registry.clone(),
    };
    if let Some(msg) = encode_event(&welcome, format)
        && socket.send(msg).await.is_err()
    {
        cleanup_join(&state, slot);
        return;
    }

    let (sink, mut stream) = socket.split();
    let (conn_tx, conn_rx) = mpsc::channel::<Arc<EncodedFrame>>(CONN_CHANNEL_CAPACITY);
    state.conns.insert(
        ulid,
        ConnHandle {
            tx: conn_tx,
            slot,
            format,
        },
    );
    state.slot2id.insert(slot, ulid);
    let writer = tokio::spawn(run_writer(sink, conn_rx, format));

    loop {
        tokio::select! {
            biased;
            _ = kick_rx.changed() => {
                tracing::info!(slot = slot.0, "session evicted by a newer login");
                break;
            }
            incoming = stream.next() => {
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

    writer.abort();
    state.conns.remove_if(&ulid, |_, h| h.slot == slot);
    state.slot2id.remove_if(&slot, |_, id| *id == ulid);
    cleanup_join(&state, slot);
}

async fn run_writer(
    mut sink: SplitSink<WebSocket, Message>,
    mut rx: mpsc::Receiver<Arc<EncodedFrame>>,
    format: WireFormat,
) {
    while let Some(frame) = rx.recv().await {
        let Some(msg) = frame.message(format) else {
            continue;
        };
        if sink.send(msg).await.is_err() {
            break;
        }
    }
}

fn cleanup_join(state: &ServerState, slot: proto::PlayerSlot) {
    // Drop the kick channel before freeing the slot: while the slot is still
    // claimed no other join can take it, so we can't clobber a reused slot's
    // fresh kick sender.
    if let Ok(mut kicks) = state.kicks.lock() {
        kicks.remove(&slot.0);
    }
    release_slot(&state.roster, slot);
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
    let (raw, sub) = if let Some(verifier) = &state.verifier {
        // External authority (Supabase GoTrue via the jedi cache): an empty or
        // invalid token is denied — no dev-accept fallthrough when a verifier set.
        match verifier.verify(&jm.jwt).await {
            Ok(user) => (user.kbve_username, user.sub),
            Err(e) => {
                send_reject(socket, format, &format!("auth rejected: {e}")).await;
                return None;
            }
        }
    } else if state.jwt_secret.is_empty() {
        (jm.kbve_username, String::new())
    } else {
        match crate::auth::verify_supabase_jwt(&jm.jwt, &state.jwt_secret) {
            Ok(claims) => (claims.kbve_username, claims.sub),
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
    let identity = if sub.is_empty() {
        username.clone()
    } else {
        sub
    };
    claim_slot(state, socket, username, identity, format).await
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
    let identity = username.clone();
    claim_slot(state, socket, username, identity, format).await
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
    identity: String,
    format: WireFormat,
) -> Option<AdmittedPlayer> {
    let ulid = ulid_from_identity(&identity);
    if state.conns.contains_key(&ulid) {
        send_reject(
            socket,
            format,
            "already connected — close the other window or tab to play here",
        )
        .await;
        return None;
    }
    let name = kbve_username.clone();
    let (slot, prior) = match state.roster.write() {
        Ok(mut r) => {
            let prior = r.slots_for_username(&name);
            (r.claim(kbve_username, ulid), prior)
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
    tracing::info!(slot = slot.0, username = %name, ulid = %ulid, "player joined");
    Some(AdmittedPlayer {
        slot,
        ulid,
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
    use super::*;

    #[test]
    fn roster_dedups_username_for_eviction() {
        let mut r = Roster::new(4);
        let s0 = r.claim("ann".into(), ulid_from_identity("ann")).unwrap();
        let _s1 = r.claim("bob".into(), ulid_from_identity("bob")).unwrap();

        let prior: Vec<u16> = r.slots_for_username("ann").iter().map(|s| s.0).collect();
        assert_eq!(prior, vec![s0.0]);
        let s2 = r.claim("ann".into(), ulid_from_identity("ann")).unwrap();
        assert_ne!(s2.0, s0.0);
        assert_eq!(r.slots_for_username("ann").len(), 2);

        r.release(s0);
        let after: Vec<u16> = r.slots_for_username("ann").iter().map(|s| s.0).collect();
        assert_eq!(after, vec![s2.0]);
    }

    #[test]
    fn ulid_is_stable_per_identity() {
        assert_eq!(ulid_from_identity("ann"), ulid_from_identity("ann"));
        assert_ne!(ulid_from_identity("ann"), ulid_from_identity("bob"));
    }

    #[test]
    fn reconnect_reclaims_same_ulid() {
        let mut r = Roster::new(4);
        let s0 = r.claim("ann".into(), ulid_from_identity("ann")).unwrap();
        let first = r.ulid(s0).unwrap();
        r.release(s0);
        let s1 = r.claim("ann".into(), ulid_from_identity("ann")).unwrap();
        assert_eq!(first, r.ulid(s1).unwrap());
    }

    #[test]
    fn targeted_event_reaches_only_owner() {
        let conns: DashMap<Ulid, ConnHandle> = DashMap::new();
        let slot2id: DashMap<proto::PlayerSlot, Ulid> = DashMap::new();
        let (atx, mut arx) = mpsc::channel(8);
        let (btx, mut brx) = mpsc::channel(8);
        let aid = ulid_from_identity("a");
        let bid = ulid_from_identity("b");
        conns.insert(
            aid,
            ConnHandle {
                tx: atx,
                slot: proto::PlayerSlot(0),
                format: WireFormat::Postcard,
            },
        );
        conns.insert(
            bid,
            ConnHandle {
                tx: btx,
                slot: proto::PlayerSlot(1),
                format: WireFormat::Postcard,
            },
        );
        slot2id.insert(proto::PlayerSlot(0), aid);
        slot2id.insert(proto::PlayerSlot(1), bid);

        let roster = Arc::new(RwLock::new(Roster::new(4)));
        route_event(
            &conns,
            &slot2id,
            &roster,
            ServerEvent::Ephemeral {
                kind: 1,
                to: proto::PlayerSlot(0),
                payload: Vec::new(),
            },
        );

        assert!(arx.try_recv().is_ok());
        assert!(brx.try_recv().is_err());
    }

    #[test]
    fn global_event_reaches_all() {
        let conns: DashMap<Ulid, ConnHandle> = DashMap::new();
        let slot2id: DashMap<proto::PlayerSlot, Ulid> = DashMap::new();
        let (atx, mut arx) = mpsc::channel(8);
        let (btx, mut brx) = mpsc::channel(8);
        let aid = ulid_from_identity("a");
        let bid = ulid_from_identity("b");
        conns.insert(
            aid,
            ConnHandle {
                tx: atx,
                slot: proto::PlayerSlot(0),
                format: WireFormat::Postcard,
            },
        );
        conns.insert(
            bid,
            ConnHandle {
                tx: btx,
                slot: proto::PlayerSlot(1),
                format: WireFormat::Postcard,
            },
        );
        slot2id.insert(proto::PlayerSlot(0), aid);
        slot2id.insert(proto::PlayerSlot(1), bid);

        let roster = Arc::new(RwLock::new(Roster::new(4)));
        route_event(
            &conns,
            &slot2id,
            &roster,
            ServerEvent::Ephemeral {
                kind: 1,
                to: proto::PLAYER_SLOT_NONE,
                payload: Vec::new(),
            },
        );

        assert!(arx.try_recv().is_ok());
        assert!(brx.try_recv().is_ok());
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
