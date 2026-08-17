//! Player-deployed pet robots: the roster, the caps, and the steering that drives them.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::transport::PeerId;
use crate::rapier::sim3d::{
    BodyId, CharacterDesc, Iso, ShapeDesc, SimCommand, SimSnapshot, SimWorld,
};
use crate::steering::field::{Deck, Field, Grid};
use crate::steering::{Config as SteerConfig, Mode, Neighbour, Patrol, Sense, Vec2};
use crate::worldgen::BridgeFootprint;

/// Samples ground height at a world position.
///
/// The host has no terrain of its own — with streaming on it never even sees a
/// `SetTerrain` — so whoever owns the generator supplies this.
pub type GroundSampler = Arc<dyn Fn(f32, f32) -> f32 + Send + Sync>;

/// Server-assigned handle for one deployed pet, stable until it is recalled.
#[derive(
    Clone, Copy, Debug, Default, Eq, PartialEq, Hash, PartialOrd, Ord, Serialize, Deserialize,
)]
pub struct PetId(pub u32);

/// Pets sit above the player band, which itself sits above every world prop.
pub const PET_BODY_BASE: u32 = 2_000_000;

/// Body a pet's collider is registered under.
pub fn pet_body(pet: PetId) -> BodyId {
    BodyId(PET_BODY_BASE + pet.0)
}

/// One entry of the pet list, which is how a client learns whose body is whose.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PetInfo {
    pub pet: PetId,
    pub owner: PeerId,
    pub body: BodyId,
    /// Which chassis to draw. The server never interprets it.
    pub kind: u8,
}

/// Why a deploy did not happen.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeployError {
    /// This player is already at their personal limit.
    PerPlayer(usize),
    /// The world as a whole is at its limit.
    World(usize),
    /// The owner has no body to be placed next to.
    NoOwner,
}

impl DeployError {
    /// Wording a player can act on, sent back as `PetDenied`.
    pub fn reason(self) -> String {
        match self {
            Self::PerPlayer(n) => format!("you already have {n} robots deployed"),
            Self::World(n) => format!("this world is at its limit of {n} robots"),
            Self::NoOwner => "you are not in this world".to_owned(),
        }
    }
}

/// Caps and movement tuning for deployed pets.
#[derive(Clone, Copy, Debug)]
pub struct PetConfig {
    /// Hard ceiling per player. A game rule.
    pub per_player: usize,
    /// Hard ceiling for the whole session, which is a resource bound rather than a
    /// game rule: pets ride in every snapshot, so they cost bandwidth per player.
    pub total: usize,
    /// Radius of the ring a pet is put down on, measured from its owner.
    pub deploy_radius: f32,
    /// Capsule radius of a pet's collider.
    pub capsule_radius: f32,
    pub capsule_half_height: f32,
    /// What avoidance keeps clear, which is wider than the capsule because the
    /// chassis is wider than the proxy that carries it.
    pub body_radius: f32,
    pub gravity: f32,
    /// Below this, gravity is buoyant and descent is capped.
    pub water_level: f32,
    pub water_gravity_scale: f32,
    pub swim_speed: f32,
    /// Fall past this and a pet is considered lost, and is recalled.
    pub void_y: f32,
    pub steering: SteerConfig,
}

impl Default for PetConfig {
    fn default() -> Self {
        Self {
            per_player: 10,
            total: 96,
            deploy_radius: 3.0,
            capsule_radius: 0.35,
            capsule_half_height: 0.6,
            body_radius: 0.9,
            gravity: -9.81,
            water_level: -1.4,
            water_gravity_scale: 0.12,
            swim_speed: 2.0,
            void_y: -100.0,
            steering: SteerConfig::pet(),
        }
    }
}

/// Where an owner is and how they are moving, which is all a follower needs.
#[derive(Clone, Copy, Debug, Default)]
pub struct LeaderState {
    pub position: Vec2,
    pub facing: Vec2,
    pub speed: f32,
}

/// What a flow field says about the ground under one pet.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Route {
    /// Which way to walk from here.
    pub direction: Vec2,
    /// The field looked and there is no way through to the owner at all, which is
    /// a different answer from having no field: walking straight at them then is
    /// how a pet ends up leaning on a riverbank until they move.
    pub blocked: bool,
}

/// How the per-owner flow fields are sized, stamped and paced.
#[derive(Clone, Copy, Debug)]
pub struct FieldConfig {
    /// Size of a grid cell, which decides both precision and cost.
    pub cell: f32,
    /// Half-width of the square kept around an owner.
    ///
    /// Local rather than world-sized: pets never leave their owner, so a window is
    /// a fraction of the cells a whole-map field would integrate, and there is one
    /// of these per player.
    pub window: f32,
    /// How far an owner may drift from the middle before the window is moved and
    /// everything restamped.
    pub recentre_slack: f32,
    /// How far the goal may move before the field is integrated again.
    pub goal_slack: f32,
    /// Obstacles grow by this, so a route fits a pet rather than a point.
    pub clearance: f32,
    /// Ground steeper than this is not walkable, as height change per unit across.
    pub max_slope: f32,
    pub water_level: f32,
    /// Cell density at which rocks stop being a cost and become a wall.
    pub stone_block_ratio: f32,
    pub stone_cost: f32,
    /// The crossing is opened but not made attractive, so a route only takes it
    /// when there is no way round.
    pub bridge_cost: u8,
    /// How far under the deck still counts as being on it.
    pub deck_drop: f32,
    /// Owners re-stamped or re-integrated per tick.
    ///
    /// One keeps the worst case to a single field's work however many players are
    /// on, which is the property that makes this affordable at sixteen.
    pub rebuilds_per_tick: usize,
    /// Radii searched for walkable ground when a pet is stuck inside a blocked
    /// region. The widest has to clear the river plus the clearance inflation.
    pub escape_rings: [f32; 4],
    pub escape_samples: usize,
}

impl Default for FieldConfig {
    fn default() -> Self {
        Self {
            cell: 2.0,
            window: 64.0,
            recentre_slack: 24.0,
            goal_slack: 4.0,
            clearance: 1.2,
            max_slope: 1.1,
            water_level: -1.4,
            stone_block_ratio: 0.2,
            stone_cost: 220.0,
            bridge_cost: 40,
            deck_drop: 1.5,
            rebuilds_per_tick: 1,
            escape_rings: [4.0, 8.0, 14.0, 22.0],
            escape_samples: 12,
        }
    }
}

struct OwnerField {
    field: Field,
    /// Middle of the window in world space.
    centre: Vec2,
    /// False after the window moved or the obstacles changed, which is what says
    /// the costs have to be laid down again rather than only re-integrated.
    stamped: bool,
}

/// One local flow field per player who has pets out.
///
/// Per owner rather than per pet: everything a player deployed wants the same
/// place, so they share one integration. That is the property that makes this
/// scale where per-agent pathing does not.
pub struct PetFields {
    cfg: FieldConfig,
    fields: HashMap<PeerId, OwnerField>,
    ground: Option<GroundSampler>,
    /// Flat `x, z, radius` triples for every rock currently collidable.
    obstacles: Vec<f32>,
    bridge: Option<BridgeFootprint>,
    /// Where the round robin got to, so no owner starves behind another.
    cursor: usize,
}

impl PetFields {
    pub fn new(cfg: FieldConfig) -> Self {
        Self {
            cfg,
            fields: HashMap::new(),
            ground: None,
            obstacles: Vec::new(),
            bridge: None,
            cursor: 0,
        }
    }

    pub fn config(&self) -> &FieldConfig {
        &self.cfg
    }

    /// Installs the height sampler. Without one no field is ever built, and pets
    /// fall back to steering straight at their owner.
    pub fn set_ground(&mut self, ground: GroundSampler) {
        self.ground = Some(ground);
        self.restamp_all();
    }

    /// Replaces the obstacle set, as flat `x, z, radius` triples.
    pub fn set_obstacles(&mut self, discs: Vec<f32>) {
        if discs == self.obstacles {
            return;
        }
        self.obstacles = discs;
        self.restamp_all();
    }

    pub fn set_bridge(&mut self, bridge: Option<BridgeFootprint>) {
        if bridge == self.bridge {
            return;
        }
        self.bridge = bridge;
        self.restamp_all();
    }

    pub fn len(&self) -> usize {
        self.fields.len()
    }

    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    fn restamp_all(&mut self) {
        for owner in self.fields.values_mut() {
            owner.stamped = false;
        }
    }

    fn new_field(&self, centre: Vec2) -> OwnerField {
        let cell = self.cfg.cell.max(0.25);
        let cells = ((self.cfg.window * 2.0) / cell).ceil().max(1.0) as usize;
        let origin = [centre[0] - self.cfg.window, centre[1] - self.cfg.window];
        OwnerField {
            field: Field::new(Grid::new(origin, cell, cells, cells)),
            centre,
            stamped: false,
        }
    }

    /// Lays every cost down: the ground, the rocks, and the crossing.
    ///
    /// Order is the whole of it. The structure is closed before the clearance is
    /// grown, so routes go round the abutments rather than into the side of them,
    /// and the walkway is cut back out afterwards — past both ends, because
    /// clearance grew beyond them too and a walkway reopened to exactly the length
    /// that was closed is a sealed tube nothing can get into.
    fn stamp(&self, owner: &mut OwnerField) {
        let Some(ground) = self.ground.as_ref() else {
            return;
        };
        owner.field.grid.fill(1);
        let sampler = ground.clone();
        owner.field.stamp_ground(
            move |x, z| sampler(x, z),
            self.cfg.water_level,
            self.cfg.max_slope,
        );

        if !self.obstacles.is_empty() {
            owner.field.grid.stamp_coverage(
                &self.obstacles,
                self.cfg.stone_block_ratio,
                self.cfg.stone_cost,
            );
        }

        if let Some(bridge) = self.bridge {
            owner
                .field
                .grid
                .block_path(bridge.from, bridge.to, bridge.solid_half_width);
        }

        owner.field.grid.inflate(self.cfg.clearance);

        if let Some(bridge) = self.bridge {
            let span = [bridge.to[0] - bridge.from[0], bridge.to[1] - bridge.from[1]];
            let len = (span[0] * span[0] + span[1] * span[1]).sqrt().max(1e-4);
            let reach = self.cfg.clearance + self.cfg.cell;
            let mouth = [span[0] / len * reach, span[1] / len * reach];
            owner.field.grid.open_path(
                [bridge.from[0] - mouth[0], bridge.from[1] - mouth[1]],
                [bridge.to[0] + mouth[0], bridge.to[1] + mouth[1]],
                bridge.walk_half_width,
                self.cfg.bridge_cost.clamp(1, 254),
            );
            owner.field.set_deck(Some(Deck {
                from: bridge.deck_from,
                to: bridge.deck_to,
                half_width: bridge.walk_half_width + self.cfg.clearance,
                surface_y: bridge.deck_y,
                drop: self.cfg.deck_drop,
            }));
        } else {
            owner.field.set_deck(None);
        }

        owner.stamped = true;
    }

    /// Brings the field set in line with who has pets out, doing at most
    /// `rebuilds_per_tick` fields' worth of work.
    pub fn update(&mut self, leaders: &HashMap<PeerId, LeaderState>, owners: &HashSet<PeerId>) {
        self.fields
            .retain(|peer, _| owners.contains(peer) && leaders.contains_key(peer));
        if self.ground.is_none() {
            return;
        }

        let mut order: Vec<PeerId> = owners
            .iter()
            .copied()
            .filter(|p| leaders.contains_key(p))
            .collect();
        order.sort_unstable();
        if order.is_empty() {
            self.cursor = 0;
            return;
        }

        let mut budget = self.cfg.rebuilds_per_tick.max(1);
        for step in 0..order.len() {
            if budget == 0 {
                break;
            }
            let peer = order[(self.cursor + step) % order.len()];
            let goal = leaders[&peer].position;

            let drifted = self
                .fields
                .get(&peer)
                .is_none_or(|f| distance(goal, f.centre) > self.cfg.recentre_slack);
            if drifted {
                let fresh = self.new_field(goal);
                self.fields.insert(peer, fresh);
            }

            let mut owner = self.fields.remove(&peer).expect("just inserted or present");
            let mut worked = false;
            if !owner.stamped {
                self.stamp(&mut owner);
                owner.field.build(goal);
                worked = true;
            } else if owner.field.rebuild_if_moved(goal, self.cfg.goal_slack) {
                worked = true;
            }
            self.fields.insert(peer, owner);
            if worked {
                budget -= 1;
            }
        }
        self.cursor = (self.cursor + 1) % order.len();
    }

    /// What this owner's field says about a pet standing at `at`.
    ///
    /// `None` means no field covers it, where steering straight at the owner is the
    /// right answer. A blocked route is not that.
    ///
    /// Being under the span counts as unreachable: the grid is flat, so the deck
    /// and the riverbed beneath it share a cell, and every route handed out down
    /// there is for a body one storey up.
    pub fn route(&self, owner: PeerId, at: [f32; 3]) -> Option<Route> {
        let field = &self.fields.get(&owner)?.field;
        let flat = [at[0], at[2]];
        if field.grid.outside(flat) {
            return None;
        }
        let reachable = field.distance_at(flat).is_finite() && !field.under_deck(at);
        if !reachable
            && let Some(escape) =
                field.escape_route(at, &self.cfg.escape_rings, self.cfg.escape_samples)
        {
            return Some(Route {
                direction: escape,
                blocked: false,
            });
        }
        Some(Route {
            direction: field.direction_at(flat).unwrap_or([0.0, 0.0]),
            blocked: !reachable,
        })
    }
}

fn distance(a: Vec2, b: Vec2) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

struct Pet {
    owner: PeerId,
    kind: u8,
    patrol: Patrol,
    vel_y: f32,
    last_pos: Vec2,
    facing: Vec2,
    mode: Mode,
}

/// Every pet in the session, and the caps that decide whether there may be another.
pub struct PetRegistry {
    cfg: PetConfig,
    pets: HashMap<PetId, Pet>,
    /// Slots freed by a recall, reused before any new one is handed out so ids stay
    /// inside the band whatever the deploy/recall traffic looks like.
    free: Vec<u32>,
    next: u32,
}

impl PetRegistry {
    pub fn new(cfg: PetConfig) -> Self {
        Self {
            cfg,
            pets: HashMap::new(),
            free: Vec::new(),
            next: 0,
        }
    }

    pub fn config(&self) -> &PetConfig {
        &self.cfg
    }

    /// What a pet is doing, for tests and for anything that wants to animate it.
    pub fn mode_of(&self, id: PetId) -> Option<Mode> {
        self.pets.get(&id).map(|p| p.mode)
    }

    /// Which player owns a pet, if it is deployed.
    pub fn owner_of(&self, id: PetId) -> Option<PeerId> {
        self.pets.get(&id).map(|p| p.owner)
    }

    pub fn len(&self) -> usize {
        self.pets.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pets.is_empty()
    }

    /// How many pets this player currently has out.
    pub fn count_of(&self, owner: PeerId) -> usize {
        self.pets.values().filter(|p| p.owner == owner).count()
    }

    /// Pets belonging to one player, in deploy order.
    pub fn ids_of(&self, owner: PeerId) -> Vec<PetId> {
        let mut ids: Vec<PetId> = self
            .pets
            .iter()
            .filter(|(_, p)| p.owner == owner)
            .map(|(id, _)| *id)
            .collect();
        ids.sort_unstable();
        ids
    }

    /// The whole list, sorted, as it goes on the wire.
    pub fn roster(&self) -> Vec<PetInfo> {
        let mut out: Vec<PetInfo> = self
            .pets
            .iter()
            .map(|(id, pet)| PetInfo {
                pet: *id,
                owner: pet.owner,
                body: pet_body(*id),
                kind: pet.kind,
            })
            .collect();
        out.sort_unstable_by_key(|p| p.pet);
        out
    }

    /// Whether another pet may be put down for this owner, without placing one.
    pub fn may_deploy(&self, owner: PeerId) -> Result<(), DeployError> {
        if self.pets.len() >= self.cfg.total {
            return Err(DeployError::World(self.cfg.total));
        }
        let mine = self.count_of(owner);
        if mine >= self.cfg.per_player {
            return Err(DeployError::PerPlayer(self.cfg.per_player));
        }
        Ok(())
    }

    /// Point on the deploy ring for the nth pet an owner puts down.
    pub fn ring_offset(&self, index: usize) -> Vec2 {
        let step = std::f32::consts::TAU / self.cfg.per_player.max(1) as f32;
        let angle = step * index as f32;
        [
            angle.cos() * self.cfg.deploy_radius,
            angle.sin() * self.cfg.deploy_radius,
        ]
    }

    fn take_slot(&mut self) -> Option<PetId> {
        if let Some(slot) = self.free.pop() {
            return Some(PetId(slot));
        }
        if self.next as usize >= self.cfg.total {
            return None;
        }
        let slot = self.next;
        self.next += 1;
        Some(PetId(slot))
    }

    /// Puts a pet down at `iso` and gives it a body.
    pub fn deploy(
        &mut self,
        owner: PeerId,
        kind: u8,
        iso: Iso,
        world: &mut SimWorld,
    ) -> Result<PetId, DeployError> {
        self.may_deploy(owner)?;
        let Some(id) = self.take_slot() else {
            return Err(DeployError::World(self.cfg.total));
        };
        let home = [iso.pos[0], iso.pos[2]];
        let seed = PET_BODY_BASE.wrapping_add(id.0).wrapping_mul(2_654_435_761);
        self.pets.insert(
            id,
            Pet {
                owner,
                kind,
                patrol: Patrol::new(home, seed, self.cfg.steering),
                vel_y: 0.0,
                last_pos: home,
                facing: [0.0, 1.0],
                mode: Mode::Following,
            },
        );
        world.apply(SimCommand::SpawnCharacter {
            id: pet_body(id),
            desc: CharacterDesc {
                iso,
                shape: ShapeDesc::Capsule {
                    half_height: self.cfg.capsule_half_height,
                    radius: self.cfg.capsule_radius,
                },
                ..Default::default()
            },
        });
        Ok(id)
    }

    /// Picks one pet back up, if it belongs to the claimant.
    pub fn recall(&mut self, owner: PeerId, id: PetId, world: &mut SimWorld) -> bool {
        if self.pets.get(&id).map(|p| p.owner) != Some(owner) {
            return false;
        }
        self.drop_pet(id, world);
        true
    }

    /// Picks up everything this player has out, and says how many that was.
    pub fn recall_all(&mut self, owner: PeerId, world: &mut SimWorld) -> usize {
        let ids = self.ids_of(owner);
        for id in &ids {
            self.drop_pet(*id, world);
        }
        ids.len()
    }

    fn drop_pet(&mut self, id: PetId, world: &mut SimWorld) {
        if self.pets.remove(&id).is_some() {
            world.apply(SimCommand::Despawn { id: pet_body(id) });
            self.free.push(id.0);
        }
    }

    /// Steers every pet one tick and queues the motion, returning true when the
    /// roster changed and has to go back out.
    /// Every owner who currently has something deployed.
    pub fn owners(&self) -> HashSet<PeerId> {
        self.pets.values().map(|p| p.owner).collect()
    }

    pub fn drive(
        &mut self,
        snapshot: &SimSnapshot,
        leaders: &HashMap<PeerId, LeaderState>,
        fields: Option<&PetFields>,
        dt: f32,
        world: &mut SimWorld,
    ) -> bool {
        let mut ids: Vec<PetId> = self.pets.keys().copied().collect();
        ids.sort_unstable();

        let mut lost: Vec<PetId> = Vec::new();
        let mut here: HashMap<PetId, Neighbour> = HashMap::with_capacity(ids.len());
        for id in &ids {
            let Some(body) = snapshot.body(pet_body(*id)) else {
                continue;
            };
            if body.iso.pos[1] < self.cfg.void_y {
                lost.push(*id);
                continue;
            }
            here.insert(
                *id,
                Neighbour {
                    position: [body.iso.pos[0], body.iso.pos[2]],
                    velocity: [body.linvel[0], body.linvel[2]],
                    radius: self.cfg.body_radius,
                },
            );
        }

        for id in &lost {
            self.drop_pet(*id, world);
        }

        let mut groups: HashMap<PeerId, Vec<PetId>> = HashMap::new();
        for id in &ids {
            if let Some(pet) = self.pets.get(id) {
                groups.entry(pet.owner).or_default().push(*id);
            }
        }

        for id in &ids {
            let Some(state) = here.get(id).copied() else {
                continue;
            };
            let Some(pet) = self.pets.get_mut(id) else {
                continue;
            };
            let leader = leaders.get(&pet.owner).copied();
            let group = groups.get(&pet.owner).map(|g| g.as_slice()).unwrap_or(&[]);

            let mut neighbours: Vec<Neighbour> = Vec::with_capacity(group.len() + leaders.len());
            for other in group {
                if other == id {
                    continue;
                }
                if let Some(n) = here.get(other) {
                    neighbours.push(*n);
                }
            }
            for (peer, lead) in leaders {
                if *peer == pet.owner {
                    continue;
                }
                neighbours.push(Neighbour {
                    position: lead.position,
                    velocity: [0.0, 0.0],
                    radius: 0.6,
                });
            }

            let slot = group.iter().position(|g| g == id).unwrap_or(0) as i32;
            pet.patrol.slot = slot;
            pet.patrol.count = group.len().max(1) as i32;

            let travelled = {
                let dx = state.position[0] - pet.last_pos[0];
                let dz = state.position[1] - pet.last_pos[1];
                (dx * dx + dz * dz).sqrt()
            };

            let body = snapshot.body(pet_body(*id));
            let route = body
                .and_then(|b| fields.and_then(|f| f.route(pet.owner, b.iso.pos)))
                .filter(|r| r.blocked || r.direction[0].abs() + r.direction[1].abs() > 1e-4);

            let sense = Sense {
                position: state.position,
                facing: pet.facing,
                velocity: state.velocity,
                travelled,
                neighbours,
                leader: leader.map(|l| l.position),
                leader_facing: leader.map(|l| l.facing).unwrap_or([0.0, 1.0]),
                leader_speed: leader.map(|l| l.speed).unwrap_or(0.0),
                route: route.filter(|r| !r.blocked).map(|r| r.direction),
                route_blocked: route.is_some_and(|r| r.blocked),
            };

            let step = pet.patrol.step(&sense, dt);
            pet.mode = step.mode;
            pet.last_pos = state.position;
            if step.face[0].abs() + step.face[1].abs() > 1e-4 {
                pet.facing = step.face;
            }

            let grounded = body.is_some_and(|b| b.grounded);
            let submerged = body.is_some_and(|b| b.iso.pos[1] < self.cfg.water_level);
            if grounded && pet.vel_y < 0.0 {
                pet.vel_y = 0.0;
            }
            if submerged {
                pet.vel_y += self.cfg.gravity * self.cfg.water_gravity_scale * dt;
                pet.vel_y = pet.vel_y.clamp(-self.cfg.swim_speed, self.cfg.swim_speed);
            } else {
                pet.vel_y += self.cfg.gravity * dt;
            }

            world.apply(SimCommand::MoveCharacter {
                id: pet_body(*id),
                translation: [step.wish[0] * dt, pet.vel_y * dt, step.wish[1] * dt],
            });
        }

        !lost.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAND: f32 = 5.0;
    const WATER: f32 = -5.0;

    fn fields<F>(ground: F, cfg: FieldConfig) -> PetFields
    where
        F: Fn(f32, f32) -> f32 + Send + Sync + 'static,
    {
        let mut f = PetFields::new(cfg);
        f.set_ground(Arc::new(ground));
        f
    }

    fn one_leader(peer: PeerId, at: Vec2) -> HashMap<PeerId, LeaderState> {
        HashMap::from([(
            peer,
            LeaderState {
                position: at,
                facing: [0.0, 1.0],
                speed: 0.0,
            },
        )])
    }

    /// Enough passes that a one-per-tick budget has served everybody.
    fn settle(f: &mut PetFields, leaders: &HashMap<PeerId, LeaderState>, owners: &HashSet<PeerId>) {
        for _ in 0..owners.len() * 2 + 2 {
            f.update(leaders, owners);
        }
    }

    /// Steering can sidestep a rock; it cannot route around a river. This is the
    /// whole reason the field exists.
    ///
    /// A channel across the world with its only gap out to the east.
    #[test]
    fn a_route_goes_round_water_rather_than_into_it() {
        let mut f = fields(
            |x, z| {
                if z.abs() < 3.0 && x < 10.0 {
                    WATER
                } else {
                    LAND
                }
            },
            FieldConfig::default(),
        );
        let peer = PeerId(1);
        let leaders = one_leader(peer, [0.0, 20.0]);
        let owners = HashSet::from([peer]);
        settle(&mut f, &leaders, &owners);

        let route = f
            .route(peer, [0.0, LAND, -20.0])
            .expect("a field covers it");
        assert!(
            !route.blocked,
            "the gap is open, so the owner is reachable the long way round"
        );
        assert!(
            route.direction[0] > 0.3,
            "the route walked at the water instead of heading for the gap: {:?}",
            route.direction
        );
    }

    /// A route that cannot be walked is a different answer from having no route,
    /// and the pet has to be told which it is.
    #[test]
    fn an_owner_with_no_way_through_reads_as_blocked() {
        let mut f = fields(
            |x, z| {
                let from_island = (x * x + z * z).sqrt();
                if (6.0..14.0).contains(&from_island) {
                    WATER
                } else {
                    LAND
                }
            },
            FieldConfig::default(),
        );
        let peer = PeerId(1);
        let leaders = one_leader(peer, [0.0, 0.0]);
        let owners = HashSet::from([peer]);
        settle(&mut f, &leaders, &owners);

        let route = f.route(peer, [0.0, LAND, 30.0]).expect("a field covers it");
        assert!(
            route.blocked,
            "a moat was walked across: {:?}",
            route.direction
        );
    }

    fn river(x: f32, _z: f32) -> f32 {
        if x.abs() < 8.0 { WATER } else { LAND }
    }

    fn crossing() -> BridgeFootprint {
        BridgeFootprint {
            from: [-14.0, 0.0],
            to: [14.0, 0.0],
            walk_half_width: 1.76,
            solid_half_width: 2.01,
            deck_from: [-10.0, 0.0],
            deck_to: [10.0, 0.0],
            deck_y: 2.0,
        }
    }

    /// The regression that cost the most last time: the walkway is closed by the
    /// structure stamp, closed again by the clearance grown off both banks, and
    /// reopened past both ends. Reopened end to end instead, it is a sealed tube
    /// nothing can get into and everything is stranded on its own bank.
    #[test]
    fn the_crossing_is_open_from_both_banks() {
        let peer = PeerId(1);
        let leaders = one_leader(peer, [20.0, 0.0]);
        let owners = HashSet::from([peer]);

        let mut without = fields(river, FieldConfig::default());
        settle(&mut without, &leaders, &owners);
        assert!(
            without
                .route(peer, [-20.0, LAND, 0.0])
                .expect("covered")
                .blocked,
            "with no bridge the river must be a wall, or this test proves nothing"
        );

        let mut with = fields(river, FieldConfig::default());
        with.set_bridge(Some(crossing()));
        settle(&mut with, &leaders, &owners);

        let route = with.route(peer, [-20.0, LAND, 0.0]).expect("covered");
        assert!(
            !route.blocked,
            "the far bank could not reach the crossing at all"
        );
        assert!(
            route.direction[0] > 0.3,
            "the route did not head for the bridge: {:?}",
            route.direction
        );
    }

    /// The grid is flat, so the deck and the riverbed beneath it are one cell. A
    /// body underneath is standing in cells the field calls open, and every answer
    /// it gets says carry on -- into a pier.
    #[test]
    fn a_body_under_the_deck_is_steered_out_rather_than_onward() {
        let peer = PeerId(1);
        let leaders = one_leader(peer, [20.0, 0.0]);
        let owners = HashSet::from([peer]);
        let mut f = fields(river, FieldConfig::default());
        f.set_bridge(Some(crossing()));
        settle(&mut f, &leaders, &owners);

        let deck = crossing().deck_y;
        let on_it = f.route(peer, [0.0, deck, 0.0]).expect("covered");
        let under = f.route(peer, [0.0, deck - 3.0, 0.0]).expect("covered");

        assert!(
            on_it.direction[0] > 0.3,
            "a body on the deck should be told to keep crossing: {:?}",
            on_it.direction
        );
        assert_ne!(
            under.direction, on_it.direction,
            "a body under the span was handed the deck's own route"
        );
        assert!(
            under.direction[0].abs() + under.direction[1].abs() > 1e-3,
            "a body under the span was told to stay there"
        );
    }

    /// One integration per tick however many players are on. That ceiling is what
    /// makes sixteen owners affordable, so it is worth asserting rather than
    /// assuming.
    #[test]
    fn only_one_field_is_built_per_tick() {
        let mut f = fields(|_, _| LAND, FieldConfig::default());
        let peers = [PeerId(1), PeerId(2), PeerId(3)];
        let owners: HashSet<PeerId> = peers.iter().copied().collect();
        let leaders: HashMap<PeerId, LeaderState> = peers
            .iter()
            .enumerate()
            .map(|(i, p)| {
                (
                    *p,
                    LeaderState {
                        position: [i as f32 * 40.0, 0.0],
                        facing: [0.0, 1.0],
                        speed: 0.0,
                    },
                )
            })
            .collect();

        f.update(&leaders, &owners);
        assert_eq!(f.len(), 1, "more than one field was built in a single tick");
        f.update(&leaders, &owners);
        assert_eq!(f.len(), 2);
        f.update(&leaders, &owners);
        assert_eq!(f.len(), 3, "the round robin starved an owner");
    }

    /// A field is per owner, and an owner with nothing deployed does not need one.
    #[test]
    fn fields_go_away_with_the_pets_that_needed_them() {
        let mut f = fields(|_, _| LAND, FieldConfig::default());
        let peer = PeerId(1);
        let leaders = one_leader(peer, [0.0, 0.0]);
        settle(&mut f, &leaders, &HashSet::from([peer]));
        assert_eq!(f.len(), 1);

        f.update(&leaders, &HashSet::new());
        assert!(f.is_empty(), "a field outlived every pet that used it");
    }

    /// Pets stay near their owner, so the window follows them rather than covering
    /// a world the field would have to integrate all of.
    #[test]
    fn the_window_follows_an_owner_who_walks_away() {
        let mut f = fields(|_, _| LAND, FieldConfig::default());
        let peer = PeerId(1);
        let owners = HashSet::from([peer]);
        settle(&mut f, &one_leader(peer, [0.0, 0.0]), &owners);

        let far = [500.0, 500.0];
        assert!(
            f.route(peer, [far[0], LAND, far[1]]).is_none(),
            "the window claimed ground it does not cover"
        );

        settle(&mut f, &one_leader(peer, far), &owners);
        let route = f.route(peer, [far[0] - 20.0, LAND, far[1]]);
        assert!(
            route.is_some(),
            "the window did not follow the owner who walked away"
        );
    }
}
