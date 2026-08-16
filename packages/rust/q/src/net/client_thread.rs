//! App-side handle to a [`ClientSession`] running on its own thread.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, watch};

use super::dual::DualClient;
use super::pets::{PetId, PetInfo};
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
    /// Seconds the host has simulated, never wrapped, so anything that wants to be a
    /// function of world time has a number that only goes up.
    pub elapsed: f64,
    /// Whole days the world has run.
    pub day: i64,
    /// Every pet deployed in the session, which is what says a body in the
    /// snapshot is somebody's robot rather than a player.
    pub pets: Vec<PetInfo>,
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
            elapsed: 0.0,
            day: 0,
            pets: Vec::new(),
        }
    }
}

/// What the app is asking the host to do with its robots.
#[derive(Clone, Copy, Debug)]
pub enum PetCommand {
    Deploy { kind: u8 },
    Recall(PetId),
    RecallAll,
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

/// Taking up or putting down a job, on its way to the host.
#[derive(Clone, Copy, Debug)]
pub enum HarvestCommand {
    Begin {
        target: HarvestTarget,
        cell: [i32; 2],
        ordinal: u32,
    },
    End,
}

pub struct NetClientHandle {
    stop: Arc<AtomicBool>,
    intent_tx: watch::Sender<Intent>,
    state_rx: watch::Receiver<Arc<NetClientState>>,
    /// Queues rather than latest-wins: starting and stopping are a sequence, and a
    /// begin overwritten by the end that followed it is a job that never ran.
    harvest_tx: mpsc::UnboundedSender<HarvestCommand>,
    event_rx: mpsc::UnboundedReceiver<HarvestEvent>,
    /// Queued like harvests rather than latest-wins: a deploy dropped because a
    /// frame was slow is a button press that silently did nothing.
    pet_tx: mpsc::UnboundedSender<PetCommand>,
    denied_rx: mpsc::UnboundedReceiver<String>,
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
        let (pet_tx, pet_rx) = mpsc::unbounded_channel();
        let (denied_tx, denied_rx) = mpsc::unbounded_channel();
        let stop_t = stop.clone();

        let join = thread::Builder::new()
            .name("q-netclient".into())
            .spawn(move || {
                run(Wiring {
                    url,
                    tick_hz,
                    credential,
                    stop: stop_t,
                    intent_rx,
                    state_tx,
                    harvest_rx,
                    event_tx,
                    pet_rx,
                    denied_tx,
                })
            })
            .expect("q: failed to spawn net client thread");

        Self {
            stop,
            intent_tx,
            state_rx,
            harvest_tx,
            event_rx,
            pet_tx,
            denied_rx,
            join: Some(join),
        }
    }

    /// Asks the host to put a robot down, pick one up, or pick all of them up.
    pub fn command_pet(&self, command: PetCommand) {
        let _ = self.pet_tx.send(command);
    }

    /// Every deploy the host has turned down since the last call, and why.
    pub fn take_pet_denials(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        while let Ok(reason) = self.denied_rx.try_recv() {
            out.push(reason);
        }
        out
    }

    /// Tells the host we have taken up or put down a job.
    pub fn harvest(&self, command: HarvestCommand) {
        let _ = self.harvest_tx.send(command);
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

/// Everything the session thread is handed at birth, gathered so the signature
/// stays readable as the channels multiply.
struct Wiring {
    url: String,
    tick_hz: f64,
    credential: Credential,
    stop: Arc<AtomicBool>,
    intent_rx: watch::Receiver<Intent>,
    state_tx: watch::Sender<Arc<NetClientState>>,
    harvest_rx: mpsc::UnboundedReceiver<HarvestCommand>,
    event_tx: mpsc::UnboundedSender<HarvestEvent>,
    pet_rx: mpsc::UnboundedReceiver<PetCommand>,
    denied_tx: mpsc::UnboundedSender<String>,
}

fn run(w: Wiring) {
    let Wiring {
        url,
        tick_hz,
        credential,
        stop,
        intent_rx,
        state_tx,
        mut harvest_rx,
        event_tx,
        mut pet_rx,
        denied_tx,
    } = w;
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
        while let Ok(command) = harvest_rx.try_recv() {
            match command {
                HarvestCommand::Begin {
                    target,
                    cell,
                    ordinal,
                } => session.harvest_begin(target, cell, ordinal),
                HarvestCommand::End => session.harvest_end(),
            }
        }
        while let Ok(command) = pet_rx.try_recv() {
            match command {
                PetCommand::Deploy { kind } => session.deploy_pet(kind),
                PetCommand::Recall(pet) => session.recall_pet(pet),
                PetCommand::RecallAll => session.recall_pets(),
            }
        }
        session.tick();
        session.advance_clock(dt.as_secs_f64());
        for event in session.take_harvest_events() {
            let _ = event_tx.send(event);
        }
        if let Some(reason) = session.take_pet_denied() {
            let _ = denied_tx.send(reason);
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
            elapsed: session.elapsed(),
            day: session.day(),
            pets: session.pets().to_vec(),
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

    /// The whole pet path over a real socket: command out, body and roster back.
    #[test]
    fn a_deployed_pet_comes_back_as_a_body_and_a_roster_entry() {
        let (stop, url) = spawn_host();
        let client = NetClientHandle::spawn(url, 60.0);
        wait_for(
            || client.state().local_body.map(|_| ()),
            Duration::from_secs(10),
        )
        .expect("joined");

        client.command_pet(PetCommand::Deploy { kind: 2 });

        let state = wait_for(
            || {
                let s = client.state();
                (!s.pets.is_empty()).then_some(s)
            },
            Duration::from_secs(10),
        )
        .expect("the deploy never came back");

        let pet = &state.pets[0];
        assert_eq!(pet.kind, 2, "the chassis we asked for was lost on the way");
        assert!(
            state
                .snapshot
                .as_ref()
                .is_some_and(|s| s.body(pet.body).is_some()),
            "the pet has a roster entry but no body to draw it on"
        );
        assert!(
            pet.body.0 >= crate::net::pets::PET_BODY_BASE,
            "a pet body outside the band a client uses to tell it from an avatar"
        );

        client.command_pet(PetCommand::Recall(pet.pet));
        let gone = wait_for(
            || client.state().pets.is_empty().then_some(()),
            Duration::from_secs(10),
        );
        assert!(gone.is_some(), "the recall never took");
        stop.store(true, Ordering::Relaxed);
    }

    /// A refusal has to reach the app, or the button just stops working.
    #[test]
    fn a_refused_deploy_comes_back_with_a_reason() {
        let (stop, url) = spawn_host();
        let mut client = NetClientHandle::spawn(url, 60.0);
        wait_for(
            || client.state().local_body.map(|_| ()),
            Duration::from_secs(10),
        )
        .expect("joined");

        let cap = SessionConfig::default().pets.per_player;
        for _ in 0..cap + 2 {
            client.command_pet(PetCommand::Deploy { kind: 0 });
        }

        let denial = wait_for(
            || {
                let denials = client.take_pet_denials();
                denials.into_iter().next()
            },
            Duration::from_secs(10),
        );
        assert!(
            denial.is_some_and(|r| !r.is_empty()),
            "the cap was enforced silently"
        );
        assert_eq!(client.state().pets.len(), cap, "the cap did not hold");
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
