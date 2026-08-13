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
    /// Dynamic bodies only.
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
#[derive(Clone, Copy, Debug)]
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
    SetTerrain(TerrainDesc),
    Spawn {
        id: BodyId,
        desc: BodyDesc,
    },
    Despawn {
        id: BodyId,
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
