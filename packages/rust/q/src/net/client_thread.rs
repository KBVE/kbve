//! App-side handle to a [`ClientSession`] running on its own thread.
//!
//! Mirrors `PhysicsHandle`: fixed cadence, latest-wins snapshot out, latest-wins
//! intent in. The engine polls; it never blocks on the network.
//!
//! The thread owns a small tokio runtime because the WebSocket reader and
//! writer are tasks. Keeping it here rather than on the app's runtime means a
//! stalled frame cannot stall the socket, and a dead socket cannot stall a
//! frame.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tokio::sync::watch;

use super::dual::DualClient;
use super::session::{ClientSession, ClientStatus, PeerInfo};
use super::ws::WsClient;
use crate::rapier::sim3d::{BodyId, SimSnapshot};

#[derive(Clone, Debug)]
pub struct NetClientState {
    pub status: ClientStatus,
    pub seed: Option<u64>,
    pub local_body: Option<BodyId>,
    pub snapshot: Option<SimSnapshot>,
    /// Set when the socket never came up, or dropped after it did.
    pub error: Option<String>,
    /// False while unreliable traffic is still falling back to the socket.
    pub udp_ready: bool,
    /// Name the host assigned. `None` until welcomed — what was requested and
    /// what was granted are not the same thing.
    pub name: Option<String>,
    pub roster: Vec<PeerInfo>,
}

impl Default for NetClientState {
    fn default() -> Self {
        Self {
            status: ClientStatus::Connecting,
            seed: None,
            local_body: None,
            snapshot: None,
            error: None,
            udp_ready: false,
            name: None,
            roster: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub wish_dir: [f32; 2],
    pub jump: bool,
}

pub struct NetClientHandle {
    stop: Arc<AtomicBool>,
    intent_tx: watch::Sender<Intent>,
    state_rx: watch::Receiver<Arc<NetClientState>>,
    join: Option<JoinHandle<()>>,
}

impl NetClientHandle {
    /// Joins as a guest — the host names us.
    pub fn spawn(url: String, tick_hz: f64) -> Self {
        Self::spawn_as(url, tick_hz, String::new())
    }

    /// `name` is a request. The host may sanitize it, or ignore it entirely and
    /// hand back a guest name; read [`NetClientState::name`] for the answer.
    pub fn spawn_as(url: String, tick_hz: f64, name: String) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let (intent_tx, intent_rx) = watch::channel(Intent::default());
        let (state_tx, state_rx) = watch::channel(Arc::new(NetClientState::default()));
        let stop_t = stop.clone();

        let join = thread::Builder::new()
            .name("q-netclient".into())
            .spawn(move || run(url, tick_hz, name, stop_t, intent_rx, state_tx))
            .expect("q: failed to spawn net client thread");

        Self {
            stop,
            intent_tx,
            state_rx,
            join: Some(join),
        }
    }

    /// Latest intent wins; the session thread reads it once per tick.
    pub fn set_intent(&self, intent: Intent) {
        let _ = self.intent_tx.send(intent);
    }

    pub fn state(&self) -> Arc<NetClientState> {
        self.state_rx.borrow().clone()
    }

    pub fn state_if_changed(&mut self) -> Option<Arc<NetClientState>> {
        match self.state_rx.has_changed() {
            Ok(true) => Some(self.state_rx.borrow_and_update().clone()),
            _ => None,
        }
    }
}

impl Drop for NetClientHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

/// Host portion of a `ws://host:port/path` url — the datagram lane targets the
/// same machine on a different port.
fn server_host(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let hostport = rest.split('/').next().unwrap_or(rest);
    hostport
        .rsplit_once(':')
        .map(|(host, _)| host)
        .unwrap_or(hostport)
        .to_owned()
}

fn run(
    url: String,
    tick_hz: f64,
    requested_name: String,
    stop: Arc<AtomicBool>,
    intent_rx: watch::Receiver<Intent>,
    state_tx: watch::Sender<Arc<NetClientState>>,
) {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            let _ = state_tx.send(Arc::new(NetClientState {
                status: ClientStatus::Rejected,
                error: Some(format!("runtime: {e}")),
                ..Default::default()
            }));
            return;
        }
    };
    let _guard = runtime.enter();

    let transport = match runtime.block_on(WsClient::connect(&url)) {
        Ok(ws) => DualClient::new(ws, server_host(&url)),
        Err(e) => {
            let _ = state_tx.send(Arc::new(NetClientState {
                status: ClientStatus::Rejected,
                error: Some(format!("{e:?}")),
                ..Default::default()
            }));
            return;
        }
    };

    let mut session = ClientSession::connect_as(transport.clone(), &requested_name);
    let dt = Duration::from_secs_f64(1.0 / tick_hz.max(1.0));
    let mut next = Instant::now() + dt;

    while !stop.load(Ordering::Relaxed) {
        transport.pump();
        let intent = *intent_rx.borrow();
        session.set_input(intent.wish_dir, intent.jump);
        session.tick();

        let dropped = !transport.is_connected();
        let _ = state_tx.send(Arc::new(NetClientState {
            status: session.status(),
            seed: session.seed(),
            local_body: session.local_body(),
            snapshot: session.latest_snapshot().cloned(),
            error: session
                .reject_reason()
                .map(str::to_owned)
                .or_else(|| dropped.then(|| "socket closed".to_owned())),
            udp_ready: transport.udp_ready(),
            name: session.name().map(str::to_owned),
            roster: session.roster().to_vec(),
        }));

        if dropped {
            return;
        }

        next += dt;
        match next.checked_duration_since(Instant::now()) {
            Some(idle) => thread::sleep(idle),
            None => next = Instant::now() + dt,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::dual::DualHost;
    use crate::net::session::{HostSession, SessionConfig};
    use crate::net::udp::UdpLane;
    use crate::net::ws::{WsHost, router};
    use crate::rapier::sim3d::{SimConfig, TerrainDesc};

    fn wait_for<T>(mut f: impl FnMut() -> Option<T>, timeout: Duration) -> Option<T> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if let Some(v) = f() {
                return Some(v);
            }
            thread::sleep(Duration::from_millis(10));
        }
        None
    }

    /// Spawns a host on its own runtime thread and returns its url.
    fn spawn_host() -> (Arc<AtomicBool>, String) {
        let stop = Arc::new(AtomicBool::new(false));
        let (addr_tx, addr_rx) = std::sync::mpsc::channel();
        let stop_t = stop.clone();

        thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .enable_all()
                .build()
                .unwrap();
            let _g = rt.enter();

            let ws = WsHost::new();
            let udp = rt
                .block_on(UdpLane::bind("127.0.0.1:0".parse().unwrap()))
                .unwrap();
            udp.spawn_recv_loop();
            let transport = DualHost::new(ws.clone(), udp);
            let listener = rt
                .block_on(tokio::net::TcpListener::bind("127.0.0.1:0"))
                .unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            let app = router(ws);
            rt.spawn(async move {
                let _ = axum::serve(listener, app).await;
            });

            let sim = SimConfig::default();
            let mut host =
                HostSession::dedicated(transport.clone(), SessionConfig::default(), sim, 4242);
            host.set_terrain(TerrainDesc {
                heights: Arc::new(vec![0.0; 33 * 33]),
                resolution: 33,
                extent: 64.0,
            });

            let step = Duration::from_secs_f64(sim.timestep());
            while !stop_t.load(Ordering::Relaxed) {
                transport.pump();
                for peer in transport.take_disconnects() {
                    host.remove_player(peer);
                }
                host.tick();
                thread::sleep(step);
            }
        });

        let addr = addr_rx.recv().unwrap();
        (stop, format!("ws://{addr}/ws"))
    }

    #[test]
    fn the_handle_joins_and_reports_its_own_body() {
        let (stop, url) = spawn_host();
        let client = NetClientHandle::spawn(url, 60.0);

        let state = wait_for(
            || {
                let s = client.state();
                (s.status == ClientStatus::Joined && s.snapshot.is_some()).then_some(s)
            },
            Duration::from_secs(10),
        )
        .expect("should join and receive a snapshot");

        assert_eq!(state.seed, Some(4242));
        let body = state.local_body.expect("own body");
        assert!(
            state.snapshot.as_ref().unwrap().body(body).is_some(),
            "our character should be in the snapshot"
        );
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn a_guest_handle_learns_its_assigned_name() {
        let (stop, url) = spawn_host();
        let client = NetClientHandle::spawn(url, 60.0);

        let state = wait_for(
            || {
                let s = client.state();
                (s.name.is_some() && !s.roster.is_empty()).then_some(s)
            },
            Duration::from_secs(10),
        )
        .expect("should be named and rostered");

        let name = state.name.as_deref().unwrap();
        assert!(name.starts_with("Anon-"), "{name}");
        assert!(
            state.roster.iter().any(|p| p.name == name),
            "our own name should be on the roster: {:?}",
            state.roster
        );
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn intent_set_from_the_app_moves_the_character() {
        let (stop, url) = spawn_host();
        let client = NetClientHandle::spawn(url, 60.0);

        let body = wait_for(|| client.state().local_body, Duration::from_secs(10)).expect("joined");

        let x_of = |s: &NetClientState| s.snapshot.as_ref()?.body(body).map(|b| b.iso.pos[0]);
        let start = wait_for(|| x_of(&client.state()), Duration::from_secs(10)).expect("position");

        client.set_intent(Intent {
            wish_dir: [1.0, 0.0],
            jump: false,
        });

        let moved = wait_for(
            || x_of(&client.state()).filter(|x| *x - start > 1.0),
            Duration::from_secs(10),
        );
        assert!(moved.is_some(), "intent should have crossed the wire");
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn the_handle_brings_up_the_datagram_lane() {
        let (stop, url) = spawn_host();
        let client = NetClientHandle::spawn(url, 60.0);

        let ready = wait_for(
            || client.state().udp_ready.then_some(()),
            Duration::from_secs(15),
        );
        assert!(ready.is_some(), "udp lane should come up end to end");
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn server_host_is_extracted_from_the_url() {
        assert_eq!(server_host("ws://127.0.0.1:7980/ws"), "127.0.0.1");
        assert_eq!(server_host("wss://game.kbve.com:443/ws"), "game.kbve.com");
        assert_eq!(server_host("ws://host/ws"), "host");
    }

    #[test]
    fn a_refused_connection_is_reported_rather_than_hanging() {
        // Port 1 is privileged and unbound; connect must fail fast.
        let client = NetClientHandle::spawn("ws://127.0.0.1:1/ws".into(), 60.0);
        let state = wait_for(
            || {
                let s = client.state();
                s.error.is_some().then_some(s)
            },
            Duration::from_secs(10),
        );
        assert!(state.is_some(), "a failed connect should surface an error");
        assert_eq!(state.unwrap().status, ClientStatus::Rejected);
    }
}
