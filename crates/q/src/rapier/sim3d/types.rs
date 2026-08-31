//! Wire types between the app pillar and the physics pillar.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

/// App-assigned body id.
#[derive(
    Clone, Copy, Debug, Default, Eq, PartialEq, Hash, PartialOrd, Ord, Serialize, Deserialize,
)]
pub struct BodyId(pub u32);

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Iso {
    pub pos: [f32; 3],
    /// Quaternion, xyzw order (matches Godot's `Quaternion` component order).
    pub rot: [f32; 4],
}

impl Iso {
    pub const IDENTITY: Self = Self {
        pos: [0.0; 3],
        rot: [0.0, 0.0, 0.0, 1.0],
    };

    pub fn at(x: f32, y: f32, z: f32) -> Self {
        Self {
            pos: [x, y, z],
            ..Self::IDENTITY
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BodyKind {
    Dynamic,
    Fixed,
    /// Driven by the app each tick via [`SimCommand::SetKinematicTarget`]; the solver
    /// moves other bodies out of its way but never pushes it back.
    KinematicPosition,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ShapeDesc {
    Ball {
        radius: f32,
    },
    Cuboid {
        half_extents: [f32; 3],
    },
    /// Upright capsule — the usual character proxy.
    Capsule {
        half_height: f32,
        radius: f32,
    },
    /// Upright cylinder — what a tree trunk is.
    Cylinder {
        half_height: f32,
        radius: f32,
    },
    /// Point cloud the sim hulls itself. Shared behind an `Arc` because the scatter
    /// fields hand the same variant-and-stage cloud to every rock wearing it, and
    /// copying a few hundred of those per rebuild would cost more than the hulling.
    ///
    /// `scale` is carried here rather than in the pose because [`Iso`] has none: every
    /// scattered rock is a different size, and without this each one would need its own
    /// pre-scaled copy of the cloud, which is the copying the `Arc` exists to avoid.
    ConvexHull {
        points: Arc<Vec<[f32; 3]>>,
        scale: [f32; 3],
    },
    /// Concave static geometry, given as a triangle soup — the bridge deck, its kerbs
    /// and its abutments, which no single convex hull describes.
    ///
    /// Static only in practice: rapier can simulate a trimesh body but it has no
    /// interior, so anything dynamic wearing one falls through itself.
    TriMesh {
        vertices: Arc<Vec<[f32; 3]>>,
        indices: Arc<Vec<[u32; 3]>>,
    },
}

#[derive(Clone, Debug)]
pub struct BodyDesc {
    pub kind: BodyKind,
    pub shape: ShapeDesc,
    pub iso: Iso,
    pub restitution: f32,
    pub friction: f32,
    /// Ignored for non-dynamic bodies.
    pub linear_damping: f32,
    /// Dynamic bodies only.
    pub mass: Option<f32>,
    /// Which layers this body is on, and which it collides with, as Godot's
    /// `collision_layer` and `collision_mask` bits.
    ///
    /// Carried because the sim would otherwise collide everything with everything, and
    /// the creatures deliberately pass through each other -- the flow field keeps them
    /// apart, and a solver shoving them as well turns avoidance into a jam.
    pub groups: [u32; 2],
}

impl Default for BodyDesc {
    fn default() -> Self {
        Self {
            kind: BodyKind::Dynamic,
            shape: ShapeDesc::Ball { radius: 0.5 },
            iso: Iso::IDENTITY,
            restitution: 0.0,
            friction: 0.7,
            linear_damping: 0.0,
            mass: None,
            groups: [u32::MAX, u32::MAX],
        }
    }
}

/// A stair/ledge the controller is allowed to step onto instead of being stopped by it.
#[derive(Clone, Copy, Debug)]
pub struct AutostepDesc {
    pub max_height: f32,
    pub min_width: f32,
    /// Whether dynamic bodies count as steppable.
    pub include_dynamic: bool,
}

impl Default for AutostepDesc {
    fn default() -> Self {
        Self {
            max_height: 0.4,
            min_width: 0.2,
            include_dynamic: false,
        }
    }
}

/// A character proxy — the rapier equivalent of a `CharacterBody3D`.
#[derive(Clone, Debug)]
pub struct CharacterDesc {
    pub shape: ShapeDesc,
    pub iso: Iso,
    /// Skin width kept between the character and geometry.
    pub offset: f32,
    pub max_slope_climb_deg: f32,
    /// Slopes steeper than this make the character slide back down.
    pub min_slope_slide_deg: f32,
    pub autostep: Option<AutostepDesc>,
    /// Distance to search downward for ground when walking off a lip, so the character
    /// follows terrain instead of launching off every bump.
    pub snap_to_ground: Option<f32>,
    /// Layer and mask, as [`BodyDesc::groups`].
    pub groups: [u32; 2],
}

impl Default for CharacterDesc {
    fn default() -> Self {
        Self {
            shape: ShapeDesc::Capsule {
                half_height: 0.6,
                radius: 0.35,
            },
            iso: Iso::IDENTITY,
            offset: 0.01,
            max_slope_climb_deg: 45.0,
            min_slope_slide_deg: 30.0,
            autostep: Some(AutostepDesc::default()),
            snap_to_ground: Some(0.4),
            groups: [u32::MAX, u32::MAX],
        }
    }
}

/// A square, origin-centred heightfield spanning `-extent..=extent` on both X and Z.
#[derive(Clone, Debug)]
pub struct TerrainDesc {
    pub heights: Arc<Vec<f32>>,
    pub resolution: u32,
    pub extent: f32,
}

#[derive(Clone, Debug)]
pub enum SimCommand {
    /// Replaces every terrain region with this one, centred on the world origin.
    /// The single-tile contract everything non-streaming relies on.
    SetTerrain(TerrainDesc),
    /// Adds or replaces one terrain region, centred on `origin`. Regions from the
    /// same generator may overlap freely — they agree on height where they meet,
    /// which is what makes a moving window seamless.
    AddTerrainRegion {
        origin: [f32; 2],
        desc: TerrainDesc,
    },
    DropTerrainRegion {
        origin: [f32; 2],
    },
    Spawn {
        id: BodyId,
        desc: BodyDesc,
    },
    /// The scatter fields register their whole collider set in one go. One command per
    /// rock would put a few hundred sends through the channel in a single frame, which
    /// is main-thread work spent on bookkeeping rather than on rendering.
    SpawnMany {
        bodies: Vec<(BodyId, BodyDesc)>,
    },
    Despawn {
        id: BodyId,
    },
    DespawnMany {
        ids: Vec<BodyId>,
    },
    /// Kinematic bodies only.
    SetKinematicTarget {
        id: BodyId,
        iso: Iso,
    },
    /// Dynamic bodies only.
    ApplyImpulse {
        id: BodyId,
        impulse: [f32; 3],
    },
    SetGravity([f32; 3]),
    SpawnCharacter {
        id: BodyId,
        desc: CharacterDesc,
    },
    /// Requested motion for this tick, in world units — gravity included by the caller.
    MoveCharacter {
        id: BodyId,
        translation: [f32; 3],
    },
    /// Puts a character somewhere outright, discarding motion queued for this tick.
    ///
    /// Distinct from [`SimCommand::SetKinematicTarget`], which asks the solver to sweep
    /// there and would be resisted by whatever is in the way. Mantling and respawns move
    /// the body by fiat and must not be negotiated with.
    TeleportCharacter {
        id: BodyId,
        iso: Iso,
    },
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct BodySnapshot {
    pub id: BodyId,
    pub iso: Iso,
    pub linvel: [f32; 3],
    /// Characters only — always false for ordinary bodies, which have no meaningful
    /// notion of standing on something.
    pub grounded: bool,
}

/// One published sim state.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SimSnapshot {
    pub tick: u64,
    /// Seconds of sim time this snapshot represents.
    pub sim_time: f64,
    /// Sorted by `id` so the app can binary-search without rebuilding a map.
    pub bodies: Vec<BodySnapshot>,
}

impl SimSnapshot {
    pub fn body(&self, id: BodyId) -> Option<&BodySnapshot> {
        self.bodies
            .binary_search_by_key(&id, |b| b.id)
            .ok()
            .map(|i| &self.bodies[i])
    }
}

#[derive(Clone, Copy, Debug)]
pub struct SimConfig {
    pub tick_hz: f64,
    pub gravity: [f32; 3],
    /// Ceiling on catch-up steps in one loop pass.
    pub max_steps_per_pass: u32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            tick_hz: 20.0,
            gravity: [0.0, -9.81, 0.0],
            max_steps_per_pass: 5,
        }
    }
}

impl SimConfig {
    pub fn timestep(&self) -> f64 {
        1.0 / self.tick_hz.max(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(ids: &[u32]) -> SimSnapshot {
        SimSnapshot {
            tick: 1,
            sim_time: 0.05,
            bodies: ids
                .iter()
                .map(|&i| BodySnapshot {
                    id: BodyId(i),
                    ..Default::default()
                })
                .collect(),
        }
    }

    #[test]
    fn every_body_in_a_snapshot_can_be_found_again() {
        let ids = [1u32, 4, 7, 9, 40, 41, 900];
        let snap = snapshot(&ids);
        for id in ids {
            assert_eq!(
                snap.body(BodyId(id)).map(|b| b.id),
                Some(BodyId(id)),
                "body {id} went missing from its own snapshot"
            );
        }
    }

    #[test]
    fn a_body_that_is_not_there_is_not_invented() {
        let snap = snapshot(&[1, 4, 7]);
        for id in [0u32, 2, 5, 8, u32::MAX] {
            assert!(snap.body(BodyId(id)).is_none(), "invented body {id}");
        }
    }

    /// `body` binary-searches, so a snapshot built out of order answers for
    /// whatever the search happens to land on -- which is not a defined answer
    /// and not always a wrong one. Sorting is what makes it a lookup, and this
    /// is the test that says the order is load-bearing rather than incidental.
    #[test]
    fn sorting_is_what_makes_a_snapshot_searchable() {
        let ids = [9u32, 1, 40, 4, 12];
        let mut snap = snapshot(&ids);
        snap.bodies.sort_unstable_by_key(|b| b.id);
        for id in ids {
            assert_eq!(
                snap.body(BodyId(id)).map(|b| b.id),
                Some(BodyId(id)),
                "body {id} is unreachable in a sorted snapshot"
            );
        }
    }

    #[test]
    fn the_timestep_is_the_tick_rate_upside_down_and_never_divides_by_nothing() {
        assert!(
            (SimConfig {
                tick_hz: 20.0,
                ..Default::default()
            }
            .timestep()
                - 0.05)
                .abs()
                < 1e-9
        );
        assert!(
            (SimConfig {
                tick_hz: 60.0,
                ..Default::default()
            }
            .timestep()
                - 1.0 / 60.0)
                .abs()
                < 1e-9
        );
        for bad in [0.0, -1.0, 0.25] {
            let step = SimConfig {
                tick_hz: bad,
                ..Default::default()
            }
            .timestep();
            assert!(
                step.is_finite() && step > 0.0 && step <= 1.0,
                "tick_hz {bad} gave a timestep of {step}"
            );
        }
    }
}
