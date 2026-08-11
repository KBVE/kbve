//! Godot adapter for the off-thread sim — the seam between {App} and {Physics}.
//!
//! Everything Godot-shaped stops here. `sim3d` below never sees a `Gd<T>`, and
//! GDScript above never sees a rapier handle; this file is the only translator,
//! which is what keeps the sim compilable into the headless server unchanged.
//!
//! Bodies come in two flavours and the direction of travel is the whole point:
//!
//! * **Sim-driven** (`spawn_*`) — rapier owns the transform and this node
//!   writes it onto the Godot node each frame. Props, debris, projectiles.
//! * **Proxy** (`track_*`) — Godot owns the transform and this node pushes it
//!   into the sim each frame as a kinematic target. That is how the player
//!   keeps `move_and_slide` feel in phase 1 while still shouldering other
//!   bodies around; flipping the player to sim-driven is a later phase, and it
//!   is a one-line change at the call site rather than a rewrite.

use std::collections::HashMap;
use std::sync::Arc;

use godot::classes::{Engine, INode3D, Node3D};
use godot::prelude::*;

use super::sim3d::{
    BodyDesc, BodyId, BodyKind, PhysicsHandle, ShapeDesc, SimCommand, SimConfig, TerrainDesc,
};
use crate::world::terrain::QTerrain;

#[derive(Clone, Copy, PartialEq)]
enum Drive {
    /// Sim owns the transform; copy sim -> node.
    Sim,
    /// Godot owns the transform; copy node -> sim.
    Proxy,
}

struct Tracked {
    node: Gd<Node3D>,
    drive: Drive,
}

fn iso_of(node: &Gd<Node3D>) -> super::sim3d::Iso {
    let xform = node.get_global_transform();
    let q = xform.basis.get_quaternion();
    super::sim3d::Iso {
        pos: [xform.origin.x, xform.origin.y, xform.origin.z],
        rot: [q.x, q.y, q.z, q.w],
    }
}

fn apply_iso(node: &mut Gd<Node3D>, iso: &super::sim3d::Iso) {
    let mut xform = node.get_global_transform();
    // Rebuild the basis from the sim's rotation but keep the node's authored
    // scale — the sim carries no scale, so a naive overwrite would silently
    // reset every scaled prop to 1.
    let scale = xform.basis.get_scale();
    let q = Quaternion::new(iso.rot[0], iso.rot[1], iso.rot[2], iso.rot[3]);
    xform.basis = Basis::from_quaternion(q).scaled(scale);
    xform.origin = Vector3::new(iso.pos[0], iso.pos[1], iso.pos[2]);
    node.set_global_transform(xform);
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QPhysics3D {
    base: Base<Node3D>,

    /// `QTerrain` to source the collision heightfield from. Optional: without
    /// it the sim runs with no ground, which is what you want for tests.
    #[export]
    terrain_path: NodePath,
    #[export]
    #[init(val = 60.0)]
    tick_hz: f64,
    #[export]
    #[init(val = Vector3::new(0.0, -9.81, 0.0))]
    gravity: Vector3,

    sim: Option<PhysicsHandle>,
    tracked: HashMap<BodyId, Tracked>,
    #[init(val = 1)]
    next_id: u32,
    terrain_sent: bool,
}

#[godot_api]
impl INode3D for QPhysics3D {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.sim = Some(PhysicsHandle::spawn(SimConfig {
            tick_hz: self.tick_hz,
            gravity: [self.gravity.x, self.gravity.y, self.gravity.z],
            ..Default::default()
        }));
    }

    fn process(&mut self, _delta: f64) {
        if self.sim.is_none() {
            return;
        }
        if !self.terrain_sent {
            self.try_send_terrain();
        }
        self.push_proxies();
        self.pull_snapshot();
    }
}

impl QPhysics3D {
    /// `QTerrain` bakes its heightfield on a worker thread, so it is normal for
    /// this to find nothing for the first frames after load. Retried each frame
    /// until the grid exists rather than resolved once in `ready`.
    fn try_send_terrain(&mut self) {
        if self.terrain_path.is_empty() {
            return;
        }
        let Some(terrain) = self
            .base()
            .get_node_or_null(&self.terrain_path)
            .and_then(|n| n.try_cast::<QTerrain>().ok())
        else {
            return;
        };

        let desc = {
            let t = terrain.bind();
            let Some((heights, res)) = t.cpu_heights() else {
                return;
            };
            TerrainDesc {
                heights: Arc::new(heights.to_vec()),
                resolution: res as u32,
                extent: t.world_extent(),
            }
        };

        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::SetTerrain(desc));
            self.terrain_sent = true;
        }
    }

    fn push_proxies(&mut self) {
        let Some(sim) = self.sim.as_ref() else {
            return;
        };
        for (id, tracked) in &self.tracked {
            if tracked.drive != Drive::Proxy || !tracked.node.is_instance_valid() {
                continue;
            }
            sim.send(SimCommand::SetKinematicTarget {
                id: *id,
                iso: iso_of(&tracked.node),
            });
        }
    }

    fn pull_snapshot(&mut self) {
        let Some(snapshot) = self.sim.as_mut().and_then(|s| s.latest_if_changed()) else {
            return;
        };
        for (id, tracked) in &mut self.tracked {
            if tracked.drive != Drive::Sim || !tracked.node.is_instance_valid() {
                continue;
            }
            if let Some(body) = snapshot.body(*id) {
                apply_iso(&mut tracked.node, &body.iso);
            }
        }
    }

    fn insert(&mut self, node: Gd<Node3D>, shape: ShapeDesc, kind: BodyKind, drive: Drive) -> i64 {
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return 0;
        };
        let id = BodyId(self.next_id);
        self.next_id += 1;

        sim.send(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind,
                shape,
                iso: iso_of(&node),
                ..Default::default()
            },
        });
        self.tracked.insert(id, Tracked { node, drive });
        id.0 as i64
    }
}

#[godot_api]
impl QPhysics3D {
    /// Sim-driven ball. The sim owns `node`'s transform from here on.
    #[func]
    fn spawn_ball(&mut self, node: Gd<Node3D>, radius: f32) -> i64 {
        self.insert(
            node,
            ShapeDesc::Ball { radius },
            BodyKind::Dynamic,
            Drive::Sim,
        )
    }

    /// Sim-driven box. `half_extents` is half the full size on each axis.
    #[func]
    fn spawn_box(&mut self, node: Gd<Node3D>, half_extents: Vector3) -> i64 {
        self.insert(
            node,
            ShapeDesc::Cuboid {
                half_extents: [half_extents.x, half_extents.y, half_extents.z],
            },
            BodyKind::Dynamic,
            Drive::Sim,
        )
    }

    /// Sim-driven upright capsule.
    #[func]
    fn spawn_capsule(&mut self, node: Gd<Node3D>, half_height: f32, radius: f32) -> i64 {
        self.insert(
            node,
            ShapeDesc::Capsule {
                half_height,
                radius,
            },
            BodyKind::Dynamic,
            Drive::Sim,
        )
    }

    /// Immovable collision, e.g. baked level geometry the sim must respect.
    #[func]
    fn spawn_static_box(&mut self, node: Gd<Node3D>, half_extents: Vector3) -> i64 {
        self.insert(
            node,
            ShapeDesc::Cuboid {
                half_extents: [half_extents.x, half_extents.y, half_extents.z],
            },
            BodyKind::Fixed,
            Drive::Sim,
        )
    }

    /// Registers a Godot-driven capsule proxy — the shape used for the player
    /// while `move_and_slide` still owns movement. Its transform is pushed into
    /// the sim every frame and never written back, so the controller keeps its
    /// feel while dynamic bodies still collide with it.
    #[func]
    fn track_capsule(&mut self, node: Gd<Node3D>, half_height: f32, radius: f32) -> i64 {
        self.insert(
            node,
            ShapeDesc::Capsule {
                half_height,
                radius,
            },
            BodyKind::KinematicPosition,
            Drive::Proxy,
        )
    }

    #[func]
    fn despawn(&mut self, id: i64) {
        let id = BodyId(id as u32);
        self.tracked.remove(&id);
        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::Despawn { id });
        }
    }

    #[func]
    fn apply_impulse(&mut self, id: i64, impulse: Vector3) {
        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::ApplyImpulse {
                id: BodyId(id as u32),
                impulse: [impulse.x, impulse.y, impulse.z],
            });
        }
    }

    /// Not named `set_gravity`: the `gravity` export already generates a setter
    /// under that name, and a second one silently shadows it in GDScript.
    #[func]
    fn update_gravity(&mut self, gravity: Vector3) {
        self.gravity = gravity;
        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::SetGravity([gravity.x, gravity.y, gravity.z]));
        }
    }

    /// Last published position for a body, or `Vector3.ZERO` if unknown.
    #[func]
    fn body_position(&self, id: i64) -> Vector3 {
        self.sim
            .as_ref()
            .and_then(|s| {
                s.latest()
                    .body(BodyId(id as u32))
                    .map(|b| Vector3::new(b.iso.pos[0], b.iso.pos[1], b.iso.pos[2]))
            })
            .unwrap_or(Vector3::ZERO)
    }

    /// True once the terrain heightfield has been handed to the sim. Until
    /// then the only collision in the world is whatever was spawned explicitly.
    #[func]
    fn is_terrain_ready(&self) -> bool {
        self.terrain_sent
    }

    /// Tick the sim has most recently published — useful for debug overlays
    /// confirming the physics thread is actually running.
    #[func]
    fn sim_tick(&self) -> i64 {
        self.sim.as_ref().map(|s| s.latest().tick).unwrap_or(0) as i64
    }
}
