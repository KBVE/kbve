use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::rendering_server::MultimeshTransformFormat;
use godot::classes::{ArrayMesh, Engine, PhysicsServer3D, RenderingServer, ShaderMaterial};
use godot::prelude::*;

use crate::world::harvest::{Entry, HarvestKind, ScatterCore, Stone, stable_id};
use crate::world::stone_mesh::{SPECIES, build_cracked_mesh, build_rubble_mesh, build_stone_mesh};
use crate::world::terrain::QTerrain;

const VARIANTS: usize = 12;
const STAGE_SLOTS: usize = 3;

fn hash32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

fn randf(state: &mut u32) -> f32 {
    *state = hash32(*state);
    (*state >> 8) as f32 / 16_777_216.0
}

struct VariantMeshes {
    stages: [Gd<ArrayMesh>; STAGE_SLOTS],
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

    core: ScatterCore<Stone>,
    meshes: Vec<VariantMeshes>,
    slots: Vec<Vec<MmSlot>>,
    #[init(val = Rid::Invalid)]
    body: Rid,
    #[init(val = Rid::Invalid)]
    shape: Rid,
    extent: f32,
    dirty: bool,
}

impl QStoneField {
    fn late_init(&mut self) -> bool {
        let _t = super::ReadyTimer::start("stones");
        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        let Some(terrain) = terrain else {
            godot_error!("[QStoneField] no QTerrain found; stones disabled");
            return true;
        };
        let (heights, res, extent, water) = {
            let t = terrain.bind();
            let Some((h, r)) = t.cpu_heights() else {
                return false;
            };
            (h.to_vec(), r, t.world_extent(), t.water())
        };
        self.extent = extent;

        let sample = |x: f32, z: f32| -> f32 {
            let fx =
                (((x + extent) / (extent * 2.0)).clamp(0.001, 0.999) * res as f32 - 0.5).max(0.0);
            let fz =
                (((z + extent) / (extent * 2.0)).clamp(0.001, 0.999) * res as f32 - 0.5).max(0.0);
            let x0 = (fx as i32).clamp(0, res - 2);
            let z0 = (fz as i32).clamp(0, res - 2);
            let tx = (fx - x0 as f32).clamp(0.0, 1.0);
            let tz = (fz - z0 as f32).clamp(0.0, 1.0);
            let h00 = heights[(z0 * res + x0) as usize];
            let h10 = heights[(z0 * res + x0 + 1) as usize];
            let h01 = heights[((z0 + 1) * res + x0) as usize];
            let h11 = heights[((z0 + 1) * res + x0 + 1) as usize];
            let a = h00 + (h10 - h00) * tx;
            let b = h01 + (h11 - h01) * tx;
            a + (b - a) * tz
        };

        let mut noise = FastNoiseLite::with_seed(self.stone_seed + 3);
        noise.set_noise_type(Some(NoiseType::OpenSimplex2S));
        noise.set_frequency(Some(self.patch_frequency));

        let seed64 = self.stone_seed as u64;
        let cells = ((extent * 2.0) / self.grid_size) as i32;
        let mut placed: Vec<(f32, f32, f32)> = Vec::new();
        let overlaps = |placed: &Vec<(f32, f32, f32)>, x: f32, z: f32, r: f32| -> bool {
            placed.iter().any(|(px, pz, pr)| {
                let dx = px - x;
                let dz = pz - z;
                dx * dx + dz * dz < ((pr + r) * 0.92).powi(2)
            })
        };
        for iz in 0..cells {
            for ix in 0..cells {
                let mut state = hash32(
                    (self.stone_seed as u32)
                        .wrapping_add(hash32(ix as u32).wrapping_mul(37))
                        .wrapping_add(hash32(iz as u32)),
                );
                let jx = (randf(&mut state) - 0.5) * (self.grid_size - 5.0);
                let jz = (randf(&mut state) - 0.5) * (self.grid_size - 5.0);
                let x = -extent + (ix as f32 + 0.5) * self.grid_size + jx;
                let z = -extent + (iz as f32 + 0.5) * self.grid_size + jz;
                if x.abs() > extent - 5.0 || z.abs() > extent - 5.0 {
                    continue;
                }
                let slope = (sample(x + 1.0, z) - sample(x - 1.0, z))
                    .abs()
                    .max((sample(x, z + 1.0) - sample(x, z - 1.0)).abs())
                    * 0.5;
                if noise.get_noise_2d(x, z) < self.patch_threshold && slope < 0.32 {
                    continue;
                }
                let h = sample(x, z);
                if h < water + 0.4 {
                    continue;
                }
                let scale = self.scale_min + randf(&mut state) * (self.scale_max - self.scale_min);
                let radius = scale * 0.85;
                if overlaps(&placed, x, z, radius) {
                    continue;
                }
                placed.push((x, z, radius));
                let yaw = randf(&mut state) * std::f32::consts::TAU;
                let variant = ((randf(&mut state) * VARIANTS as f32) as usize).min(VARIANTS - 1);
                self.core.insert(Entry {
                    id: stable_id(seed64, x, z),
                    pos: Vector3::new(x, h - 0.06 * scale, z),
                    scale,
                    yaw,
                    variant: variant as u8,
                    ore: 0,
                    amount: 0,
                });
                let companions = (randf(&mut state) * 3.0) as usize;
                for _ in 0..companions {
                    let cscale = scale * (0.28 + randf(&mut state) * 0.27);
                    let cradius = cscale * 0.85;
                    let az = randf(&mut state) * std::f32::consts::TAU;
                    let dist = (radius + cradius) * (1.15 + randf(&mut state) * 0.5);
                    let cx = x + az.cos() * dist;
                    let cz = z + az.sin() * dist;
                    if cx.abs() > extent - 5.0 || cz.abs() > extent - 5.0 {
                        continue;
                    }
                    let ch = sample(cx, cz);
                    if ch < water + 0.4 {
                        continue;
                    }
                    if overlaps(&placed, cx, cz, cradius) {
                        continue;
                    }
                    placed.push((cx, cz, cradius));
                    let cyaw = randf(&mut state) * std::f32::consts::TAU;
                    let cvariant =
                        ((randf(&mut state) * VARIANTS as f32) as usize).min(VARIANTS - 1);
                    self.core.insert(Entry {
                        id: stable_id(seed64, cx, cz),
                        pos: Vector3::new(cx, ch - 0.06 * cscale, cz),
                        scale: cscale,
                        yaw: cyaw,
                        variant: cvariant as u8,
                        ore: 0,
                        amount: 0,
                    });
                }
            }
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

        self.build_meshes();
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
        if self.dirty {
            self.dirty = false;
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

    #[func]
    fn get_info(&self, id: i64) -> VarDictionary {
        let mut d = VarDictionary::new();
        let Some(e) = self.core.get(id as u64) else {
            return d;
        };
        let table = Stone::drop_table();
        let _ = d.insert("position", e.pos);
        let _ = d.insert("scale", e.scale);
        let _ = d.insert("variant", e.variant as i64);
        let _ = d.insert("stage", self.core.stage(e.id) as i64);
        let _ = d.insert("alive", self.core.alive(e.id));
        let _ = d.insert("ore", table[e.ore as usize].ore);
        let _ = d.insert("amount", e.amount as i64);
        d
    }

    #[func]
    fn apply_damage(&mut self, id: i64, hits: i64) -> VarDictionary {
        let mut d = VarDictionary::new();
        let Some(out) = self.core.apply_damage(id as u64, hits.clamp(1, 255) as u8) else {
            let _ = d.insert("hit", false);
            return d;
        };
        let _ = d.insert("hit", true);
        let _ = d.insert("stage", out.stage as i64);
        let _ = d.insert("broken", out.broken);
        let _ = d.insert("ore", out.ore);
        let _ = d.insert("amount", out.amount as i64);
        self.dirty = true;
        if out.broken {
            self.rebuild_colliders();
            let ore = GString::from(out.ore);
            let amount = out.amount as i64;
            self.signals().stone_broken().emit(id, &ore, amount);
        }
        d
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
        d
    }
}

impl QStoneField {
    fn build_meshes(&mut self) {
        let seed = self.stone_seed as u32;
        for v in 0..VARIANTS {
            let species = v % SPECIES.len();
            let s = hash32(seed.wrapping_add(v as u32 * 7919));
            self.meshes.push(VariantMeshes {
                stages: [
                    build_stone_mesh(s, species),
                    build_cracked_mesh(s, species),
                    build_rubble_mesh(s, species, 5, 0.7),
                ],
            });
        }
    }

    fn world_aabb(&self) -> Aabb {
        let e = self.extent + 10.0;
        Aabb::new(
            Vector3::new(-e, -40.0, -e),
            Vector3::new(e * 2.0, 120.0, e * 2.0),
        )
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
        rs.instance_set_custom_aabb(inst, self.world_aabb());
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
        let stage_meshes: Vec<[Gd<ArrayMesh>; STAGE_SLOTS]> =
            self.meshes.iter().map(|v| v.stages.clone()).collect();
        for stages in stage_meshes {
            let row: Vec<MmSlot> = stages
                .iter()
                .map(|m| self.make_slot(m, scenario, material))
                .collect();
            self.slots.push(row);
        }
    }

    fn upload_buffers(&mut self) {
        let mut rs = RenderingServer::singleton();
        for v in 0..self.slots.len() {
            let mut bufs: Vec<Vec<f32>> = vec![Vec::new(); STAGE_SLOTS];
            for e in self.core.entries() {
                if e.variant as usize != v {
                    continue;
                }
                let stage = self.core.stage(e.id);
                if stage >= Stone::STAGES {
                    continue;
                }
                let (c, s) = (e.yaw.cos() * e.scale, e.yaw.sin() * e.scale);
                bufs[(stage as usize).min(STAGE_SLOTS - 1)].extend_from_slice(&[
                    c, 0.0, -s, e.pos.x, 0.0, e.scale, 0.0, e.pos.y, s, 0.0, c, e.pos.z,
                ]);
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

    fn build_colliders(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let space = world.get_space();
        let mut ps = PhysicsServer3D::singleton();
        let shape = ps.sphere_shape_create();
        ps.shape_set_data(shape, &0.52f32.to_variant());
        let body = ps.body_create();
        ps.body_set_mode(body, BodyMode::STATIC);
        ps.body_set_space(body, space);
        self.body = body;
        self.shape = shape;
        self.fill_collider_shapes();
    }

    fn fill_collider_shapes(&mut self) {
        let mut ps = PhysicsServer3D::singleton();
        ps.body_clear_shapes(self.body);
        for e in self.core.entries() {
            if !self.core.alive(e.id) {
                continue;
            }
            let basis = Basis::IDENTITY.scaled(Vector3::ONE * e.scale);
            let t = Transform3D::new(basis, e.pos + Vector3::new(0.0, 0.25 * e.scale, 0.0));
            ps.body_add_shape_ex(self.body, self.shape)
                .transform(t)
                .done();
        }
    }

    fn rebuild_colliders(&mut self) {
        if self.body.is_valid() {
            self.fill_collider_shapes();
        }
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
        for rid in [self.body, self.shape] {
            if rid.is_valid() {
                ps.free_rid(rid);
            }
        }
        self.body = Rid::Invalid;
        self.shape = Rid::Invalid;
    }
}
