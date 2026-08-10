use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::rendering_server::MultimeshTransformFormat;
use godot::classes::{
    Engine, Mesh, MeshInstance3D, PackedScene, PhysicsServer3D, RenderingServer, ShaderMaterial,
};
use godot::prelude::*;
use godot::tools::try_load;

use crate::world::harvest::{Entry, HarvestKind, ScatterCore, Stone, stable_id};
use crate::world::terrain::QTerrain;

const VARIANTS: usize = 3;
const CHUNKS: usize = 5;

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
    whole: Gd<Mesh>,
    chunks: Vec<Gd<Mesh>>,
}

struct MmSlot {
    mm: Rid,
    inst: Rid,
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QStoneField {
    base: Base<Node3D>,

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
    #[init(val = 0.9)]
    scale_min: f32,
    #[export]
    #[init(val = 1.7)]
    scale_max: f32,

    core: ScatterCore<Stone>,
    meshes: Vec<VariantMeshes>,
    whole_slots: Vec<MmSlot>,
    chunk_slots: Vec<Vec<MmSlot>>,
    #[init(val = Rid::Invalid)]
    body: Rid,
    #[init(val = Rid::Invalid)]
    shape: Rid,
    extent: f32,
    dirty: bool,
}

#[godot_api]
impl INode3D for QStoneField {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        let Some(terrain) = terrain else {
            godot_error!("[QStoneField] no QTerrain found; stones disabled");
            return;
        };
        let (heights, res, extent, water) = {
            let t = terrain.bind();
            let Some((h, r)) = t.cpu_heights() else {
                godot_error!("[QStoneField] terrain has no CPU heights; stones disabled");
                return;
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
                let yaw = randf(&mut state) * std::f32::consts::TAU;
                let variant = ((randf(&mut state) * VARIANTS as f32) as usize).min(VARIANTS - 1);
                self.core.insert(Entry {
                    id: stable_id(seed64, x, z),
                    pos: Vector3::new(x, h - 0.1 * scale, z),
                    scale,
                    yaw,
                    variant: variant as u8,
                    ore: 0,
                    amount: 0,
                });
            }
        }
        if self.core.entries().is_empty() {
            godot_error!("[QStoneField] no stone candidates survived placement");
            return;
        }

        if !self.load_meshes() {
            godot_error!("[QStoneField] rock meshes failed to load; stones disabled");
            return;
        }
        self.build_multimeshes();
        self.build_colliders();
        self.dirty = true;
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
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
    fn load_meshes(&mut self) -> bool {
        for v in 0..VARIANTS {
            let path = format!("res://assets/environment/props/rocks/rock_{v}.glb");
            let Ok(scene) = try_load::<PackedScene>(&path) else {
                godot_error!("[QStoneField] missing {path}");
                return false;
            };
            let Some(root) = scene.instantiate() else {
                return false;
            };
            let mut whole: Option<Gd<Mesh>> = None;
            let mut chunks: Vec<Gd<Mesh>> = Vec::new();
            for child in root.get_children().iter_shared() {
                let Ok(mi) = child.try_cast::<MeshInstance3D>() else {
                    continue;
                };
                let Some(mesh) = mi.get_mesh() else {
                    continue;
                };
                if mi.get_name().to_string().contains("chunk") {
                    chunks.push(mesh);
                } else {
                    whole = Some(mesh);
                }
            }
            root.free();
            let Some(whole) = whole else {
                godot_error!("[QStoneField] no whole mesh in {path}");
                return false;
            };
            self.meshes.push(VariantMeshes { whole, chunks });
        }
        true
    }

    fn world_aabb(&self) -> Aabb {
        let e = self.extent + 10.0;
        Aabb::new(
            Vector3::new(-e, -40.0, -e),
            Vector3::new(e * 2.0, 120.0, e * 2.0),
        )
    }

    fn make_slot(&self, mesh: &Gd<Mesh>, scenario: Rid, material: Rid) -> MmSlot {
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
        let mesh_ptrs: Vec<(Gd<Mesh>, Vec<Gd<Mesh>>)> = self
            .meshes
            .iter()
            .map(|v| (v.whole.clone(), v.chunks.clone()))
            .collect();
        for (whole, chunks) in mesh_ptrs {
            let slot = self.make_slot(&whole, scenario, material);
            self.whole_slots.push(slot);
            let mut cs = Vec::new();
            for c in &chunks {
                cs.push(self.make_slot(c, scenario, material));
            }
            self.chunk_slots.push(cs);
        }
    }

    fn upload_buffers(&mut self) {
        let mut rs = RenderingServer::singleton();
        for v in 0..self.whole_slots.len() {
            let mut whole_buf: Vec<f32> = Vec::new();
            let mut chunk_bufs: Vec<Vec<f32>> = vec![Vec::new(); self.chunk_slots[v].len()];
            for e in self.core.entries() {
                if e.variant as usize != v {
                    continue;
                }
                let stage = self.core.stage(e.id);
                if stage >= Stone::STAGES {
                    continue;
                }
                let (c, s) = (e.yaw.cos() * e.scale, e.yaw.sin() * e.scale);
                let row = [
                    c, 0.0, -s, e.pos.x, 0.0, e.scale, 0.0, e.pos.y, s, 0.0, c, e.pos.z,
                ];
                if stage == 0 {
                    whole_buf.extend_from_slice(&row);
                } else {
                    for (ci, buf) in chunk_bufs.iter_mut().enumerate() {
                        if ci >= (stage as usize - 1) * 2 {
                            buf.extend_from_slice(&row);
                        }
                    }
                }
            }
            let fill = |rs: &mut Gd<RenderingServer>, slot: &MmSlot, buf: &[f32]| {
                let count = (buf.len() / 12) as i32;
                rs.multimesh_allocate_data(slot.mm, count, MultimeshTransformFormat::TRANSFORM_3D);
                if count > 0 {
                    rs.multimesh_set_buffer(slot.mm, &PackedFloat32Array::from(buf));
                }
                rs.instance_set_visible(slot.inst, count > 0);
            };
            fill(&mut rs, &self.whole_slots[v], &whole_buf);
            for (ci, buf) in chunk_bufs.iter().enumerate() {
                fill(&mut rs, &self.chunk_slots[v][ci], buf);
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
        let mut out: Vec<(Rid, Rid)> = Vec::new();
        for s in &self.whole_slots {
            out.push((s.mm, s.inst));
        }
        for cs in &self.chunk_slots {
            for s in cs {
                out.push((s.mm, s.inst));
            }
        }
        out
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
        self.whole_slots.clear();
        self.chunk_slots.clear();
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
