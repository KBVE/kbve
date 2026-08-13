//! Two-lane [`Transport`]: reliable over WebSocket, unreliable over UDP.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::transport::{Delivery, Envelope, PeerId, Transport};
use super::udp::{Token, UdpClient, UdpLane};
use super::ws::{WsClient, WsError, WsHost};
use crate::proto;

const CH_SESSION: u8 = 0;
const CH_CONTROL: u8 = 1;

#[derive(Serialize, Deserialize)]
enum Control {
    /// `host` is set when the datagram lane is reachable somewhere other than the
    /// WebSocket's host — Agones port-maps and an L7 gateway cannot carry UDP at all,
    /// so the advertised endpoint is not always the one we bound.
    UdpOffer {
        port: u16,
        token: Token,
        host: Option<String>,
    },
}

/// Resolves a host that may be a name rather than a literal address — the advertised
/// endpoint can be a DNS name behind a load balancer.
fn resolve(host: &str, port: u16) -> Option<SocketAddr> {
    use std::net::ToSocketAddrs;
    (host, port).to_socket_addrs().ok()?.next()
}

fn tag(channel: u8, payload: &[u8]) -> Vec<u8> {
    let mut framed = Vec::with_capacity(payload.len() + 1);
    framed.push(channel);
    framed.extend_from_slice(payload);
    framed
}


pub struct DualHost {
    ws: Arc<WsHost>,
    udp: Arc<UdpLane>,
    offered: Mutex<HashSet<PeerId>>,
    advertise: Mutex<(Option<String>, Option<u16>)>,
}

impl DualHost {
    pub fn new(ws: Arc<WsHost>, udp: Arc<UdpLane>) -> Arc<Self> {
        Arc::new(Self {
            ws,
            udp,
            offered: Mutex::new(HashSet::new()),
            advertise: Mutex::new((None, None)),
        })
    }

    /// Endpoint clients should send datagrams to, when it differs from what we bound.
    pub fn advertise_udp(&self, host: Option<String>, port: Option<u16>) {
        *self.advertise.lock().unwrap() = (host, port);
    }

    pub fn udp_port(&self) -> u16 {
        self.udp.port()
    }

    pub fn peer_count(&self) -> usize {
        self.ws.peer_count()
    }

    /// Number of peers currently reachable by datagram.
    pub fn bound_count(&self) -> usize {
        self.ws
            .peers()
            .iter()
            .filter(|p| self.udp.is_bound(**p))
            .count()
    }

    pub fn oversize_count(&self) -> u64 {
        self.udp.oversize_count()
    }

    /// Offers the datagram lane to any newly-connected peer.
    pub fn pump(&self) {
        for peer in self.ws.peers() {
            if self.offered.lock().unwrap().contains(&peer) {
                continue;
            }
            let token = self.udp.issue_token(peer);
            let (host, port) = self.advertise.lock().unwrap().clone();
            let offer = Control::UdpOffer {
                port: port.unwrap_or_else(|| self.udp.port()),
                token,
                host,
            };
            let Ok(bytes) = proto::encode(&offer) else {
                continue;
            };
            if self
                .ws
                .send(peer, Delivery::Reliable, &tag(CH_CONTROL, &bytes))
                .is_ok()
            {
                self.offered.lock().unwrap().insert(peer);
            }
        }
    }

    /// Peers whose socket dropped.
    pub fn take_disconnects(&self) -> Vec<PeerId> {
        let gone = self.ws.take_disconnects();
        for peer in &gone {
            self.udp.revoke(*peer);
            self.offered.lock().unwrap().remove(peer);
        }
        gone
    }
}

impl Transport for Arc<DualHost> {
    type Error = WsError;

    fn local_peer(&self) -> PeerId {
        PeerId::HOST
    }

    fn send(&self, to: PeerId, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        if delivery == Delivery::Unreliable && self.udp.try_send(to, payload) {
            return Ok(());
        }
        self.ws
            .send(to, Delivery::Reliable, &tag(CH_SESSION, payload))
    }

    fn broadcast(&self, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        for peer in self.ws.peers() {
            let _ = self.send(peer, delivery, payload);
        }
        Ok(())
    }

    fn try_recv(&self) -> Option<Envelope> {
        if let Some(envelope) = self.udp.try_recv() {
            return Some(envelope);
        }
        loop {
            let mut envelope = self.ws.try_recv()?;
            if envelope.payload.is_empty() {
                continue;
            }
            let channel = envelope.payload.remove(0);
            if channel == CH_SESSION {
                return Some(envelope);
            }
        }
    }

    fn peers(&self) -> Vec<PeerId> {
        self.ws.peers()
    }
}


pub struct DualClient {
    ws: Arc<WsClient>,
    server_host: String,
    udp: Mutex<Option<Arc<UdpClient>>>,
    pending: Mutex<Option<(String, u16, Token)>>,
}

impl DualClient {
    /// `server_host` is the host portion of the WebSocket url — the datagram lane goes
    /// to the same machine on a different port.
    pub fn new(ws: Arc<WsClient>, server_host: impl Into<String>) -> Arc<Self> {
        Arc::new(Self {
            ws,
            server_host: server_host.into(),
            udp: Mutex::new(None),
            pending: Mutex::new(None),
        })
    }

    pub fn is_connected(&self) -> bool {
        self.ws.is_connected()
    }

    /// True once datagrams are flowing; until then everything rides the socket.
    pub fn udp_ready(&self) -> bool {
        self.udp
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|u| u.is_confirmed())
    }

    /// Advances the datagram handshake.
    pub fn pump(self: &Arc<Self>) {
        let offer = self.pending.lock().unwrap().take();
        if let Some((host, port, token)) = offer {
            let Some(addr) = resolve(&host, port) else {
                return;
            };
            let this = self.clone();
            tokio::spawn(async move {
                if let Ok(client) = UdpClient::connect(addr, token).await {
                    *this.udp.lock().unwrap() = Some(client);
                }
            });
            return;
        }
        let udp = self.udp.lock().unwrap();
        if let Some(client) = udp.as_ref()
            && !client.is_confirmed()
        {
            client.send_hello();
        }
    }
}

impl Transport for Arc<DualClient> {
    type Error = WsError;

    fn local_peer(&self) -> PeerId {
        PeerId::UNASSIGNED
    }

    fn send(&self, to: PeerId, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        if delivery == Delivery::Unreliable
            && let Some(udp) = self.udp.lock().unwrap().as_ref()
            && udp.try_send(payload)
        {
            return Ok(());
        }
        self.ws
            .send(to, Delivery::Reliable, &tag(CH_SESSION, payload))
    }

    fn broadcast(&self, delivery: Delivery, payload: &[u8]) -> Result<(), Self::Error> {
        self.send(PeerId::HOST, delivery, payload)
    }

    fn try_recv(&self) -> Option<Envelope> {
        if let Some(udp) = self.udp.lock().unwrap().as_ref()
            && let Some(envelope) = udp.try_recv()
        {
            return Some(envelope);
        }
        loop {
            let mut envelope = self.ws.try_recv()?;
            if envelope.payload.is_empty() {
                continue;
            }
            let channel = envelope.payload.remove(0);
            if channel == CH_SESSION {
                return Some(envelope);
            }
            if channel == CH_CONTROL
                && let Ok(Control::UdpOffer { port, token, host }) =
                    proto::decode::<Control>(&mut envelope.payload)
            {
                let host = host.unwrap_or_else(|| self.server_host.clone());
                *self.pending.lock().unwrap() = Some((host, port, token));
            }
        }
    }

    fn peers(&self) -> Vec<PeerId> {
        vec![PeerId::HOST]
    }
}

#[cfg(all(test, feature = "net-session"))]
mod tests {
    use super::*;
    use crate::net::session::{ClientSession, ClientStatus, HostSession, SessionConfig};
    use crate::net::ws::router;
    use crate::rapier::sim3d::{SimConfig, TerrainDesc};
    use std::time::Duration;

    async fn serve() -> (Arc<DualHost>, String) {
        let ws = WsHost::new();
        let udp = UdpLane::bind("127.0.0.1:0".parse().unwrap()).await.unwrap();
        udp.spawn_recv_loop();
        let host = DualHost::new(ws.clone(), udp);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router(ws);
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

    async fn run(
        host: &mut HostSession<Arc<DualHost>>,
        transport: &Arc<DualHost>,
        client: &mut ClientSession<Arc<DualClient>>,
        client_transport: &Arc<DualClient>,
        ticks: usize,
    ) {
        for _ in 0..ticks {
            transport.pump();
            client_transport.pump();
            host.tick();
            client.tick();
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    }

    #[tokio::test]
    async fn the_session_runs_across_both_lanes() {
        let (transport, url) = serve().await;
        let mut host = HostSession::dedicated(
            transport.clone(),
            SessionConfig::default(),
            SimConfig::default(),
            77,
        );
        host.set_terrain(flat_terrain());

        let ws = WsClient::connect(&url).await.unwrap();
        let client_transport = DualClient::new(ws, "127.0.0.1");
        let mut client = ClientSession::connect(client_transport.clone());

        run(&mut host, &transport, &mut client, &client_transport, 200).await;

        assert_eq!(client.status(), ClientStatus::Joined);
        assert_eq!(client.seed(), Some(77));
        assert!(
            client_transport.udp_ready(),
            "datagram lane should have come up"
        );
        assert_eq!(
            transport.bound_count(),
            1,
            "host should have bound the peer"
        );

        let body = client.local_body().expect("welcomed");
        let start = host.world_mut().snapshot().body(body).unwrap().iso.pos;
        client.set_input([1.0, 0.0], false);
        run(&mut host, &transport, &mut client, &client_transport, 300).await;
        let end = host.world_mut().snapshot().body(body).unwrap().iso.pos;

        assert!(
            end[0] - start[0] > 1.0,
            "input should have crossed the wire, moved {}",
            end[0] - start[0]
        );
        assert!(client.latest_snapshot().is_some_and(|s| s.tick > 0));
    }

    /// The fallback is what makes the lane safe to add: a client that never completes
    /// the datagram handshake must still play, just over TCP.
    #[tokio::test]
    async fn a_client_that_never_gets_udp_still_plays() {
        let (transport, url) = serve().await;
        let mut host = HostSession::dedicated(
            transport.clone(),
            SessionConfig::default(),
            SimConfig::default(),
            5,
        );
        host.set_terrain(flat_terrain());

        let ws = WsClient::connect(&url).await.unwrap();
        let client_transport = DualClient::new(ws, "127.0.0.1");
        let mut client = ClientSession::connect(client_transport.clone());

        for _ in 0..200 {
            transport.pump();
            host.tick();
            client.tick();
            tokio::time::sleep(Duration::from_millis(2)).await;
        }

        assert!(!client_transport.udp_ready(), "lane should be down");
        assert_eq!(transport.bound_count(), 0);
        assert_eq!(
            client.status(),
            ClientStatus::Joined,
            "still joined over ws"
        );
        assert!(
            client.latest_snapshot().is_some(),
            "snapshots should have fallen back to the reliable lane"
        );
    }

    #[tokio::test]
    async fn control_frames_never_reach_the_session() {
        let (transport, url) = serve().await;
        let ws = WsClient::connect(&url).await.unwrap();
        let client_transport = DualClient::new(ws, "127.0.0.1");

        for _ in 0..50 {
            transport.pump();
            tokio::time::sleep(Duration::from_millis(2)).await;
        }

        let seen: Vec<Envelope> = std::iter::from_fn(|| client_transport.try_recv()).collect();
        assert!(
            seen.is_empty(),
            "the UDP offer must be consumed by the transport, got {seen:?}"
        );
        client_transport.pump();
        for _ in 0..100 {
            client_transport.pump();
            if client_transport.udp_ready() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(
            client_transport.udp_ready(),
            "offer should have been acted on"
        );
    }
}
