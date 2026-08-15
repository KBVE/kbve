//! Player-deployed pet robots: the roster, the caps, and the steering that drives them.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::transport::PeerId;
use crate::rapier::sim3d::{
    BodyId, CharacterDesc, Iso, ShapeDesc, SimCommand, SimSnapshot, SimWorld,
};
use crate::steering::{Config as SteerConfig, Mode, Neighbour, Patrol, Sense, Vec2};

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
            steering: SteerConfig {
                radius: 0.9,
                speed: 3.2,
                max_speed: 6.0,
                separation: 5.0,
                personal_space: 2.0,
                formation_distance: 3.5,
                formation_spacing: 2.4,
                formation_columns: 3,
                rank_depth: 2.4,
                hold_radius: 6.0,
                sprint_distance: 10.0,
                roam_radius: 8.0,
                ..SteerConfig::default()
            },
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
    pub fn drive(
        &mut self,
        snapshot: &SimSnapshot,
        leaders: &HashMap<PeerId, LeaderState>,
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

            let sense = Sense {
                position: state.position,
                facing: pet.facing,
                velocity: state.velocity,
                travelled,
                neighbours,
                leader: leader.map(|l| l.position),
                leader_facing: leader.map(|l| l.facing).unwrap_or([0.0, 1.0]),
                leader_speed: leader.map(|l| l.speed).unwrap_or(0.0),
                route: None,
                route_blocked: false,
            };

            let step = pet.patrol.step(&sense, dt);
            pet.mode = step.mode;
            pet.last_pos = state.position;
            if step.face[0].abs() + step.face[1].abs() > 1e-4 {
                pet.facing = step.face;
            }

            let body = snapshot.body(pet_body(*id));
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
