//! WebSocket [`Transport`]: axum host, tungstenite client.
//!
//! Delivery is advisory — WebSocket rides TCP, so `Unreliable` is still
//! retransmitted and still head-of-line blocks. The argument is carried through
//! rather than discarded so a UDP snapshot lane can route on it later.
//!
//! One binary message carries exactly one COBS frame from `crate::proto`.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

use super::transport::{Delivery, Envelope, Inbox, PeerId, Transport};

#[derive(Debug)]
pub enum WsError {
    NotConnected(PeerId),
    Connect(String),
}

// -----------------------------------------------------------------------------
// Host
// -----------------------------------------------------------------------------

pub struct WsHost {
    next_peer: AtomicU32,
    peers: Mutex<BTreeMap<PeerId, UnboundedSender<Vec<u8>>>>,
    inbox: Inbox,
    disconnects: Mutex<Vec<PeerId>>,
}

impl WsHost {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            next_peer: AtomicU32::new(PeerId::HOST.0 + 1),
            peers: Mutex::new(BTreeMap::new()),
            inbox: Inbox::new(),
            disconnects: Mutex::new(Vec::new()),
        })
    }

    /// Peers dropped since the last call. The driver feeds these to
    /// `HostSession::remove_player`; the transport cannot, it has no session.
    pub fn take_disconnects(&self) -> Vec<PeerId> {
        std::mem::take(&mut *self.disconnects.lock().unwrap())
    }

    pub fn peer_count(&self) -> usize {
        self.peers.lock().unwrap().len()
    }

    fn attach(&self) -> (PeerId, UnboundedReceiver<Vec<u8>>) {
        let peer = PeerId(self.next_peer.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::unbounded_channel();
        self.peers.lock().unwrap().insert(peer, tx);
        (peer, rx)
    }

    fn detach(&self, peer: PeerId) {
        if self.peers.lock().unwrap().remove(&peer).is_some() {
            self.disconnects.lock().unwrap().push(peer);
        }
    }
}

impl Transport for Arc<WsHost> {
    type Error = WsError;

    fn local_peer(&self) -> PeerId {
        PeerId::HOST
    }

    fn send(&self, to: PeerId, _delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        let peers = self.peers.lock().unwrap();
        let tx = peers.get(&to).ok_or(WsError::NotConnected(to))?;
        // A closed channel means the writer task already exited; the reader
        // task files the disconnect, so it is not raised here.
        let _ = tx.send(payload.to_vec());
        Ok(())
    }

    fn broadcast(&self, _delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        for tx in self.peers.lock().unwrap().values() {
            let _ = tx.send(payload.to_vec());
        }
        Ok(())
    }

    fn try_recv(&self) -> Option<Envelope> {
        self.inbox.pop()
    }

    fn peers(&self) -> Vec<PeerId> {
        self.peers.lock().unwrap().keys().copied().collect()
    }
}

pub async fn serve_socket(host: Arc<WsHost>, socket: axum::extract::ws::WebSocket) {
    use axum::extract::ws::Message;

    let (peer, mut outbound) = host.attach();
    let (mut sink, mut stream) = socket.split();

    let writer = tokio::spawn(async move {
        while let Some(bytes) = outbound.recv().await {
            if sink.send(Message::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Binary(bytes) => {
                let _ = host.inbox.tx.send(Envelope {
                    from: peer,
                    delivery: Delivery::Reliable,
                    payload: bytes.to_vec(),
                });
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    writer.abort();
    host.detach(peer);
}

pub fn router(host: Arc<WsHost>) -> axum::Router {
    use axum::routing::{any, get};

    async fn upgrade(
        axum::extract::State(host): axum::extract::State<Arc<WsHost>>,
        ws: axum::extract::ws::WebSocketUpgrade,
    ) -> axum::response::Response {
        ws.on_upgrade(move |socket| serve_socket(host, socket))
    }

    axum::Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", any(upgrade))
        .with_state(host)
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

pub struct WsClient {
    outbound: UnboundedSender<Vec<u8>>,
    inbox: Inbox,
}

/// rustls 0.23 refuses to guess a crypto backend and panics on first use when
/// none is installed — which, for a `wss://` url, means the panic lands inside
/// the connect future rather than at startup. Godot turns that into an engine
/// abort, so a TLS server the client could otherwise reach kills the game
/// instead. Installing once, here, keeps the fix next to the only thing that
/// needs it.
fn install_crypto_provider() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        // Err means someone else installed one first, which is just as good.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

impl WsClient {
    /// `url` is e.g. `ws://127.0.0.1:7980/ws`, or `wss://` for TLS.
    pub async fn connect(url: &str) -> Result<Arc<Self>, WsError> {
        use tokio_tungstenite::tungstenite::Message;

        install_crypto_provider();

        let (socket, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| WsError::Connect(e.to_string()))?;
        let (mut sink, mut stream) = socket.split();

        let (outbound, mut outbound_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let client = Arc::new(Self {
            outbound,
            inbox: Inbox::new(),
        });

        tokio::spawn(async move {
            while let Some(bytes) = outbound_rx.recv().await {
                if sink.send(Message::Binary(bytes.into())).await.is_err() {
                    break;
                }
            }
        });

        let inbox_tx = client.inbox.tx.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = stream.next().await {
                if let Message::Binary(bytes) = msg {
                    let envelope = Envelope {
                        from: PeerId::HOST,
                        delivery: Delivery::Reliable,
                        payload: bytes.to_vec(),
                    };
                    if inbox_tx.send(envelope).is_err() {
                        break;
                    }
                }
            }
        });

        Ok(client)
    }

    pub fn is_connected(&self) -> bool {
        !self.outbound.is_closed()
    }
}

impl Transport for Arc<WsClient> {
    type Error = WsError;

    fn local_peer(&self) -> PeerId {
        PeerId::UNASSIGNED
    }

    fn send(&self, _to: PeerId, _delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        self.outbound
            .send(payload.to_vec())
            .map_err(|_| WsError::NotConnected(PeerId::HOST))
    }

    fn broadcast(&self, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        self.send(PeerId::HOST, delivery, payload)
    }

    fn try_recv(&self) -> Option<Envelope> {
        self.inbox.pop()
    }

    fn peers(&self) -> Vec<PeerId> {
        vec![PeerId::HOST]
    }
}

#[cfg(all(test, feature = "net-session"))]
mod tests {
    use super::*;
    use crate::net::session::{ClientSession, ClientStatus, HostSession, SessionConfig};
    use crate::rapier::sim3d::{SimConfig, TerrainDesc};

    async fn serve() -> (Arc<WsHost>, String) {
        let host = WsHost::new();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router(host.clone());
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        (host, format!("ws://{addr}/ws"))
    }

    fn flat_terrain() -> TerrainDesc {
        TerrainDesc {
            heights: Arc::new(vec![0.0; 33 * 33]),
            resolution: 33,
            extent: 64.0,
        }
    }

    /// Pumps both sides, yielding so the socket tasks can actually run.
    async fn run(
        host: &mut HostSession<Arc<WsHost>>,
        client: &mut ClientSession<Arc<WsClient>>,
        ticks: usize,
    ) {
        for _ in 0..ticks {
            host.tick();
            client.tick();
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
    }

    #[tokio::test]
    async fn a_client_joins_and_moves_over_a_real_socket() {
        let (transport, url) = serve().await;
        let mut host = HostSession::dedicated(
            transport.clone(),
            SessionConfig::default(),
            SimConfig::default(),
            99,
        );
        host.set_terrain(flat_terrain());

        let client_transport = WsClient::connect(&url).await.expect("connect");
        let mut client = ClientSession::connect(client_transport);

        run(&mut host, &mut client, 60).await;
        assert_eq!(client.status(), ClientStatus::Joined);
        assert_eq!(client.seed(), Some(99));
        assert_eq!(host.player_count(), 1);

        let body = client.local_body().expect("welcomed");
        let start = host.world_mut().snapshot().body(body).unwrap().iso.pos;

        client.set_input([1.0, 0.0], false);
        run(&mut host, &mut client, 200).await;

        let end = host.world_mut().snapshot().body(body).unwrap().iso.pos;
        assert!(
            end[0] - start[0] > 1.0,
            "input should have crossed the wire, moved {}",
            end[0] - start[0]
        );
        assert!(
            client.latest_snapshot().is_some_and(|s| s.tick > 0),
            "snapshots should have come back"
        );
    }

    #[tokio::test]
    async fn each_client_gets_a_distinct_peer_id() {
        let (transport, url) = serve().await;
        let mut host = HostSession::dedicated(
            transport.clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());

        let mut a = ClientSession::connect(WsClient::connect(&url).await.unwrap());
        let mut b = ClientSession::connect(WsClient::connect(&url).await.unwrap());

        for _ in 0..60 {
            host.tick();
            a.tick();
            b.tick();
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }

        assert_eq!(host.player_count(), 2);
        let (pa, pb) = (a.peer().expect("a"), b.peer().expect("b"));
        assert_ne!(pa, pb);
        assert!(!pa.is_host() && !pb.is_host());
    }

    #[tokio::test]
    async fn a_dropped_socket_is_reported_so_the_player_can_be_despawned() {
        let (transport, url) = serve().await;
        let mut host = HostSession::dedicated(
            transport.clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());

        let mut client = ClientSession::connect(WsClient::connect(&url).await.unwrap());
        run(&mut host, &mut client, 60).await;
        let peer = client.peer().expect("joined");
        assert_eq!(host.player_count(), 1);

        drop(client);

        let mut dropped = Vec::new();
        for _ in 0..200 {
            host.tick();
            dropped = transport.take_disconnects();
            if !dropped.is_empty() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
        assert_eq!(dropped, vec![peer]);

        host.remove_player(peer);
        host.tick();
        assert_eq!(host.player_count(), 0);
        assert!(
            host.world_mut()
                .snapshot()
                .body(crate::net::session::player_body(peer))
                .is_none(),
            "the character should be gone with its socket"
        );
    }
}
