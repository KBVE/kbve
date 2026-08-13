//! Listen-server session: the host/client role split over a [`Transport`].

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::guest::{sanitize, unique_guest_name};
use super::transport::{Delivery, PeerId, Transport};
use crate::proto::{self, PROTOCOL_VERSION};
use crate::rapier::sim3d::{
    BodyId, CharacterDesc, Iso, SimCommand, SimConfig, SimSnapshot, SimWorld, TerrainDesc,
};

/// What a client reports it is trying to do this tick.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PlayerInput {
    /// Monotonic per-client counter.
    pub sequence: u32,
    /// Horizontal wish direction in world space, `[x, z]`.
    pub wish_dir: [f32; 2],
    pub jump: bool,
}

/// One entry of the player list.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer: PeerId,
    pub body: BodyId,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SessionMsg {
    /// Join as a guest.
    Join {
        protocol: u32,
        /// Legacy request field, ignored since accounts landed — a guest that could ask
        /// for a name could ask for someone else's.
        name: String,
    },
    /// `peer` is the id the host assigned; a client cannot infer its own.
    Welcome {
        protocol: u32,
        seed: u64,
        peer: PeerId,
        name: String,
    },
    Reject {
        reason: String,
    },
    /// Whole player list, reliably, whenever it changes.
    Roster {
        players: Vec<PeerInfo>,
    },
    Input(PlayerInput),
    Snapshot(SimSnapshot),
    /// Join carrying a bearer token from an external identity provider (Supabase
    /// GoTrue, in practice).
    JoinAuthed {
        protocol: u32,
        token: String,
    },
}

/// Turns a bearer token into a display name, or into a reason the player can read.
pub trait TokenAuthority: Send + Sync {
    fn verify(&self, token: &str) -> Result<String, String>;
}

#[derive(Clone, Copy, Debug)]
pub struct SessionConfig {
    /// Snapshot broadcast rate.
    pub snapshot_hz: f64,
    pub move_speed: f32,
    pub gravity: f32,
    pub jump_speed: f32,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            snapshot_hz: 20.0,
            move_speed: 4.0,
            gravity: -9.81,
            jump_speed: 4.5,
        }
    }
}

/// Longest token the host will look at.
const MAX_TOKEN_LEN: usize = 8 * 1024;

/// Players occupy a reserved id band so world props can never collide with a player
/// body id, whatever order things spawn in.
const PLAYER_BODY_BASE: u32 = 1_000_000;

pub fn player_body(peer: PeerId) -> BodyId {
    BodyId(PLAYER_BODY_BASE + peer.0)
}

#[derive(Default)]
struct Player {
    last_sequence: u32,
    input: PlayerInput,
    /// Integrated separately from the character controller, which resolves motion but
    /// never applies gravity.
    vel_y: f32,
    /// Host-assigned display name — see [`crate::net::guest`].
    name: String,
}

pub struct HostSession<T: Transport> {
    transport: T,
    world: SimWorld,
    config: SessionConfig,
    sim: SimConfig,
    players: HashMap<PeerId, Player>,
    seed: u64,
    snapshot_accum: f64,
    authority: Option<Arc<dyn TokenAuthority>>,
}

impl<T: Transport> HostSession<T> {
    /// Listen-server host: the local peer is also a player, admitted up front since it
    /// will never send itself a Join.
    pub fn new(transport: T, config: SessionConfig, sim: SimConfig, seed: u64) -> Self {
        let mut host = Self::dedicated(transport, config, sim, seed);
        let local = host.transport.local_peer();
        host.admit_guest(local);
        host
    }

    /// Dedicated host: authoritative but not a participant, so no body is spawned for
    /// the local peer.
    pub fn dedicated(transport: T, config: SessionConfig, sim: SimConfig, seed: u64) -> Self {
        Self {
            world: SimWorld::new(&sim),
            transport,
            config,
            sim,
            players: HashMap::new(),
            seed,
            snapshot_accum: 0.0,
            authority: None,
        }
    }

    /// Installs the authority that signed-in joins are checked against.
    pub fn with_authority(mut self, authority: Arc<dyn TokenAuthority>) -> Self {
        self.authority = Some(authority);
        self
    }

    pub fn world_mut(&mut self) -> &mut SimWorld {
        &mut self.world
    }

    pub fn seed(&self) -> u64 {
        self.seed
    }

    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    pub fn set_terrain(&mut self, terrain: TerrainDesc) {
        self.world.apply(SimCommand::SetTerrain(terrain));
    }

    /// Assigned display name for a peer, if it is in the session.
    pub fn player_name(&self, peer: PeerId) -> Option<&str> {
        self.players.get(&peer).map(|p| p.name.as_str())
    }

    pub fn roster(&self) -> Vec<PeerInfo> {
        let mut players: Vec<PeerInfo> = self
            .players
            .iter()
            .map(|(peer, player)| PeerInfo {
                peer: *peer,
                body: player_body(*peer),
                name: player.name.clone(),
            })
            .collect();
        players.sort_by_key(|p| p.peer);
        players
    }

    /// Admits `peer` as a guest under a host-assigned name, and returns it.
    fn admit_guest(&mut self, peer: PeerId) -> String {
        if let Some(player) = self.players.get(&peer) {
            return player.name.clone();
        }
        let taken = |candidate: &str| self.players.values().any(|p| p.name == candidate);
        let name = unique_guest_name(taken, peer.0);
        self.spawn_player(peer, name.clone());
        name
    }

    /// Admits `peer` under the name their verified token carries.
    fn admit_account(&mut self, peer: PeerId, username: &str) -> Result<String, String> {
        if let Some(player) = self.players.get(&peer) {
            return Ok(player.name.clone());
        }
        let name = sanitize(username).ok_or("account has no usable display name")?;
        if self.players.values().any(|p| p.name == name) {
            return Err("that account is already in this session".to_owned());
        }
        self.spawn_player(peer, name.clone());
        Ok(name)
    }

    fn spawn_player(&mut self, peer: PeerId, name: String) {
        self.players.insert(
            peer,
            Player {
                name,
                ..Default::default()
            },
        );
        self.world.apply(SimCommand::SpawnCharacter {
            id: player_body(peer),
            desc: CharacterDesc {
                iso: Iso::at(peer.0 as f32 * 2.0, 5.0, 0.0),
                ..Default::default()
            },
        });
    }

    pub fn remove_player(&mut self, peer: PeerId) {
        if self.players.remove(&peer).is_some() {
            self.world.apply(SimCommand::Despawn {
                id: player_body(peer),
            });
            self.broadcast_roster();
        }
    }

    fn welcome(&mut self, peer: PeerId, assigned: String) {
        self.reply(
            peer,
            &SessionMsg::Welcome {
                protocol: PROTOCOL_VERSION,
                seed: self.seed,
                peer,
                name: assigned,
            },
        );
        self.broadcast_roster();
    }

    fn broadcast_roster(&self) {
        if self.transport.peers().is_empty() {
            return;
        }
        let msg = SessionMsg::Roster {
            players: self.roster(),
        };
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self.transport.broadcast(Delivery::Reliable, &bytes);
        }
    }

    fn handle(&mut self, from: PeerId, msg: SessionMsg) {
        match msg {
            SessionMsg::Join { protocol, name: _ } => {
                if protocol != PROTOCOL_VERSION {
                    let reason = format!("protocol {protocol} != {PROTOCOL_VERSION}");
                    self.reply(from, &SessionMsg::Reject { reason });
                    return;
                }
                let assigned = self.admit_guest(from);
                self.welcome(from, assigned);
            }
            SessionMsg::JoinAuthed { protocol, token } => {
                if protocol != PROTOCOL_VERSION {
                    let reason = format!("protocol {protocol} != {PROTOCOL_VERSION}");
                    self.reply(from, &SessionMsg::Reject { reason });
                    return;
                }
                let Some(authority) = self.authority.clone() else {
                    self.reply(
                        from,
                        &SessionMsg::Reject {
                            reason: "this server does not accept accounts".to_owned(),
                        },
                    );
                    return;
                };
                if token.len() > MAX_TOKEN_LEN {
                    self.reply(
                        from,
                        &SessionMsg::Reject {
                            reason: "token too large".to_owned(),
                        },
                    );
                    return;
                }
                let assigned = match authority
                    .verify(&token)
                    .and_then(|username| self.admit_account(from, &username))
                {
                    Ok(name) => name,
                    Err(reason) => {
                        self.reply(from, &SessionMsg::Reject { reason });
                        return;
                    }
                };
                self.welcome(from, assigned);
            }
            SessionMsg::Input(input) => {
                let Some(player) = self.players.get_mut(&from) else {
                    return;
                };
                if input.sequence >= player.last_sequence {
                    player.last_sequence = input.sequence;
                    player.input = input;
                }
            }
            SessionMsg::Welcome { .. }
            | SessionMsg::Reject { .. }
            | SessionMsg::Roster { .. }
            | SessionMsg::Snapshot(_) => {}
        }
    }

    fn reply(&self, to: PeerId, msg: &SessionMsg) {
        if let Ok(bytes) = proto::encode(msg) {
            let _ = self.transport.send(to, Delivery::Reliable, &bytes);
        }
    }

    /// Drain inputs, advance the sim one tick, and broadcast on the network cadence.
    pub fn tick(&mut self) {
        while let Some(mut envelope) = self.transport.try_recv() {
            if let Ok(msg) = proto::decode::<SessionMsg>(&mut envelope.payload) {
                self.handle(envelope.from, msg);
            }
        }

        let dt = self.sim.timestep() as f32;
        let snapshot = self.world.snapshot();
        for (peer, player) in &mut self.players {
            let body = player_body(*peer);
            let grounded = snapshot.body(body).is_some_and(|b| b.grounded);

            if grounded && player.vel_y < 0.0 {
                player.vel_y = 0.0;
            }
            if grounded && player.input.jump {
                player.vel_y = self.config.jump_speed;
            }
            player.vel_y += self.config.gravity * dt;

            let [wx, wz] = player.input.wish_dir;
            let len = (wx * wx + wz * wz).sqrt();
            let (nx, nz) = if len > 1.0 {
                (wx / len, wz / len)
            } else {
                (wx, wz)
            };

            self.world.apply(SimCommand::MoveCharacter {
                id: body,
                translation: [
                    nx * self.config.move_speed * dt,
                    player.vel_y * dt,
                    nz * self.config.move_speed * dt,
                ],
            });
        }

        self.world.step();

        self.snapshot_accum += self.sim.timestep();
        let interval = 1.0 / self.config.snapshot_hz.max(1.0);
        if self.snapshot_accum >= interval {
            self.snapshot_accum = 0.0;
            self.broadcast_snapshot();
        }
    }

    fn broadcast_snapshot(&self) {
        if self.transport.peers().is_empty() {
            return;
        }
        let msg = SessionMsg::Snapshot(self.world.snapshot());
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self.transport.broadcast(Delivery::Unreliable, &bytes);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClientStatus {
    Connecting,
    Joined,
    Rejected,
}

pub struct ClientSession<T: Transport> {
    transport: T,
    status: ClientStatus,
    seed: Option<u64>,
    snapshot: Option<SimSnapshot>,
    input: PlayerInput,
    reject_reason: Option<String>,
    /// Assigned by the host in `Welcome`; unknown until then.
    peer: Option<PeerId>,
    /// Likewise assigned — the requested name is not the granted one.
    name: Option<String>,
    roster: Vec<PeerInfo>,
}

impl<T: Transport> ClientSession<T> {
    /// Joins as a guest: no name requested, so the host assigns one.
    pub fn connect(transport: T) -> Self {
        Self::connect_as(transport, "")
    }

    /// Joins with a bearer token: the host verifies it and names the player from the
    /// claims inside.
    pub fn connect_with_token(transport: T, token: &str) -> Self {
        Self::open(
            transport,
            SessionMsg::JoinAuthed {
                protocol: PROTOCOL_VERSION,
                token: token.to_owned(),
            },
        )
    }

    /// Sends the join request immediately — reliably, because a dropped join is a
    /// session that silently never starts.
    pub fn connect_as(transport: T, requested_name: &str) -> Self {
        Self::open(
            transport,
            SessionMsg::Join {
                protocol: PROTOCOL_VERSION,
                name: requested_name.to_owned(),
            },
        )
    }

    fn open(transport: T, join: SessionMsg) -> Self {
        let client = Self {
            transport,
            status: ClientStatus::Connecting,
            seed: None,
            snapshot: None,
            input: PlayerInput::default(),
            reject_reason: None,
            peer: None,
            name: None,
            roster: Vec::new(),
        };
        if let Ok(bytes) = proto::encode(&join) {
            let _ = client
                .transport
                .send(PeerId::HOST, Delivery::Reliable, &bytes);
        }
        client
    }

    pub fn status(&self) -> ClientStatus {
        self.status
    }

    pub fn reject_reason(&self) -> Option<&str> {
        self.reject_reason.as_deref()
    }

    /// Seed the world was generated from.
    pub fn seed(&self) -> Option<u64> {
        self.seed
    }

    pub fn latest_snapshot(&self) -> Option<&SimSnapshot> {
        self.snapshot.as_ref()
    }

    /// `None` until the host welcomes us.
    pub fn peer(&self) -> Option<PeerId> {
        self.peer
    }

    /// `None` until welcomed; guessing would render another player's character.
    pub fn local_body(&self) -> Option<BodyId> {
        self.peer.map(player_body)
    }

    /// Name the host assigned us.
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    /// Everyone in the session, host included.
    pub fn roster(&self) -> &[PeerInfo] {
        &self.roster
    }

    pub fn name_of_body(&self, body: BodyId) -> Option<&str> {
        self.roster
            .iter()
            .find(|p| p.body == body)
            .map(|p| p.name.as_str())
    }

    pub fn set_input(&mut self, wish_dir: [f32; 2], jump: bool) {
        self.input.sequence = self.input.sequence.wrapping_add(1);
        self.input.wish_dir = wish_dir;
        self.input.jump = jump;
    }

    pub fn tick(&mut self) {
        while let Some(mut envelope) = self.transport.try_recv() {
            let Ok(msg) = proto::decode::<SessionMsg>(&mut envelope.payload) else {
                continue;
            };
            match msg {
                SessionMsg::Welcome {
                    seed, peer, name, ..
                } => {
                    self.status = ClientStatus::Joined;
                    self.seed = Some(seed);
                    self.peer = Some(peer);
                    self.name = Some(name);
                }
                SessionMsg::Roster { players } => {
                    self.roster = players;
                }
                SessionMsg::Reject { reason } => {
                    self.status = ClientStatus::Rejected;
                    self.reject_reason = Some(reason);
                }
                SessionMsg::Snapshot(snapshot) => {
                    let newer = self
                        .snapshot
                        .as_ref()
                        .is_none_or(|current| snapshot.tick > current.tick);
                    if newer {
                        self.snapshot = Some(snapshot);
                    }
                }
                SessionMsg::Join { .. } | SessionMsg::JoinAuthed { .. } | SessionMsg::Input(_) => {}
            }
        }

        if self.status == ClientStatus::Joined
            && let Ok(bytes) = proto::encode(&SessionMsg::Input(self.input))
        {
            let _ = self
                .transport
                .send(PeerId::HOST, Delivery::Unreliable, &bytes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::transport::Loopback;
    use std::sync::Arc;

    fn flat_terrain() -> TerrainDesc {
        TerrainDesc {
            heights: Arc::new(vec![0.0; 33 * 33]),
            resolution: 33,
            extent: 64.0,
        }
    }

    fn host_and_client() -> (HostSession<Loopback>, ClientSession<Loopback>) {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        let client = ClientSession::connect(mesh[1].clone());
        (host, client)
    }

    fn run(host: &mut HostSession<Loopback>, client: &mut ClientSession<Loopback>, ticks: usize) {
        for _ in 0..ticks {
            host.tick();
            client.tick();
        }
    }

    #[test]
    fn client_joins_and_learns_the_seed() {
        let (mut host, mut client) = host_and_client();
        assert_eq!(client.status(), ClientStatus::Connecting);

        run(&mut host, &mut client, 2);

        assert_eq!(client.status(), ClientStatus::Joined);
        assert_eq!(client.seed(), Some(42));
        assert_eq!(host.player_count(), 2);
    }

    #[test]
    fn a_mismatched_protocol_is_rejected_rather_than_desynced() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        let client = mesh[1].clone();

        let bogus = proto::encode(&SessionMsg::Join {
            protocol: PROTOCOL_VERSION + 99,
            name: String::new(),
        })
        .unwrap();
        client
            .send(PeerId::HOST, Delivery::Reliable, &bogus)
            .unwrap();
        host.tick();

        let mut envelope = client.try_recv().expect("host should answer");
        let msg: SessionMsg = proto::decode(&mut envelope.payload).unwrap();
        assert!(matches!(msg, SessionMsg::Reject { .. }));
        assert_eq!(host.player_count(), 1, "only the host itself");
    }

    #[test]
    fn a_dedicated_host_is_authoritative_without_being_a_player() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            7,
        );
        host.set_terrain(flat_terrain());
        assert_eq!(host.player_count(), 0, "nobody has joined yet");

        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 120);

        assert_eq!(host.player_count(), 1, "only the joining client");
        let snapshot = host.world_mut().snapshot();
        assert!(
            snapshot.body(player_body(PeerId::HOST)).is_none(),
            "a dedicated host must not spawn a body for itself"
        );
        assert_eq!(
            snapshot.bodies.len(),
            1,
            "terrain is fixed and culled, so only the client's character remains"
        );
        assert_eq!(client.local_body(), Some(player_body(PeerId(1))));
    }

    #[test]
    fn the_host_assigns_the_client_its_peer_id() {
        let (mut host, mut client) = host_and_client();
        assert_eq!(client.peer(), None, "unknown before Welcome");
        run(&mut host, &mut client, 2);
        assert_eq!(client.peer(), Some(PeerId(1)));
        assert_eq!(client.local_body(), Some(player_body(PeerId(1))));
    }

    #[test]
    fn client_input_moves_its_character_on_the_host() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);

        let body = client
            .local_body()
            .expect("client should be welcomed by now");
        let start = host.world_mut().snapshot().body(body).unwrap().iso.pos;

        client.set_input([1.0, 0.0], false);
        run(&mut host, &mut client, 90);

        let end = host.world_mut().snapshot().body(body).unwrap().iso.pos;
        assert!(
            end[0] - start[0] > 3.0,
            "client should have driven its character +X, moved {}",
            end[0] - start[0]
        );
    }

    #[test]
    fn the_client_sees_host_state_through_snapshots() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        client.set_input([1.0, 0.0], false);
        run(&mut host, &mut client, 120);

        let snapshot = client.latest_snapshot().expect("should have a snapshot");
        assert!(snapshot.tick > 0);
        let me = snapshot
            .body(
                client
                    .local_body()
                    .expect("client should be welcomed by now"),
            )
            .expect("own body");
        assert!(
            me.iso.pos[0] > 1.0,
            "movement should be visible client-side"
        );
        assert!(
            snapshot.body(player_body(PeerId::HOST)).is_some(),
            "the host's own character should be in the snapshot too"
        );
    }

    #[test]
    fn snapshots_are_sent_at_the_network_rate_not_the_sim_rate() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig {
                snapshot_hz: 10.0,
                ..Default::default()
            },
            SimConfig::default(),
            7,
        );
        host.set_terrain(flat_terrain());
        let peer = mesh[1].clone();

        for _ in 0..60 {
            host.tick();
        }
        let snapshots = std::iter::from_fn(|| peer.try_recv())
            .filter(|e| {
                let mut payload = e.payload.clone();
                matches!(
                    proto::decode::<SessionMsg>(&mut payload),
                    Ok(SessionMsg::Snapshot(_))
                )
            })
            .count();
        assert!(
            (8..=12).contains(&snapshots),
            "expected ~10 snapshots in one second, got {snapshots}"
        );
    }

    #[test]
    fn stale_inputs_do_not_rewind_newer_intent() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = PeerId(1);

        let fresh = PlayerInput {
            sequence: 50,
            wish_dir: [1.0, 0.0],
            jump: false,
        };
        let stale = PlayerInput {
            sequence: 5,
            wish_dir: [-1.0, 0.0],
            jump: false,
        };
        host.handle(peer, SessionMsg::Input(fresh));
        host.handle(peer, SessionMsg::Input(stale));

        let applied = host.players[&peer].input;
        assert_eq!(applied.wish_dir, [1.0, 0.0], "stale input must be ignored");
        assert_eq!(host.players[&peer].last_sequence, 50);
    }

    #[test]
    fn an_oversized_wish_dir_does_not_grant_extra_speed() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let body = client
            .local_body()
            .expect("client should be welcomed by now");
        let start = host.world_mut().snapshot().body(body).unwrap().iso.pos;

        host.handle(
            PeerId(1),
            SessionMsg::Input(PlayerInput {
                sequence: 1,
                wish_dir: [1000.0, 0.0],
                jump: false,
            }),
        );
        for _ in 0..60 {
            host.tick();
        }

        let travelled = host.world_mut().snapshot().body(body).unwrap().iso.pos[0] - start[0];
        assert!(
            travelled < 5.0,
            "clamped to move_speed (~4/s), travelled {travelled}"
        );
    }

    fn snapshot_of(n: u32) -> SimSnapshot {
        SimSnapshot {
            tick: 100_000,
            sim_time: 1666.6,
            bodies: (0..n)
                .map(|i| crate::rapier::sim3d::BodySnapshot {
                    id: BodyId(i),
                    iso: Iso::at(i as f32, 1.5, -(i as f32)),
                    linvel: [1.0, -2.0, 3.0],
                    grounded: i % 2 == 0,
                })
                .collect(),
        }
    }

    /// Snapshots ride an unreliable datagram, and Steam fragments anything past roughly
    /// an MTU.
    #[test]
    fn snapshot_wire_cost_per_body_stays_bounded() {
        let small = proto::encode(&SessionMsg::Snapshot(snapshot_of(8)))
            .unwrap()
            .len();
        let large = proto::encode(&SessionMsg::Snapshot(snapshot_of(72)))
            .unwrap()
            .len();
        let per_body = (large - small) / 64;

        assert!(
            per_body <= 48,
            "per-body wire cost grew to {per_body} bytes; \
             re-check the datagram budget before accepting this"
        );
    }

    #[test]
    fn a_guest_is_named_by_the_host() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);

        let name = client.name().expect("welcomed");
        assert!(name.starts_with("Anon-"), "{name}");
        assert_eq!(
            host.player_name(PeerId(1)),
            Some(name),
            "host and client must agree on who we are"
        );
    }

    /// A guest asking for a name is how you arrive as somebody else, so asking buys
    /// nothing at all — an account is the only way to bring a name.
    #[test]
    fn a_guest_cannot_ask_for_a_name() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect_as(mesh[1].clone(), "h0lybyte");

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        let name = client.name().expect("welcomed");
        assert_ne!(name, "h0lybyte");
        assert!(name.starts_with("Anon-"), "{name}");
    }

    /// The name field is client-controlled, so it is an injection point for whatever
    /// renders it.
    #[test]
    fn a_hostile_name_never_survives_the_join() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect_as(mesh[1].clone(), &"\u{202e}".repeat(4096));

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        let name = client.name().expect("welcomed anyway");
        assert!(name.starts_with("Anon-"), "{name}");
        assert!(name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    }

    #[test]
    fn the_roster_names_every_player_and_their_body() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 4);

        let roster = client.roster();
        assert_eq!(roster.len(), 2, "host and joiner: {roster:?}");

        let me = client.local_body().expect("welcomed");
        assert_eq!(client.name_of_body(me), client.name());
        assert!(
            roster.iter().all(|p| !p.name.is_empty()),
            "every entry needs a name: {roster:?}"
        );
        assert!(
            roster.iter().any(|p| p.body == player_body(PeerId::HOST)),
            "the host is a player here too: {roster:?}"
        );
    }

    /// Two guests with the same generated name would be indistinguishable on screen,
    /// which is the one thing the name exists to prevent.
    #[test]
    fn two_players_never_share_a_name() {
        let mesh = Loopback::mesh(3);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());
        let mut a = ClientSession::connect(mesh[1].clone());
        let mut b = ClientSession::connect(mesh[2].clone());

        for _ in 0..4 {
            host.tick();
            a.tick();
            b.tick();
        }

        let first = a.name().expect("welcomed");
        let second = b.name().expect("welcomed");
        assert_ne!(first, second);
        assert!(first.starts_with("Anon-") && second.starts_with("Anon-"));
    }

    /// Stands in for the GoTrue verifier: whatever the "token" says, minus the
    /// signature nobody in a unit test has.
    struct StubAuthority;

    impl TokenAuthority for StubAuthority {
        fn verify(&self, token: &str) -> Result<String, String> {
            match token.strip_prefix("valid:") {
                Some(name) => Ok(name.to_owned()),
                None => Err("sign-in was not accepted".to_owned()),
            }
        }
    }

    fn authed_host(mesh: &[Loopback]) -> HostSession<Loopback> {
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        )
        .with_authority(Arc::new(StubAuthority));
        host.set_terrain(flat_terrain());
        host
    }

    #[test]
    fn a_verified_token_brings_its_own_name() {
        let mesh = Loopback::mesh(2);
        let mut host = authed_host(&mesh);
        let mut client = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        assert_eq!(client.status(), ClientStatus::Joined);
        assert_eq!(client.name(), Some("h0lybyte"));
    }

    /// A name from a token is still a name on someone else's screen.
    #[test]
    fn a_verified_name_is_still_sanitized() {
        let mesh = Loopback::mesh(2);
        let mut host = authed_host(&mesh);
        let mut client =
            ClientSession::connect_with_token(mesh[1].clone(), "valid:\u{202e}h0ly\nbyte");

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        assert_eq!(client.name(), Some("h0lybyte"));
    }

    #[test]
    fn a_bad_token_is_rejected_rather_than_downgraded_to_a_guest() {
        let mesh = Loopback::mesh(2);
        let mut host = authed_host(&mesh);
        let mut client = ClientSession::connect_with_token(mesh[1].clone(), "forged");

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        assert_eq!(client.status(), ClientStatus::Rejected);
        assert_eq!(host.player_count(), 0, "nothing was spawned");
    }

    /// A host with no verifier cannot tell an account from a claim about one.
    #[test]
    fn a_host_without_an_authority_refuses_accounts() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        );
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        assert_eq!(client.status(), ClientStatus::Rejected);
    }

    /// Two bodies wearing one name is worse than a refused second session.
    #[test]
    fn one_account_cannot_be_in_the_session_twice() {
        let mesh = Loopback::mesh(3);
        let mut host = authed_host(&mesh);
        let mut a = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");
        let mut b = ClientSession::connect_with_token(mesh[2].clone(), "valid:h0lybyte");

        for _ in 0..4 {
            host.tick();
            a.tick();
            b.tick();
        }

        assert_eq!(a.name(), Some("h0lybyte"));
        assert_eq!(b.status(), ClientStatus::Rejected);
        assert_eq!(host.player_count(), 1);
    }

    /// Guests and accounts share one namespace, and the guest arrived first.
    #[test]
    fn an_account_name_already_in_the_room_is_refused() {
        let mesh = Loopback::mesh(2);
        let mut host = authed_host(&mesh);
        let taken = host.admit_guest(PeerId(9));
        let mut client =
            ClientSession::connect_with_token(mesh[1].clone(), &format!("valid:{taken}"));

        for _ in 0..2 {
            host.tick();
            client.tick();
        }

        assert_eq!(client.status(), ClientStatus::Rejected);
    }

    #[test]
    fn a_departing_player_drops_off_the_roster() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 4);
        assert_eq!(client.roster().len(), 2);

        host.remove_player(PeerId::HOST);
        run(&mut host, &mut client, 2);

        let roster = client.roster();
        assert_eq!(roster.len(), 1, "only us left: {roster:?}");
        assert_eq!(roster[0].peer, PeerId(1));
    }

    #[test]
    fn a_departing_player_leaves_the_world() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 10);
        assert_eq!(host.player_count(), 2);

        host.remove_player(PeerId(1));

        assert_eq!(host.player_count(), 1);
        assert!(
            host.world_mut()
                .snapshot()
                .body(player_body(PeerId(1)))
                .is_none(),
            "their character should be gone from the sim"
        );
    }
}
