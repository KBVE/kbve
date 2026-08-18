use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::rendering_server::MultimeshTransformFormat;
use godot::classes::{ArrayMesh, Engine, PhysicsServer3D, RenderingServer, ShaderMaterial};
use godot::prelude::*;

use crate::world::harvest::{Entry, HarvestKind, HarvestOutcome, ScatterCore, Stone, stable_id};
use crate::world::stone_mesh::{
    LOD_LEVELS, SPECIES, build_cracked_mesh, build_rubble_mesh, build_stone_hull, build_stone_lod,
    build_stone_mesh,
};
use crate::world::{TerrainSnapshot, hash32, world_aabb_at};
use crate::worldgen::StoneScatter;

const VARIANTS: usize = 12;

struct VariantMeshes {
    /// Intact stone at each LOD, then the two damage stages (no LOD needed — damaged
    /// stones are rare and only ever seen up close).
    lods: [Gd<ArrayMesh>; LOD_LEVELS],
    damaged: [Gd<ArrayMesh>; 2],
    /// One hull per stage, in step with `damaged`: intact, cracked, rubble.
    ///
    /// A single hull would be the intact rock's, and a rock mined down to rubble draws
    /// ankle high while still standing a boulder in the player's way.
    hulls: [PackedVector3Array; Stone::STAGES as usize],
    /// Measured from the built mesh at unit scale.
    height: f32,
}

struct MmSlot {
    mm: Rid,
    inst: Rid,
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QStoneField {
    base: Base<Node3D>,

    init_done: bool,

    #[export]
    terrain_path: NodePath,
    #[export]
    player_path: NodePath,
    /// Off-thread sim to mirror the colliders into. Godot keeps its own copy either
    /// way -- the mantle and camera probes raycast against it -- but the sim needs
    /// them too or the character controller walks straight through the rocks.
    #[export]
    #[init(val = NodePath::from("../Physics"))]
    physics_path: NodePath,
    #[export]
    stone_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 24601)]
    stone_seed: i32,
    #[export]
    #[init(val = 22.0)]
    grid_size: f32,
    #[export]
    #[init(val = 0.3)]
    patch_threshold: f32,
    #[export]
    #[init(val = 0.025)]
    patch_frequency: f32,
    #[export]
    #[init(val = 1.6)]
    scale_min: f32,
    #[export]
    #[init(val = 3.2)]
    scale_max: f32,
    #[export]
    #[init(val = 1.1)]
    clearance_radius: f32,
    #[export]
    #[init(val = 0.75)]
    ground_align: f32,
    #[export]
    #[init(val = 0.18)]
    burial: f32,
    #[export]
    #[init(val = 24.0)]
    max_tilt_degrees: f32,
    #[export]
    #[init(val = 0.6)]
    seat_bias: f32,
    #[export]
    #[init(val = 45.0)]
    lod1_distance: f32,
    #[export]
    #[init(val = 120.0)]
    lod2_distance: f32,
    #[export]
    #[init(val = 12.0)]
    lod_refresh: f32,

    core: ScatterCore<Stone>,
    meshes: Vec<VariantMeshes>,
    slots: Vec<Vec<MmSlot>>,
    #[init(val = Rid::Invalid)]
    body: Rid,
    shapes: Vec<Rid>,
    /// Sim body ids handed out by `QPhysics3D`, so a rebuild can take the previous set
    /// down before registering the new one.
    sim_bodies: PackedInt64Array,
    extent: f32,
    origin: Vector2,
    /// What the player has already mined, kept across rescatters.
    ledger: crate::world::harvest::Ledger,
    /// Snapshot of the terrain used to test sight lines during LOD rebucketing.
    terrain_heights: Vec<f32>,
    terrain_res: i32,
    /// Stones nearer than this are never occlusion tested; the march costs more than it
    /// saves at close range and a false positive there is very visible.
    #[init(val = 30.0)]
    occlusion_start: f32,
    dirty: bool,
    #[init(val = Vector3::new(1.0e9, 0.0, 0.0))]
    last_lod_origin: Vector3,
}

impl QStoneField {
    /// True once the terrain has re-baked somewhere else and these stones are
    /// for ground nobody is standing on any more.
    fn window_moved(&self) -> bool {
        let node = self.base().clone().upcast::<godot::classes::Node>();
        crate::world::resolve_terrain(&node, &self.terrain_path)
            .map(|t| t.bind().window_origin() != self.origin)
            .unwrap_or(false)
    }

    /// Throws the scatter away and builds it again for the new window.
    ///
    /// What the player mined goes into the ledger first and is replayed after,
    /// so a rock broken before walking away is still broken on the way back.
    fn rescatter(&mut self) {
        let _t = crate::world::StallTimer::start("stones.rescatter");
        let damage: Vec<(u64, u8)> = self.core.damage().collect();
        for (id, stage) in damage {
            self.ledger.record(id, stage);
        }
        self.free_all();
        self.core.clear();
        // The meshes stay. Every one of them is a function of the stone seed
        // and the variant table -- three lods, two damage states and three
        // hulls per variant -- and a window shift changes which rocks stand
        // where, not what a rock is. Rebuilding all thirty-two on the main
        // thread each stride was the bulk of a stone rescatter.
        self.slots.clear();
        self.init_done = false;
    }

    fn late_init(&mut self) -> bool {
        let _t = super::ReadyTimer::start("stones");
        let node = self.base().clone().upcast::<godot::classes::Node>();
        let Some(terrain) = crate::world::resolve_terrain(&node, &self.terrain_path) else {
            godot_error!("[QStoneField] no QTerrain found; stones disabled");
            return true;
        };
        let Some(terra) = TerrainSnapshot::take(&terrain) else {
            return false;
        };
        let extent = terra.extent;
        let water = terra.water;
        self.extent = extent;
        let (raw, raw_res) = terra.raw_heights();
        self.terrain_heights = raw.to_vec();
        self.terrain_res = raw_res;

        let sample = |x: f32, z: f32| -> f32 { terra.height(x, z) };

        if self.meshes.is_empty() {
            self.build_meshes();
        }
        let heights: Vec<f32> = self.meshes.iter().map(|m| m.height).collect();

        let seed64 = self.stone_seed as u64;
        self.origin = terra.origin;

        let (hgen, road) = terra.scatter_world();
        let scatter = StoneScatter {
            seed: self.stone_seed,
            variants: VARIANTS,
            grid_size: self.grid_size,
            patch_threshold: self.patch_threshold,
            patch_frequency: self.patch_frequency,
            scale_min: self.scale_min,
            scale_max: self.scale_max,
        };
        let placements = scatter.place(
            &hgen,
            Some(&road),
            [terra.origin.x, terra.origin.y],
            extent,
            water,
        );

        for p in &placements {
            let variant = (p.variant as usize).min(VARIANTS - 1);
            let (up, seat) = self.bed(
                &sample,
                p.pos[0],
                p.pos[1],
                p.radius,
                heights[variant] * p.scale,
            );
            self.core.insert(Entry {
                id: stable_id(seed64, p.cell.0, p.cell.1, p.companion),
                pos: Vector3::new(p.pos[0], seat, p.pos[1]),
                up,
                scale: p.scale,
                yaw: p.yaw,
                variant: p.variant,
                ore: 0,
                amount: 0,
                cell: [p.cell.0, p.cell.1],
                ordinal: p.companion,
            });
        }
        if self.core.entries().is_empty() {
            godot_error!("[QStoneField] no stone candidates survived placement");
            return true;
        }

        if self.clearance_radius > 0.0 {
            let mut terrain = terrain;
            let mut tb = terrain.bind_mut();
            for e in self.core.entries() {
                tb.stamp_clearance(e.pos.x, e.pos.z, self.clearance_radius * e.scale);
            }
            tb.flush_clearance();
        }

        // Before anything is drawn or given a collider: a rock the player
        // already broke must come back broken, not whole.
        let ledger = std::mem::take(&mut self.ledger);
        self.core.restore(&ledger);
        self.ledger = ledger;

        self.build_multimeshes();
        self.build_colliders();
        self.dirty = true;
        true
    }
}

#[godot_api]
impl INode3D for QStoneField {
    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        if !self.init_done {
            if super::q_hidden("stones") || self.late_init() {
                self.init_done = true;
            }
            return;
        }
        if self.window_moved() {
            self.rescatter();
            return;
        }
        if !self.dirty {
            let view = self.view_origin();
            if view.distance_squared_to(self.last_lod_origin) > self.lod_refresh * self.lod_refresh
            {
                self.last_lod_origin = view;
                self.dirty = true;
            }
        }
        if self.dirty {
            self.dirty = false;
            let _t = crate::world::StallTimer::start("stones.upload");
            self.upload_buffers();
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                let mut rs = RenderingServer::singleton();
                for s in self.all_slots() {
                    if s.1.is_valid() {
                        rs.instance_set_visible(s.1, visible);
                    }
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QStoneField {
    #[signal]
    fn stone_broken(id: i64, ore: GString, amount: i64);

    #[func]
    fn query_radius(&self, pos: Vector3, radius: f32, max: i32) -> PackedInt64Array {
        let ids = self.core.query_radius(pos, radius, max.max(0) as usize);
        let mut out = PackedInt64Array::new();
        for id in ids {
            out.push(id as i64);
        }
        out
    }

    /// Every standing stone as flat `x, z, radius` triples, for a flow field to
    /// route around. Mined-out stones are left out, so a field rebuilt after a
    /// stone breaks stops routing around the hole where it was.
    ///
    /// The radius comes off the collision hull, measured flat: a stone bedded
    /// into a slope leans, so this reads a little under its true footprint and
    /// the field's own clearance covers the difference.
    #[func]
    fn obstacle_discs(&self) -> PackedFloat32Array {
        let radii: Vec<f32> = self
            .meshes
            .iter()
            .flat_map(|m| {
                m.hulls.iter().map(|hull| {
                    hull.as_slice()
                        .iter()
                        .map(|p| (p.x * p.x + p.z * p.z).sqrt())
                        .fold(0.0f32, f32::max)
                })
            })
            .collect();
        let mut out = PackedFloat32Array::new();
        for e in self.core.entries() {
            if !self.core.alive(e.id) {
                continue;
            }
            let stage = (self.core.stage(e.id) as usize).min(Stone::STAGES as usize - 1);
            let Some(r) = radii.get(e.variant as usize * Stone::STAGES as usize + stage) else {
                continue;
            };
            out.push(e.pos.x);
            out.push(e.pos.z);
            out.push(r * e.scale);
        }
        out
    }

    #[func]
    fn get_info(&self, id: i64) -> VarDictionary {
        let mut d = VarDictionary::new();
        let Some(e) = self.core.get(id as u64) else {
            return d;
        };
        let table = Stone::drop_table();
        let _ = d.insert("position", e.pos);
        let _ = d.insert("up", e.up);
        let _ = d.insert("scale", e.scale);
        let _ = d.insert("variant", e.variant as i64);
        let _ = d.insert("stage", self.core.stage(e.id) as i64);
        let _ = d.insert("alive", self.core.alive(e.id));
        let _ = d.insert("ore", table[e.ore as usize].ore);
        let _ = d.insert("amount", e.amount as i64);
        // What the wire wants. The host will not take an id from a client, so a
        // caller that means to work this rock over the network has to be able to
        // say which cell it is in.
        let _ = d.insert("cell", Vector2i::new(e.cell[0], e.cell[1]));
        let _ = d.insert("ordinal", e.ordinal as i64);
        d
    }

    #[func]
    fn apply_damage(&mut self, id: i64, hits: i64) -> VarDictionary {
        let out = self.core.apply_damage(id as u64, hits.clamp(1, 255) as u8);
        self.settle(id, out)
    }

    /// Moves a rock to the stage the server decided on.
    ///
    /// What a `harvest_applied` delta is applied through. Absolute rather than
    /// incremental, because the host is counting for everybody: two clients each
    /// reporting a hit on the same rock must not add up to two.
    #[func]
    fn set_stage(&mut self, id: i64, stage: i64) -> VarDictionary {
        let out = self.core.set_stage(id as u64, stage.clamp(0, 255) as u8);
        self.settle(id, out)
    }

    /// The points the physics server was handed for one variant at one stage.
    ///
    /// Exposed for the debug overlay only. These colliders are built straight on
    /// PhysicsServer3D with no CollisionShape3D behind them, so the engine's own shape
    /// drawing cannot see them and anything that wants to show them has to be given the
    /// same data the server got.
    #[func]
    fn debug_hull_points(&self, variant: i64, stage: i64) -> PackedVector3Array {
        let v = (variant.max(0) as usize) % self.meshes.len().max(1);
        let s = (stage.max(0) as usize).min(Stone::STAGES as usize - 1);
        self.meshes
            .get(v)
            .map(|m| m.hulls[s].clone())
            .unwrap_or_default()
    }

    /// Every standing stone as the hull to draw and where to draw it: `transform`,
    /// `variant`, `stage`.
    #[func]
    fn debug_colliders(&self) -> Array<VarDictionary> {
        let mut out = Array::new();
        for e in self.core.entries() {
            if !self.core.alive(e.id) {
                continue;
            }
            let mut d = VarDictionary::new();
            let _ = d.insert("transform", Self::instance_transform(e));
            let _ = d.insert("variant", e.variant as i64);
            let _ = d.insert("stage", self.core.stage(e.id) as i64);
            out.push(&d);
        }
        out
    }

    #[func]
    fn preview_mesh(&self, variant: i64, stage: i64) -> Option<Gd<ArrayMesh>> {
        let species = (variant.max(0) as usize) % SPECIES.len();
        let s = hash32((self.stone_seed as u32).wrapping_add(variant.max(0) as u32 * 7919));
        Some(match stage {
            1 => build_cracked_mesh(s, species),
            2 => build_rubble_mesh(s, species, 5, 0.7),
            _ => build_stone_mesh(s, species),
        })
    }

    #[func]
    fn preview_lod(&self, variant: i64, lod: i64) -> Option<Gd<ArrayMesh>> {
        let species = (variant.max(0) as usize) % SPECIES.len();
        let s = hash32((self.stone_seed as u32).wrapping_add(variant.max(0) as u32 * 7919));
        Some(build_stone_lod(
            s,
            species,
            (lod.max(0) as usize).min(LOD_LEVELS - 1),
        ))
    }

    #[func]
    fn get_stone_stats(&self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let total = self.core.entries().len() as i64;
        let alive = self
            .core
            .entries()
            .iter()
            .filter(|e| self.core.alive(e.id))
            .count() as i64;
        let _ = d.insert("total", total);
        let _ = d.insert("alive", alive);
        let _ = d.insert("mined", total - alive);

        let view = self.view_origin();
        let (lod1, lod2) = (
            self.lod1_distance * self.lod1_distance,
            self.lod2_distance * self.lod2_distance,
        );
        let mut tiers = [0i64; LOD_LEVELS];
        for e in self.core.entries() {
            if self.core.stage(e.id) != 0 {
                continue;
            }
            let d2 = e.pos.distance_squared_to(view) / (e.scale * e.scale).max(0.01);
            let tier = if d2 > lod2 {
                2
            } else if d2 > lod1 {
                1
            } else {
                0
            };
            tiers[tier] += 1;
        }
        let _ = d.insert("lod0", tiers[0]);
        let _ = d.insert("lod1", tiers[1]);
        let _ = d.insert("lod2", tiers[2]);
        d
    }
}

impl QStoneField {
    /// Everything that follows a stage changing, however it changed: the answer
    /// for the caller, and the world catching up if that was the last hit.
    fn settle(&mut self, id: i64, out: Option<HarvestOutcome>) -> VarDictionary {
        let mut d = VarDictionary::new();
        let Some(out) = out else {
            let _ = d.insert("hit", false);
            return d;
        };
        let _ = d.insert("hit", true);
        let _ = d.insert("stage", out.stage as i64);
        let _ = d.insert("broken", out.broken);
        let _ = d.insert("ore", out.ore);
        let _ = d.insert("amount", out.amount as i64);
        self.dirty = true;
        self.rebuild_colliders();
        if out.broken {
            let ore = GString::from(out.ore);
            let amount = out.amount as i64;
            self.signals().stone_broken().emit(id, &ore, amount);
        }
        d
    }

    /// Seat a stone into the terrain: returns the ground normal to align to and the Y
    /// the instance origin should sit at.
    fn bed<F: Fn(f32, f32) -> f32>(
        &self,
        sample: &F,
        x: f32,
        z: f32,
        radius: f32,
        stone_height: f32,
    ) -> (Vector3, f32) {
        let e = radius.max(0.35);
        let hx = sample(x + e, z) - sample(x - e, z);
        let hz = sample(x, z + e) - sample(x, z - e);
        let normal = Vector3::new(-hx, 2.0 * e, -hz).normalized();
        let mut blend = self.ground_align.clamp(0.0, 1.0);
        let angle = normal.dot(Vector3::UP).clamp(-1.0, 1.0).acos();
        let max_tilt = self.max_tilt_degrees.to_radians();
        if angle > 1.0e-4 {
            blend = blend.min(max_tilt / angle);
        }
        let up = Vector3::UP.lerp(normal, blend).normalized();

        let centre = sample(x, z);
        let uy = up.y.max(0.2);
        let mut sunk = centre;
        let mut rest = centre;
        let mut lowest = centre;
        for ring in 1..=3 {
            let rr = e * ring as f32 / 3.0;
            for i in 0..8 {
                let a = std::f32::consts::TAU * i as f32 / 8.0;
                let (dx, dz) = (libm::cosf(a) * rr, libm::sinf(a) * rr);
                let g = sample(x + dx, z + dz);
                lowest = lowest.min(g);
                let plane_drop = (up.x * dx + up.z * dz) / uy;
                sunk = sunk.min(g + plane_drop);
                rest = rest.max(g + plane_drop);
            }
        }
        let seat = sunk + (rest - sunk) * self.seat_bias.clamp(0.0, 1.0);
        let seat = seat.min(sunk + stone_height * 0.05);
        let floor = lowest - stone_height * 0.6;
        let seat = (seat - stone_height * self.burial).max(floor);
        (up, seat)
    }

    /// Column-major 3x4 rows for a MultiMesh TRANSFORM_3D buffer.
    fn instance_rows(e: &Entry) -> [f32; 12] {
        let up = if e.up.length_squared() > 1e-6 {
            e.up.normalized()
        } else {
            Vector3::UP
        };
        let reference = Vector3::new(e.yaw.cos(), 0.0, e.yaw.sin());
        let mut right = reference.cross(up);
        if right.length_squared() < 1e-6 {
            right = Vector3::RIGHT.cross(up);
        }
        let right = right.normalized();
        let fwd = right.cross(up).normalized() * e.scale;
        let right = right * e.scale;
        let up = up * e.scale;
        [
            right.x, up.x, fwd.x, e.pos.x, right.y, up.y, fwd.y, e.pos.y, right.z, up.z, fwd.z,
            e.pos.z,
        ]
    }

    fn instance_transform(e: &Entry) -> Transform3D {
        let r = Self::instance_rows(e);
        Transform3D::new(
            Basis::from_cols(
                Vector3::new(r[0], r[4], r[8]),
                Vector3::new(r[1], r[5], r[9]),
                Vector3::new(r[2], r[6], r[10]),
            ),
            Vector3::new(r[3], r[7], r[11]),
        )
    }

    /// Collision points for a damage stage, taken off the mesh that stage actually draws.
    /// The shape is convex, so handing it the vertices is enough — it wraps them itself.
    fn mesh_hull(mesh: &Gd<ArrayMesh>) -> PackedVector3Array {
        if mesh.get_surface_count() == 0 {
            return PackedVector3Array::new();
        }
        mesh.surface_get_arrays(0)
            .at(godot::classes::mesh::ArrayType::VERTEX.ord() as usize)
            .try_to::<PackedVector3Array>()
            .unwrap_or_default()
    }

    fn build_meshes(&mut self) {
        let seed = self.stone_seed as u32;
        for v in 0..VARIANTS {
            let species = v % SPECIES.len();
            let s = hash32(seed.wrapping_add(v as u32 * 7919));
            let lods = [
                build_stone_lod(s, species, 0),
                build_stone_lod(s, species, 1),
                build_stone_lod(s, species, 2),
            ];
            let height = lods[0].get_aabb().size.y.max(0.05);
            let damaged = [
                build_cracked_mesh(s, species),
                build_rubble_mesh(s, species, 5, 0.7),
            ];
            let hulls = [
                build_stone_hull(s, species),
                Self::mesh_hull(&damaged[0]),
                Self::mesh_hull(&damaged[1]),
            ];
            self.meshes.push(VariantMeshes {
                lods,
                damaged,
                hulls,
                height,
            });
        }
    }

    fn make_slot(&self, mesh: &Gd<ArrayMesh>, scenario: Rid, material: Rid) -> MmSlot {
        let mut rs = RenderingServer::singleton();
        let mm = rs.multimesh_create();
        rs.multimesh_set_mesh(mm, mesh.get_rid());
        let inst = rs.instance_create();
        rs.instance_set_scenario(inst, scenario);
        rs.instance_set_base(inst, mm);
        if material.is_valid() {
            rs.instance_geometry_set_material_override(inst, material);
        }
        rs.instance_set_custom_aabb(inst, world_aabb_at(self.extent, self.origin));
        rs.instance_set_transform(inst, Transform3D::IDENTITY);
        MmSlot { mm, inst }
    }

    fn build_multimeshes(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let scenario = world.get_scenario();
        let material = self
            .stone_material
            .as_ref()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let per_variant: Vec<Vec<Gd<ArrayMesh>>> = self
            .meshes
            .iter()
            .map(|v| {
                let mut m: Vec<Gd<ArrayMesh>> = v.lods.to_vec();
                m.extend(v.damaged.iter().cloned());
                m
            })
            .collect();
        for meshes in per_variant {
            let row: Vec<MmSlot> = meshes
                .iter()
                .map(|m| self.make_slot(m, scenario, material))
                .collect();
            self.slots.push(row);
        }
    }

    fn upload_buffers(&mut self) {
        let mut rs = RenderingServer::singleton();
        let view = self.view_origin();
        let lod1 = self.lod1_distance * self.lod1_distance;
        let lod2 = self.lod2_distance * self.lod2_distance;
        let slots_per_variant = LOD_LEVELS + 2;
        for v in 0..self.slots.len() {
            let mut bufs: Vec<Vec<f32>> = vec![Vec::new(); slots_per_variant];
            for e in self.core.entries() {
                if e.variant as usize != v {
                    continue;
                }
                let stage = self.core.stage(e.id);
                if stage >= Stone::STAGES {
                    continue;
                }
                if self.occluded(e.pos, e.scale * 2.0, view) {
                    continue;
                }
                let slot = if stage == 0 {
                    let d2 = e.pos.distance_squared_to(view) / (e.scale * e.scale).max(0.01);
                    if d2 > lod2 {
                        2
                    } else if d2 > lod1 {
                        1
                    } else {
                        0
                    }
                } else {
                    LOD_LEVELS + (stage as usize - 1).min(1)
                };
                bufs[slot].extend_from_slice(&Self::instance_rows(e));
            }
            for (si, buf) in bufs.iter().enumerate() {
                let slot = &self.slots[v][si];
                let count = (buf.len() / 12) as i32;
                rs.multimesh_allocate_data(slot.mm, count, MultimeshTransformFormat::TRANSFORM_3D);
                if count > 0 {
                    rs.multimesh_set_buffer(slot.mm, &PackedFloat32Array::from(buf.as_slice()));
                }
                rs.instance_set_visible(slot.inst, count > 0);
            }
        }
    }

    fn terrain_at(&self, x: f32, z: f32) -> f32 {
        let res = self.terrain_res;
        if res < 2 || self.terrain_heights.len() < (res * res) as usize {
            return f32::MIN;
        }
        let e = self.extent.max(1.0);
        let fx = (((x + e) / (e * 2.0)).clamp(0.0, 1.0) * (res - 1) as f32).max(0.0);
        let fz = (((z + e) / (e * 2.0)).clamp(0.0, 1.0) * (res - 1) as f32).max(0.0);
        let x0 = (fx as i32).clamp(0, res - 2);
        let z0 = (fz as i32).clamp(0, res - 2);
        let tx = fx - x0 as f32;
        let tz = fz - z0 as f32;
        let h00 = self.terrain_heights[(z0 * res + x0) as usize];
        let h10 = self.terrain_heights[(z0 * res + x0 + 1) as usize];
        let h01 = self.terrain_heights[((z0 + 1) * res + x0) as usize];
        let h11 = self.terrain_heights[((z0 + 1) * res + x0 + 1) as usize];
        (h00 + (h10 - h00) * tx) + ((h01 + (h11 - h01) * tx) - (h00 + (h10 - h00) * tx)) * tz
    }

    /// Distance culling keeps everything in a radius, hill or no hill.
    fn occluded(&self, pos: Vector3, top: f32, view: Vector3) -> bool {
        if self.terrain_res < 2 {
            return false;
        }
        let from = Vector3::new(pos.x, pos.y + top, pos.z);
        if Vector2::new(from.x, from.z).distance_to(Vector2::new(view.x, view.z))
            < self.occlusion_start
        {
            return false;
        }
        let d = view - from;
        const STEPS: i32 = 12;
        const BIAS: f32 = 0.75;
        for i in 1..STEPS {
            let t = i as f32 / STEPS as f32;
            let sp = from + d * t;
            if self.terrain_at(sp.x, sp.z) > sp.y + BIAS {
                return true;
            }
        }
        false
    }

    fn view_origin(&self) -> Vector3 {
        crate::world::view_origin(&self.base().clone(), None).unwrap_or(Vector3::ZERO)
    }

    fn build_colliders(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let space = world.get_space();
        let mut ps = PhysicsServer3D::singleton();
        for m in &self.meshes {
            for hull in &m.hulls {
                let shape = ps.convex_polygon_shape_create();
                ps.shape_set_data(shape, &hull.to_variant());
                self.shapes.push(shape);
            }
        }
        let body = ps.body_create();
        ps.body_set_mode(body, BodyMode::STATIC);
        ps.body_set_space(body, space);
        self.body = body;
        self.fill_collider_shapes();
        self.publish_sim_colliders();
    }

    fn fill_collider_shapes(&mut self) {
        if self.shapes.is_empty() {
            return;
        }
        let mut ps = PhysicsServer3D::singleton();
        ps.body_clear_shapes(self.body);
        for e in self.core.entries() {
            if !self.core.alive(e.id) {
                continue;
            }
            let stage = (self.core.stage(e.id) as usize).min(Stone::STAGES as usize - 1);
            let slot = e.variant as usize * Stone::STAGES as usize + stage;
            let Some(shape) = self.shapes.get(slot) else {
                continue;
            };
            ps.body_add_shape_ex(self.body, *shape)
                .transform(Self::instance_transform(e))
                .done();
        }
    }

    fn rebuild_colliders(&mut self) {
        if self.body.is_valid() {
            self.fill_collider_shapes();
        }
        self.publish_sim_colliders();
    }

    /// Re-registers every live rock with the sim, one batch per variant-and-stage so
    /// each distinct point cloud crosses the channel once rather than once per rock.
    #[cfg(not(feature = "rapier3d-sim"))]
    fn publish_sim_colliders(&mut self) {}

    #[cfg(feature = "rapier3d-sim")]
    fn publish_sim_colliders(&mut self) {
        let Some(mut phys) = self
            .base()
            .get_node_or_null(&self.physics_path)
            .and_then(|n| n.try_cast::<crate::rapier::bridge3d::QPhysics3D>().ok())
        else {
            return;
        };

        let taken = std::mem::take(&mut self.sim_bodies);
        if !taken.is_empty() {
            phys.bind_mut().despawn_batch(taken);
        }

        let stages = Stone::STAGES as usize;
        let mut by_slot: Vec<Array<Transform3D>> = vec![Array::new(); self.meshes.len() * stages];
        for e in self.core.entries() {
            if !self.core.alive(e.id) {
                continue;
            }
            let stage = (self.core.stage(e.id) as usize).min(stages - 1);
            let slot = e.variant as usize * stages + stage;
            if let Some(list) = by_slot.get_mut(slot) {
                list.push(Self::instance_transform(e));
            }
        }

        let mut ids = PackedInt64Array::new();
        for (slot, transforms) in by_slot.into_iter().enumerate() {
            if transforms.is_empty() {
                continue;
            }
            let Some(hull) = self
                .meshes
                .get(slot / stages)
                .and_then(|m| m.hulls.get(slot % stages))
            else {
                continue;
            };
            let spawned = phys.bind_mut().spawn_static_hulls(hull.clone(), transforms);
            ids.extend_array(&spawned);
        }
        self.sim_bodies = ids;
    }

    fn all_slots(&self) -> Vec<(Rid, Rid)> {
        self.slots
            .iter()
            .flatten()
            .map(|s| (s.mm, s.inst))
            .collect()
    }

    fn free_all(&mut self) {
        let mut rs = RenderingServer::singleton();
        for (mm, inst) in self.all_slots() {
            for rid in [inst, mm] {
                if rid.is_valid() {
                    rs.free_rid(rid);
                }
            }
        }
        self.slots.clear();
        let mut ps = PhysicsServer3D::singleton();
        if self.body.is_valid() {
            ps.free_rid(self.body);
        }
        for rid in self.shapes.drain(..) {
            if rid.is_valid() {
                ps.free_rid(rid);
            }
        }
        self.body = Rid::Invalid;
    }
}
