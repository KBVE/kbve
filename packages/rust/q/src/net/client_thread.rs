//! App-side handle to a [`ClientSession`] running on its own thread.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, watch};

use super::dual::DualClient;
use super::session::{ClientSession, ClientStatus, HarvestEvent, PeerInfo, WorldInfo};
use super::ws::WsClient;
use crate::harvest::HarvestTarget;
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
    /// Name the host assigned.
    pub name: Option<String>,
    pub roster: Vec<PeerInfo>,
    /// Terrain and day length the host published on join.
    pub world: Option<WorldInfo>,
    /// Host clock, hours 0..24.
    pub hour: f32,
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
            world: None,
            hour: 0.0,
        }
    }
}

/// How the client asks to be let in.
#[derive(Clone, Debug, Default)]
pub enum Credential {
    #[default]
    Guest,
    /// Bearer token from the identity provider.
    Token(String),
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub wish_dir: [f32; 2],
    pub jump: bool,
    /// Facing, radians.
    pub yaw: f32,
}

/// One swing, on its way to the host.
#[derive(Clone, Copy, Debug)]
pub struct HarvestRequest {
    pub target: HarvestTarget,
    pub cell: [i32; 2],
    pub ordinal: u32,
    pub hits: u8,
}

pub struct NetClientHandle {
    stop: Arc<AtomicBool>,
    intent_tx: watch::Sender<Intent>,
    state_rx: watch::Receiver<Arc<NetClientState>>,
    /// Queues rather than latest-wins: every swing counts, unlike intent, where
    /// only the newest matters.
    harvest_tx: mpsc::UnboundedSender<HarvestRequest>,
    event_rx: mpsc::UnboundedReceiver<HarvestEvent>,
    join: Option<JoinHandle<()>>,
}

impl NetClientHandle {
    /// Joins as a guest — the host names us.
    pub fn spawn(url: String, tick_hz: f64) -> Self {
        Self::spawn_as(url, tick_hz, String::new())
    }

    /// Joins with a bearer token; the host reads the name out of its claims.
    pub fn spawn_with_token(url: String, tick_hz: f64, token: String) -> Self {
        Self::spawn_credentialed(url, tick_hz, Credential::Token(token))
    }

    /// `name` is vestigial — guests are named by the host.
    pub fn spawn_as(url: String, tick_hz: f64, name: String) -> Self {
        let _ = name;
        Self::spawn_credentialed(url, tick_hz, Credential::Guest)
    }

    fn spawn_credentialed(url: String, tick_hz: f64, credential: Credential) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let (intent_tx, intent_rx) = watch::channel(Intent::default());
        let (state_tx, state_rx) = watch::channel(Arc::new(NetClientState::default()));
        let (harvest_tx, harvest_rx) = mpsc::unbounded_channel();
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let stop_t = stop.clone();

        let join = thread::Builder::new()
            .name("q-netclient".into())
            .spawn(move || {
                run(
                    url, tick_hz, credential, stop_t, intent_rx, state_tx, harvest_rx, event_tx,
                )
            })
            .expect("q: failed to spawn net client thread");

        Self {
            stop,
            intent_tx,
            state_rx,
            harvest_tx,
            event_rx,
            join: Some(join),
        }
    }

    /// Asks the host to work a scattered object.
    pub fn harvest(&self, request: HarvestRequest) {
        let _ = self.harvest_tx.send(request);
    }

    /// Everything the host has ruled on since the last call.
    ///
    /// Drained rather than published with the rest of the state: state is
    /// latest-wins, and a delta missed because a frame was slow is a rock that
    /// stands here and nowhere else.
    pub fn take_harvest_events(&mut self) -> Vec<HarvestEvent> {
        let mut out = Vec::new();
        while let Ok(event) = self.event_rx.try_recv() {
            out.push(event);
        }
        out
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

/// Host portion of a `ws://host:port/path` url — the datagram lane targets the same
/// machine on a different port.
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
    credential: Credential,
    stop: Arc<AtomicBool>,
    intent_rx: watch::Receiver<Intent>,
    state_tx: watch::Sender<Arc<NetClientState>>,
    mut harvest_rx: mpsc::UnboundedReceiver<HarvestRequest>,
    event_tx: mpsc::UnboundedSender<HarvestEvent>,
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

    let mut session = match &credential {
        Credential::Guest => ClientSession::connect(transport.clone()),
        Credential::Token(token) => ClientSession::connect_with_token(transport.clone(), token),
    };
    let dt = Duration::from_secs_f64(1.0 / tick_hz.max(1.0));
    let mut next = Instant::now() + dt;

    while !stop.load(Ordering::Relaxed) {
        transport.pump();
        let intent = *intent_rx.borrow();
        session.set_input(intent.wish_dir, intent.jump, intent.yaw);
        while let Ok(request) = harvest_rx.try_recv() {
            session.harvest(request.target, request.cell, request.ordinal, request.hits);
        }
        session.tick();
        for event in session.take_harvest_events() {
            let _ = event_tx.send(event);
        }

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
            world: session.world(),
            hour: session.hour(),
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
            yaw: 0.0,
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
