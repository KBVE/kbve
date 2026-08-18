//! Godot adapter for the off-thread sim — the seam between {App} and {Physics}.

use std::collections::HashMap;
use std::sync::Arc;

use godot::classes::{Engine, INode3D, Node3D};
use godot::prelude::*;

use super::sim3d::{
    BodyDesc, BodyId, BodyKind, CharacterDesc, PhysicsHandle, ShapeDesc, SimCommand, SimConfig,
    TerrainDesc,
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
    /// Where the collider sits relative to the node origin. A character node is
    /// authored with its origin at the feet while rapier centres a capsule on its
    /// middle, and without this the body renders half its height into the ground.
    offset: Vector3,
    /// Whether the sim may write this node's rotation as well as its position.
    ///
    /// False for characters. A capsule is symmetric, so the controller never turns it,
    /// and writing its rotation back would overwrite the facing the game just set --
    /// mouse look is `rotate_y` on the same node, and it would snap back every tick.
    drives_rotation: bool,
    /// The last two published poses, rendered between. The sim runs free of the frame
    /// loop, so without this the node only moves on frames where a snapshot happened to
    /// land -- which at similar rates means it stutters rather than glides.
    prev: super::sim3d::Iso,
    cur: super::sim3d::Iso,
}

pub(super) fn iso_of(node: &Gd<Node3D>) -> super::sim3d::Iso {
    let xform = node.get_global_transform();
    let q = xform.basis.get_quaternion();
    super::sim3d::Iso {
        pos: [xform.origin.x, xform.origin.y, xform.origin.z],
        rot: [q.x, q.y, q.z, q.w],
    }
}

pub(super) fn apply_iso(node: &mut Gd<Node3D>, iso: &super::sim3d::Iso) {
    apply_iso_ex(node, iso, true);
}

/// `rotation` false writes the position only, leaving the node's facing to the game.
pub(super) fn apply_iso_ex(node: &mut Gd<Node3D>, iso: &super::sim3d::Iso, rotation: bool) {
    let mut xform = node.get_global_transform();
    if rotation {
        let scale = xform.basis.get_scale();
        let q = Quaternion::new(iso.rot[0], iso.rot[1], iso.rot[2], iso.rot[3]);
        xform.basis = Basis::from_quaternion(q).scaled(scale);
    }
    xform.origin = Vector3::new(iso.pos[0], iso.pos[1], iso.pos[2]);
    node.set_global_transform(xform);
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QPhysics3D {
    base: Base<Node3D>,

    /// `QTerrain` to source the collision heightfield from.
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
    /// Centre of the region the sim currently holds. `QTerrain` streams its window
    /// after the player, and a collider left at the old centre is ground the player
    /// can walk off the edge of.
    terrain_origin: Option<[f32; 2]>,
    /// Seconds of render time since the last snapshot landed, which is what places the
    /// node between the two poses it is being rendered between.
    since_snapshot: f64,
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

    fn process(&mut self, delta: f64) {
        if self.sim.is_none() {
            return;
        }
        self.try_send_terrain();
        self.push_proxies();
        self.pull_snapshot();
        self.since_snapshot += delta;
        self.render_tracked();
    }
}

impl QPhysics3D {
    /// `QTerrain` bakes its heightfield on a worker thread, so it is normal for this to
    /// find nothing for the first frames after load. It also re-bakes as the window
    /// follows the player, so this keeps polling rather than latching after the first
    /// send: the window origin is what says the ground underneath has moved.
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

        let (origin, desc) = {
            let t = terrain.bind();
            let Some((heights, res)) = t.cpu_heights() else {
                return;
            };
            let o = t.window_origin();
            (
                [o.x, o.y],
                TerrainDesc {
                    heights: Arc::new(heights.to_vec()),
                    resolution: res as u32,
                    extent: t.world_extent(),
                },
            )
        };

        if self.terrain_origin == Some(origin) {
            return;
        }
        let Some(sim) = self.sim.as_ref() else {
            return;
        };
        sim.send(SimCommand::AddTerrainRegion { origin, desc });
        if let Some(old) = self.terrain_origin.replace(origin) {
            sim.send(SimCommand::DropTerrainRegion { origin: old });
        }
        self.terrain_sent = true;
    }

    fn push_proxies(&mut self) {
        let Some(sim) = self.sim.as_ref() else {
            return;
        };
        for (id, tracked) in &self.tracked {
            if tracked.drive != Drive::Proxy || !tracked.node.is_instance_valid() {
                continue;
            }
            let mut iso = iso_of(&tracked.node);
            iso.pos[0] += tracked.offset.x;
            iso.pos[1] += tracked.offset.y;
            iso.pos[2] += tracked.offset.z;
            sim.send(SimCommand::SetKinematicTarget { id: *id, iso });
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
                let mut iso = body.iso;
                iso.pos[0] -= tracked.offset.x;
                iso.pos[1] -= tracked.offset.y;
                iso.pos[2] -= tracked.offset.z;
                tracked.prev = tracked.cur;
                tracked.cur = iso;
            }
        }
        self.since_snapshot = 0.0;
    }

    /// Places every sim-driven node between the last two published poses.
    ///
    /// A teleport is not interpolated: `TELEPORT_GAP` is far beyond anything a
    /// character covers in one tick, so a jump that large is a body being put
    /// somewhere rather than travelling there, and sliding it across the map would
    /// be the wrong picture.
    fn render_tracked(&mut self) {
        const TELEPORT_GAP: f32 = 5.0;
        let dt = 1.0 / self.tick_hz.max(1.0);
        let t = (self.since_snapshot / dt).clamp(0.0, 1.0) as f32;
        for tracked in self.tracked.values_mut() {
            if tracked.drive != Drive::Sim || !tracked.node.is_instance_valid() {
                continue;
            }
            let (a, b) = (tracked.prev, tracked.cur);
            let from = Vector3::new(a.pos[0], a.pos[1], a.pos[2]);
            let to = Vector3::new(b.pos[0], b.pos[1], b.pos[2]);
            let mut iso = b;
            if from.distance_squared_to(to) < TELEPORT_GAP * TELEPORT_GAP {
                let at = from.lerp(to, t);
                iso.pos = [at.x, at.y, at.z];
            }
            apply_iso_ex(&mut tracked.node, &iso, tracked.drives_rotation);
        }
    }

    fn insert(&mut self, node: Gd<Node3D>, shape: ShapeDesc, kind: BodyKind, drive: Drive) -> i64 {
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return 0;
        };
        let id = BodyId(self.next_id);
        self.next_id += 1;

        let iso = iso_of(&node);
        sim.send(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind,
                shape,
                iso,
                ..Default::default()
            },
        });
        if kind != BodyKind::Fixed {
            self.tracked.insert(
                id,
                Tracked {
                    node,
                    drive,
                    offset: Vector3::ZERO,
                    drives_rotation: true,
                    prev: iso,
                    cur: iso,
                },
            );
        }
        id.0 as i64
    }
}

#[godot_api]
impl QPhysics3D {
    #[func]
    fn spawn_ball(&mut self, node: Gd<Node3D>, radius: f32) -> i64 {
        self.insert(
            node,
            ShapeDesc::Ball { radius },
            BodyKind::Dynamic,
            Drive::Sim,
        )
    }

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
    pub(crate) fn spawn_static_box(&mut self, node: Gd<Node3D>, half_extents: Vector3) -> i64 {
        self.insert(
            node,
            ShapeDesc::Cuboid {
                half_extents: [half_extents.x, half_extents.y, half_extents.z],
            },
            BodyKind::Fixed,
            Drive::Sim,
        )
    }

    /// Registers a Godot-driven capsule proxy — the shape used for the player while
    /// `move_and_slide` still owns movement.
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

    /// Sim-side replacement for a `CharacterBody3D`: the sim owns the transform and the
    /// node follows it, so the walk-and-slide resolution runs on the physics thread.
    #[func]
    fn spawn_character(
        &mut self,
        node: Gd<Node3D>,
        half_height: f32,
        radius: f32,
        offset: Vector3,
        layer: i64,
        mask: i64,
    ) -> i64 {
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return 0;
        };
        let id = BodyId(self.next_id);
        self.next_id += 1;
        let node_iso = iso_of(&node);
        let mut iso = node_iso;
        iso.pos[0] += offset.x;
        iso.pos[1] += offset.y;
        iso.pos[2] += offset.z;
        sim.send(SimCommand::SpawnCharacter {
            id,
            desc: CharacterDesc {
                shape: ShapeDesc::Capsule {
                    half_height,
                    radius,
                },
                iso,
                groups: [layer as u32, mask as u32],
                ..Default::default()
            },
        });
        self.tracked.insert(
            id,
            Tracked {
                node,
                drive: Drive::Sim,
                offset,
                drives_rotation: false,
                prev: node_iso,
                cur: node_iso,
            },
        );
        id.0 as i64
    }

    /// Motion wanted this frame in world units, gravity included by the caller — the
    /// controller applies none of its own, exactly as `move_and_slide` does not.
    #[func]
    fn move_character(&mut self, id: i64, translation: Vector3) {
        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::MoveCharacter {
                id: BodyId(id as u32),
                translation: [translation.x, translation.y, translation.z],
            });
        }
    }

    /// Puts a character somewhere outright — mantling, respawning, being put back on the
    /// ground after falling through it. Motion queued for this tick is discarded.
    #[func]
    fn teleport_character(&mut self, id: i64, to: Vector3) {
        let Some(sim) = self.sim.as_ref() else {
            return;
        };
        let id = BodyId(id as u32);
        let mut iso = super::sim3d::Iso::at(to.x, to.y, to.z);
        if let Some(t) = self.tracked.get(&id) {
            iso.rot = iso_of(&t.node).rot;
            iso.pos[0] += t.offset.x;
            iso.pos[1] += t.offset.y;
            iso.pos[2] += t.offset.z;
        }
        sim.send(SimCommand::TeleportCharacter { id, iso });
    }

    /// Whether the controller found ground under the character on its last step.
    #[func]
    fn character_grounded(&self, id: i64) -> bool {
        self.sim
            .as_ref()
            .and_then(|s| s.latest().body(BodyId(id as u32)).map(|b| b.grounded))
            .unwrap_or(false)
    }

    /// Velocity rapier derived from the body's pose delta. Characters move by pose, so
    /// this is the only velocity they have.
    #[func]
    fn body_velocity(&self, id: i64) -> Vector3 {
        self.sim
            .as_ref()
            .and_then(|s| {
                s.latest()
                    .body(BodyId(id as u32))
                    .map(|b| Vector3::new(b.linvel[0], b.linvel[1], b.linvel[2]))
            })
            .unwrap_or(Vector3::ZERO)
    }

    /// Registers one immovable convex hull per transform, all sharing `points`.
    ///
    /// Built for the scatter fields: a few hundred rocks wearing a handful of distinct
    /// meshes. The cloud crosses the channel once and each rock carries only its pose
    /// and its scale, so re-registering a field after a mining hit does not copy the
    /// mesh data once per rock.
    #[func]
    pub(crate) fn spawn_static_hulls(
        &mut self,
        points: PackedVector3Array,
        transforms: Array<Transform3D>,
    ) -> PackedInt64Array {
        let mut out = PackedInt64Array::new();
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return out;
        };
        if points.len() < 4 || transforms.is_empty() {
            return out;
        }

        let cloud = Arc::new(
            points
                .as_slice()
                .iter()
                .map(|p| [p.x, p.y, p.z])
                .collect::<Vec<_>>(),
        );
        let mut bodies = Vec::with_capacity(transforms.len());
        for xform in transforms.iter_shared() {
            let id = BodyId(self.next_id);
            self.next_id += 1;
            let scale = xform.basis.get_scale();
            let q = xform.basis.orthonormalized().get_quaternion();
            bodies.push((
                id,
                BodyDesc {
                    kind: BodyKind::Fixed,
                    shape: ShapeDesc::ConvexHull {
                        points: cloud.clone(),
                        scale: [scale.x, scale.y, scale.z],
                    },
                    iso: super::sim3d::Iso {
                        pos: [xform.origin.x, xform.origin.y, xform.origin.z],
                        rot: [q.x, q.y, q.z, q.w],
                    },
                    ..Default::default()
                },
            ));
            out.push(id.0 as i64);
        }
        sim.send(SimCommand::SpawnMany { bodies });
        out
    }

    /// Registers one immovable upright cylinder per transform — tree trunks, which are
    /// all the same shape at a handful of sizes.
    #[func]
    pub(crate) fn spawn_static_cylinders(
        &mut self,
        half_height: f32,
        radius: f32,
        transforms: Array<Transform3D>,
    ) -> PackedInt64Array {
        let mut out = PackedInt64Array::new();
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return out;
        };
        let mut bodies = Vec::with_capacity(transforms.len());
        for xform in transforms.iter_shared() {
            let id = BodyId(self.next_id);
            self.next_id += 1;
            let q = xform.basis.orthonormalized().get_quaternion();
            bodies.push((
                id,
                BodyDesc {
                    kind: BodyKind::Fixed,
                    shape: ShapeDesc::Cylinder {
                        half_height,
                        radius,
                    },
                    iso: super::sim3d::Iso {
                        pos: [xform.origin.x, xform.origin.y, xform.origin.z],
                        rot: [q.x, q.y, q.z, q.w],
                    },
                    ..Default::default()
                },
            ));
            out.push(id.0 as i64);
        }
        sim.send(SimCommand::SpawnMany { bodies });
        out
    }

    /// Registers one immovable triangle mesh — concave geometry no hull describes, such
    /// as the bridge deck with its kerbs and abutments.
    ///
    /// `indices` is triangle-major. An empty index array is read as a triangle soup, the
    /// order `ArrayMesh` hands back for an unindexed surface.
    #[func]
    pub(crate) fn spawn_static_trimesh(
        &mut self,
        vertices: PackedVector3Array,
        indices: PackedInt32Array,
        transform: Transform3D,
    ) -> i64 {
        let Some(sim) = self.sim.as_ref() else {
            godot_error!("[QPhysics3D] not started; call this after _ready");
            return 0;
        };
        if vertices.len() < 3 {
            return 0;
        }

        let verts: Vec<[f32; 3]> = vertices
            .as_slice()
            .iter()
            .map(|v| {
                let p = transform * *v;
                [p.x, p.y, p.z]
            })
            .collect();

        let tris: Vec<[u32; 3]> = if indices.is_empty() {
            (0..verts.len() / 3)
                .map(|i| [i as u32 * 3, i as u32 * 3 + 1, i as u32 * 3 + 2])
                .collect()
        } else {
            indices
                .as_slice()
                .chunks_exact(3)
                .map(|c| [c[0] as u32, c[1] as u32, c[2] as u32])
                .collect()
        };
        if tris.is_empty() {
            return 0;
        }

        let id = BodyId(self.next_id);
        self.next_id += 1;
        sim.send(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind: BodyKind::Fixed,
                shape: ShapeDesc::TriMesh {
                    vertices: Arc::new(verts),
                    indices: Arc::new(tris),
                },
                ..Default::default()
            },
        });
        id.0 as i64
    }

    /// Bulk despawn — the counterpart to [`Self::spawn_static_hulls`], for the rebuild
    /// a field does when one of its rocks changes stage.
    #[func]
    pub(crate) fn despawn_batch(&mut self, ids: PackedInt64Array) {
        let ids: Vec<BodyId> = ids.as_slice().iter().map(|i| BodyId(*i as u32)).collect();
        for id in &ids {
            self.tracked.remove(id);
        }
        if let Some(sim) = self.sim.as_ref() {
            sim.send(SimCommand::DespawnMany { ids });
        }
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

    /// Not named `set_gravity`: the `gravity` export already generates a setter under
    /// that name, and a second one silently shadows it in GDScript.
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

    /// True once the terrain heightfield has been handed to the sim.
    #[func]
    fn is_terrain_ready(&self) -> bool {
        self.terrain_sent
    }

    /// Tick the sim has most recently published — useful for debug overlays confirming
    /// the physics thread is actually running.
    #[func]
    fn sim_tick(&self) -> i64 {
        self.sim.as_ref().map(|s| s.latest().tick).unwrap_or(0) as i64
    }
}
