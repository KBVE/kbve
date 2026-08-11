//! Wire types between the app pillar and the physics pillar.
//!
//! Deliberately free of rapier and Godot types: the app side builds commands
//! without linking a physics engine, and the sim side never learns what is
//! rendering it. Arrays instead of nalgebra/Godot vectors keep both true.

use std::sync::Arc;

/// App-assigned body id. The app owns the numbering so it can key its own
/// node tables without waiting for a round trip through the sim.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct BodyId(pub u32);

#[derive(Clone, Copy, Debug, Default, PartialEq)]
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
    /// Driven by the app each tick via [`SimCommand::SetKinematicTarget`];
    /// the solver moves other bodies out of its way but never pushes it back.
    KinematicPosition,
}

#[derive(Clone, Copy, Debug, PartialEq)]
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
}

#[derive(Clone, Copy, Debug)]
pub struct BodyDesc {
    pub kind: BodyKind,
    pub shape: ShapeDesc,
    pub iso: Iso,
    pub restitution: f32,
    pub friction: f32,
    /// Ignored for non-dynamic bodies.
    pub linear_damping: f32,
    /// Dynamic bodies only. `None` lets rapier derive it from shape volume.
    pub mass: Option<f32>,
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
        }
    }
}

/// A square, origin-centred heightfield spanning `-extent..=extent` on both X
/// and Z. Row-major, `resolution * resolution` samples — the exact layout
/// `QTerrain::cpu_heights` already hands out, so no repack on the app side.
///
/// `Arc` because the app keeps its copy for its own queries; the send is a
/// refcount bump rather than a clone of a half-megabyte grid.
#[derive(Clone, Debug)]
pub struct TerrainDesc {
    pub heights: Arc<Vec<f32>>,
    pub resolution: u32,
    pub extent: f32,
}

#[derive(Clone, Debug)]
pub enum SimCommand {
    SetTerrain(TerrainDesc),
    Spawn {
        id: BodyId,
        desc: BodyDesc,
    },
    Despawn {
        id: BodyId,
    },
    /// Kinematic bodies only. Applied at the head of the next step.
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
}

#[derive(Clone, Copy, Debug, Default)]
pub struct BodySnapshot {
    pub id: BodyId,
    pub iso: Iso,
    pub linvel: [f32; 3],
}

/// One published sim state. Snapshots are latest-wins: a slow app frame drops
/// intermediate ticks rather than queueing them, so the sim never blocks on
/// rendering and the app never replays stale physics.
#[derive(Clone, Debug, Default)]
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
    /// Ceiling on catch-up steps in one loop pass. Without it a stalled
    /// process wakes owing thousands of ticks and never finishes paying them
    /// back — each catch-up burst pushes the deadline further out.
    pub max_steps_per_pass: u32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            tick_hz: 60.0,
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
