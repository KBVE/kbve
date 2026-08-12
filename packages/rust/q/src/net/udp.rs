//! Unreliable datagram lane.
//!
//! Carries snapshots and inputs, which are worthless once superseded — a
//! retransmitted snapshot costs head-of-line blocking in exchange for state
//! nobody wants. The reliable lane stays on WebSocket; this one drops.
//!
//! A datagram carries no connection, so the host has to learn which address
//! belongs to which peer. The reliable channel hands the client a one-time
//! token, the client sends it in a `Hello`, and the host binds
//! token -> (peer, addr). Everything after that routes by address. Without the
//! token an attacker who guessed a peer id could redirect that player's traffic
//! to their own address.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

use super::transport::{Delivery, Envelope, Inbox, PeerId};
use crate::proto::{self, PROTOCOL_VERSION};

/// Conservative payload ceiling. Above this a datagram risks IP fragmentation,
/// where losing one fragment loses the whole packet — the opposite of what an
/// unreliable lane is for. Oversize sends fall back to the reliable lane.
pub const MAX_DATAGRAM: usize = 1200;

/// A binding is dropped after this long without traffic, so a client that
/// changes address (NAT rebind, roaming) can re-`Hello` into a fresh one.
const STALE: Duration = Duration::from_secs(10);

pub type Token = [u8; 16];

#[derive(Serialize, Deserialize)]
enum UdpPacket {
    Hello { protocol: u32, token: Token },
    HelloAck,
    Frame(Vec<u8>),
}

fn random_token() -> Token {
    let mut token = [0u8; 16];
    getrandom::getrandom(&mut token).expect("getrandom");
    token
}

struct Binding {
    addr: SocketAddr,
    last_seen: Instant,
}

// -----------------------------------------------------------------------------
// Host
// -----------------------------------------------------------------------------

pub struct UdpLane {
    socket: Arc<UdpSocket>,
    port: u16,
    tokens: Mutex<HashMap<Token, PeerId>>,
    peer_tokens: Mutex<HashMap<PeerId, Token>>,
    bindings: Mutex<HashMap<PeerId, Binding>>,
    addr2peer: Mutex<HashMap<SocketAddr, PeerId>>,
    inbox: Inbox,
    oversize: AtomicU64,
}

impl UdpLane {
    pub async fn bind(addr: SocketAddr) -> std::io::Result<Arc<Self>> {
        let socket = UdpSocket::bind(addr).await?;
        // A fresh socket has no cached write readiness, so the first
        // `try_send_to` would fail with WouldBlock. Await it once here.
        socket.writable().await?;
        let port = socket.local_addr()?.port();
        Ok(Arc::new(Self {
            socket: Arc::new(socket),
            port,
            tokens: Mutex::new(HashMap::new()),
            peer_tokens: Mutex::new(HashMap::new()),
            bindings: Mutex::new(HashMap::new()),
            addr2peer: Mutex::new(HashMap::new()),
            inbox: Inbox::new(),
            oversize: AtomicU64::new(0),
        }))
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Number of payloads that exceeded [`MAX_DATAGRAM`] and fell back.
    pub fn oversize_count(&self) -> u64 {
        self.oversize.load(Ordering::Relaxed)
    }

    /// Issues a fresh token for `peer`, invalidating any previous one.
    pub fn issue_token(&self, peer: PeerId) -> Token {
        self.revoke(peer);
        let token = random_token();
        self.tokens.lock().unwrap().insert(token, peer);
        self.peer_tokens.lock().unwrap().insert(peer, token);
        token
    }

    pub fn revoke(&self, peer: PeerId) {
        if let Some(token) = self.peer_tokens.lock().unwrap().remove(&peer) {
            self.tokens.lock().unwrap().remove(&token);
        }
        if let Some(binding) = self.bindings.lock().unwrap().remove(&peer) {
            self.addr2peer.lock().unwrap().remove(&binding.addr);
        }
    }

    /// The peer's current address, or `None` if it never completed the
    /// handshake or has gone quiet past [`STALE`].
    pub fn bound_addr(&self, peer: PeerId) -> Option<SocketAddr> {
        let bindings = self.bindings.lock().unwrap();
        let binding = bindings.get(&peer)?;
        (binding.last_seen.elapsed() <= STALE).then_some(binding.addr)
    }

    pub fn is_bound(&self, peer: PeerId) -> bool {
        self.bound_addr(peer).is_some()
    }

    /// Returns false when the caller must fall back to the reliable lane:
    /// the peer is unbound, the payload is oversize, or the socket refused it.
    pub fn try_send(&self, peer: PeerId, payload: &[u8]) -> bool {
        let Some(addr) = self.bound_addr(peer) else {
            return false;
        };
        if payload.len() > MAX_DATAGRAM {
            self.oversize.fetch_add(1, Ordering::Relaxed);
            return false;
        }
        let Ok(bytes) = proto::encode(&UdpPacket::Frame(payload.to_vec())) else {
            return false;
        };
        if bytes.len() > MAX_DATAGRAM {
            self.oversize.fetch_add(1, Ordering::Relaxed);
            return false;
        }
        self.socket.try_send_to(&bytes, addr).is_ok()
    }

    pub fn try_recv(&self) -> Option<Envelope> {
        self.inbox.pop()
    }

    fn bind_peer(&self, peer: PeerId, addr: SocketAddr) {
        let mut addr2peer = self.addr2peer.lock().unwrap();
        let mut bindings = self.bindings.lock().unwrap();
        // An address can only speak for one peer. Reclaiming it from a stale
        // owner keeps a NAT that reused a port from silently cross-wiring two
        // players' inputs.
        if let Some(previous) = addr2peer.insert(addr, peer)
            && previous != peer
        {
            bindings.remove(&previous);
        }
        if let Some(old) = bindings.insert(
            peer,
            Binding {
                addr,
                last_seen: Instant::now(),
            },
        ) && old.addr != addr
        {
            addr2peer.remove(&old.addr);
        }
    }

    fn touch(&self, peer: PeerId) {
        if let Some(binding) = self.bindings.lock().unwrap().get_mut(&peer) {
            binding.last_seen = Instant::now();
        }
    }

    pub fn spawn_recv_loop(self: &Arc<Self>) {
        let lane = self.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 2048];
            loop {
                let (n, from) = match lane.socket.recv_from(&mut buf).await {
                    Ok(v) => v,
                    Err(_) => {
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        continue;
                    }
                };
                let mut frame = buf[..n].to_vec();
                let Ok(packet) = proto::decode::<UdpPacket>(&mut frame) else {
                    continue;
                };
                match packet {
                    UdpPacket::Hello { protocol, token } => {
                        if protocol != PROTOCOL_VERSION {
                            continue;
                        }
                        let peer = lane.tokens.lock().unwrap().get(&token).copied();
                        let Some(peer) = peer else {
                            continue;
                        };
                        lane.bind_peer(peer, from);
                        if let Ok(ack) = proto::encode(&UdpPacket::HelloAck) {
                            let _ = lane.socket.try_send_to(&ack, from);
                        }
                    }
                    UdpPacket::Frame(payload) => {
                        let peer = lane.addr2peer.lock().unwrap().get(&from).copied();
                        let Some(peer) = peer else {
                            continue;
                        };
                        lane.touch(peer);
                        let _ = lane.inbox.tx.send(Envelope {
                            from: peer,
                            delivery: Delivery::Unreliable,
                            payload,
                        });
                    }
                    UdpPacket::HelloAck => {}
                }
            }
        });
    }
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

pub struct UdpClient {
    socket: Arc<UdpSocket>,
    server: SocketAddr,
    token: Token,
    confirmed: Arc<AtomicBool>,
    inbox: Arc<Inbox>,
    oversize: AtomicU64,
}

impl UdpClient {
    /// Binds a local socket and starts the handshake. The lane is not usable
    /// until the host acks; until then callers must use the reliable lane.
    pub async fn connect(server: SocketAddr, token: Token) -> std::io::Result<Arc<Self>> {
        let bind: SocketAddr = if server.is_ipv4() {
            "0.0.0.0:0".parse().unwrap()
        } else {
            "[::]:0".parse().unwrap()
        };
        let socket = Arc::new(UdpSocket::bind(bind).await?);
        socket.writable().await?;
        let client = Arc::new(Self {
            socket: socket.clone(),
            server,
            token,
            confirmed: Arc::new(AtomicBool::new(false)),
            inbox: Arc::new(Inbox::new()),
            oversize: AtomicU64::new(0),
        });

        let confirmed = client.confirmed.clone();
        let inbox = client.inbox.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 2048];
            loop {
                let Ok((n, from)) = socket.recv_from(&mut buf).await else {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    continue;
                };
                if from != server {
                    continue;
                }
                let mut frame = buf[..n].to_vec();
                match proto::decode::<UdpPacket>(&mut frame) {
                    Ok(UdpPacket::HelloAck) => confirmed.store(true, Ordering::Relaxed),
                    Ok(UdpPacket::Frame(payload)) => {
                        let _ = inbox.tx.send(Envelope {
                            from: PeerId::HOST,
                            delivery: Delivery::Unreliable,
                            payload,
                        });
                    }
                    _ => {}
                }
            }
        });

        client.send_hello();
        Ok(client)
    }

    /// Re-sends the handshake. The `Hello` is itself droppable, so a caller
    /// that is still unconfirmed should retry rather than wait forever.
    pub fn send_hello(&self) {
        if let Ok(bytes) = proto::encode(&UdpPacket::Hello {
            protocol: PROTOCOL_VERSION,
            token: self.token,
        }) {
            let _ = self.socket.try_send_to(&bytes, self.server);
        }
    }

    pub fn is_confirmed(&self) -> bool {
        self.confirmed.load(Ordering::Relaxed)
    }

    pub fn oversize_count(&self) -> u64 {
        self.oversize.load(Ordering::Relaxed)
    }

    /// False when the caller must fall back to the reliable lane.
    pub fn try_send(&self, payload: &[u8]) -> bool {
        if !self.is_confirmed() {
            return false;
        }
        if payload.len() > MAX_DATAGRAM {
            self.oversize.fetch_add(1, Ordering::Relaxed);
            return false;
        }
        let Ok(bytes) = proto::encode(&UdpPacket::Frame(payload.to_vec())) else {
            return false;
        };
        if bytes.len() > MAX_DATAGRAM {
            self.oversize.fetch_add(1, Ordering::Relaxed);
            return false;
        }
        self.socket.try_send_to(&bytes, self.server).is_ok()
    }

    pub fn try_recv(&self) -> Option<Envelope> {
        self.inbox.pop()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn wait_for(mut f: impl FnMut() -> bool, label: &str) {
        for _ in 0..200 {
            if f() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("timed out waiting for {label}");
    }

    async fn lane() -> (Arc<UdpLane>, SocketAddr) {
        let lane = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        lane.spawn_recv_loop();
        let addr = format!("127.0.0.1:{}", lane.port()).parse().unwrap();
        (lane, addr)
    }

    #[tokio::test]
    async fn a_token_binds_the_peer_and_carries_traffic_both_ways() {
        let (lane, addr) = lane().await;
        let peer = PeerId(7);
        let token = lane.issue_token(peer);

        let client = UdpClient::connect(addr, token).await.unwrap();
        wait_for(|| client.is_confirmed(), "handshake ack").await;
        assert!(lane.is_bound(peer), "host should have bound the peer");

        assert!(client.try_send(b"input"));
        wait_for(
            || lane.try_recv().is_some_and(|e| e.payload == b"input"),
            "client -> host",
        )
        .await;

        assert!(lane.try_send(peer, b"snapshot"));
        wait_for(
            || {
                client
                    .try_recv()
                    .is_some_and(|e| e.payload == b"snapshot" && e.from == PeerId::HOST)
            },
            "host -> client",
        )
        .await;
    }

    /// The whole point of the token: an address cannot claim a peer id it was
    /// not granted, so it can never redirect that player's traffic to itself.
    #[tokio::test]
    async fn an_unknown_token_never_binds() {
        let (lane, addr) = lane().await;
        lane.issue_token(PeerId(1));

        let client = UdpClient::connect(addr, [0xAB; 16]).await.unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;

        assert!(!client.is_confirmed(), "host must not ack an unknown token");
        assert!(!lane.is_bound(PeerId(1)));
        assert!(
            !client.try_send(b"spoofed"),
            "unconfirmed client must not send"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(lane.try_recv().is_none(), "nothing should have been routed");
    }

    #[tokio::test]
    async fn traffic_is_attributed_to_the_right_peer() {
        let (lane, addr) = lane().await;
        let (a, b) = (PeerId(1), PeerId(2));
        let ta = lane.issue_token(a);
        let tb = lane.issue_token(b);

        let ca = UdpClient::connect(addr, ta).await.unwrap();
        let cb = UdpClient::connect(addr, tb).await.unwrap();
        wait_for(|| ca.is_confirmed() && cb.is_confirmed(), "both handshakes").await;

        assert!(cb.try_send(b"from-b"));
        wait_for(
            || {
                lane.try_recv()
                    .is_some_and(|e| e.from == b && e.payload == b"from-b")
            },
            "b's frame attributed to b",
        )
        .await;

        // Sends address the peer, so a's snapshot must not reach b.
        assert!(lane.try_send(a, b"for-a"));
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(ca.try_recv().is_some());
        assert!(cb.try_recv().is_none(), "b should not see a's traffic");
    }

    #[tokio::test]
    async fn revoking_a_token_unbinds_the_peer() {
        let (lane, addr) = lane().await;
        let peer = PeerId(3);
        let client = UdpClient::connect(addr, lane.issue_token(peer))
            .await
            .unwrap();
        wait_for(|| client.is_confirmed(), "handshake").await;

        lane.revoke(peer);
        assert!(!lane.is_bound(peer));
        assert!(
            !lane.try_send(peer, b"gone"),
            "sending to a revoked peer must fall back"
        );
    }

    #[tokio::test]
    async fn an_oversize_payload_falls_back_instead_of_fragmenting() {
        let (lane, addr) = lane().await;
        let peer = PeerId(4);
        let client = UdpClient::connect(addr, lane.issue_token(peer))
            .await
            .unwrap();
        wait_for(|| client.is_confirmed(), "handshake").await;

        let huge = vec![0u8; MAX_DATAGRAM + 1];
        assert!(!lane.try_send(peer, &huge), "host should refuse oversize");
        assert_eq!(lane.oversize_count(), 1);
        assert!(!client.try_send(&huge), "client should refuse oversize");
        assert_eq!(client.oversize_count(), 1);

        // Still healthy for normal traffic afterwards.
        assert!(lane.try_send(peer, b"ok"));
    }

    #[tokio::test]
    async fn an_unbound_peer_reports_fallback_rather_than_erroring() {
        let (lane, _addr) = lane().await;
        assert!(!lane.try_send(PeerId(99), b"nowhere"));
    }
}
