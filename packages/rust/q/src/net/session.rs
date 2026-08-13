//! Listen-server session: the host/client role split over a [`Transport`].
//!
//! One player hosts. The host owns the authoritative [`SimWorld`] and is also a
//! player; everyone else sends intent and renders what comes back. Both roles
//! ship in the same binary — hosting is a role, not a build — which is what
//! makes Steam P2P invite-a-friend co-op work without a dedicated server.
//!
//! Clients send **intent, not motion**. A client says "I want to go this way";
//! the host decides what that means against gravity, speed, and the world. A
//! client that lies can only claim to be holding a direction, which is the
//! cheapest cheat-resistance available and costs nothing to adopt now — sending
//! finished translations would hand movement authority to the client and is
//! very hard to walk back later.
//!
//! Deliberately synchronous: `tick()` is called by whoever owns the cadence, so
//! the whole session is testable in-process without threads or Steam. Wiring it
//! to the physics thread is the app's job.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::guest::{MAX_NAME_LEN, resolve_name};
use super::transport::{Delivery, PeerId, Transport};
use crate::proto::{self, PROTOCOL_VERSION};
use crate::rapier::sim3d::{
    BodyId, CharacterDesc, Iso, SimCommand, SimConfig, SimSnapshot, SimWorld, TerrainDesc,
};

/// What a client reports it is trying to do this tick.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PlayerInput {
    /// Monotonic per-client counter. Late or duplicated datagrams are discarded
    /// by comparing this, and it is the hook a prediction layer would later use
    /// to reconcile against acknowledged inputs.
    pub sequence: u32,
    /// Horizontal wish direction in world space, `[x, z]`. Magnitude is clamped
    /// host-side, so an oversized vector buys a cheater nothing.
    pub wish_dir: [f32; 2],
    pub jump: bool,
}

/// One entry of the player list. `body` is carried explicitly so the client can
/// label an avatar without knowing how peer ids map onto body ids.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer: PeerId,
    pub body: BodyId,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SessionMsg {
    Join {
        protocol: u32,
        /// Name the client would like. A request, not a claim: the host
        /// sanitizes it and hands back what was actually assigned. Empty means
        /// "give me a guest name", which is the whole of guest mode.
        name: String,
    },
    /// `peer` is the id the host assigned; a client cannot infer its own.
    /// `name` likewise — what was asked for and what was granted differ
    /// whenever the request was empty, unusable, or already taken.
    Welcome {
        protocol: u32,
        seed: u64,
        peer: PeerId,
        name: String,
    },
    Reject {
        reason: String,
    },
    /// Whole player list, reliably, whenever it changes. Small and rare enough
    /// (max a handful of players, only on join/leave) that diffing it would
    /// cost more in bugs than it saves in bytes.
    Roster {
        players: Vec<PeerInfo>,
    },
    Input(PlayerInput),
    Snapshot(SimSnapshot),
}

#[derive(Clone, Copy, Debug)]
pub struct SessionConfig {
    /// Snapshot broadcast rate. Far below the sim rate on purpose — clients
    /// interpolate between snapshots, and sending every tick spends bandwidth
    /// on detail no one can perceive.
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

/// Players occupy a reserved id band so world props can never collide with a
/// player body id, whatever order things spawn in.
const PLAYER_BODY_BASE: u32 = 1_000_000;

pub fn player_body(peer: PeerId) -> BodyId {
    BodyId(PLAYER_BODY_BASE + peer.0)
}

#[derive(Default)]
struct Player {
    last_sequence: u32,
    input: PlayerInput,
    /// Integrated separately from the character controller, which resolves
    /// motion but never applies gravity.
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
}

impl<T: Transport> HostSession<T> {
    /// Listen-server host: the local peer is also a player, admitted up front
    /// since it will never send itself a Join.
    pub fn new(transport: T, config: SessionConfig, sim: SimConfig, seed: u64) -> Self {
        let mut host = Self::dedicated(transport, config, sim, seed);
        let local = host.transport.local_peer();
        // The host never sends itself a Join, so it never states a preference —
        // it gets a guest name like anyone else until an account layer exists.
        host.admit(local, "");
        host
    }

    /// Dedicated host: authoritative but not a participant, so no body is
    /// spawned for the local peer.
    pub fn dedicated(transport: T, config: SessionConfig, sim: SimConfig, seed: u64) -> Self {
        Self {
            world: SimWorld::new(&sim),
            transport,
            config,
            sim,
            players: HashMap::new(),
            seed,
            snapshot_accum: 0.0,
        }
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
        // HashMap order is arbitrary and would reshuffle the list on every
        // broadcast, which a client rendering it in order would show as flicker.
        players.sort_by_key(|p| p.peer);
        players
    }

    /// Admits `peer` under a name derived from `requested` and returns what was
    /// actually assigned. A rejoining peer keeps the name it already has.
    fn admit(&mut self, peer: PeerId, requested: &str) -> String {
        if let Some(player) = self.players.get(&peer) {
            return player.name.clone();
        }
        let taken = |candidate: &str| self.players.values().any(|p| p.name == candidate);
        let name = resolve_name(requested, taken, peer.0);

        self.players.insert(
            peer,
            Player {
                name: name.clone(),
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
        name
    }

    pub fn remove_player(&mut self, peer: PeerId) {
        if self.players.remove(&peer).is_some() {
            self.world.apply(SimCommand::Despawn {
                id: player_body(peer),
            });
            // Whoever is left needs to stop drawing their nameplate.
            self.broadcast_roster();
        }
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
            SessionMsg::Join { protocol, name } => {
                if protocol != PROTOCOL_VERSION {
                    // P2P means mismatched builds will absolutely try to
                    // connect; refusing loudly beats desyncing quietly.
                    let reason = format!("protocol {protocol} != {PROTOCOL_VERSION}");
                    self.reply(from, &SessionMsg::Reject { reason });
                    return;
                }
                // Bound the work before doing any of it: a client can send a
                // megabyte here, and sanitizing it character by character is
                // exactly the kind of loop worth not entering.
                let requested: String = name.chars().take(MAX_NAME_LEN * 4).collect();
                let assigned = self.admit(from, &requested);
                self.reply(
                    from,
                    &SessionMsg::Welcome {
                        protocol: PROTOCOL_VERSION,
                        seed: self.seed,
                        peer: from,
                        name: assigned,
                    },
                );
                self.broadcast_roster();
            }
            SessionMsg::Input(input) => {
                let Some(player) = self.players.get_mut(&from) else {
                    return;
                };
                // Unreliable delivery reorders, so an older sequence arriving
                // after a newer one must not rewind the player's intent.
                if input.sequence >= player.last_sequence {
                    player.last_sequence = input.sequence;
                    player.input = input;
                }
            }
            // Host-authored messages; a peer sending one is confused or hostile.
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

    /// Drain inputs, advance the sim one tick, and broadcast on the network
    /// cadence. This ordering is the authoritative loop: intent is applied to
    /// the tick it arrived for, never a tick late.
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
                // Zero it rather than letting gravity integrate without bound
                // while standing, or the first step off a ledge is a plummet.
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

    /// Sends the join request immediately — reliably, because a dropped join is
    /// a session that silently never starts.
    ///
    /// `requested_name` is advisory; read [`name`](Self::name) after the
    /// welcome for what was actually assigned.
    pub fn connect_as(transport: T, requested_name: &str) -> Self {
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
        let msg = SessionMsg::Join {
            protocol: PROTOCOL_VERSION,
            name: requested_name.to_owned(),
        };
        if let Ok(bytes) = proto::encode(&msg) {
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

    /// Seed the world was generated from. Terrain is rebuilt locally from this
    /// rather than shipped — see `TerrainDesc`.
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

    /// Name the host assigned us. `None` until welcomed — showing the requested
    /// name before then would flash a name the server may not have granted.
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    /// Everyone in the session, host included. Empty until the first roster.
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
                    // Out-of-order snapshots are normal on an unreliable
                    // channel; an older one must never replace a newer one.
                    let newer = self
                        .snapshot
                        .as_ref()
                        .is_none_or(|current| snapshot.tick > current.tick);
                    if newer {
                        self.snapshot = Some(snapshot);
                    }
                }
                SessionMsg::Join { .. } | SessionMsg::Input(_) => {}
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
        // Host counts itself plus the joiner — the host is a player too.
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

        // One second of sim at 60Hz should yield ~10 snapshots, not ~60.
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

        // A cheating client claiming a huge direction vector.
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

    /// Snapshots ride an unreliable datagram, and Steam fragments anything past
    /// roughly an MTU. Fragmentation is not fatal but it amplifies loss — one
    /// missing fragment discards the whole snapshot — so the per-body cost is
    /// worth pinning. At ~42 bytes each, about 28 bodies fit in a single ~1200
    /// byte datagram; beyond that, cull what is replicated rather than letting
    /// the snapshot grow.
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

    #[test]
    fn a_requested_name_is_honoured_when_it_is_usable() {
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

        assert_eq!(client.name(), Some("h0lybyte"));
    }

    /// The name field is client-controlled, so it is an injection point for
    /// whatever renders it. What comes back must already be safe.
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

    /// Two guests with the same generated name would be indistinguishable on
    /// screen, which is the one thing the name exists to prevent.
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
        let mut a = ClientSession::connect_as(mesh[1].clone(), "twin");
        let mut b = ClientSession::connect_as(mesh[2].clone(), "twin");

        for _ in 0..4 {
            host.tick();
            a.tick();
            b.tick();
        }

        assert_eq!(a.name(), Some("twin"), "first asker keeps it");
        let second = b.name().expect("welcomed");
        assert_ne!(second, "twin");
        assert!(second.starts_with("Anon-"), "{second}");
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
