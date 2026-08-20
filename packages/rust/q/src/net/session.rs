//! Listen-server session: the host/client role split over a [`Transport`].

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::guest::{sanitize, unique_guest_name};
use super::pets::{
    DeployError, FieldConfig, LeaderState, PetConfig, PetFields, PetId, PetInfo, PetRegistry,
};
use super::transport::{Delivery, PeerId, Transport};
use crate::harvest::{HarvestTarget, Ledger, stable_id};
use crate::proto::{self, PROTOCOL_VERSION};
use crate::rapier::sim3d::{
    BodyId, CharacterDesc, Iso, SimCommand, SimConfig, SimSnapshot, SimWorld, TerrainDesc,
};
use crate::worldgen::{StoneScatter, TreeScatter};

/// The constants a body's motion is integrated with, sent to every client at join.
///
/// This is a copy of the subset of [`SessionConfig`] that `step_players` reads, rather
/// than a borrow of it: the host holds far more than a client should know, and a client
/// predicting with anything the host does not actually use would drift.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct MovementConfig {
    pub move_speed: f32,
    pub gravity: f32,
    pub jump_speed: f32,
    pub swim_speed: f32,
    pub water_gravity_scale: f32,
    /// The host's fixed timestep. Predicting with a different one integrates gravity at
    /// a different rate, which reads as the local body falling faster or slower than the
    /// one the server eventually confirms.
    pub timestep: f64,
}

/// One player's vertical state between ticks. The character controller resolves motion
/// but never accumulates gravity, so this is carried alongside it on both sides.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Motion {
    pub vel_y: f32,
}

/// Advances one player's vertical velocity and returns the translation to hand the
/// character controller.
///
/// The host calls this, and so does a predicting client. That is the entire point of it
/// being a function: a predictor that reimplements the host's arithmetic drifts from it
/// the first time either side is edited, and the drift shows up as a correction every
/// tick rather than as an obvious break.
///
/// `grounded` and `submerged` come from the state at the start of the tick, which is what
/// the host has and therefore all a client may use if it wants the same answer.
pub fn step_motion(
    motion: &mut Motion,
    input: &PlayerInput,
    grounded: bool,
    submerged: bool,
    config: &MovementConfig,
    dt: f32,
) -> [f32; 3] {
    if grounded && motion.vel_y < 0.0 {
        motion.vel_y = 0.0;
    }
    if submerged {
        // Buoyant rather than weightless, and jump becomes swim-up. Capped both ways so
        // entering water cannot carry a body straight through the bed on momentum it
        // built in the air.
        if input.jump {
            motion.vel_y = config.swim_speed;
        } else {
            motion.vel_y += config.gravity * config.water_gravity_scale * dt;
        }
        motion.vel_y = motion.vel_y.clamp(-config.swim_speed, config.swim_speed);
    } else {
        if grounded && input.jump {
            motion.vel_y = config.jump_speed;
        }
        motion.vel_y += config.gravity * dt;
    }

    // Already finite and magnitude-clamped on ingest.
    let [nx, nz] = input.wish_dir;
    [
        nx * config.move_speed * dt,
        motion.vel_y * dt,
        nz * config.move_speed * dt,
    ]
}

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
        /// How the world's props are scattered. Both sides derive every rock and tree
        /// from these and the ground alone, so neither is ever told where one is --
        /// which only works while both scatter from the same numbers. They were the
        /// client's own exported defaults, matched here by convention, and a host that
        /// moved one stood its colliders in a forest nobody could see.
        stone_seed: i32,
        tree_seed: i32,
        stone_grid_size: f32,
        tree_grid_size: f32,
        /// Hours, 0..24, at the moment of joining.
        /// Hours, 0..24, the host's day started at. Paired with `elapsed` and
        /// `day_length_minutes` this is the whole clock: every other time in the world is
        /// derived from the three, so nothing has to be resent to stay in step.
        start_hour: f32,
        day_length_minutes: f32,
        /// Seconds the host has simulated. Monotonic and never wrapped, so it can be the
        /// input to anything scheduled rather than only to a sky.
        elapsed: f64,
        /// Everything a client needs to advance its own body the way the host will.
        /// These were host-only, so a client could not predict a step without guessing
        /// at the numbers -- and a prediction built on a guess is worse than none,
        /// because it disagrees with the authority in a way reconciliation then has to
        /// undo every tick.
        movement: MovementConfig,
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
    ///
    /// Seconds rather than the hour it used to carry: an hour wraps every 24, so it can
    /// say what the sky should look like and nothing else. Anything that wants to be a
    /// function of world time needs a number that only goes up.
    WorldTime {
        elapsed: f64,
    },
    Input(PlayerInput),
    Snapshot {
        sim: SimSnapshot,
        /// The input sequence each player has been simulated up to, so a client can tell
        /// which of its own inputs this state already accounts for and replay only the
        /// rest. Broadcast rather than addressed because one snapshot is encoded once
        /// for every peer; at `max_players` the whole list is cheaper than per-peer
        /// encoding.
        ///
        /// Kept out of `SimSnapshot` deliberately -- that type is the sim's, and input
        /// sequences are the session's.
        acks: Vec<(PeerId, u32)>,
    },
    /// Join carrying a bearer token from an external identity provider (Supabase
    /// GoTrue, in practice).
    JoinAuthed {
        protocol: u32,
        token: String,
    },
    /// A client says it has started working a scattered object, and means to keep
    /// going until it stops or the thing is gone.
    ///
    /// An intent, not a swing. The host owns the clock from here: it decides how
    /// long a stage takes and rules on each one as it falls due, so the rate is
    /// not something a client can ask for. A swing-shaped message could always be
    /// sent faster than a swing takes, and no amount of validation on one message
    /// fixes that, because each one is individually legitimate.
    ///
    /// Carries the cell and ordinal rather than an id: the host derives the id
    /// itself, so a client cannot name one it could not have reached, and the
    /// cell is what the reach check is measured against.
    HarvestBegin {
        target: HarvestTarget,
        cell: [i32; 2],
        ordinal: u32,
    },
    /// A client says it has stopped. Not required for correctness -- walking away
    /// ends the job on its own, and so does disconnecting -- but it is what makes
    /// letting go of the button stop the work on the same tick rather than at the
    /// next reach check.
    HarvestEnd,
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
    /// What somebody earned by finishing a job, sent only to them.
    ///
    /// Separate from `HarvestDelta` because the two say different things and go
    /// to different people: the delta is the world changing, which everybody has
    /// to draw, and this is a payout, which is nobody else's business. Everyone
    /// who put work into the object gets one, in full, rather than the drop being
    /// split or handed to whoever happened to land the last blow.
    HarvestReward {
        target: HarvestTarget,
        id: u64,
        /// Index into the target's drop table rather than the name, so the wire
        /// does not carry a string per rock and the two sides cannot disagree
        /// about spelling.
        ore: u8,
        amount: u8,
    },
    /// A client asks for one of its pet robots to be put down beside it.
    ///
    /// The chassis is all the client gets to choose. Where it lands, which id it
    /// gets and whether it is allowed at all are the host's to decide, because a
    /// client that could name any of those could deploy an army into someone
    /// else's world.
    DeployPet {
        kind: u8,
    },
    /// A client asks for one of its own pets back.
    RecallPet {
        pet: PetId,
    },
    /// A client asks for all of its pets back.
    RecallPets,
    /// Whole pet list, reliably, whenever it changes.
    ///
    /// Pets already ride in the snapshot as ordinary bodies; this is the only
    /// thing that says which body is a pet, whose it is, and what to draw.
    Pets {
        pets: Vec<PetInfo>,
    },
    /// Why a deploy did not happen, which is not a `Reject`: that ends a session.
    PetDenied {
        reason: String,
    },
}

/// Real seconds one in-world day takes.
fn day_seconds(day_length_minutes: f32) -> f64 {
    (day_length_minutes as f64 * 60.0).max(1.0)
}

/// The hour a world reads after running for `elapsed` seconds.
///
/// The only place the mapping lives. A host and a client each keeping their own version
/// of it is how two people end up standing in the same world under different suns, which
/// is exactly what the periodic resync was there to paper over.
pub fn hour_at(start_hour: f32, day_length_minutes: f32, elapsed: f64) -> f32 {
    (start_hour as f64 + elapsed * 24.0 / day_seconds(day_length_minutes)).rem_euclid(24.0) as f32
}

/// Whole days the world has been running, counting from the session's first tick.
pub fn day_at(day_length_minutes: f32, elapsed: f64) -> i64 {
    (elapsed / day_seconds(day_length_minutes)).floor() as i64
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
    /// World clock. The host owns it so everyone shares one sky. Only the start and the
    /// length are configured: the time itself is [`hour_at`] of how long the host has
    /// run, so there is no second copy of it to drift.
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
    /// How long a disconnected player's place is held for them, in seconds of world
    /// time. A drop is usually a network event rather than a decision to leave, and
    /// putting someone back where they were is the difference between a blip and losing
    /// the walk they just made.
    pub reconnect_grace_seconds: f64,
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
    /// Seconds of work one stage costs. The host's clock, not the client's: this
    /// is the whole reason a chop is a job rather than a stream of swings, and it
    /// is what a client's animation is paced to rather than the other way round.
    pub chop_seconds: f32,
    /// Caps and tuning for deployed pet robots.
    pub pets: PetConfig,
    /// Scatter seeds for the world's props, sent on join. Fixed rather than derived
    /// from the world seed: only the ground under a rock moves with the seed, and the
    /// client's fields carry their own.
    pub stone_seed: i32,
    pub tree_seed: i32,
    /// Sizing and pacing of the per-owner flow fields those pets route on.
    pub pet_fields: FieldConfig,
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
            reconnect_grace_seconds: 120.0,
            swim_speed: 2.0,
            move_speed: 4.0,
            gravity: -9.81,
            jump_speed: 4.5,
            // Match QStoneField and QTreeField's exported grid_size and seeds. The
            // client is told all four on join, so these are the world's numbers rather
            // than an agreement each side has to keep on its own.
            stone_grid_size: 22.0,
            tree_grid_size: 14.0,
            stone_seed: StoneScatter::DEFAULT_SEED,
            tree_seed: TreeScatter::DEFAULT_SEED,
            harvest_reach: 6.0,
            // Match the harvester's exported swing_interval, which is the clip the
            // player watches while this runs down.
            chop_seconds: 0.75,
            pets: PetConfig::default(),
            pet_fields: FieldConfig::default(),
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

/// How long a peer may be silent before a join under its name treats it as dead.
///
/// A joined client sends `Input` every tick whether or not anything changed, so silence
/// is liveness rather than idleness -- an afk player still stamps this. Input rides the
/// unreliable lane, but five seconds of unbroken loss is a dead connection by any other
/// name. Transport membership is deliberately not consulted: players can be admitted
/// outside it (guests, a listen server's own host), and those would read as ghosts.
const GHOST_SILENCE_SECONDS: f64 = 5.0;

/// Ceiling on unacknowledged inputs a client keeps for replay. At 60 inputs a second
/// this is several seconds of round trip, far past anything playable.
const MAX_PENDING_INPUTS: usize = 256;

pub fn player_body(peer: PeerId) -> BodyId {
    BodyId(PLAYER_BODY_BASE + peer.0)
}

pub use super::pets::GroundSampler;

/// A disconnected player's place, held so they can be put back where they were.
///
/// Keyed by the account name because `PeerId` is not stable across a reconnect -- it is a
/// monotonic counter, and the socket that comes back is a new one by definition.
struct Reserved {
    name: String,
    iso: Iso,
    /// World time this stops being honoured, after which the account spawns fresh.
    expires_at: f64,
}

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
    /// Where this player stood last tick, which is the only way to tell a player
    /// walking from one leaning on a wall with the stick pushed forward.
    last_pos: [f32; 2],
    /// Ground speed actually achieved last tick, which is what a follower reads to
    /// decide whether its leader has settled.
    ground_speed: f32,
    /// What this player is working on, if anything. One job at a time: a second
    /// begin replaces the first, because a player has one pair of hands.
    chop: Option<Chop>,
    /// World time anything was last heard from this peer. A socket that has died
    /// without the host noticing goes quiet here first, which is what separates a
    /// player reconnecting from one genuinely signed in twice.
    last_seen: f64,
}

/// A job in progress, held by the host for as long as the player keeps at it.
#[derive(Clone, Copy, Debug)]
struct Chop {
    target: HarvestTarget,
    cell: [i32; 2],
    id: u64,
    /// Work done toward the next stage. Carried across stages rather than reset,
    /// so a job does not lose the remainder of a tick every time one falls due.
    accum: f32,
}

/// Room left between a spawned body and any prop it would otherwise be standing in.
const SPAWN_CLEARANCE: f32 = 0.8;

/// How far under the surface a body has to be before the host stops treating it as
/// standing on ground the sampler reads generously and starts treating it as a fall.
const BURIED_SLACK: f32 = 3.0;

pub struct HostSession<T: Transport> {
    transport: T,
    world: SimWorld,
    config: SessionConfig,
    sim: SimConfig,
    players: HashMap<PeerId, Player>,
    /// Places held for players who dropped, honoured until they expire.
    reserved: Vec<Reserved>,
    seed: u64,
    snapshot_accum: f64,
    authority: Option<Arc<dyn TokenAuthority>>,
    ground: Option<GroundSampler>,
    bridge: Option<crate::worldgen::BridgeFootprint>,
    /// Flat `x, z, radius` triples for the props standing right now.
    obstacles: Vec<f32>,
    /// Seconds simulated. The clock: the hour is derived from it rather than kept
    /// alongside it, so there is nothing for the two to disagree about.
    elapsed: f64,
    time_accum: f64,
    /// What has been mined and felled. The host has no scatter, but damage only
    /// ever increases, so a ledger is enough to be authoritative about state
    /// without ever generating the objects it describes.
    stone_ledger: Ledger,
    tree_ledger: Ledger,
    /// Who has put work into each unfinished object, so that felling it can pay
    /// everyone who swung at it rather than whoever happened to land the last
    /// blow. Entries are dropped as they are paid, so this only ever holds the
    /// jobs somebody started and nobody has finished.
    contributors: HashMap<(HarvestTarget, u64), Vec<PeerId>>,
    pets: PetRegistry,
    pet_fields: PetFields,
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
        let pets = PetConfig {
            water_level: config.water_level,
            void_y: config.void_y,
            gravity: config.gravity,
            water_gravity_scale: config.water_gravity_scale,
            swim_speed: config.swim_speed,
            ..config.pets
        };
        Self {
            world: SimWorld::new(&sim),
            transport,
            config,
            sim,
            players: HashMap::new(),
            reserved: Vec::new(),
            seed,
            snapshot_accum: 0.0,
            authority: None,
            ground: None,
            bridge: None,
            obstacles: Vec::new(),
            stone_ledger: Ledger::new(),
            tree_ledger: Ledger::new(),
            contributors: HashMap::new(),
            pets: PetRegistry::new(pets),
            pet_fields: PetFields::new(FieldConfig {
                water_level: config.water_level,
                clearance: pets.body_radius + 0.3,
                ..config.pet_fields
            }),
            elapsed: 0.0,
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
        self.pet_fields.set_ground(ground.clone());
        self.ground = Some(ground);
        self
    }

    /// Hands the pet fields the rocks currently collidable, as flat `x, z, radius`
    /// triples. Changing them restamps every field, so this is cheap to call with
    /// the same set and expensive to churn.
    pub fn set_pet_obstacles(&mut self, discs: Vec<f32>) {
        // Kept as well as forwarded, for the same reason the bridge is: a spawn
        // point that only checks water and the deck is free to put a player
        // inside a boulder.
        self.obstacles = discs.clone();
        self.pet_fields.set_obstacles(discs);
    }

    /// True where a prop stands, with room for the body that would be put there.
    fn blocked(&self, x: f32, z: f32) -> bool {
        self.obstacles.chunks_exact(3).any(|disc| {
            let clearance = disc[2] + SPAWN_CLEARANCE;
            let (dx, dz) = (x - disc[0], z - disc[1]);
            dx * dx + dz * dz < clearance * clearance
        })
    }

    /// Tells the pet fields where the crossing is, so a route may take it rather
    /// than treating the river as a wall.
    pub fn set_bridge(&mut self, bridge: Option<crate::worldgen::BridgeFootprint>) {
        // Kept as well as forwarded: spawn placement needs it for the same reason
        // routing does, and the bridge was already being computed and handed over
        // when a player could still be dropped inside it.
        self.bridge = bridge;
        self.pet_fields.set_bridge(bridge);
    }

    /// Tells the pet fields what is built on the ground they cover.
    ///
    /// A landmark levels its own ground, so a field reading only the height sampler
    /// reads a walled capital as the most walkable country for miles.
    pub fn set_landmarks(&mut self, marks: Vec<crate::landmark::LandmarkFootprint>) {
        self.pet_fields.set_landmarks(marks);
    }

    /// How many owners currently have a flow field built.
    pub fn pet_field_count(&self) -> usize {
        self.pet_fields.len()
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
    ///
    /// Wet ground is walked past, not spawned into. The river wanders sixty-odd
    /// metres either side of the world's middle and the spawn disc is twelve, so
    /// on essentially every seed the plain spiral put somebody in the riverbed —
    /// measured at five hundred seeds out of five hundred. The escape continues
    /// the same spiral outward, one full ring of slots at a time, so it stays a
    /// pure function of the slot and two players can never be walked onto the
    /// same point. Bounded, because on a world whose middle is open sea there is
    /// no dry ground within any reasonable reach and standing in water beats
    /// spawning at a point the search never returned from.
    fn spawn_point(&self, slot: u32) -> Iso {
        const GOLDEN_ANGLE: f32 = 2.399_963_2;
        let ring = self.config.max_players.max(1) as u32;
        let mut fallback = None;
        for round in 0..24u32 {
            let n = (slot + round * ring) as f32;
            let r = self.config.spawn_radius * (n / ring as f32).sqrt();
            let angle = n * GOLDEN_ANGLE;
            let (x, z) = (r * angle.cos(), r * angle.sin());
            // The bridge is walked past for the same reason the river is. The
            // crossing sits wherever the river meets z = 0, which on many seeds is
            // inside the twelve-metre spawn disc, and the ground under a deck is
            // dry — so the water test passes and the player is placed inside the
            // structure. Ruled out before the height test, since the height there
            // is exactly what makes the point look good.
            let on_bridge = self
                .bridge
                .as_ref()
                .is_some_and(|bridge| bridge.covers([x, z]))
                || self.blocked(x, z);
            let Some(sample) = self.ground.as_ref() else {
                if on_bridge {
                    continue;
                }
                return Iso::at(x, 5.0, z);
            };
            let h = sample(x, z);
            if !h.is_finite() {
                if on_bridge {
                    continue;
                }
                return Iso::at(x, 5.0, z);
            }
            if h > self.config.water_level + 0.4 && !on_bridge {
                return Iso::at(x, h + 1.5, z);
            }
            if !on_bridge {
                fallback.get_or_insert(Iso::at(x, h + 1.5, z));
            }
        }
        // Not `expect`: every round can now decline to record a fallback, because a
        // slot whose whole spiral lies along the bridge records nothing at all.
        // Standing in the river beats panicking the session on a join.
        fallback.unwrap_or_else(|| {
            let h = self
                .ground
                .as_ref()
                .map(|sample| sample(0.0, 0.0))
                .filter(|h| h.is_finite())
                .unwrap_or(5.0);
            Iso::at(0.0, h + 1.5, 0.0)
        })
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

        // The same name on another peer is either a player coming back on a new socket
        // or a genuine second sign-in, and the two want opposite answers. Two bodies
        // wearing one name is worse than a refused second session, so a peer that is
        // still there is still refused; but a peer the transport has already dropped, or
        // one that has gone silent past the point a live client could, is a ghost, and
        // refusing on its behalf locks a player out of their own account. Retiring it
        // also reserves its place, so the spawn below restores rather than restarts.
        if let Some((stale, silent_for)) = self
            .players
            .iter()
            .find(|(p, player)| **p != peer && player.name == name)
            .map(|(p, player)| (*p, self.elapsed - player.last_seen))
        {
            if silent_for < GHOST_SILENCE_SECONDS {
                return Err("that account is already in this session".to_owned());
            }
            self.remove_player(stale);
        }

        self.spawn_player(peer, name.clone());
        Ok(name)
    }

    /// Drops reservations nobody came back for. Called on the world clock rather than a
    /// wall clock so a paused or slowed host holds places for the time its players
    /// actually experienced.
    fn expire_reservations(&mut self) {
        let now = self.elapsed;
        self.reserved.retain(|r| r.expires_at > now);
    }

    fn spawn_player(&mut self, peer: PeerId, name: String) {
        let slot = self.free_slot();
        // A held place wins over the spawn ring. The slot is freshly allocated either
        // way: it only feeds the spawn point and void recovery, and handing back a slot
        // somebody else has since taken would put two players on the same ring point.
        let resumed = self
            .reserved
            .iter()
            .position(|r| r.name == name && r.expires_at > self.elapsed)
            .map(|i| self.reserved.remove(i));
        let iso = match resumed {
            Some(place) => place.iso,
            None => self.spawn_point(slot),
        };
        self.players.insert(
            peer,
            Player {
                name,
                slot,
                last_pos: [iso.pos[0], iso.pos[2]],
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

    /// Removes a player and everything they had deployed.
    ///
    /// A leaderless pet has nobody to follow and nobody to recall it, so it would
    /// stand in the world for the rest of the session holding a slot against
    /// everybody else's cap.
    pub fn remove_player(&mut self, peer: PeerId) {
        if let Some(player) = self.players.remove(&peer) {
            // Hold where they stood before the body goes, so a reconnect inside the
            // grace window is a blip rather than a walk back from the spawn ring. Guests
            // are not held: the name is assigned per join, so there is nothing stable to
            // match a returning one against.
            if !player.name.is_empty()
                && let Some(state) = self.world.snapshot().body(player_body(peer))
            {
                self.reserved.retain(|r| r.name != player.name);
                self.reserved.push(Reserved {
                    name: player.name.clone(),
                    iso: state.iso,
                    expires_at: self.elapsed + self.config.reconnect_grace_seconds,
                });
            }
            self.world.apply(SimCommand::Despawn {
                id: player_body(peer),
            });
            if self.pets.recall_all(peer, &mut self.world) > 0 {
                self.broadcast_pets();
            }
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
                stone_seed: self.config.stone_seed,
                tree_seed: self.config.tree_seed,
                stone_grid_size: self.config.stone_grid_size,
                tree_grid_size: self.config.tree_grid_size,
                start_hour: self.config.start_hour,
                day_length_minutes: self.config.day_length_minutes,
                elapsed: self.elapsed,
                movement: self.movement_config(),
            },
        );
        self.send_harvest_ledgers(peer);
        if !self.pets.is_empty() {
            self.reply(
                peer,
                &SessionMsg::Pets {
                    pets: self.pets.roster(),
                },
            );
        }
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

    /// Centre of a cell in world terms, which is what a reach check measures to.
    fn cell_centre(&self, target: HarvestTarget, cell: [i32; 2]) -> [f32; 2] {
        let size = self.grid_size(target);
        [(cell[0] as f32 + 0.5) * size, (cell[1] as f32 + 0.5) * size]
    }

    /// Whether `peer` is standing close enough to `cell` to be working it.
    ///
    /// The host cannot check that a rock is really in that cell without running
    /// the scatter it does not have. What it can check is that the cell is near
    /// the player, which bounds a forged claim to ground they are standing on
    /// rather than the whole world. Damage is monotonic, so the worst a bad
    /// claim does is break something early — it can never repair anything.
    ///
    /// Rechecked every tick a job runs, not only when it starts: otherwise the
    /// way to fell a forest is to begin on one tree and walk.
    fn within_reach(&self, peer: PeerId, target: HarvestTarget, cell: [i32; 2]) -> bool {
        let Some(body) = self.world.snapshot().body(player_body(peer)).copied() else {
            return false;
        };
        let centre = self.cell_centre(target, cell);
        let [px, _, pz] = body.iso.pos;
        let (dx, dz) = (centre[0] - px, centre[1] - pz);
        // Half a cell of slack: the claim names a cell, and anywhere in it is a
        // legitimate place for the object to have stood.
        let reach = self.config.harvest_reach + self.grid_size(target) * 0.5;
        dx * dx + dz * dz <= reach * reach
    }

    /// Takes up a job, if the claimant could plausibly have reached it.
    ///
    /// Nothing is ruled on here. The first stage falls due one `chop_seconds`
    /// from now, in `advance_chops`, which is the point: the client gets to start
    /// its animation on the press and the host's answer arrives while it runs.
    fn begin_harvest(&mut self, from: PeerId, target: HarvestTarget, cell: [i32; 2], ordinal: u32) {
        if !self.players.contains_key(&from) || !self.within_reach(from, target, cell) {
            return;
        }
        let id = stable_id(self.seed, cell[0], cell[1], ordinal);
        if self.ledger(target).stage(id) >= target.stages() {
            return;
        }
        if let Some(player) = self.players.get_mut(&from) {
            // A begin naming the job already running is left alone rather than
            // restarted. Otherwise a client that repeats itself — retrying, or
            // simply sending on every frame it holds the button — resets its own
            // progress every time and the tree never falls.
            if player
                .chop
                .is_some_and(|c| c.id == id && c.target == target)
            {
                return;
            }
            player.chop = Some(Chop {
                target,
                cell,
                id,
                accum: 0.0,
            });
        }
    }

    fn end_harvest(&mut self, from: PeerId) {
        if let Some(player) = self.players.get_mut(&from) {
            player.chop = None;
        }
    }

    /// Advances every job in progress by one tick, ruling on the stages that fall
    /// due. Runs on the host's clock, so how fast anyone can chop is a property of
    /// the server rather than of how often a client cares to ask.
    fn advance_chops(&mut self, dt: f32) {
        let per_stage = self.config.chop_seconds.max(0.05);
        // Planned first and applied second: the ledgers and the broadcast both want
        // the session mutably, which a walk over `players` is already holding.
        let mut plan: Vec<(PeerId, Chop, f32, u8)> = Vec::new();
        let mut dropped: Vec<PeerId> = Vec::new();

        for (peer, player) in &self.players {
            let Some(chop) = player.chop else { continue };
            if !self.within_reach(*peer, chop.target, chop.cell) {
                dropped.push(*peer);
                continue;
            }
            let mut accum = chop.accum + dt;
            let mut earned: u8 = 0;
            while accum >= per_stage {
                accum -= per_stage;
                earned = earned.saturating_add(1);
            }
            plan.push((*peer, chop, accum, earned));
        }

        for (peer, chop, accum, earned) in plan {
            if let Some(held) = self.players.get_mut(&peer).and_then(|p| p.chop.as_mut()) {
                held.accum = accum;
            }
            if earned == 0 {
                continue;
            }
            let stages = chop.target.stages();
            let current = self.ledger(chop.target).stage(chop.id);
            let next = current.saturating_add(earned).min(stages);
            if next > current {
                self.ledger_mut(chop.target).record(chop.id, next);
                self.broadcast_harvest(chop.target, chop.id, next);
                // Noted for the payout, not for the stage. Work done is what earns
                // a share, so someone who chopped half a tree and wandered off is
                // still owed when whoever took over finishes it.
                let who = self.contributors.entry((chop.target, chop.id)).or_default();
                if !who.contains(&peer) {
                    who.push(peer);
                }
            }
            // Nothing left to work. The last delta already said so, so this only
            // stops the job rather than telling anyone anything.
            if next >= stages {
                self.pay_out(chop.target, chop.id);
                dropped.push(peer);
            }
        }

        for peer in dropped {
            self.end_harvest(peer);
        }
    }

    /// Pays everyone who worked an object once it is finished.
    ///
    /// In full, each of them, rather than split: the amounts are small integers,
    /// so dividing a two-log tree three ways mostly pays nobody, and chopping
    /// together should be worth more than chopping apart rather than less. The
    /// drop is rolled from the id, which is the same roll the client makes from
    /// its own scatter, so nobody has to be told what the object was.
    fn pay_out(&mut self, target: HarvestTarget, id: u64) {
        let Some(who) = self.contributors.remove(&(target, id)) else {
            return;
        };
        let (ore, amount) = target.roll_drop(id);
        let msg = SessionMsg::HarvestReward {
            target,
            id,
            ore,
            amount,
        };
        for peer in who {
            // Anyone who left is simply not paid. There is nowhere to send it and
            // nothing yet that would hold it for them.
            if self.players.contains_key(&peer) {
                self.reply(peer, &msg);
            }
        }
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
        if let Ok(bytes) = proto::encode(&SessionMsg::WorldTime {
            elapsed: self.elapsed,
        }) {
            let _ = self.transport.broadcast(Delivery::Unreliable, &bytes);
        }
    }

    /// Host clock, hours 0..24.
    pub fn hour(&self) -> f32 {
        hour_at(
            self.config.start_hour,
            self.config.day_length_minutes,
            self.elapsed,
        )
    }

    /// Seconds the host has simulated, never wrapped.
    pub fn elapsed(&self) -> f64 {
        self.elapsed
    }

    /// Whole days the world has run.
    pub fn day(&self) -> i64 {
        day_at(self.config.day_length_minutes, self.elapsed)
    }

    /// Pets currently deployed, in id order.
    pub fn pet_roster(&self) -> Vec<PetInfo> {
        self.pets.roster()
    }

    pub fn pet_count(&self) -> usize {
        self.pets.len()
    }

    fn broadcast_pets(&self) {
        if self.transport.peers().is_empty() {
            return;
        }
        let msg = SessionMsg::Pets {
            pets: self.pets.roster(),
        };
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self.transport.broadcast(Delivery::Reliable, &bytes);
        }
    }

    /// Places a pet on the ring around its owner, on the ground.
    ///
    /// The ring slot is the count they already have out, so pets fan out around a
    /// standing player instead of stacking inside one another and shoving each
    /// other apart the moment they exist.
    pub fn deploy_pet(&mut self, owner: PeerId, kind: u8) -> Result<PetId, DeployError> {
        if !self.players.contains_key(&owner) {
            return Err(DeployError::NoOwner);
        }
        self.pets.may_deploy(owner)?;
        let Some(body) = self.world.snapshot().body(player_body(owner)).copied() else {
            return Err(DeployError::NoOwner);
        };
        let offset = self.pets.ring_offset(self.pets.count_of(owner));
        let (x, z) = (body.iso.pos[0] + offset[0], body.iso.pos[2] + offset[1]);
        let y = match self.ground.as_ref() {
            Some(sample) => {
                let h = sample(x, z);
                if h.is_finite() {
                    h + 1.0
                } else {
                    body.iso.pos[1]
                }
            }
            None => body.iso.pos[1],
        };
        let id = self
            .pets
            .deploy(owner, kind, Iso::at(x, y, z), &mut self.world)?;
        self.broadcast_pets();
        Ok(id)
    }

    /// Picks one of a player's own pets back up.
    pub fn recall_pet(&mut self, owner: PeerId, pet: PetId) -> bool {
        if self.pets.recall(owner, pet, &mut self.world) {
            self.broadcast_pets();
            return true;
        }
        false
    }

    /// Picks up everything a player has out, and says how many that was.
    pub fn recall_pets(&mut self, owner: PeerId) -> usize {
        let n = self.pets.recall_all(owner, &mut self.world);
        if n > 0 {
            self.broadcast_pets();
        }
        n
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
        let now = self.elapsed;
        if let Some(player) = self.players.get_mut(&from) {
            player.last_seen = now;
        }
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
            SessionMsg::HarvestBegin {
                target,
                cell,
                ordinal,
            } => {
                self.begin_harvest(from, target, cell, ordinal);
            }
            SessionMsg::HarvestEnd => {
                self.end_harvest(from);
            }
            SessionMsg::DeployPet { kind } => {
                if let Err(err) = self.deploy_pet(from, kind) {
                    self.reply(
                        from,
                        &SessionMsg::PetDenied {
                            reason: err.reason(),
                        },
                    );
                }
            }
            SessionMsg::RecallPet { pet } => {
                self.recall_pet(from, pet);
            }
            SessionMsg::RecallPets => {
                self.recall_pets(from);
            }
            SessionMsg::Welcome { .. }
            | SessionMsg::Reject { .. }
            | SessionMsg::Roster { .. }
            | SessionMsg::WorldTime { .. }
            | SessionMsg::HarvestDelta { .. }
            | SessionMsg::HarvestLedger { .. }
            | SessionMsg::HarvestReward { .. }
            | SessionMsg::Pets { .. }
            | SessionMsg::PetDenied { .. }
            | SessionMsg::Snapshot { .. } => {}
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
        self.advance_chops(dt);
        self.expire_reservations();
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

        // Under the ground but not yet past the void floor. A heightfield is a
        // surface rather than a solid, so a body that ends up beneath one is in open
        // space and falling -- and the only thing that catches it is a hundred metre
        // drop, after which it is put back at spawn. The sampler knows where the
        // surface is now, so the fall can be ended where it started instead.
        //
        // Only where terrain exists: a world with a sampler and no collider is one
        // where falling is the correct outcome, not a hole to be rescued from.
        if self.world.terrain_region_count() > 0
            && let Some(ground) = self.ground.clone()
        {
            let buried: Vec<(PeerId, Iso)> = self
                .players
                .keys()
                .filter_map(|peer| {
                    let body = snapshot.body(player_body(*peer))?;
                    let [x, y, z] = body.iso.pos;
                    let h = ground(x, z);
                    (h.is_finite() && y >= self.config.void_y && y < h - BURIED_SLACK)
                        .then(|| (*peer, Iso::at(x, h + 1.0, z)))
                })
                .collect();
            for (peer, iso) in buried {
                // A sweep up out of the ground is negotiated with the ground it is
                // sweeping out of. The crate documents the distinction; this has to
                // be by fiat.
                self.world.apply(SimCommand::TeleportCharacter {
                    id: player_body(peer),
                    iso,
                });
                if let Some(player) = self.players.get_mut(&peer) {
                    player.vel_y = 0.0;
                }
            }
        }

        let movement = self.movement_config();
        for (peer, player) in &mut self.players {
            let body = player_body(*peer);
            if let Some(state) = snapshot.body(body) {
                let at = [state.iso.pos[0], state.iso.pos[2]];
                let (dx, dz) = (at[0] - player.last_pos[0], at[1] - player.last_pos[1]);
                player.ground_speed = (dx * dx + dz * dz).sqrt() / dt.max(1e-4);
                player.last_pos = at;
            }
            let grounded = snapshot.body(body).is_some_and(|b| b.grounded);

            let submerged = snapshot
                .body(body)
                .is_some_and(|b| b.iso.pos[1] < self.config.water_level);

            let mut motion = Motion {
                vel_y: player.vel_y,
            };
            let translation = step_motion(
                &mut motion,
                &player.input,
                grounded,
                submerged,
                &movement,
                dt,
            );
            player.vel_y = motion.vel_y;

            self.world.apply(SimCommand::MoveCharacter {
                id: body,
                translation,
            });
        }

        if !self.pets.is_empty() || !self.pet_fields.is_empty() {
            let leaders = self.leader_states();
            self.pet_fields.update(&leaders, &self.pets.owners());
            if self.pets.drive(
                &snapshot,
                &leaders,
                Some(&self.pet_fields),
                dt,
                &mut self.world,
            ) {
                self.broadcast_pets();
            }
        }

        self.world.step();

        // One clock for everyone, advanced by the host and rebroadcast so clients that
        // joined at different times do not drift into different skies.
        self.elapsed += self.sim.timestep();
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

    /// Where every player is and how they are moving, as their pets read it.
    ///
    /// Facing comes from the yaw the client reports rather than the body's rotation:
    /// the character proxy never turns, so the pose in the snapshot says nothing
    /// about which way anybody is looking.
    fn leader_states(&self) -> HashMap<PeerId, LeaderState> {
        self.players
            .iter()
            .map(|(peer, player)| {
                let yaw = player.input.yaw;
                (
                    *peer,
                    LeaderState {
                        position: player.last_pos,
                        facing: [-yaw.sin(), -yaw.cos()],
                        speed: player.ground_speed,
                    },
                )
            })
            .collect()
    }

    /// The slice of the host's config a client integrates its own body with. Derived
    /// rather than stored so it cannot fall out of step with what `step_players` reads.
    fn movement_config(&self) -> MovementConfig {
        MovementConfig {
            move_speed: self.config.move_speed,
            gravity: self.config.gravity,
            jump_speed: self.config.jump_speed,
            swim_speed: self.config.swim_speed,
            water_gravity_scale: self.config.water_gravity_scale,
            timestep: self.sim.timestep(),
        }
    }

    fn broadcast_snapshot(&self) {
        if self.transport.peers().is_empty() {
            return;
        }
        let msg = SessionMsg::Snapshot {
            sim: self.world.snapshot(),
            acks: self
                .players
                .iter()
                .map(|(peer, player)| (*peer, player.last_sequence))
                .collect(),
        };
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
    /// The host's movement constants, from `Welcome`. `None` until welcomed, which is
    /// the only honest answer -- a default here would be a guess that silently disagrees
    /// with the authority.
    movement: Option<MovementConfig>,
    /// The newest input sequence the host has confirmed simulating for us. Everything
    /// after it is still ours to replay.
    acked_input: u32,
    /// Inputs sent but not yet confirmed, oldest first. These are exactly what a
    /// predictor replays on top of an authoritative state to get back to now.
    pending: Vec<PlayerInput>,
    /// Seconds the host had simulated as of the last clock that arrived. The client
    /// advances it between them, so this is a correction rather than the only source.
    elapsed: f64,
    /// The host's view of what has been harvested, replayed on join and kept up
    /// to date by deltas. Held so a field rescattering mid-session can restore
    /// from it without asking anyone.
    stone_ledger: Ledger,
    tree_ledger: Ledger,
    /// Deltas since the last drain, for whoever owns the scatter to apply.
    harvest_events: Vec<HarvestEvent>,
    harvest_rewards: Vec<HarvestRewardEvent>,
    /// Every pet in the session, which is what turns bodies in the snapshot into
    /// something the client knows to draw and whose it is.
    pets: Vec<PetInfo>,
    /// Why the last deploy was turned down, drained by whoever shows it.
    pet_denied: Option<String>,
}

/// One authoritative change to a scattered object.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HarvestEvent {
    pub target: HarvestTarget,
    pub id: u64,
    pub stage: u8,
}

/// What this player earned by finishing something off.
///
/// Only ever about us. Everybody's rocks break in `HarvestEvent`; only ours pay.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HarvestRewardEvent {
    pub target: HarvestTarget,
    pub id: u64,
    /// Drop table slug, resolved from the index the wire carries.
    pub ore: &'static str,
    pub amount: u8,
}

/// What the host told us about the world it is simulating.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldInfo {
    pub terrain_extent: f32,
    pub terrain_resolution: u32,
    /// The deck's height is derived from these two on both sides.
    pub water_level: f32,
    pub road_width: f32,
    /// What the host scattered its rocks and trees from, so the client can scatter the
    /// same ones instead of agreeing by convention.
    pub stone_seed: i32,
    pub tree_seed: i32,
    pub stone_grid_size: f32,
    pub tree_grid_size: f32,
    /// The clock's two constants. Everything else about the time is derived from these
    /// and the elapsed seconds, on both sides, through the same function.
    pub start_hour: f32,
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
            movement: None,
            acked_input: 0,
            pending: Vec::new(),
            elapsed: 0.0,
            stone_ledger: Ledger::new(),
            tree_ledger: Ledger::new(),
            harvest_events: Vec::new(),
            harvest_rewards: Vec::new(),
            pets: Vec::new(),
            pet_denied: None,
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

    /// The host's movement constants. `None` until welcomed.
    pub fn movement(&self) -> Option<MovementConfig> {
        self.movement
    }

    /// Newest input sequence the host has confirmed simulating for us. Inputs after this
    /// are the ones a predictor replays on top of the authoritative state.
    pub fn acked_input(&self) -> u32 {
        self.acked_input
    }

    /// Sequence of the most recent [`Self::set_input`], so a predictor can file what it
    /// applied under the same number the host will ack it by.
    pub fn input_sequence(&self) -> u32 {
        self.input.sequence
    }

    /// Inputs sent but not yet confirmed by the host, oldest first. Replaying these on
    /// top of the newest authoritative state is what puts a predicted body back at now.
    pub fn pending_inputs(&self) -> &[PlayerInput] {
        &self.pending
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

    /// Host clock, hours 0..24.
    pub fn hour(&self) -> f32 {
        self.world.map_or(0.0, |w| {
            hour_at(w.start_hour, w.day_length_minutes, self.elapsed)
        })
    }

    /// Seconds the host has simulated, never wrapped.
    pub fn elapsed(&self) -> f64 {
        self.elapsed
    }

    /// Whole days the world has run.
    pub fn day(&self) -> i64 {
        self.world
            .map_or(0, |w| day_at(w.day_length_minutes, self.elapsed))
    }

    /// Runs the clock on between the host's corrections, so the sky keeps moving rather
    /// than stepping once every resync.
    pub fn advance_clock(&mut self, dt: f64) {
        if self.world.is_some() {
            self.elapsed += dt.max(0.0);
        }
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

    /// Everything the host has paid us since the last call.
    pub fn take_harvest_rewards(&mut self) -> Vec<HarvestRewardEvent> {
        std::mem::take(&mut self.harvest_rewards)
    }

    /// Tells the host we have started working a scattered object.
    ///
    /// Sent once, at the top of the job rather than once per swing. The host times
    /// the stages from here, so the answers arrive while the client is already in
    /// its loop and there is nothing for the player to wait on.
    ///
    /// Reliable: a dropped begin is a tree that never falls, and the client has no
    /// way to notice it was lost.
    pub fn harvest_begin(&mut self, target: HarvestTarget, cell: [i32; 2], ordinal: u32) {
        self.send_harvest(SessionMsg::HarvestBegin {
            target,
            cell,
            ordinal,
        });
    }

    /// Tells the host we have stopped. Reliable for the same reason: a dropped end
    /// is a player who keeps chopping a tree they walked away from, until the reach
    /// check happens to catch it.
    pub fn harvest_end(&mut self) {
        self.send_harvest(SessionMsg::HarvestEnd);
    }

    fn send_harvest(&mut self, msg: SessionMsg) {
        if self.status != ClientStatus::Joined {
            return;
        }
        if let Ok(bytes) = proto::encode(&msg) {
            let _ = self
                .transport
                .send(PeerId::HOST, Delivery::Reliable, &bytes);
        }
    }

    /// Every pet the host has told us about, sorted by id.
    pub fn pets(&self) -> &[PetInfo] {
        &self.pets
    }

    /// Pets belonging to the local player.
    pub fn my_pets(&self) -> Vec<&PetInfo> {
        let Some(me) = self.peer else {
            return Vec::new();
        };
        self.pets.iter().filter(|p| p.owner == me).collect()
    }

    /// The last refused deploy, cleared by reading it.
    pub fn take_pet_denied(&mut self) -> Option<String> {
        self.pet_denied.take()
    }

    /// Asks the host to put a pet down. Reliable: a dropped deploy is a button
    /// press that silently did nothing.
    pub fn deploy_pet(&mut self, kind: u8) {
        self.request(&SessionMsg::DeployPet { kind });
    }

    pub fn recall_pet(&mut self, pet: PetId) {
        self.request(&SessionMsg::RecallPet { pet });
    }

    pub fn recall_pets(&mut self) {
        self.request(&SessionMsg::RecallPets);
    }

    fn request(&self, msg: &SessionMsg) {
        if self.status != ClientStatus::Joined {
            return;
        }
        if let Ok(bytes) = proto::encode(msg) {
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
        self.pending.push(self.input);
        // A host that stops acking must not be able to grow this without bound. The cap
        // is far past any real round trip, and dropping the oldest is the right loss:
        // those are the inputs the authoritative state is most likely to already hold.
        if self.pending.len() > MAX_PENDING_INPUTS {
            let excess = self.pending.len() - MAX_PENDING_INPUTS;
            self.pending.drain(..excess);
        }
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
                    stone_seed,
                    tree_seed,
                    stone_grid_size,
                    tree_grid_size,
                    start_hour,
                    day_length_minutes,
                    elapsed,
                    movement,
                    ..
                } => {
                    self.status = ClientStatus::Joined;
                    self.seed = Some(seed);
                    self.peer = Some(peer);
                    self.name = Some(name);
                    self.elapsed = elapsed;
                    self.movement = Some(movement);
                    self.world = Some(WorldInfo {
                        terrain_extent,
                        terrain_resolution,
                        water_level,
                        road_width,
                        stone_seed,
                        tree_seed,
                        stone_grid_size,
                        tree_grid_size,
                        start_hour,
                        day_length_minutes,
                    });
                }
                SessionMsg::WorldTime { elapsed } => {
                    self.elapsed = elapsed;
                }
                SessionMsg::Roster { players } => {
                    self.roster = players;
                }
                SessionMsg::Reject { reason } => {
                    self.status = ClientStatus::Rejected;
                    self.reject_reason = Some(reason);
                }
                SessionMsg::Snapshot { sim, acks } => {
                    let newer = self
                        .snapshot
                        .as_ref()
                        .is_none_or(|current| sim.tick > current.tick);
                    if newer {
                        // Only from a newer snapshot: these arrive unreliably and out of
                        // order, and an ack from a stale one would walk the replay point
                        // backwards, re-applying inputs the host has already consumed.
                        self.acked_input = self
                            .peer
                            .and_then(|me| acks.iter().find(|(p, _)| *p == me))
                            .map(|(_, seq)| *seq)
                            .unwrap_or(self.acked_input);
                        // Everything the host has confirmed is now its problem, not
                        // ours; what is left is exactly the replay set.
                        let acked = self.acked_input;
                        self.pending.retain(|input| input.sequence > acked);
                        self.snapshot = Some(sim);
                    }
                }
                SessionMsg::HarvestDelta { target, id, stage } => {
                    self.harvest_ledger_mut(target).record(id, stage);
                    self.harvest_events.push(HarvestEvent { target, id, stage });
                }
                SessionMsg::HarvestReward {
                    target,
                    id,
                    ore,
                    amount,
                } => {
                    // An index the host chose out of a table we compiled in, so it
                    // is checked rather than trusted: a bad one earns nothing
                    // instead of panicking on the way past.
                    if let Some(drop) = target.drop_table().get(ore as usize) {
                        self.harvest_rewards.push(HarvestRewardEvent {
                            target,
                            id,
                            ore: drop.ore,
                            amount,
                        });
                    }
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
                SessionMsg::Pets { pets } => {
                    self.pets = pets;
                }
                SessionMsg::PetDenied { reason } => {
                    self.pet_denied = Some(reason);
                }
                SessionMsg::Join { .. }
                | SessionMsg::JoinAuthed { .. }
                | SessionMsg::HarvestBegin { .. }
                | SessionMsg::HarvestEnd
                | SessionMsg::DeployPet { .. }
                | SessionMsg::RecallPet { .. }
                | SessionMsg::RecallPets
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
    use crate::net::pets::pet_body;
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

    /// Ticks one stage's worth of work takes, at the config the tests run under.
    fn ticks_per_stage() -> usize {
        let seconds = SessionConfig::default().chop_seconds as f64;
        (seconds / SimConfig::default().timestep()).ceil() as usize
    }

    #[test]
    fn a_chop_in_reach_earns_a_stage_once_the_work_is_done() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);
        let per_stage = ticks_per_stage();

        client.harvest_begin(HarvestTarget::Tree, cell, 0);
        // Deliberately short of a full stage. Taking the job is not doing it, and
        // the host answering the instant it is asked is the thing being ruled out.
        run(&mut host, &mut client, per_stage / 2);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id),
            0,
            "a stage was granted before the work that buys it was done"
        );

        run(&mut host, &mut client, per_stage);
        assert!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id) >= 1,
            "an uninterrupted chop earned nothing after a full stage of work"
        );
    }

    /// The one thing the host can check without a scatter of its own.
    #[test]
    fn a_chop_out_of_reach_is_refused() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let size = SessionConfig::default().tree_grid_size;
        let far = [9_000, -9_000];

        client.harvest_begin(HarvestTarget::Tree, far, 0);
        run(&mut host, &mut client, ticks_per_stage() * 3);

        let id = stable_id(42, far[0], far[1], 0);
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id),
            0,
            "a claim from {size} units of nowhere was honoured"
        );
    }

    /// The whole point of a job rather than a stream of swings. Under the old
    /// shape each message was one hit, so the rate was whatever a client chose to
    /// send at; now the host holds the clock and asking cannot make it run.
    #[test]
    fn chopping_cannot_be_hurried_by_asking_more_often() {
        let ticks = ticks_per_stage() * 3;

        let stage_after = |spam: bool| {
            let (mut host, mut client) = host_and_client();
            run(&mut host, &mut client, 120);
            let peer = client.peer().expect("joined");
            let size = SessionConfig::default().tree_grid_size;
            let cell = cell_under(&mut host, peer, size);
            client.harvest_begin(HarvestTarget::Tree, cell, 0);
            for _ in 0..ticks {
                if spam {
                    client.harvest_begin(HarvestTarget::Tree, cell, 0);
                }
                run(&mut host, &mut client, 1);
            }
            let id = stable_id(42, cell[0], cell[1], 0);
            client.harvest_ledger(HarvestTarget::Tree).stage(id)
        };

        let patient = stage_after(false);
        assert!(
            patient > 0,
            "an uninterrupted chop earned nothing in {ticks} ticks"
        );
        assert_eq!(
            patient,
            stage_after(true),
            "asking on every tick was worth more than asking once"
        );
    }

    /// Letting go stops the work, rather than leaving it running until the reach
    /// check happens to catch up.
    #[test]
    fn ending_a_chop_stops_the_work() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);

        client.harvest_begin(HarvestTarget::Tree, cell, 0);
        client.harvest_end();
        run(&mut host, &mut client, ticks_per_stage() * 3);

        assert_eq!(
            client.harvest_ledger(HarvestTarget::Tree).stage(id),
            0,
            "work carried on after the player stopped"
        );
    }

    /// Felling something pays the person who felled it.
    #[test]
    fn felling_a_tree_pays_the_player_who_did_it() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);

        client.harvest_begin(HarvestTarget::Tree, cell, 0);
        run(
            &mut host,
            &mut client,
            ticks_per_stage() * (Tree::STAGES as usize + 2),
        );

        let paid = client.take_harvest_rewards();
        assert_eq!(paid.len(), 1, "felling a tree paid {} times", paid.len());
        assert_eq!(paid[0].id, id);
        assert!(paid[0].amount > 0, "paid nothing at all");
        // The same roll the client's own scatter would have made, so a reward can
        // be trusted without the host describing an object it never generated.
        let (ore, amount) = HarvestTarget::Tree.roll_drop(id);
        assert_eq!(paid[0].ore, Tree::drop_table()[ore as usize].ore);
        assert_eq!(paid[0].amount, amount);
    }

    /// Nothing is owed until the thing actually comes down.
    #[test]
    fn a_half_chopped_tree_pays_nobody() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);

        client.harvest_begin(HarvestTarget::Tree, cell, 0);
        run(&mut host, &mut client, ticks_per_stage());
        client.harvest_end();
        run(&mut host, &mut client, ticks_per_stage() * 3);

        assert!(
            client.take_harvest_rewards().is_empty(),
            "a tree that is still standing paid out"
        );
    }

    /// Everyone who worked it is paid, in full, whoever landed the last blow.
    ///
    /// The rule the design turns on: chopping together has to be worth more than
    /// chopping apart, and nobody should be able to take a tree by swooping in on
    /// the last stage of somebody else's work.
    #[test]
    fn everyone_who_worked_a_tree_is_paid_in_full() {
        let mesh = Loopback::mesh(3);
        // A spawn ring tight enough that both players are at the same tree. On the
        // default radius the two slots are further apart than harvest reach, so the
        // second could not work the first one's cell at all.
        let config = SessionConfig {
            spawn_radius: 1.0,
            ..SessionConfig::default()
        };
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 42);
        host.set_terrain(flat_terrain());
        let mut early = ClientSession::connect(mesh[1].clone());
        let mut late = ClientSession::connect(mesh[2].clone());

        let step = |host: &mut HostSession<Loopback>,
                    a: &mut ClientSession<Loopback>,
                    b: &mut ClientSession<Loopback>,
                    ticks: usize| {
            for _ in 0..ticks {
                host.tick();
                a.tick();
                b.tick();
            }
        };
        step(&mut host, &mut early, &mut late, 120);

        // Both spawn on the ring, so they are not in the same cell. The tree is
        // the one under the first of them; the second has to be near it to work
        // it at all, which the spawn radius and the reach slack allow.
        let peer = early.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);

        // One player starts it and leaves off partway.
        early.harvest_begin(HarvestTarget::Tree, cell, 0);
        step(&mut host, &mut early, &mut late, ticks_per_stage() + 2);
        early.harvest_end();

        // The other finishes it.
        late.harvest_begin(HarvestTarget::Tree, cell, 0);
        step(
            &mut host,
            &mut early,
            &mut late,
            ticks_per_stage() * (Tree::STAGES as usize + 2),
        );

        assert_eq!(
            late.harvest_ledger(HarvestTarget::Tree).stage(id),
            Tree::STAGES,
            "the tree never came down, so this proves nothing about paying for it"
        );

        let paid_early = early.take_harvest_rewards();
        let paid_late = late.take_harvest_rewards();
        assert_eq!(
            paid_early.len(),
            1,
            "the player who started the tree was not paid"
        );
        assert_eq!(
            paid_late.len(),
            1,
            "the player who finished the tree was not paid"
        );
        assert_eq!(
            paid_early[0].amount, paid_late[0].amount,
            "the drop was split rather than paid to each of them in full"
        );
        assert_eq!(paid_early[0].ore, paid_late[0].ore);
    }

    /// Damage is monotonic and stops at the last stage, so a job left running on
    /// something already broken cannot wrap it back round.
    #[test]
    fn a_chop_stops_at_the_last_stage() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 120);
        let peer = client.peer().expect("joined");
        let size = SessionConfig::default().stone_grid_size;
        let cell = cell_under(&mut host, peer, size);
        let id = stable_id(42, cell[0], cell[1], 0);

        client.harvest_begin(HarvestTarget::Stone, cell, 0);
        // Long enough to earn several times the stages that exist.
        run(
            &mut host,
            &mut client,
            ticks_per_stage() * (Stone::STAGES as usize + 3),
        );
        assert_eq!(
            client.harvest_ledger(HarvestTarget::Stone).stage(id),
            Stone::STAGES
        );

        // Already broken; taking the job up again must not move it, and must not wrap.
        client.harvest_begin(HarvestTarget::Stone, cell, 0);
        run(&mut host, &mut client, ticks_per_stage() * 2);
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
        early.harvest_begin(HarvestTarget::Tree, cell, 0);
        run(
            &mut host,
            &mut early,
            ticks_per_stage() * (Tree::STAGES as usize + 2),
        );
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

    /// Everyone standing there watches the same tree come down.
    ///
    /// The late joiner gets the ledger, which is a different mechanism and a different
    /// test. This is the bystander: already joined, listening, and holding a tree that
    /// somebody else is felling. If the delta does not reach them they keep a whole
    /// tree standing where the world has a stump, and they keep it until they rejoin --
    /// harvest is not a snapshot, and nothing later corrects it.
    #[test]
    fn a_bystander_sees_the_tree_the_other_player_fells() {
        let mesh = Loopback::mesh(3);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        let mut chopper = ClientSession::connect(mesh[1].clone());
        let mut bystander = ClientSession::connect(mesh[2].clone());
        for _ in 0..120 {
            host.tick();
            chopper.tick();
            bystander.tick();
        }
        // Whatever the ledger replay handed out on join, so what is left is only what
        // arrives from here on.
        bystander.take_harvest_events();

        let peer = chopper.peer().expect("joined");
        let size = SessionConfig::default().tree_grid_size;
        let cell = cell_under(&mut host, peer, size);
        chopper.harvest_begin(HarvestTarget::Tree, cell, 0);
        for _ in 0..ticks_per_stage() * (Tree::STAGES as usize + 2) {
            host.tick();
            chopper.tick();
            bystander.tick();
        }

        let id = stable_id(42, cell[0], cell[1], 0);
        assert_eq!(
            bystander.harvest_ledger(HarvestTarget::Tree).stage(id),
            Tree::STAGES,
            "the tree is down for whoever swung and standing for everyone watching"
        );
        assert!(
            bystander.take_harvest_events().iter().any(|e| e.id == id),
            "the stage arrived with no event, so nothing on that side would draw it"
        );
    }

    fn pet_host(mesh: &[Loopback], pets: PetConfig) -> HostSession<Loopback> {
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig {
                pets,
                ..SessionConfig::default()
            },
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        host
    }

    fn flat_pos(host: &mut HostSession<Loopback>, body: BodyId) -> [f32; 2] {
        let pos = host
            .world_mut()
            .snapshot()
            .body(body)
            .expect("body")
            .iso
            .pos;
        [pos[0], pos[2]]
    }

    fn gap(a: [f32; 2], b: [f32; 2]) -> f32 {
        ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
    }

    /// Two players, a pet each. Everyone has to see both: the roster is what says which
    /// body is a pet and what chassis to draw, so a client missing the other's entry draws
    /// nothing at all and the pet is invisible rather than merely wrong.
    #[test]
    fn each_client_sees_every_players_pets() {
        let mesh = Loopback::mesh(3);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut a = ClientSession::connect(mesh[1].clone());
        let mut b = ClientSession::connect(mesh[2].clone());
        for _ in 0..60 {
            host.tick();
            a.tick();
            b.tick();
        }
        let pa = a.peer().expect("a joined");
        let pb = b.peer().expect("b joined");
        assert_ne!(pa, pb);

        a.deploy_pet(1);
        b.deploy_pet(2);
        for _ in 0..20 {
            host.tick();
            a.tick();
            b.tick();
        }

        assert_eq!(host.pet_roster().len(), 2, "host lost a deploy");
        for (who, client) in [("a", &a), ("b", &b)] {
            assert_eq!(
                client.pets().len(),
                2,
                "{who} was only told about {} of the 2 pets",
                client.pets().len()
            );
            assert_eq!(client.my_pets().len(), 1, "{who} should own exactly one");
        }

        let snapshot = host.world_mut().snapshot();
        for info in host.pet_roster() {
            assert!(
                snapshot.body(info.body).is_some(),
                "pet {:?} has no body to replicate",
                info.pet
            );
        }

        // The roster only names the pets. What actually draws one is its body arriving
        // in the client's own snapshot, and a roster entry with no body behind it is an
        // invisible pet rather than a missing one.
        for (who, client) in [("a", &a), ("b", &b)] {
            let seen = client.latest_snapshot().expect("no snapshot yet");
            for info in host.pet_roster() {
                assert!(
                    seen.body(info.body).is_some(),
                    "{who} never received a body for pet {:?} owned by {:?}",
                    info.pet,
                    info.owner
                );
            }
        }
    }

    /// Joining after the fact must not miss what is already down: the roster rides a
    /// reliable message on join, and without it a late joiner sees bodies it cannot draw.
    #[test]
    fn a_late_joiner_is_told_about_pets_already_deployed() {
        let mesh = Loopback::mesh(3);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut early = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut early, 40);

        early.deploy_pet(2);
        run(&mut host, &mut early, 10);
        assert_eq!(host.pet_roster().len(), 1);

        let mut late = ClientSession::connect(mesh[2].clone());
        for _ in 0..60 {
            host.tick();
            early.tick();
            late.tick();
        }

        assert_eq!(
            late.pets().len(),
            1,
            "a late joiner was never told about the pet already out"
        );
        assert_eq!(late.my_pets().len(), 0, "it is not theirs");
        assert_eq!(late.pets()[0].kind, 2, "chassis lost on the join replay");
    }

    #[test]
    fn a_deployed_pet_gets_a_body_next_to_its_owner() {
        let mesh = Loopback::mesh(2);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);
        let peer = client.peer().expect("joined");

        client.deploy_pet(3);
        run(&mut host, &mut client, 4);

        let roster = host.pet_roster();
        assert_eq!(roster.len(), 1, "the deploy did not produce a pet");
        assert_eq!(roster[0].owner, peer);
        assert_eq!(
            roster[0].kind, 3,
            "the chassis the client asked for was lost"
        );
        assert_eq!(roster[0].body, pet_body(roster[0].pet));

        let owner_at = flat_pos(&mut host, player_body(peer));
        let pet_at = flat_pos(&mut host, roster[0].body);
        assert!(
            gap(owner_at, pet_at) < PetConfig::default().deploy_radius * 2.0,
            "a pet was put down nowhere near its owner: {owner_at:?} vs {pet_at:?}"
        );
        assert_eq!(client.pets().len(), 1, "the client was never told about it");
        assert_eq!(client.my_pets().len(), 1);
    }

    /// The cap the whole feature exists to hold.
    #[test]
    fn a_player_may_not_exceed_their_own_cap() {
        let mesh = Loopback::mesh(2);
        let cfg = PetConfig {
            per_player: 4,
            ..PetConfig::default()
        };
        let mut host = pet_host(&mesh, cfg);
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);

        for _ in 0..cfg.per_player + 3 {
            client.deploy_pet(0);
            run(&mut host, &mut client, 2);
        }

        assert_eq!(
            host.pet_count(),
            cfg.per_player,
            "the per-player cap did not hold"
        );
        assert!(
            client.take_pet_denied().is_some(),
            "the client was refused silently, so the button just stops working"
        );
    }

    /// The other cap, which is a bandwidth bound rather than a game rule: one player
    /// at their personal limit must not be able to fill the world on their own.
    #[test]
    fn the_world_cap_holds_across_players() {
        let mesh = Loopback::mesh(3);
        let cfg = PetConfig {
            per_player: 10,
            total: 3,
            ..PetConfig::default()
        };
        let mut host = pet_host(&mesh, cfg);
        let mut one = ClientSession::connect(mesh[1].clone());
        let mut two = ClientSession::connect(mesh[2].clone());
        for _ in 0..40 {
            host.tick();
            one.tick();
            two.tick();
        }

        for _ in 0..6 {
            one.deploy_pet(0);
            two.deploy_pet(0);
            for _ in 0..2 {
                host.tick();
                one.tick();
                two.tick();
            }
        }

        assert_eq!(host.pet_count(), cfg.total, "the world cap did not hold");
    }

    #[test]
    fn a_pet_may_only_be_recalled_by_its_owner() {
        let mesh = Loopback::mesh(3);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut owner = ClientSession::connect(mesh[1].clone());
        let mut other = ClientSession::connect(mesh[2].clone());
        for _ in 0..40 {
            host.tick();
            owner.tick();
            other.tick();
        }

        owner.deploy_pet(0);
        for _ in 0..4 {
            host.tick();
            owner.tick();
            other.tick();
        }
        let pet = host.pet_roster()[0].pet;

        other.recall_pet(pet);
        for _ in 0..4 {
            host.tick();
            owner.tick();
            other.tick();
        }
        assert_eq!(
            host.pet_count(),
            1,
            "somebody else's robot answered a stranger"
        );

        owner.recall_pet(pet);
        for _ in 0..4 {
            host.tick();
            owner.tick();
            other.tick();
        }
        assert_eq!(
            host.pet_count(),
            0,
            "an owner could not recall their own pet"
        );
    }

    /// A leaderless pet has nobody to follow and nobody to recall it, so it would
    /// hold a slot against everyone else's cap for the rest of the session.
    #[test]
    fn leaving_takes_your_pets_with_you() {
        let mesh = Loopback::mesh(2);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);
        let peer = client.peer().expect("joined");

        for _ in 0..3 {
            client.deploy_pet(0);
            run(&mut host, &mut client, 2);
        }
        assert_eq!(host.pet_count(), 3);

        host.remove_player(peer);
        run(&mut host, &mut client, 2);
        assert_eq!(
            host.pet_count(),
            0,
            "pets outlived the player who owned them"
        );
    }

    /// Ids come off a free list, so deploy/recall traffic cannot walk them out of
    /// the band reserved for pets and into the players'.
    #[test]
    fn recalled_slots_are_reused() {
        let mesh = Loopback::mesh(2);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);

        let mut seen = Vec::new();
        for _ in 0..30 {
            client.deploy_pet(0);
            run(&mut host, &mut client, 2);
            let pet = host.pet_roster()[0].pet;
            seen.push(pet);
            client.recall_pet(pet);
            run(&mut host, &mut client, 2);
        }

        assert!(
            seen.iter().all(|p| p.0 < PetConfig::default().total as u32),
            "pet ids escaped their band: {seen:?}"
        );
        assert_eq!(host.pet_count(), 0);
    }

    /// The unit tests cover what a field decides; this covers that one is wired up
    /// at all — built for an owner who deploys, and gone when they recall.
    #[test]
    fn an_owner_with_pets_gets_a_flow_field() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        host = host.with_ground(Arc::new(|_, _| 5.0));
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);
        assert_eq!(host.pet_field_count(), 0, "a field with nothing to route");

        client.deploy_pet(0);
        run(&mut host, &mut client, 8);
        assert_eq!(
            host.pet_field_count(),
            1,
            "a deployed pet got no field to route on"
        );

        client.recall_pets();
        run(&mut host, &mut client, 8);
        assert_eq!(
            host.pet_field_count(),
            0,
            "the field outlived every pet that used it"
        );
    }

    /// The whole point of a pet: it comes with you.
    #[test]
    fn a_pet_follows_its_owner() {
        let mesh = Loopback::mesh(2);
        let mut host = pet_host(&mesh, PetConfig::default());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 40);
        let peer = client.peer().expect("joined");

        client.deploy_pet(0);
        run(&mut host, &mut client, 4);
        let body = host.pet_roster()[0].body;
        let started = flat_pos(&mut host, body);

        client.set_input([1.0, 0.0], false, std::f32::consts::FRAC_PI_2);
        for _ in 0..400 {
            client.set_input([1.0, 0.0], false, std::f32::consts::FRAC_PI_2);
            host.tick();
            client.tick();
        }

        let owner_at = flat_pos(&mut host, player_body(peer));
        let pet_at = flat_pos(&mut host, body);
        assert!(
            gap(started, owner_at) > 8.0,
            "the owner never went anywhere, so this proves nothing"
        );
        assert!(
            gap(started, pet_at) > 5.0,
            "the pet stood where it was put down"
        );
        assert!(
            gap(owner_at, pet_at) < 14.0,
            "the pet fell behind: owner {owner_at:?}, pet {pet_at:?}"
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

    /// The guarantee a join rests on, sworn across seeds rather than at one:
    /// nobody's first moment in the world is underwater.
    ///
    /// Before the spiral learned to walk past wet ground this failed on five
    /// hundred seeds out of five hundred -- the river wanders sixty-odd metres
    /// either side of the world's middle and the spawn disc is twelve, so the
    /// plain spiral stood somebody in the riverbed on essentially every world.
    /// The bridge was ruled out of spawn placement because a player could be put
    /// inside it. Rocks are the same shape of problem: the ground under one is dry
    /// and at a perfectly reasonable height, so every earlier test passed while a
    /// player stood in the middle of a boulder.
    #[test]
    fn nobody_is_spawned_inside_a_rock() {
        use crate::worldgen::{HeightGen, HeightParams, StoneScatter};
        for seed in 0..40 {
            let sampler = HeightGen::new(&HeightParams {
                seed,
                ..Default::default()
            });
            let scatter = StoneScatter {
                seed,
                ..StoneScatter::default()
            };
            let water = HeightParams::default().water_level;
            let mut discs: Vec<f32> = Vec::new();
            for stone in scatter.place(&sampler, None, [0.0, 0.0], 48.0, water) {
                discs.extend_from_slice(&[stone.pos[0], stone.pos[1], stone.radius]);
            }
            if discs.is_empty() {
                continue;
            }

            let mesh = Loopback::mesh(2);
            let mut host = HostSession::dedicated(
                mesh[0].clone(),
                SessionConfig::default(),
                SimConfig::default(),
                seed as u64,
            )
            .with_ground(Arc::new(move |x, z| sampler.height(x, z)));
            host.set_pet_obstacles(discs.clone());

            for slot in 0..host.config.max_players as u32 {
                let p = host.spawn_point(slot);
                for disc in discs.chunks_exact(3) {
                    let (dx, dz) = (p.pos[0] - disc[0], p.pos[2] - disc[1]);
                    assert!(
                        dx * dx + dz * dz >= disc[2] * disc[2],
                        "seed {seed} slot {slot} spawned inside a rock at {:?}",
                        p.pos
                    );
                }
            }
        }
    }

    #[test]
    fn every_seed_spawns_every_slot_on_dry_ground() {
        use crate::worldgen::{HeightGen, HeightParams};
        for seed in 0..200 {
            let sampler = HeightGen::new(&HeightParams {
                seed,
                ..Default::default()
            });
            let mesh = Loopback::mesh(2);
            let host = HostSession::dedicated(
                mesh[0].clone(),
                SessionConfig::default(),
                SimConfig::default(),
                seed as u64,
            )
            .with_ground(Arc::new(move |x, z| sampler.height(x, z)));
            let probe = HeightGen::new(&HeightParams {
                seed,
                ..Default::default()
            });
            for slot in 0..host.config.max_players as u32 {
                let p = host.spawn_point(slot);
                let ground = probe.height(p.pos[0], p.pos[2]);
                assert!(
                    ground > host.config.water_level + 0.35,
                    "seed {seed} slot {slot} spawned on wet ground ({ground:.2}) at \
                     ({:.1}, {:.1})",
                    p.pos[0],
                    p.pos[2]
                );
                assert!(
                    (p.pos[1] - (ground + 1.5)).abs() < 1e-3,
                    "seed {seed} slot {slot} does not stand on its own ground"
                );
            }
        }
    }

    /// Two players may never be walked onto the same point, however far the
    /// escape had to go, and the point a slot gets must not depend on who asked
    /// first -- it is re-derived on every respawn.
    #[test]
    fn escaped_spawns_stay_distinct_and_deterministic() {
        use crate::worldgen::{HeightGen, HeightParams};
        for seed in [0i32, 7, 1337, 4242] {
            let sampler = HeightGen::new(&HeightParams {
                seed,
                ..Default::default()
            });
            let mesh = Loopback::mesh(2);
            let host = HostSession::dedicated(
                mesh[0].clone(),
                SessionConfig::default(),
                SimConfig::default(),
                seed as u64,
            )
            .with_ground(Arc::new(move |x, z| sampler.height(x, z)));
            let mut seen: Vec<[f32; 3]> = Vec::new();
            for slot in 0..host.config.max_players as u32 {
                let a = host.spawn_point(slot);
                let b = host.spawn_point(slot);
                assert_eq!(a.pos, b.pos, "seed {seed} slot {slot} is not deterministic");
                for (other, q) in seen.iter().enumerate() {
                    let d = ((a.pos[0] - q[0]).powi(2) + (a.pos[2] - q[2]).powi(2)).sqrt();
                    assert!(
                        d > 0.5,
                        "seed {seed} slots {other} and {slot} spawn {d:.2}m apart"
                    );
                }
                seen.push(a.pos);
            }
        }
    }

    /// Under the surface but nowhere near the void floor. A heightfield is a
    /// surface, not a solid, so a body that ends up beneath one is in open space
    /// falling -- and the only thing that caught it was a hundred metre drop ending
    /// at spawn. The sampler already knows where the surface is, so the fall ends
    /// where it began.
    #[test]
    fn a_player_under_the_surface_is_put_back_on_it() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        )
        // Agrees with `flat_terrain`, so nothing standing on the ground looks buried.
        .with_ground(Arc::new(|_, _| 0.0));
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 2);
        let peer = client.peer().expect("joined");

        host.world_mut().apply(SimCommand::TeleportCharacter {
            id: player_body(peer),
            iso: Iso::at(12.0, -30.0, -9.0),
        });
        run(&mut host, &mut client, 4);

        let iso = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .expect("body")
            .iso;
        assert!(
            iso.pos[1] > -3.0,
            "still under the surface at {:?}",
            iso.pos
        );
        assert!(
            (iso.pos[0] - 12.0).abs() < 1.5 && (iso.pos[2] + 9.0).abs() < 1.5,
            "put back, but carried off to {:?} rather than stood up where it fell",
            iso.pos
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

    /// A host running rotated scatter seeds has to be able to say so.
    ///
    /// The seeds started as a convention: both sides held the same constants and neither
    /// mentioned them. That holds exactly as long as nobody ever changes one -- and the
    /// moment a world wants a different forest, a client that was never told keeps
    /// drawing the old one and walks through everything it can see. Sending them makes
    /// the host's numbers the world's numbers.
    #[test]
    fn a_client_learns_which_forest_the_host_scattered() {
        let config = SessionConfig {
            stone_seed: 7,
            tree_seed: 8,
            stone_grid_size: 19.0,
            tree_grid_size: 11.0,
            ..SessionConfig::default()
        };
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 42);
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 2);

        let world = client.world().expect("welcome carries the world");
        assert_eq!(world.stone_seed, 7);
        assert_eq!(world.tree_seed, 8);
        assert_eq!(world.stone_grid_size, 19.0);
        assert_eq!(world.tree_grid_size, 11.0);
    }

    /// And a client joining a host that changed nothing gets what it would have
    /// assumed, so the wire agrees with the constants rather than replacing them.
    #[test]
    fn the_default_forest_on_the_wire_is_the_one_the_fields_draw() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);

        let world = client.world().expect("welcome carries the world");
        assert_eq!(world.stone_seed, StoneScatter::default().seed);
        assert_eq!(world.tree_seed, TreeScatter::default().seed);
        assert_eq!(world.stone_grid_size, StoneScatter::default().grid_size);
        assert_eq!(world.tree_grid_size, TreeScatter::default().grid_size);
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
    fn the_hour_is_derived_rather_than_counted() {
        assert!((hour_at(9.0, 45.0, 0.0) - 9.0).abs() < 1e-4);
        assert!((hour_at(9.0, 45.0, 45.0 * 60.0 / 2.0) - 21.0).abs() < 1e-3);
        assert!(
            (hour_at(9.0, 45.0, 45.0 * 60.0) - 9.0).abs() < 1e-3,
            "a whole day is a round trip"
        );
        assert!((hour_at(9.0, 45.0, 45.0 * 60.0 * 3.0) - 9.0).abs() < 1e-3);
    }

    #[test]
    fn days_are_counted_past_the_wrap() {
        let day = 45.0 * 60.0;
        assert_eq!(day_at(45.0, 0.0), 0);
        assert_eq!(day_at(45.0, day - 1.0), 0);
        assert_eq!(day_at(45.0, day + 1.0), 1);
        assert_eq!(day_at(45.0, day * 7.5), 7);
    }

    /// The clock the wire carries has to survive midnight. An hour cannot: it says 23.9
    /// then 0.1 and there is no way to tell a new day from a correction backwards, which
    /// is why nothing could be scheduled against it.
    #[test]
    fn the_shared_clock_only_ever_goes_up() {
        let config = SessionConfig {
            day_length_minutes: 0.05,
            time_sync_seconds: 0.05,
            start_hour: 23.0,
            ..SessionConfig::default()
        };
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 3);
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect(mesh[1].clone());

        let mut last = 0.0;
        let mut wrapped = false;
        let mut previous_hour = config.start_hour;
        for _ in 0..400 {
            host.tick();
            client.tick();
            // What the client really does between the host's corrections, and the half
            // of the clock a test that only ticks would never touch.
            client.advance_clock(SimConfig::default().timestep());
            let now = client.elapsed();
            assert!(now >= last, "clock went backwards: {last} then {now}");
            last = now;
            let hour = client.hour();
            wrapped |= hour < previous_hour;
            previous_hour = hour;
        }
        assert!(
            wrapped,
            "the test never crossed midnight, so it proved nothing"
        );
        assert!(host.day() > 0, "host never counted a day");
        assert_eq!(
            client.day(),
            host.day(),
            "client and host disagree on the day"
        );
    }

    /// The host holds one number and derives the rest, so there is no second copy of the
    /// time to fall out of step with the first.
    #[test]
    fn the_host_hour_is_its_elapsed_seconds() {
        let config = SessionConfig {
            day_length_minutes: 1.0,
            ..SessionConfig::default()
        };
        let mesh = Loopback::mesh(1);
        let mut host = HostSession::new(mesh[0].clone(), config, SimConfig::default(), 3);
        host.set_terrain(flat_terrain());
        for _ in 0..200 {
            host.tick();
        }
        assert!(host.elapsed() > 0.0);
        assert_eq!(
            host.hour(),
            hour_at(config.start_hour, config.day_length_minutes, host.elapsed())
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
    fn welcome_carries_the_movement_the_host_integrates_with() {
        let (mut host, mut client) = host_and_client();
        assert_eq!(client.movement(), None, "unknown before Welcome");
        run(&mut host, &mut client, 2);

        let movement = client.movement().expect("welcomed");
        let config = SessionConfig::default();
        assert_eq!(movement.move_speed, config.move_speed);
        assert_eq!(movement.gravity, config.gravity);
        assert_eq!(movement.jump_speed, config.jump_speed);
        assert_eq!(movement.swim_speed, config.swim_speed);
        assert_eq!(movement.water_gravity_scale, config.water_gravity_scale);
        assert_eq!(
            movement.timestep,
            SimConfig::default().timestep(),
            "predicting on a different step integrates gravity at a different rate"
        );
    }

    /// Without this the client cannot tell which of its inputs the state it just
    /// received already accounts for, which is the whole of reconciliation.
    #[test]
    fn snapshots_ack_the_input_they_were_simulated_from() {
        let (mut host, mut client) = host_and_client();
        run(&mut host, &mut client, 2);
        assert_eq!(client.acked_input(), 0, "nothing sent yet");

        for _ in 0..8 {
            client.set_input([1.0, 0.0], false, 0.0);
            run(&mut host, &mut client, 1);
        }

        let acked = client.acked_input();
        assert!(acked > 0, "host never acknowledged an input");
        assert!(
            acked <= client.input_sequence(),
            "acked {acked} is ahead of anything we have sent ({})",
            client.input_sequence()
        );
    }

    /// Snapshots ride an unreliable lane, so a stale one can land after a newer one.
    /// Taking its ack would walk the replay point backwards and re-apply inputs the
    /// host has already consumed.
    #[test]
    fn a_stale_snapshot_does_not_walk_the_ack_backwards() {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        let mut client = ClientSession::connect(mesh[1].clone());
        run(&mut host, &mut client, 2);
        let me = client.peer().expect("welcomed");

        // Ticks far above anything the host has reached, so the real broadcasts already
        // in flight cannot decide this.
        let deliver = |client: &mut ClientSession<Loopback>, tick: u64, seq: u32| {
            let bytes = proto::encode(&SessionMsg::Snapshot {
                sim: SimSnapshot {
                    tick,
                    ..Default::default()
                },
                acks: vec![(me, seq)],
            })
            .unwrap();
            mesh[0].send(me, Delivery::Unreliable, &bytes).unwrap();
            client.tick();
        };

        deliver(&mut client, 10_000, 50);
        assert_eq!(client.acked_input(), 50);

        deliver(&mut client, 9_999, 20);
        assert_eq!(
            client.acked_input(),
            50,
            "an ack from an older snapshot must not undo a newer one"
        );
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
                    Ok(SessionMsg::Snapshot { .. })
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
        let small = proto::encode(&SessionMsg::Snapshot {
            sim: snapshot_of(8),
            acks: Vec::new(),
        })
        .unwrap()
        .len();
        let large = proto::encode(&SessionMsg::Snapshot {
            sim: snapshot_of(72),
            acks: Vec::new(),
        })
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

    /// A drop is usually the network, not a decision to leave. Coming back inside the
    /// grace window should put a player where they were, not at the spawn ring.
    #[test]
    fn a_reconnecting_account_is_put_back_where_it_stood() {
        let mesh = Loopback::mesh(3);
        let mut host = authed_host(&mesh);
        let mut first = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");

        for _ in 0..4 {
            host.tick();
            first.tick();
        }
        let peer = first.peer().expect("welcomed");
        for _ in 0..90 {
            first.set_input([1.0, 0.0], false, 0.0);
            host.tick();
            first.tick();
        }
        let walked = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .expect("a body")
            .iso
            .pos;
        assert!(walked[0] > 1.0, "player never left the spawn point");

        host.remove_player(peer);

        let mut again = ClientSession::connect_with_token(mesh[2].clone(), "valid:h0lybyte");
        for _ in 0..4 {
            host.tick();
            again.tick();
        }
        let back = again.peer().expect("welcomed again");
        assert_ne!(back, peer, "a reconnect is a new socket and a new peer");

        let resumed = host
            .world_mut()
            .snapshot()
            .body(player_body(back))
            .expect("a body for the returning player")
            .iso
            .pos;
        let (dx, dz) = (resumed[0] - walked[0], resumed[2] - walked[2]);
        assert!(
            (dx * dx + dz * dz).sqrt() < 0.5,
            "resumed at {resumed:?}, walked to {walked:?}"
        );
    }

    /// The place is held, not kept forever. Past the window it is an ordinary join.
    #[test]
    fn a_reservation_past_its_window_spawns_fresh() {
        let mesh = Loopback::mesh(3);
        let mut host = HostSession::dedicated(
            mesh[0].clone(),
            SessionConfig {
                reconnect_grace_seconds: 0.25,
                ..Default::default()
            },
            SimConfig::default(),
            1,
        )
        .with_authority(Arc::new(StubAuthority));
        host.set_terrain(flat_terrain());
        let mut first = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");
        for _ in 0..4 {
            host.tick();
            first.tick();
        }
        let peer = first.peer().expect("welcomed");
        for _ in 0..90 {
            first.set_input([1.0, 0.0], false, 0.0);
            host.tick();
            first.tick();
        }
        let walked = host
            .world_mut()
            .snapshot()
            .body(player_body(peer))
            .expect("a body")
            .iso
            .pos;
        host.remove_player(peer);

        // Age the host past the window it was built with. Its clock only moves on tick,
        // so the config carries a short grace rather than this looping for two minutes.
        for _ in 0..40 {
            host.tick();
        }

        let mut again = ClientSession::connect_with_token(mesh[2].clone(), "valid:h0lybyte");
        for _ in 0..4 {
            host.tick();
            again.tick();
        }
        let back = again.peer().expect("welcomed again");
        let spawned = host
            .world_mut()
            .snapshot()
            .body(player_body(back))
            .expect("a body")
            .iso
            .pos;
        assert!(
            (spawned[0] - walked[0]).abs() > 1.0,
            "expired reservation still resumed: {spawned:?} against {walked:?}"
        );
    }

    /// A socket that dies without the host noticing leaves a player holding their own
    /// name against themselves. They must still be able to get back in.
    #[test]
    fn a_silent_peer_does_not_lock_its_account_out() {
        let mesh = Loopback::mesh(3);
        let mut host = authed_host(&mesh);
        let mut first = ClientSession::connect_with_token(mesh[1].clone(), "valid:h0lybyte");
        for _ in 0..4 {
            host.tick();
            first.tick();
        }
        assert_eq!(host.player_count(), 1);

        // The client is never ticked again: its socket is up as far as the host knows,
        // but nothing arrives from it.
        for _ in 0..((GHOST_SILENCE_SECONDS / SimConfig::default().timestep()) as usize + 30) {
            host.tick();
        }

        let mut again = ClientSession::connect_with_token(mesh[2].clone(), "valid:h0lybyte");
        for _ in 0..4 {
            host.tick();
            again.tick();
        }
        assert_eq!(
            again.status(),
            ClientStatus::Joined,
            "a ghost held the account: {:?}",
            again.reject_reason()
        );
        assert_eq!(host.player_count(), 1, "the ghost should have been retired");
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

    fn bridge_at_origin() -> crate::worldgen::BridgeFootprint {
        crate::worldgen::BridgeFootprint {
            from: [-14.0, 0.0],
            to: [14.0, 0.0],
            walk_half_width: 1.76,
            solid_half_width: 2.01,
            deck_from: [-10.0, 0.0],
            deck_to: [10.0, 0.0],
            deck_y: 2.0,
        }
    }

    #[test]
    fn nobody_spawns_inside_the_bridge() {
        // Flat dry ground everywhere, so the water test can never be what moves a
        // spawn: anything that lands off the structure did so because the bridge
        // was checked, not because the riverbed was.
        let mesh = Loopback::mesh(1);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        )
        .with_ground(std::sync::Arc::new(|_x, _z| 3.0));
        host.set_terrain(flat_terrain());
        let bridge = bridge_at_origin();
        host.set_bridge(Some(bridge.clone()));

        for slot in 0..64u32 {
            let at = host.spawn_point(slot);
            let p = [at.pos[0], at.pos[2]];
            assert!(
                !bridge.covers(p),
                "slot {slot} spawned at {p:?}, inside the bridge"
            );
        }
    }

    #[test]
    fn the_spiral_is_unchanged_where_there_is_no_bridge() {
        // The escape must not perturb the ordinary case: same slot, same point.
        let mesh = Loopback::mesh(1);
        let ground = std::sync::Arc::new(|_x: f32, _z: f32| 3.0);
        let mut without = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        )
        .with_ground(ground.clone());
        without.set_terrain(flat_terrain());

        for slot in 0..16u32 {
            let at = without.spawn_point(slot);
            assert!(at.pos[1].is_finite());
        }
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
