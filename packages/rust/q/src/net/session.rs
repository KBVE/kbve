//! Listen-server session: the host/client role split over a [`Transport`].

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::guest::{sanitize, unique_guest_name};
use super::transport::{Delivery, PeerId, Transport};
use crate::harvest::{HarvestTarget, Ledger, stable_id};
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
    /// Facing, radians. The host has no other way to know which way anyone is looking,
    /// which is what any server-authoritative interaction needs first.
    pub yaw: f32,
}

impl PlayerInput {
    /// Every field here arrived from a client, so none of it can be trusted.
    ///
    /// A non-finite `wish_dir` is the dangerous one: `NaN > 1.0` is false, so it slips
    /// past a magnitude check, multiplies into the character's translation, and lands
    /// in the rigid body's pose. Rapier has no reason to reject it, and from then on
    /// that body — and anything the solver pairs it with — is NaN. One packet.
    fn sanitized(mut self) -> Self {
        if !self.yaw.is_finite() {
            self.yaw = 0.0;
        } else {
            // Wrapped rather than clamped: yaw is an angle, and a client that
            // accumulates without wrapping is not misbehaving, just naive.
            self.yaw = self.yaw.rem_euclid(std::f32::consts::TAU);
        }
        let [x, z] = self.wish_dir;
        if !x.is_finite() || !z.is_finite() {
            self.wish_dir = [0.0, 0.0];
            return self;
        }
        let len = (x * x + z * z).sqrt();
        if len > 1.0 {
            self.wish_dir = [x / len, z / len];
        }
        self
    }
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
        /// Everything below describes the world the host is simulating. It used to be
        /// agreed by convention on both sides, which failed silently: a terrain extent
        /// or resolution that disagreed showed up as players sinking into or hovering
        /// over the ground, never as an error.
        terrain_extent: f32,
        terrain_resolution: u32,
        /// The two numbers the bridge deck is measured from. They decide `deck_y`, so a
        /// client holding different ones draws planks where its own server holds river.
        water_level: f32,
        road_width: f32,
        /// Hours, 0..24, at the moment of joining.
        time_of_day: f32,
        day_length_minutes: f32,
    },
    Reject {
        reason: String,
    },
    /// Whole player list, reliably, whenever it changes.
    Roster {
        players: Vec<PeerInfo>,
    },
    /// The host's clock, resent periodically. Clients run their own between these and
    /// correct on arrival; without it two people who joined minutes apart stand in the
    /// same world under different suns.
    WorldTime {
        hour: f32,
    },
    Input(PlayerInput),
    Snapshot(SimSnapshot),
    /// Join carrying a bearer token from an external identity provider (Supabase
    /// GoTrue, in practice).
    JoinAuthed {
        protocol: u32,
        token: String,
    },
    /// A client says it worked a scattered object.
    ///
    /// Carries the cell and ordinal rather than an id: the host derives the id
    /// itself, so a client cannot name one it could not have reached, and the
    /// cell is what the reach check is measured against.
    Harvest {
        target: HarvestTarget,
        cell: [i32; 2],
        ordinal: u32,
        hits: u8,
    },
    /// What the host decided, to everyone. Reliable, because a dropped delta is
    /// a rock that stands on one client and not the others until it rescatters.
    HarvestDelta {
        target: HarvestTarget,
        id: u64,
        stage: u8,
    },
    /// Everything already harvested, sent once on join so a late arrival does
    /// not walk into a forest that was felled an hour ago.
    HarvestLedger {
        target: HarvestTarget,
        flat: Vec<u32>,
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
    /// Hard ceiling on concurrent players. Snapshots carry every body and go to
    /// everyone, so bandwidth grows with the square of this — it is a resource bound,
    /// not a game rule.
    pub max_players: usize,
    /// Players are placed within this radius of the origin.
    pub spawn_radius: f32,
    /// Fall past this and a body is considered lost rather than falling, and is put
    /// back. Without it there is no way out of the void but reconnecting.
    pub void_y: f32,
    /// Terrain contract, echoed to clients in `Welcome` so it stops being a convention
    /// two codebases have to remember.
    pub terrain_extent: f32,
    pub terrain_resolution: u32,
    /// World clock. The host owns it so everyone shares one sky.
    pub start_hour: f32,
    pub day_length_minutes: f32,
    /// How often the clock is rebroadcast.
    pub time_sync_seconds: f64,
    /// Surface height of the water. Below it, gravity is buoyant and descent is capped.
    /// Also half of what the bridge deck's height is measured from, which is why it is
    /// echoed to clients rather than authored twice.
    pub water_level: f32,
    /// Width of the trunk road. The deck is a multiple of it, so it travels with the
    /// rest of the terrain contract.
    pub road_width: f32,
    /// Downward pull under water, as a fraction of `gravity`. Negative would push a
    /// body up; zero leaves it neutrally buoyant.
    pub water_gravity_scale: f32,
    /// Fastest a body may sink or rise under water.
    pub swim_speed: f32,
    /// Cell size of each scatter. The host has no scatter of its own, so this is
    /// how it turns a claimed cell back into somewhere in the world to measure
    /// against. Must match the matching field's `grid_size` export: a mismatch
    /// does not corrupt ids, which the client derives, it only makes the reach
    /// check loose or tight.
    pub stone_grid_size: f32,
    pub tree_grid_size: f32,
    /// How far a player may stand from a cell and still work it. Generous by
    /// design — this bounds cheating to things nearby, it is not a hit test.
    pub harvest_reach: f32,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            snapshot_hz: 20.0,
            max_players: 16,
            spawn_radius: 12.0,
            void_y: -100.0,
            // Match QTerrain's exported defaults; the client is told these on join.
            terrain_extent: 256.0,
            terrain_resolution: 513,
            start_hour: 9.0,
            day_length_minutes: 45.0,
            time_sync_seconds: 2.0,
            // HeightParams::default().water_level.
            water_level: -1.4,
            // Match QTerrain's exported road_width.
            road_width: 3.2,
            water_gravity_scale: 0.12,
            swim_speed: 2.0,
            move_speed: 4.0,
            gravity: -9.81,
            jump_speed: 4.5,
            // Match QStoneField and QTreeField's exported grid_size.
            stone_grid_size: 22.0,
            tree_grid_size: 14.0,
            harvest_reach: 6.0,
        }
    }
}

/// Longest token the host will look at.
const MAX_TOKEN_LEN: usize = 8 * 1024;

/// Rejection reason for a session at capacity. A fixed string so a client can tell
/// "come back later" apart from "you are not welcome".
pub const FULL: &str = "server is full";

/// Players occupy a reserved id band so world props can never collide with a player
/// body id, whatever order things spawn in.
const PLAYER_BODY_BASE: u32 = 1_000_000;

pub fn player_body(peer: PeerId) -> BodyId {
    BodyId(PLAYER_BODY_BASE + peer.0)
}

/// Samples ground height at a world position. The host has no terrain of its own —
/// with streaming on it never even sees a `SetTerrain` — so whoever owns the generator
/// supplies this.
pub type GroundSampler = Arc<dyn Fn(f32, f32) -> f32 + Send + Sync>;

#[derive(Default)]
struct Player {
    last_sequence: u32,
    /// Position in the spawn ring. Reused when a player leaves, unlike `PeerId`.
    slot: u32,
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
    ground: Option<GroundSampler>,
    hour: f32,
    time_accum: f64,
    /// What has been mined and felled. The host has no scatter, but damage only
    /// ever increases, so a ledger is enough to be authoritative about state
    /// without ever generating the objects it describes.
    stone_ledger: Ledger,
    tree_ledger: Ledger,
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
            ground: None,
            stone_ledger: Ledger::new(),
            tree_ledger: Ledger::new(),
            hour: config.start_hour,
            time_accum: 0.0,
        }
    }

    /// Installs the authority that signed-in joins are checked against.
    pub fn with_authority(mut self, authority: Arc<dyn TokenAuthority>) -> Self {
        self.authority = Some(authority);
        self
    }

    /// Installs the ground sampler used to place spawns. Without one, spawns fall back
    /// to a fixed height and a player can land inside a hill.
    pub fn with_ground(mut self, ground: GroundSampler) -> Self {
        self.ground = Some(ground);
        self
    }

    /// Lowest unused ring slot. Peer ids only ever count up, so using them directly
    /// walks the spawn point away from the origin forever.
    fn free_slot(&self) -> u32 {
        let taken: std::collections::HashSet<u32> = self.players.values().map(|p| p.slot).collect();
        (0..).find(|s| !taken.contains(s)).unwrap_or(0)
    }

    /// A point on a golden-angle spiral inside `spawn_radius`, lifted to stand on the
    /// ground rather than at a fixed altitude — terrain runs to roughly 7.5 and the old
    /// fixed 5.0 buried players on any hill.
    fn spawn_point(&self, slot: u32) -> Iso {
        const GOLDEN_ANGLE: f32 = 2.399_963_2;
        let n = slot as f32;
        let r = self.config.spawn_radius * (n / self.config.max_players.max(1) as f32).sqrt();
        let angle = n * GOLDEN_ANGLE;
        let (x, z) = (r * angle.cos(), r * angle.sin());
        let y = match self.ground.as_ref() {
            Some(sample) => {
                let h = sample(x, z);
                if h.is_finite() { h + 1.5 } else { 5.0 }
            }
            None => 5.0,
        };
        Iso::at(x, y, z)
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
        let slot = self.free_slot();
        let iso = self.spawn_point(slot);
        self.players.insert(
            peer,
            Player {
                name,
                slot,
                ..Default::default()
            },
        );
        self.world.apply(SimCommand::SpawnCharacter {
            id: player_body(peer),
            desc: CharacterDesc {
                iso,
                ..Default::default()
            },
        });
    }

    /// True once the session is full. Checked before a name is even looked at, so a
    /// full server costs nothing to turn away.
    fn is_full(&self, peer: PeerId) -> bool {
        !self.players.contains_key(&peer) && self.players.len() >= self.config.max_players
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
                terrain_extent: self.config.terrain_extent,
                terrain_resolution: self.config.terrain_resolution,
                water_level: self.config.water_level,
                road_width: self.config.road_width,
                time_of_day: self.hour,
                day_length_minutes: self.config.day_length_minutes,
            },
        );
        self.send_harvest_ledgers(peer);
        self.broadcast_roster();
    }

    fn grid_size(&self, target: HarvestTarget) -> f32 {
        match target {
            HarvestTarget::Stone => self.config.stone_grid_size,
            HarvestTarget::Tree => self.config.tree_grid_size,
        }
        .max(0.01)
    }

    fn ledger_mut(&mut self, target: HarvestTarget) -> &mut Ledger {
        match target {
            HarvestTarget::Stone => &mut self.stone_ledger,
            HarvestTarget::Tree => &mut self.tree_ledger,
        }
    }

    fn ledger(&self, target: HarvestTarget) -> &Ledger {
        match target {
            HarvestTarget::Stone => &self.stone_ledger,
            HarvestTarget::Tree => &self.tree_ledger,
        }
    }

    /// Applies a claimed harvest, if the claimant could plausibly have reached it.
    ///
    /// The host cannot check that a rock is really in that cell without running
    /// the scatter it does not have. What it can check is that the cell is near
    /// the player, which bounds a forged claim to ground they are standing on
    /// rather than the whole world. Damage is monotonic, so the worst a bad
    /// claim does is break something early — it can never repair anything.
    fn apply_harvest(
        &mut self,
        from: PeerId,
        target: HarvestTarget,
        cell: [i32; 2],
        ordinal: u32,
        hits: u8,
    ) {
        if !self.players.contains_key(&from) {
            return;
        }
        let size = self.grid_size(target);
        let centre = [(cell[0] as f32 + 0.5) * size, (cell[1] as f32 + 0.5) * size];
        let Some(body) = self.world.snapshot().body(player_body(from)).copied() else {
            return;
        };
        let [px, _, pz] = body.iso.pos;
        let (dx, dz) = (centre[0] - px, centre[1] - pz);
        // Half a cell of slack: the claim names a cell, and anywhere in it is a
        // legitimate place for the object to have stood.
        let reach = self.config.harvest_reach + size * 0.5;
        if dx * dx + dz * dz > reach * reach {
            return;
        }

        let stages = target.stages();
        let id = stable_id(self.seed, cell[0], cell[1], ordinal);
        let current = self.ledger(target).stage(id);
        if current >= stages {
            return;
        }
        let next = current.saturating_add(hits.clamp(1, stages)).min(stages);
        self.ledger_mut(target).record(id, next);
        self.broadcast_harvest(target, id, next);
    }

    fn broadcast_harvest(&self, target: HarvestTarget, id: u64, stage: u8) {
        if self.transport.peers().is_empty() {
            return;
        }
        let msg = SessionMsg::HarvestDelta { target, id, stage };
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self.transport.broadcast(Delivery::Reliable, &bytes);
        }
    }

    /// Hands a joiner everything already harvested, so they do not walk into a
    /// forest that was felled before they arrived.
    fn send_harvest_ledgers(&self, peer: PeerId) {
        for target in [HarvestTarget::Stone, HarvestTarget::Tree] {
            let flat = self.ledger(target).to_flat();
            if flat.is_empty() {
                continue;
            }
            self.reply(peer, &SessionMsg::HarvestLedger { target, flat });
        }
    }

    fn broadcast_world_time(&self) {
        if self.transport.peers().is_empty() {
            return;
        }
        if let Ok(bytes) = proto::encode(&SessionMsg::WorldTime { hour: self.hour }) {
            let _ = self.transport.broadcast(Delivery::Unreliable, &bytes);
        }
    }

    /// Host clock, hours 0..24.
    pub fn hour(&self) -> f32 {
        self.hour
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
                if self.is_full(from) {
                    self.reply(
                        from,
                        &SessionMsg::Reject {
                            reason: FULL.to_owned(),
                        },
                    );
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
                if self.is_full(from) {
                    self.reply(
                        from,
                        &SessionMsg::Reject {
                            reason: FULL.to_owned(),
                        },
                    );
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
                    player.input = input.sanitized();
                }
            }
            SessionMsg::Harvest {
                target,
                cell,
                ordinal,
                hits,
            } => {
                self.apply_harvest(from, target, cell, ordinal, hits);
            }
            SessionMsg::Welcome { .. }
            | SessionMsg::Reject { .. }
            | SessionMsg::Roster { .. }
            | SessionMsg::WorldTime { .. }
            | SessionMsg::HarvestDelta { .. }
            | SessionMsg::HarvestLedger { .. }
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

        // Anyone who has fallen out of the world goes back to their spawn. A body below
        // the void floor is never coming back on its own — gravity integrates forever
        // and nothing else resets it — so without this the only way out is reconnecting.
        // Terrain arrives asynchronously when streaming, which makes the hole reachable
        // rather than theoretical.
        let lost: Vec<(PeerId, u32)> = self
            .players
            .iter()
            .filter(|(peer, _)| {
                snapshot
                    .body(player_body(**peer))
                    .is_some_and(|b| b.iso.pos[1] < self.config.void_y)
            })
            .map(|(peer, player)| (*peer, player.slot))
            .collect();
        for (peer, slot) in lost {
            let iso = self.spawn_point(slot);
            self.world.apply(SimCommand::SetKinematicTarget {
                id: player_body(peer),
                iso,
            });
            if let Some(player) = self.players.get_mut(&peer) {
                player.vel_y = 0.0;
            }
        }

        for (peer, player) in &mut self.players {
            let body = player_body(*peer);
            let grounded = snapshot.body(body).is_some_and(|b| b.grounded);

            let submerged = snapshot
                .body(body)
                .is_some_and(|b| b.iso.pos[1] < self.config.water_level);

            if grounded && player.vel_y < 0.0 {
                player.vel_y = 0.0;
            }
            if submerged {
                // Buoyant rather than weightless, and jump becomes swim-up. Capped both
                // ways so entering water cannot carry a body straight through the bed on
                // momentum it built in the air.
                if player.input.jump {
                    player.vel_y = self.config.swim_speed;
                } else {
                    player.vel_y += self.config.gravity * self.config.water_gravity_scale * dt;
                }
                player.vel_y = player
                    .vel_y
                    .clamp(-self.config.swim_speed, self.config.swim_speed);
            } else {
                if grounded && player.input.jump {
                    player.vel_y = self.config.jump_speed;
                }
                player.vel_y += self.config.gravity * dt;
            }

            // Already finite and magnitude-clamped on ingest.
            let [nx, nz] = player.input.wish_dir;

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

        // One clock for everyone, advanced by the host and rebroadcast so clients that
        // joined at different times do not drift into different skies.
        let day_seconds = (self.config.day_length_minutes as f64 * 60.0).max(1.0);
        self.hour =
            (self.hour as f64 + self.sim.timestep() * 24.0 / day_seconds).rem_euclid(24.0) as f32;
        self.time_accum += self.sim.timestep();
        if self.time_accum >= self.config.time_sync_seconds.max(0.1) {
            self.time_accum = 0.0;
            self.broadcast_world_time();
        }

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
    /// The world contract from `Welcome`, and the clock the host keeps correcting.
    world: Option<WorldInfo>,
    hour: f32,
    /// The host's view of what has been harvested, replayed on join and kept up
    /// to date by deltas. Held so a field rescattering mid-session can restore
    /// from it without asking anyone.
    stone_ledger: Ledger,
    tree_ledger: Ledger,
    /// Deltas since the last drain, for whoever owns the scatter to apply.
    harvest_events: Vec<HarvestEvent>,
}

/// One authoritative change to a scattered object.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HarvestEvent {
    pub target: HarvestTarget,
    pub id: u64,
    pub stage: u8,
}

/// What the host told us about the world it is simulating.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldInfo {
    pub terrain_extent: f32,
    pub terrain_resolution: u32,
    /// The deck's height is derived from these two on both sides.
    pub water_level: f32,
    pub road_width: f32,
    pub day_length_minutes: f32,
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
            world: None,
            hour: 0.0,
            stone_ledger: Ledger::new(),
            tree_ledger: Ledger::new(),
            harvest_events: Vec::new(),
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
    /// Terrain and day-length the host published, once joined.
    pub fn world(&self) -> Option<WorldInfo> {
        self.world
    }

    /// Host clock as of the last sync, hours 0..24.
    pub fn hour(&self) -> f32 {
        self.hour
    }

    pub fn roster(&self) -> &[PeerInfo] {
        &self.roster
    }

    pub fn name_of_body(&self, body: BodyId) -> Option<&str> {
        self.roster
            .iter()
            .find(|p| p.body == body)
            .map(|p| p.name.as_str())
    }

    fn harvest_ledger_mut(&mut self, target: HarvestTarget) -> &mut Ledger {
        match target {
            HarvestTarget::Stone => &mut self.stone_ledger,
            HarvestTarget::Tree => &mut self.tree_ledger,
        }
    }

    pub fn harvest_ledger(&self, target: HarvestTarget) -> &Ledger {
        match target {
            HarvestTarget::Stone => &self.stone_ledger,
            HarvestTarget::Tree => &self.tree_ledger,
        }
    }

    /// Everything the host has ruled on since the last call.
    pub fn take_harvest_events(&mut self) -> Vec<HarvestEvent> {
        std::mem::take(&mut self.harvest_events)
    }

    /// Asks the host to work a scattered object.
    ///
    /// Reliable: a dropped swing is a rock that never breaks, and the client
    /// has no way to notice it was lost.
    pub fn harvest(&mut self, target: HarvestTarget, cell: [i32; 2], ordinal: u32, hits: u8) {
        if self.status != ClientStatus::Joined {
            return;
        }
        let msg = SessionMsg::Harvest {
            target,
            cell,
            ordinal,
            hits: hits.max(1),
        };
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self
                .transport
                .send(PeerId::HOST, Delivery::Reliable, &bytes);
        }
    }

    pub fn set_input(&mut self, wish_dir: [f32; 2], jump: bool, yaw: f32) {
        self.input.sequence = self.input.sequence.wrapping_add(1);
        self.input.wish_dir = wish_dir;
        self.input.jump = jump;
        self.input.yaw = yaw;
    }

    pub fn tick(&mut self) {
        while let Some(mut envelope) = self.transport.try_recv() {
            let Ok(msg) = proto::decode::<SessionMsg>(&mut envelope.payload) else {
                continue;
            };
            match msg {
                SessionMsg::Welcome {
                    seed,
                    peer,
                    name,
                    terrain_extent,
                    terrain_resolution,
                    water_level,
                    road_width,
                    time_of_day,
                    day_length_minutes,
                    ..
                } => {
                    self.status = ClientStatus::Joined;
                    self.seed = Some(seed);
                    self.peer = Some(peer);
                    self.name = Some(name);
                    self.hour = time_of_day;
                    self.world = Some(WorldInfo {
                        terrain_extent,
                        terrain_resolution,
                        water_level,
                        road_width,
                        day_length_minutes,
                    });
                }
                SessionMsg::WorldTime { hour } => {
                    self.hour = hour;
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
                SessionMsg::HarvestDelta { target, id, stage } => {
                    self.harvest_ledger_mut(target).record(id, stage);
                    self.harvest_events.push(HarvestEvent { target, id, stage });
                }
                SessionMsg::HarvestLedger { target, flat } => {
                    let replay = Ledger::from_flat(&flat);
                    // Every entry becomes an event too: the fields were built
                    // before this arrived and have no other way to learn of it.
                    for c in flat.chunks_exact(3) {
                        let id = c[0] as u64 | ((c[1] as u64) << 32);
                        self.harvest_events.push(HarvestEvent {
                            target,
                            id,
                            stage: c[2].min(255) as u8,
                        });
                    }
                    self.harvest_ledger_mut(target).merge(&replay);
                }
                SessionMsg::Join { .. }
                | SessionMsg::JoinAuthed { .. }
                | SessionMsg::Harvest { .. }
                | SessionMsg::Input(_) => {}
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
    use crate::harvest::{HarvestKind, Stone, Tree};
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

    /// The cell a player is standing in, so a claim is in reach by construction.
    fn cell_under(host: &mut HostSession<Loopback>, peer: PeerId, size: f32) -> [i32; 2] {
        let pos = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .expect("player body")
            .iso
            .pos;
        [
            (pos[0] / size).floor() as i32,
            (pos[2] / size).floor() as i32,
        ]
    }

    #[test]
    fn a_harvest_in_reach_is_applied_and_broadcast() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);

        client.harvest(HarvestTarget::Tree, cell, 0, 1);
        run(&mut host, &mut client, 4);

        let id = stable_id(42, cell[0], cell[1], 0);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id),
            1,
            "the host did not rule on a claim made from on top of the cell"
        );
    }

    /// The one thing the host can check without a scatter of its own.
    #[test]
    fn a_harvest_out_of_reach_is_refused() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let size = SessionConfig::default().tree_grid_size;
        let far = [9_000, -9_000];

        client.harvest(HarvestTarget::Tree, far, 0, 1);
        run(&mut host, &mut client, 4);

        let id = stable_id(42, far[0], far[1], 0);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id),
            0,
            "a claim from {size} units of nowhere was honoured"
        );
    }

    /// Damage is monotonic, so a client cannot walk a stage backwards.
    #[test]
    fn a_harvest_never_repairs() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().stone_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);

        client.harvest(HarvestTarget::Stone, cell, 0, Stone::STAGES);
        run(&mut host, &mut client, 4);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Stone).stage(id),
            Stone::STAGES
        );

        // Already broken; another swing must not move it, and must not wrap.
        client.harvest(HarvestTarget::Stone, cell, 0, 1);
        run(&mut host, &mut client, 4);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Stone).stage(id),
            Stone::STAGES
        );
    }

    /// Someone arriving after a forest was felled must not see it standing.
    #[test]
    fn a_late_joiner_is_told_what_was_already_harvested() {
        let mesh = Loopback::mesh(3);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        let mut early = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut early, 120);

        let peer = early.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        early.harvest(HarvestTarget::Tree, cell, 0, Tree::STAGES);
        run(&mut host, &mut early, 4);
        let id = stable_id(42, cell[0], cell[1], 0);
        assert_eq!(
            early.harvest_ledger(HarvestTarget::Tree).stage(id),
            Tree::STAGES
        );

        let mut late = ClientSession::connect(mesh[2].clone());
        for _ in 0..120 {
            host.tick();
            early.tick();
            late.tick();
        }
        assert_eq!(
            late.harvest_ledger(HarvestTarget::Tree).stage(id),
            Tree::STAGES,
            "a late joiner was handed a forest that is already down"
        );
        assert!(
            late.take_harvest_events().iter().any(|e| e.id == id),
            "the replay produced no event, so nothing would apply it"
        );
    }

    #[test]
    fn a_non_finite_wish_direction_cannot_reach_the_sim() {
        // One packet, and every arithmetic path downstream is poisoned: NaN > 1.0 is
        // false, so a magnitude check waves it through into the body's pose.
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let cleaned = PlayerInput {
                sequence: 1,
                wish_dir: [bad, 0.5],
                yaw: 0.0,
                jump: false,
            }
            .sanitized();
            assert_eq!(cleaned.wish_dir, [0.0, 0.0], "{bad} survived sanitizing");
        }
    }

    #[test]
    fn an_oversized_wish_direction_is_clamped_not_trusted() {
        let cleaned = PlayerInput {
            sequence: 1,
            wish_dir: [1000.0, 0.0],
            yaw: 0.0,
            jump: false,
        }
        .sanitized();
        let len = (cleaned.wish_dir[0].powi(2) + cleaned.wish_dir[1].powi(2)).sqrt();
        assert!((len - 1.0).abs() < 1e-5, "expected unit length, got {len}");
    }

    #[test]
    fn a_poisoned_input_leaves_the_body_finite() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);
        let peer = client.peer().expect("joined");

        host.handle(
            peer,
            SessionMsg::Input(PlayerInput {
                sequence: 9,
                wish_dir: [f32::NAN, f32::NAN],
                yaw: 0.0,
                jump: false,
            }),
        );
        run(&mut host, &mut client, 10);

        let body = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .copied()
            .expect("body still exists");
        assert!(
            body.iso.pos.iter().all(|v| v.is_finite()),
            "body went non-finite: {:?}",
            body.iso.pos
        );
    }

    #[test]
    fn a_full_session_turns_new_players_away() {
        let mesh = Loopback::mesh(4);
        let config = SessionConfig {
            // The local host peer takes one, leaving room for exactly one guest.
            max_players: 2,
            ..SessionConfig::default()
        };
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 7);
        host.set_terrain(flat_terrain());

        let mut first = ClientSession::connect(mesh[1].clone());
        let mut second = ClientSession::connect(mesh[2].clone());
        for _ in 0..4 {
            host.tick();
            first.tick();
            second.tick();
        }

        assert_eq!(first.status(), ClientStatus::Joined);
        assert_eq!(second.status(), ClientStatus::Rejected);
        assert_eq!(second.reject_reason(), Some(FULL));
        assert_eq!(host.player_count(), 2, "the cap must actually bound bodies");
    }

    #[test]
    fn spawn_slots_are_reused_rather_than_walking_away_forever() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);
        let peer = client.peer().expect("joined");
        let first = host.spawn_point(host.players[&peer].slot);

        host.remove_player(peer);
        // A different, much larger peer id — the counter never rewinds in practice.
        host.admit_guest(PeerId(9_999));
        let reused = host.spawn_point(host.players[&PeerId(9_999)].slot);

        assert_eq!(
            first.pos, reused.pos,
            "a vacated slot should be handed to the next joiner"
        );
    }

    #[test]
    fn every_spawn_point_stays_inside_the_spawn_radius() {
        let (host, _client) = host_and_client();
        for slot in 0..host.config.max_players as u32 {
            let p = host.spawn_point(slot);
            let r = (p.pos[0] * p.pos[0] + p.pos[2] * p.pos[2]).sqrt();
            assert!(
                r <= host.config.spawn_radius + 1e-3,
                "slot {slot} landed {r} out, past {}",
                host.config.spawn_radius
            );
        }
    }

    #[test]
    fn spawns_stand_on_the_ground_when_a_sampler_is_installed() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            1,
        )
        // Higher than the old hardcoded 5.0, which is exactly the case that buried a
        // player inside a hill.
        .with_ground(Arc::new(|_, _| 7.5));
        host.set_terrain(flat_terrain());

        let p = host.spawn_point(0);
        assert!(
            p.pos[1] > 7.5,
            "expected to stand above ground, got {}",
            p.pos[1]
        );
    }

    #[test]
    fn falling_out_of_the_world_puts_a_player_back() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);
        let peer = client.peer().expect("joined");

        // Straight into the void — reachable for real, because terrain arrives
        // asynchronously when it streams.
        host.world_mut().apply(SimCommand::SetKinematicTarget {
            id: player_body(peer),
            iso: Iso::at(0.0, -5_000.0, 0.0),
        });
        run(&mut host, &mut client, 6);

        let y = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .expect("body")
            .iso
            .pos[1];
        assert!(
            y > host.config.void_y,
            "should have been recovered, still at {y}"
        );
    }

    #[test]
    fn a_client_learns_the_world_contract_on_join() {
        // Previously agreed by convention on both sides, and wrong silently.
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);

        let world = client.world().expect("welcome carries the world");
        assert_eq!(world.terrain_extent, host.config.terrain_extent);
        assert_eq!(world.terrain_resolution, host.config.terrain_resolution);
        assert_eq!(world.day_length_minutes, host.config.day_length_minutes);
    }

    #[test]
    fn everyone_shares_one_clock() {
        let config = SessionConfig {
            // A minute-long day so the clock visibly moves inside a test.
            day_length_minutes: 1.0,
            time_sync_seconds: 0.05,
            ..SessionConfig::default()
        };
        let mesh = Loopback::mesh(3);
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 3);
        host.set_terrain(flat_terrain());
        let mut early = ClientSession::connect(mesh[1].clone());
        for _ in 0..40 {
            host.tick();
            early.tick();
        }

        // Joins much later — the case that used to leave two players under different
        // suns, because each ran its own clock from its own scene load.
        let mut late = ClientSession::connect(mesh[2].clone());
        for _ in 0..40 {
            host.tick();
            early.tick();
            late.tick();
        }

        assert!(host.hour() > config.start_hour, "host clock should advance");
        assert!(
            (early.hour() - late.hour()).abs() < 0.05,
            "clients disagree on time: {} vs {}",
            early.hour(),
            late.hour()
        );
        assert!(
            (early.hour() - host.hour()).abs() < 0.05,
            "client drifted from host: {} vs {}",
            early.hour(),
            host.hour()
        );
    }

    #[test]
    fn a_non_finite_yaw_cannot_reach_the_sim() {
        let cleaned = PlayerInput {
            sequence: 1,
            wish_dir: [0.0, 0.0],
            jump: false,
            yaw: f32::NAN,
        }
        .sanitized();
        assert_eq!(cleaned.yaw, 0.0);
    }

    #[test]
    fn an_unwrapped_yaw_is_wrapped_not_rejected() {
        // A client that accumulates yaw without wrapping is naive, not hostile.
        let cleaned = PlayerInput {
            sequence: 1,
            wish_dir: [0.0, 0.0],
            jump: false,
            yaw: std::f32::consts::TAU * 10.5,
        }
        .sanitized();
        assert!(
            (0.0..std::f32::consts::TAU).contains(&cleaned.yaw),
            "yaw {} outside one turn",
            cleaned.yaw
        );
    }

    #[test]
    fn yaw_reaches_the_host() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);
        let peer = client.peer().expect("joined");

        client.set_input([0.0, 0.0], false, 1.25);
        run(&mut host, &mut client, 4);

        assert!(
            (host.players[&peer].input.yaw - 1.25).abs() < 1e-4,
            "host never saw the facing: {}",
            host.players[&peer].input.yaw
        );
    }

    #[test]
    fn a_body_under_water_sinks_slower_than_it_would_in_air() {
        fn fall_distance(water_level: f32) -> f32 {
            let mesh = Loopback::mesh(2);
            let config = SessionConfig {
                water_level,
                ..SessionConfig::default()
            };
            let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 5);
            // No terrain: nothing to land on, so this measures the fall itself.
            let mut client = ClientSession::connect(mesh[1].clone());
            for _ in 0..2 {
                host.tick();
                client.tick();
            }
            let peer = client.peer().expect("joined");
            let start = host
                .world_mut()
                .snapshot()
                .body(player_body(peer))
                .expect("body")
                .iso
                .pos[1];
            for _ in 0..120 {
                host.tick();
                client.tick();
            }
            let end = host
                .world_mut()
                .snapshot()
                .body(player_body(peer))
                .expect("body")
                .iso
                .pos[1];
            start - end
        }

        // Water above the spawn means submerged from the first tick; far below means
        // the same fall happens entirely in air.
        let wet = fall_distance(1_000.0);
        let dry = fall_distance(-10_000.0);
        assert!(
            wet < dry * 0.5,
            "buoyancy did nothing: fell {wet} wet vs {dry} dry"
        );
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

        client.set_input([1.0, 0.0], false, 0.0);
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
        client.set_input([1.0, 0.0], false, 0.0);
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

        let one_second = SimConfig::default().tick_hz.round() as u32;
        for _ in 0..one_second {
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
            yaw: 0.0,
            jump: false,
        };
        let stale = PlayerInput {
            sequence: 5,
            wish_dir: [-1.0, 0.0],
            yaw: 0.0,
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
                yaw: 0.0,
                jump: false,
            }),
        );
        let one_second = SimConfig::default().tick_hz.round() as u32;
        for _ in 0..one_second {
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
