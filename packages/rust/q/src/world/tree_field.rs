use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::mesh::PrimitiveType;
use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::{ArrayMesh, Engine, PhysicsServer3D, ShaderMaterial, Texture2D};
use godot::prelude::*;
use godot::tools::try_load;

use crate::world::flora_compute::{FloraCompute, TerrainOcclusion};
use crate::world::{TerrainSnapshot, hash32, randf, world_aabb};

struct Growth {
    lateral_angle: [(f32, f32); 3],
    leader_angle: (f32, f32),
    phyllotaxis: f32,
    az_jitter: f32,
    length_ratio: (f32, f32),
    murray: f32,
    lateral_share: (f32, f32),
    leader_share: f32,
    tropism: (f32, f32),
    curl: f32,
    children: [u32; 3],
    shape: u32,
    fork: f32,
    up_attract: f32,
}

fn crown_shape(id: u32, f: f32) -> f32 {
    match id {
        0 => 0.55 + 0.45 * (std::f32::consts::PI * (0.15 + 0.85 * f)).sin(),
        1 => 1.0 - 0.55 * f,
        2 => 0.5 + 0.5 * f,
        _ => 1.0,
    }
}

struct TreeSpecies {
    seed_off: u32,
    height: (f32, f32),
    crown: f32,
    leaf_tex: &'static str,
    bark_color: Color,
    growth: Growth,
}

const SPECIES: &[TreeSpecies] = &[
    TreeSpecies {
        seed_off: 0,
        height: (4.2, 8.4),
        crown: 1.3,
        leaf_tex: "res://assets/environment/props/flora/euonymus/euonymus_alpha_0.png",
        bark_color: Color::from_rgba(0.38, 0.28, 0.2, 1.0),
        growth: Growth {
            lateral_angle: [(0.55, 0.2), (0.68, 0.24), (0.68, 0.24)],
            leader_angle: (0.24, 0.14),
            phyllotaxis: 2.399963,
            az_jitter: 0.35,
            length_ratio: (0.6, 0.2),
            murray: 2.49,
            lateral_share: (0.2, 0.1),
            leader_share: 0.72,
            tropism: (-0.05, 0.35),
            curl: 0.55,
            children: [6, 4, 2],
            shape: 0,
            fork: 0.42,
            up_attract: 0.12,
        },
    },
    TreeSpecies {
        seed_off: 7919,
        height: (3.4, 6.6),
        crown: 1.0,
        leaf_tex: "res://assets/environment/props/flora/euonymus/euonymus_alpha_5.png",
        bark_color: Color::from_rgba(0.52, 0.47, 0.4, 1.0),
        growth: Growth {
            lateral_angle: [(0.42, 0.15), (0.55, 0.2), (0.6, 0.2)],
            leader_angle: (0.18, 0.1),
            phyllotaxis: 2.399963,
            az_jitter: 0.3,
            length_ratio: (0.65, 0.2),
            murray: 2.49,
            lateral_share: (0.18, 0.08),
            leader_share: 0.78,
            tropism: (0.15, 0.45),
            curl: 0.4,
            children: [5, 4, 2],
            shape: 1,
            fork: 0.0,
            up_attract: 0.2,
        },
    },
    TreeSpecies {
        seed_off: 104729,
        height: (3.0, 5.8),
        crown: 1.1,
        leaf_tex: "res://assets/environment/props/flora/euonymus/euonymus_alpha_11.png",
        bark_color: Color::from_rgba(0.33, 0.24, 0.19, 1.0),
        growth: Growth {
            lateral_angle: [(0.7, 0.25), (0.8, 0.25), (0.85, 0.25)],
            leader_angle: (0.3, 0.18),
            phyllotaxis: 2.399963,
            az_jitter: 0.45,
            length_ratio: (0.55, 0.2),
            murray: 2.49,
            lateral_share: (0.22, 0.1),
            leader_share: 0.68,
            tropism: (-0.15, 0.2),
            curl: 0.7,
            children: [6, 3, 2],
            shape: 2,
            fork: 0.6,
            up_attract: 0.08,
        },
    },
];

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QTreeField {
    base: Base<Node3D>,

    init_done: bool,

    #[export]
    terrain_path: NodePath,
    #[export]
    player_path: NodePath,
    #[export]
    tree_material: Option<Gd<ShaderMaterial>>,
    #[export]
    bark_material: Option<Gd<ShaderMaterial>>,
    #[export]
    leaf_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 9001)]
    tree_seed: i32,
    #[export]
    #[init(val = 14.0)]
    grid_size: f32,
    #[export]
    #[init(val = 0.15)]
    grove_threshold: f32,
    #[export]
    #[init(val = 0.02)]
    grove_frequency: f32,
    #[export]
    #[init(val = 110.0)]
    mesh_range: f32,
    /// Draw distance for the cheap far tree LOD.
    #[export]
    #[init(val = 0.0)]
    far_range: f32,
    #[export]
    #[init(val = 0.08)]
    growth_per_day: f32,
    #[export]
    #[init(val = 0.3)]
    trunk_collider_radius: f32,

    computes: Vec<FloraCompute>,
    attempts: i32,
    candidates: Vec<f32>,
    meshes: Vec<Gd<ArrayMesh>>,
    /// Per-entry triangle count, parallel to `meshes`.
    mesh_tris: Vec<u64>,
    leaf_mats: Vec<Gd<ShaderMaterial>>,
    bark_mats: Vec<Gd<ShaderMaterial>>,
    player: Option<Gd<Node3D>>,
    last_player_pos: Vector3,
    #[init(val = -1.0)]
    prev_hour: f32,
    day_progress: f32,
    #[init(val = Rid::Invalid)]
    body: Rid,
    trunk_shapes: Vec<Rid>,
    extent: f32,
}

impl QTreeField {
    fn late_init(&mut self) -> bool {
        let _t = super::ReadyTimer::start("trees");
        self.player = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok());
        let node = self.base().clone().upcast::<godot::classes::Node>();
        let Some(terrain) = crate::world::resolve_terrain(&node, &self.terrain_path) else {
            godot_error!("[QTreeField] no QTerrain found; trees disabled");
            return true;
        };
        let Some(terra) = TerrainSnapshot::take(&terrain) else {
            return false;
        };
        let extent = terra.extent;
        let water = terra.water;
        self.extent = extent;

        let sample = |x: f32, z: f32| -> f32 { terra.height(x, z) };

        let mut noise = FastNoiseLite::with_seed(self.tree_seed + 5);
        noise.set_noise_type(Some(NoiseType::OpenSimplex2S));
        noise.set_frequency(Some(self.grove_frequency));

        let cells = ((extent * 2.0) / self.grid_size) as i32;
        let mut cand: Vec<f32> = Vec::new();
        for iz in 0..cells {
            for ix in 0..cells {
                let mut state = hash32(
                    (self.tree_seed as u32)
                        .wrapping_add(hash32(ix as u32).wrapping_mul(31))
                        .wrapping_add(hash32(iz as u32)),
                );
                let jx = (randf(&mut state) - 0.5) * (self.grid_size - 4.0);
                let jz = (randf(&mut state) - 0.5) * (self.grid_size - 4.0);
                let x = -extent + (ix as f32 + 0.5) * self.grid_size + jx;
                let z = -extent + (iz as f32 + 0.5) * self.grid_size + jz;
                if x.abs() > extent - 4.0 || z.abs() > extent - 4.0 {
                    continue;
                }
                if noise.get_noise_2d(x, z) < self.grove_threshold {
                    continue;
                }
                if terra.on_road(x, z) > 0.12 {
                    continue;
                }
                let h = sample(x, z);
                let low = sample(x + 1.5, z)
                    .min(sample(x - 1.5, z))
                    .min(sample(x, z + 1.5))
                    .min(sample(x, z - 1.5));
                if low < water + 0.6 {
                    continue;
                }
                let rank = randf(&mut state);
                let kind =
                    ((randf(&mut state) * SPECIES.len() as f32) as usize).min(SPECIES.len() - 1);
                let phase = randf(&mut state) * std::f32::consts::TAU;
                let sp = &SPECIES[kind];
                let scale = sp.height.0 + randf(&mut state) * (sp.height.1 - sp.height.0);
                cand.extend_from_slice(&[x, h - 0.17, z, scale, rank, kind as f32, phase, 0.0]);
            }
        }
        if cand.is_empty() {
            godot_error!("[QTreeField] no tree candidates survived placement");
            return true;
        }
        self.candidates = cand;
        self.build_colliders();

        {
            let mut terrain = terrain;
            let mut tb = terrain.bind_mut();
            for c in self.candidates.chunks_exact(8) {
                tb.stamp_clearance(c[0], c[2], 1.1 + c[3] * 0.18);
            }
            tb.flush_clearance();
        }

        let world = self.base().get_world_3d();
        let Some(world) = world else {
            return true;
        };
        let scenario = world.get_scenario();
        let aabb = world_aabb(extent);
        let (occl_h, occl_res) = terra.raw_heights();

        for (i, sp) in SPECIES.iter().enumerate() {
            let cands: Vec<f32> = self
                .candidates
                .chunks_exact(8)
                .filter(|c| c[5] as usize == i)
                .flatten()
                .copied()
                .collect();
            if cands.is_empty() {
                continue;
            }
            let count = (cands.len() / 8) as u32;
            let seed = (self.tree_seed as u32).wrapping_add(sp.seed_off);

            let leaf_mat = self.leaf_material.as_ref().map(|m| m.duplicate_resource());
            if let Some(mut lm) = leaf_mat.clone() {
                if let Ok(tex) = try_load::<Texture2D>(sp.leaf_tex) {
                    lm.set_shader_parameter("albedo_tex", &tex.to_variant());
                }
            }
            let bark_mat = self.bark_material.as_ref().map(|m| {
                let mut dup = m.duplicate_resource();
                dup.set_shader_parameter("bark_color", &sp.bark_color.to_variant());
                dup
            });

            let mut near = build_skeleton_tree_mesh(seed, sp);
            if let Some(m) = bark_mat.as_ref() {
                near.surface_set_material(0, m);
            }
            if let Some(m) = leaf_mat.as_ref() {
                near.surface_set_material(1, m);
            }
            let mut far = build_far_tree_mesh(seed, sp.crown);
            if let Some(m) = self.tree_material.as_ref() {
                far.surface_set_material(0, m);
            }
            if let Some(m) = leaf_mat.as_ref() {
                far.surface_set_material(1, m);
            }

            let band_lo = self.mesh_range - 8.0;
            let band_hi = self.mesh_range + 8.0;
            let near_c = FloraCompute::new(
                scenario,
                aabb,
                near.get_rid(),
                Rid::Invalid,
                &cands,
                count,
                band_hi,
                0.0,
                (band_lo, band_hi, true),
                false,
                true,
                true,
                2,
                TerrainOcclusion::new(occl_h, occl_res, extent, 25.0),
            );
            let far_c = FloraCompute::new(
                scenario,
                aabb,
                far.get_rid(),
                Rid::Invalid,
                &cands,
                count,
                if self.far_range > 0.0 {
                    self.far_range
                } else {
                    extent * 8.0
                },
                band_lo,
                (band_lo, band_hi, false),
                false,
                true,
                false,
                2,
                TerrainOcclusion::new(occl_h, occl_res, extent, 25.0),
            );
            match (near_c, far_c) {
                (Some(n), Some(f)) => {
                    self.computes.push(n);
                    self.computes.push(f);
                    self.mesh_tris.push((near.get_faces().len() / 3) as u64);
                    self.mesh_tris.push((far.get_faces().len() / 3) as u64);
                    self.meshes.push(near);
                    self.meshes.push(far);
                    if let Some(lm) = leaf_mat {
                        self.leaf_mats.push(lm);
                    }
                    if let Some(bm) = bark_mat {
                        self.bark_mats.push(bm);
                    }
                }
                (n, f) => {
                    for mut c in [n, f].into_iter().flatten() {
                        c.free();
                    }
                    godot_error!("[QTreeField] compute unavailable for species {i}");
                }
            }
        }
        if self.computes.is_empty() {
            godot_error!("[QTreeField] no tree computes online; trees disabled");
        }
        true
    }
}

#[godot_api]
impl INode3D for QTreeField {
    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() || !self.base().is_visible_in_tree() {
            return;
        }
        if !self.init_done {
            if super::q_hidden("trees") || self.late_init() {
                self.init_done = true;
            }
            return;
        }
        let player_pos = self
            .player
            .as_ref()
            .filter(|p| p.is_instance_valid())
            .map(|p| p.get_global_position());
        if let Some(p) = player_pos {
            if p.distance_squared_to(self.last_player_pos) > 0.0004 {
                self.last_player_pos = p;
                let obj = p + Vector3::new(0.0, 1.1, 0.0);
                for m in self.leaf_mats.iter_mut().chain(self.bark_mats.iter_mut()) {
                    m.set_shader_parameter("object_position", &obj.to_variant());
                }
            }
        }
        if self.computes.is_empty() {
            return;
        }
        if let Some(dn) = self.base().get_node_or_null("../DayNight") {
            let hour = dn.get("hour").try_to::<f32>().unwrap_or(-1.0);
            if hour >= 0.0 {
                if self.prev_hour >= 0.0 {
                    let mut delta = hour - self.prev_hour;
                    if delta < -12.0 {
                        delta += 24.0;
                    }
                    if delta > 0.0 && delta < 12.0 {
                        self.day_progress += delta / 24.0;
                    }
                }
                self.prev_hour = hour;
            }
        }
        let growth = (0.5 + self.day_progress * self.growth_per_day).min(1.0);
        for fc in self.computes.iter_mut() {
            fc.growth = growth;
        }
        let all_online = self
            .computes
            .iter_mut()
            .all(|fc| fc.online() || fc.try_finalize());
        if !all_online {
            self.attempts += 1;
            if self.attempts > 300 {
                godot_warn!("[QTreeField] compute never came online");
                self.free_computes();
            }
            return;
        }
        let Some(vp) = self.base().get_viewport() else {
            return;
        };
        let Some(cam) = vp.get_camera_3d() else {
            return;
        };
        let frustum = cam.get_frustum();
        if frustum.len() < 6 {
            return;
        }
        let planes = [frustum.at(2), frustum.at(3), frustum.at(4), frustum.at(5)];
        let cam_pos = cam.get_global_position();
        let _t = crate::world::StallTimer::start("trees.dispatch");
        for fc in self.computes.iter_mut() {
            fc.dispatch(cam_pos, &planes);
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                for fc in self.computes.iter_mut() {
                    fc.set_visible(visible);
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QTreeField {
    #[func]
    fn get_tree_stats(&mut self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let mut near: i64 = 0;
        let mut far: i64 = 0;
        let mut near_tris: i64 = 0;
        let mut far_tris: i64 = 0;
        for (i, fc) in self.computes.iter_mut().enumerate() {
            let n = fc.survivor_count().min(fc.cap()) as i64;
            let t = n * self.mesh_tris.get(i).copied().unwrap_or(0) as i64;
            if i % 2 == 0 {
                near += n;
                near_tris += t;
            } else {
                far += n;
                far_tris += t;
            }
        }
        let _ = d.insert("active", !self.computes.is_empty());
        let _ = d.insert("instances", near + far);
        let _ = d.insert("near", near);
        let _ = d.insert("far", far);
        let _ = d.insert("near_tris", near_tris);
        let _ = d.insert("far_tris", far_tris);
        let _ = d.insert("species", (self.computes.len() / 2) as i64);
        let _ = d.insert("candidates", (self.candidates.len() / 8) as i64);
        d
    }

    #[func]
    fn get_tree_positions(&self, max: i32) -> PackedVector3Array {
        let mut out = PackedVector3Array::new();
        for c in self.candidates.chunks_exact(8).take(max.max(0) as usize) {
            out.push(Vector3::new(c[0], c[1], c[2]));
        }
        out
    }

    #[func]
    fn get_tree_info(&self, max: i32) -> VarArray {
        let mut out = VarArray::new();
        for c in self.candidates.chunks_exact(8).take(max.max(0) as usize) {
            let mut d = VarDictionary::new();
            let _ = d.insert("pos", Vector3::new(c[0], c[1], c[2]));
            let _ = d.insert("scale", c[3]);
            let _ = d.insert("kind", c[5] as i32);
            out.push(&d.to_variant());
        }
        out
    }
}

impl QTreeField {
    fn build_colliders(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let space = world.get_space();
        let mut ps = PhysicsServer3D::singleton();
        let scale_r = self.trunk_collider_radius / 5.0;
        let buckets = [3.5f32, 5.5, 7.5];
        let shapes: Vec<Rid> = buckets
            .iter()
            .map(|s| {
                let shape = ps.cylinder_shape_create();
                let mut data = VarDictionary::new();
                let _ = data.insert("radius", scale_r * s);
                let _ = data.insert("height", 4.0);
                ps.shape_set_data(shape, &data.to_variant());
                shape
            })
            .collect();
        let body = ps.body_create();
        ps.body_set_mode(body, BodyMode::STATIC);
        ps.body_set_space(body, space);
        for c in self.candidates.chunks_exact(8) {
            let bi = if c[3] < 4.5 {
                0
            } else if c[3] < 6.5 {
                1
            } else {
                2
            };
            let t = Transform3D::IDENTITY.translated(Vector3::new(c[0], c[1] + 2.0, c[2]));
            ps.body_add_shape_ex(body, shapes[bi]).transform(t).done();
        }
        self.body = body;
        self.trunk_shapes = shapes;
    }

    fn free_computes(&mut self) {
        for mut fc in self.computes.drain(..) {
            fc.free();
        }
    }

    fn free_all(&mut self) {
        self.free_computes();
        let mut ps = PhysicsServer3D::singleton();
        for rid in std::iter::once(self.body).chain(self.trunk_shapes.drain(..)) {
            if rid.is_valid() {
                ps.free_rid(rid);
            }
        }
        self.body = Rid::Invalid;
    }
}

struct MeshBuilder {
    verts: Vec<Vector3>,
    normals: Vec<Vector3>,
    colors: Vec<Color>,
    uvs: Vec<Vector2>,
    indices: Vec<i32>,
}

impl MeshBuilder {
    fn new() -> Self {
        Self {
            verts: Vec::new(),
            normals: Vec::new(),
            colors: Vec::new(),
            uvs: Vec::new(),
            indices: Vec::new(),
        }
    }

    fn tri(&mut self, a: Vector3, b: Vector3, c: Vector3, col: Color) {
        let n = (b - a).cross(c - a).normalized();
        let base = self.verts.len() as i32;
        self.verts.extend_from_slice(&[a, b, c]);
        self.normals.extend_from_slice(&[n, n, n]);
        self.colors.extend_from_slice(&[col, col, col]);
        self.uvs.extend_from_slice(&[Vector2::ZERO; 3]);
        self.indices.extend_from_slice(&[base, base + 1, base + 2]);
    }

    fn card(&mut self, corners: [Vector3; 4], col: Color) {
        let n = (corners[1] - corners[0])
            .cross(corners[3] - corners[0])
            .normalized();
        let uv = [
            Vector2::new(0.0, 1.0),
            Vector2::new(1.0, 1.0),
            Vector2::new(1.0, 0.0),
            Vector2::new(0.0, 0.0),
        ];
        let base = self.verts.len() as i32;
        for i in 0..4 {
            self.verts.push(corners[i]);
            self.normals.push(n);
            self.colors.push(col);
            self.uvs.push(uv[i]);
        }
        self.indices
            .extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    fn ring(
        &mut self,
        center: Vector3,
        t: Vector3,
        b: Vector3,
        r: f32,
        sides: u32,
        v: f32,
        col: Color,
    ) -> Vec<i32> {
        let mut out = Vec::with_capacity(sides as usize + 1);
        for i in 0..=sides {
            let a = std::f32::consts::TAU * i as f32 / sides as f32;
            let dir = t * a.cos() + b * a.sin();
            let base = self.verts.len() as i32;
            self.verts.push(center + dir * r);
            self.normals.push(dir);
            self.colors.push(col);
            self.uvs
                .push(Vector2::new(i as f32 / sides as f32 * 2.0, v * 6.0));
            out.push(base);
        }
        out
    }

    fn bridge(&mut self, a: &[i32], b: &[i32]) {
        for i in 0..a.len() - 1 {
            let (a0, a1, b0, b1) = (a[i], a[i + 1], b[i], b[i + 1]);
            self.indices.extend_from_slice(&[a0, b0, a1, a1, b0, b1]);
        }
    }

    fn arrays(&self, with_uv: bool) -> VarArray {
        let mut arrays = VarArray::new();
        arrays.resize(
            godot::classes::mesh::ArrayType::MAX.ord() as usize,
            &Variant::nil(),
        );
        let verts = PackedVector3Array::from(self.verts.as_slice());
        let normals = PackedVector3Array::from(self.normals.as_slice());
        let colors = PackedColorArray::from(self.colors.as_slice());
        arrays.set(
            godot::classes::mesh::ArrayType::VERTEX.ord() as usize,
            &verts.to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::NORMAL.ord() as usize,
            &normals.to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::COLOR.ord() as usize,
            &colors.to_variant(),
        );
        if with_uv {
            let uvs = PackedVector2Array::from(self.uvs.as_slice());
            arrays.set(
                godot::classes::mesh::ArrayType::TEX_UV.ord() as usize,
                &uvs.to_variant(),
            );
        }
        let idx = PackedInt32Array::from(self.indices.as_slice());
        arrays.set(
            godot::classes::mesh::ArrayType::INDEX.ord() as usize,
            &idx.to_variant(),
        );
        arrays
    }
}

fn frame(dir: Vector3) -> (Vector3, Vector3) {
    let t = if dir.y.abs() > 0.95 {
        Vector3::RIGHT
    } else {
        Vector3::UP.cross(dir).normalized()
    };
    let b = dir.cross(t).normalized();
    (t, b)
}

/// How far a tuft reaches along its twig, and how tightly it hugs it across.
const TUFT_ALONG: f32 = 1.45;
const TUFT_ACROSS: f32 = 0.75;

fn leaf_cluster(
    leaves: &mut MeshBuilder,
    pos: Vector3,
    axis: Vector3,
    n_cards: u32,
    cluster_r: f32,
    card_size: f32,
    sway: f32,
    state: &mut u32,
) {
    let golden = 2.399963;
    let spin = randf(state) * std::f32::consts::TAU;
    let (ax_t, ax_b) = frame(axis);
    for i in 0..n_cards {
        let f = (i as f32 + 0.5) / n_cards as f32;
        let cosphi = (1.0 - 2.0 * f) * 0.6;
        let sinphi = (1.0 - cosphi * cosphi).max(0.0).sqrt();
        let theta = spin + golden * i as f32;
        let offset = axis * (cosphi * TUFT_ALONG)
            + ax_t * (theta.cos() * sinphi * TUFT_ACROSS)
            + ax_b * (theta.sin() * sinphi * TUFT_ACROSS);
        let dir = offset.normalized();
        let c = pos + offset * cluster_r * (0.8 + randf(state) * 0.4);
        let (t0, b0) = frame(dir);
        let roll = randf(state) * std::f32::consts::TAU;
        let t = t0 * roll.cos() + b0 * roll.sin();
        let b = dir.cross(t).normalized();
        let hs = card_size * (0.85 + randf(state) * 0.3);
        let col = Color::from_rgba(1.0, 1.0, 1.0, sway);
        leaves.card(
            [
                c - t * hs - b * hs,
                c + t * hs - b * hs,
                c + t * hs + b * hs,
                c - t * hs + b * hs,
            ],
            col,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn limb(
    bark: &mut MeshBuilder,
    leaves: &mut MeshBuilder,
    start: Vector3,
    dir: Vector3,
    len: f32,
    r0: f32,
    r1: f32,
    taper_pow: f32,
    curve: Vector3,
    sides: u32,
    depth: u32,
    sway: f32,
    crown: f32,
    g: &Growth,
    state: &mut u32,
) {
    let segs = match depth {
        0 => 4,
        1 => 3,
        _ => 2,
    };
    let col = Color::from_rgba(1.0, 1.0, 1.0, sway);
    let bend = if depth == 0 { 0.18 } else { 0.35 };
    let step = len / segs as f32;
    let mut nodes: Vec<Vector3> = vec![start];
    let mut segd: Vec<Vector3> = Vec::new();
    {
        let mut p = start;
        let mut d = dir;
        for k in 0..segs {
            let (jt, jb) = frame(d);
            let jitter = (jt * (randf(state) - 0.5) + jb * (randf(state) - 0.5)) * step * bend;
            let thin = (k + 1) as f32 / segs as f32;
            let up_amt = 0.06 + g.up_attract * thin * if depth >= 2 { 1.0 } else { 0.25 };
            d = (d * step + jitter + Vector3::UP * step * up_amt + curve * step * 0.5).normalized();
            p = p + d * step;
            nodes.push(p);
            segd.push(d);
        }
    }
    let base_r = |f: f32| r0 + (r1 - r0) * f.powf(taper_pow);
    let mut specs: Vec<(f32, bool, f32, f32, f32, f32)> = Vec::new();
    if depth < 3 {
        let n_children = g.children[depth as usize];
        let az0 = randf(state) * std::f32::consts::TAU;
        let mut lead_az = 0.0f32;
        let mut lead_seen = false;
        for c in 0..n_children {
            let leader = depth == 0 && c + 2 >= n_children;
            let frac = if leader {
                1.0
            } else if depth == 0 {
                let n_lat = (n_children - 2).max(1);
                let u = c as f32 / (n_lat.saturating_sub(1)).max(1) as f32;
                (0.58 + 0.3 * u.powf(0.65)).min(0.88)
            } else {
                let u = c as f32 / (n_children - 1).max(1) as f32;
                (0.45 + 0.43 * u.powf(0.65)).min(0.88)
            };
            let mut az = az0 + g.phyllotaxis * c as f32 + (randf(state) - 0.5) * g.az_jitter;
            if leader && g.fork > 0.0 {
                if lead_seen {
                    az = lead_az + std::f32::consts::PI + (randf(state) - 0.5) * 0.4;
                } else {
                    lead_az = az;
                    lead_seen = true;
                }
            }
            let second = leader && g.fork > 0.0 && c + 1 == n_children;
            let ang = if leader {
                if g.fork > 0.0 {
                    g.fork * if second { 1.18 } else { 0.85 } + randf(state) * 0.12
                } else {
                    g.leader_angle.0 + randf(state) * g.leader_angle.1
                }
            } else {
                let (ab, aj) = g.lateral_angle[depth as usize];
                ab + randf(state) * aj
            };
            let share = if leader {
                if g.fork > 0.0 {
                    if second { 0.5 } else { 0.64 }
                } else {
                    g.leader_share
                }
            } else {
                g.lateral_share.0 + randf(state) * g.lateral_share.1
            };
            let mut lr = g.length_ratio.0 + randf(state) * g.length_ratio.1;
            if depth == 0 && !leader {
                lr *= crown_shape(g.shape, ((frac - 0.55) / 0.35).clamp(0.0, 1.0));
            }
            specs.push((frac, leader, az, ang, share, lr));
        }
    }
    let mut drops: Vec<(f32, f32)> = specs
        .iter()
        .filter(|s| !s.1)
        .map(|s| {
            let cr = base_r(s.0) * s.4.powf(1.0 / g.murray);
            (s.0, cr * cr * 0.5)
        })
        .collect();
    drops.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    let r_of = |f: f32| {
        let mut a = base_r(f) * base_r(f);
        for (fc, dsq) in &drops {
            if *fc < f {
                a -= dsq;
            }
        }
        a.max(r1 * r1 * 0.55).sqrt()
    };
    let (mut ft, _) = frame(segd[0]);
    let mut fb;
    let mut prev: Option<Vec<i32>> = None;
    let mut first: Option<Vec<i32>> = None;
    let mut v = 0.0f32;
    for i in 0..=segs {
        let f = i as f32 / segs as f32;
        let r = r_of(f);
        let n = if i == 0 {
            segd[0]
        } else if i == segs {
            segd[segs - 1]
        } else {
            (segd[i - 1] + segd[i]).normalized()
        };
        ft = (ft - n * ft.dot(n)).normalized();
        fb = n.cross(ft).normalized();
        let ring = bark.ring(nodes[i], ft, fb, r, sides, v, col);
        if let Some(pr) = prev.as_ref() {
            bark.bridge(pr, &ring);
        }
        if i == 0 {
            first = Some(ring.clone());
        }
        prev = Some(ring);
        v += step;
    }
    if let Some(pr) = prev.as_ref() {
        let tipp = nodes[segs] + segd[segs - 1] * (r1 * 0.8);
        let pts: Vec<Vector3> = pr.iter().map(|i| bark.verts[*i as usize]).collect();
        for w in pts.windows(2) {
            bark.tri(tipp, w[0], w[1], col);
        }
    }
    if let Some(fr) = first.as_ref() {
        let backp = nodes[0] - segd[0] * (r0 * 0.5);
        let pts: Vec<Vector3> = fr.iter().map(|i| bark.verts[*i as usize]).collect();
        for w in pts.windows(2) {
            bark.tri(backp, w[1], w[0], col);
        }
    }
    let tip = nodes[segs];
    if depth == 0 {
        let n_roots = 5 + (randf(state) * 3.0) as u32;
        let raz0 = randf(state) * std::f32::consts::TAU;
        for i in 0..n_roots {
            let az = raz0
                + std::f32::consts::TAU * i as f32 / n_roots as f32
                + (randf(state) - 0.5) * 0.5;
            let f = 0.05 + randf(state) * 0.1;
            let ff = f * segs as f32;
            let i0 = (ff as usize).min(segs - 1);
            let bp = nodes[i0] + (nodes[i0 + 1] - nodes[i0]) * (ff - i0 as f32);
            let pd = segd[i0];
            let (t, b) = frame(pd);
            let out = t * az.cos() + b * az.sin();
            let r_at = r_of(f);
            let rr = r_at * (0.42 + randf(state) * 0.16);
            let reach = 0.3 + randf(state) * 0.22;
            let sink = start.y - 0.07 - randf(state) * 0.05;
            let rd = (out - Vector3::UP * 0.2).normalized();
            let (rt, rb) = frame(rd);
            let wobble = (randf(state) - 0.5) * 0.6;
            let mut prev_ring: Option<Vec<i32>> = None;
            for k in 0..=4 {
                let tt = k as f32 / 4.0;
                let sway_az = az + wobble * tt;
                let dirk = t * sway_az.cos() + b * sway_az.sin();
                let horiz = Vector3::new(dirk.x, 0.0, dirk.z).normalized();
                let u = ((tt - 0.25) / 0.75).clamp(0.0, 1.0);
                let yk = bp.y + (sink - bp.y) * (u * u * (3.0 - 2.0 * u));
                let pos = Vector3::new(bp.x, yk, bp.z) + horiz * reach * tt;
                let rk = (rr * (1.0 - tt).powf(1.8)).max(0.004);
                let ring = bark.ring(pos, rt, rb, rk, 5, reach * tt, col);
                if let Some(pr) = prev_ring.as_ref() {
                    bark.bridge(pr, &ring);
                }
                prev_ring = Some(ring);
            }
        }
    }
    if depth < 3 {
        for (frac, leader, az, ang, share, lr) in specs.iter().copied() {
            let f = (frac * segs as f32).clamp(0.0, segs as f32);
            let i0 = (f as usize).min(segs - 1);
            let tt = f - i0 as f32;
            let mut bp = nodes[i0] + (nodes[i0 + 1] - nodes[i0]) * tt;
            let pd = segd[i0];
            if leader {
                bp -= pd * (r1 * 0.9);
            }
            let (t, b) = frame(pd);
            let out = t * az.cos() + b * az.sin();
            let cd = if leader && g.fork <= 0.0 {
                (pd * ang.cos() + (out * 0.6 + Vector3::UP * 0.8).normalized() * ang.sin())
                    .normalized()
            } else {
                (pd * ang.cos() + out * ang.sin()).normalized()
            };
            let trop = if depth >= 1 { g.tropism.1 } else { g.tropism.0 };
            let ccurve = if leader && g.fork <= 0.0 {
                Vector3::ZERO
            } else if leader {
                (out * 0.3 + Vector3::UP * 0.5).normalized() * 0.35
            } else {
                (out * (1.0 - trop.abs() * 0.5) + Vector3::UP * trop).normalized() * g.curl
            };
            let cl = len * lr;
            let cr0 = (r_of(frac) * share.powf(1.0 / g.murray)).max(0.006);
            let child_sway = (sway + 0.3).min(0.9);
            limb(
                bark,
                leaves,
                bp,
                cd,
                cl,
                cr0,
                (cr0 * 0.4).max(0.004),
                1.0,
                ccurve,
                sides.saturating_sub(1).max(3),
                depth + 1,
                child_sway,
                crown,
                g,
                state,
            );
        }
        if depth > 0 {
            leaf_cluster(
                leaves,
                tip,
                segd[segs - 1],
                (10.0 * crown) as u32,
                0.095 * crown,
                0.044 * crown,
                (sway + 0.3).min(0.9),
                state,
            );
        }
    } else {
        let twig = (tip - start).normalized();
        leaf_cluster(
            leaves,
            tip,
            twig,
            (16.0 * crown) as u32,
            0.11 * crown,
            0.045 * crown,
            0.9,
            state,
        );
        leaf_cluster(
            leaves,
            start + (tip - start) * 0.78,
            twig,
            (9.0 * crown) as u32,
            0.085 * crown,
            0.041 * crown,
            (sway + 0.25).min(0.9),
            state,
        );
        leaf_cluster(
            leaves,
            start + (tip - start) * 0.55,
            twig,
            (6.0 * crown) as u32,
            0.07 * crown,
            0.039 * crown,
            (sway + 0.2).min(0.9),
            state,
        );
    }
}

fn build_skeleton_tree_mesh(seed: u32, sp: &TreeSpecies) -> Gd<ArrayMesh> {
    let crown = sp.crown;
    let mut bark = MeshBuilder::new();
    let mut leaves = MeshBuilder::new();
    let mut state = hash32(seed | 1);

    let lean = Vector3::new(
        (randf(&mut state) - 0.5) * 0.2,
        1.0,
        (randf(&mut state) - 0.5) * 0.2,
    )
    .normalized();
    limb(
        &mut bark,
        &mut leaves,
        Vector3::new(0.0, -0.05, 0.0),
        lean,
        0.68,
        0.12,
        0.028,
        0.42,
        Vector3::ZERO,
        7,
        0,
        0.0,
        crown,
        &sp.growth,
        &mut state,
    );

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &bark.arrays(true));
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &leaves.arrays(true));
    am
}

fn build_far_tree_mesh(seed: u32, crown: f32) -> Gd<ArrayMesh> {
    let mut mb = MeshBuilder::new();
    let mut state = hash32(seed | 1);

    let trunk = Color::from_rgba(0.36, 0.26, 0.18, 0.0);
    let sides = 6;
    let r0 = 0.045;
    let r1 = 0.03;
    let top = 0.45;
    for i in 0..sides {
        let a0 = std::f32::consts::TAU * i as f32 / sides as f32;
        let a1 = std::f32::consts::TAU * (i + 1) as f32 / sides as f32;
        let b0 = Vector3::new(a0.cos() * r0, 0.0, a0.sin() * r0);
        let b1 = Vector3::new(a1.cos() * r0, 0.0, a1.sin() * r0);
        let t0 = Vector3::new(a0.cos() * r1, top, a0.sin() * r1);
        let t1 = Vector3::new(a1.cos() * r1, top, a1.sin() * r1);
        mb.tri(b0, t0, b1, trunk);
        mb.tri(b1, t0, t1, trunk);
    }

    let greens = [
        Color::from_rgba(0.32, 0.52, 0.24, 1.0),
        Color::from_rgba(0.4, 0.6, 0.26, 1.0),
        Color::from_rgba(0.27, 0.46, 0.22, 1.0),
    ];
    let blob = |center: Vector3, radius: Vector3, mb: &mut MeshBuilder, state: &mut u32| {
        let ring_n = 6;
        let base_phase = randf(state) * std::f32::consts::TAU;
        let top = center
            + Vector3::new(
                (randf(state) - 0.5) * radius.x * 0.3,
                radius.y,
                (randf(state) - 0.5) * radius.z * 0.3,
            );
        let bottom = center - Vector3::new(0.0, radius.y * 0.85, 0.0);
        let mut upper: Vec<Vector3> = Vec::with_capacity(ring_n);
        let mut lower: Vec<Vector3> = Vec::with_capacity(ring_n);
        for i in 0..ring_n {
            let a = base_phase + std::f32::consts::TAU * i as f32 / ring_n as f32;
            let w0 = 0.9 + randf(state) * 0.2;
            let w1 = 0.9 + randf(state) * 0.2;
            upper.push(
                center
                    + Vector3::new(
                        a.cos() * radius.x * 0.75 * w0,
                        radius.y * (0.5 + (randf(state) - 0.5) * 0.15),
                        a.sin() * radius.z * 0.75 * w0,
                    ),
            );
            let a2 = a + std::f32::consts::TAU / (ring_n as f32 * 2.0);
            lower.push(
                center
                    + Vector3::new(
                        a2.cos() * radius.x * 0.95 * w1,
                        radius.y * (-0.35 + (randf(state) - 0.5) * 0.15),
                        a2.sin() * radius.z * 0.95 * w1,
                    ),
            );
        }
        for i in 0..ring_n {
            let j = (i + 1) % ring_n;
            let cu = greens[(randf(state) * 3.0) as usize % 3];
            let cm = greens[(randf(state) * 3.0) as usize % 3];
            let cm2 = greens[(randf(state) * 3.0) as usize % 3];
            let cb = greens[(randf(state) * 3.0) as usize % 3];
            mb.tri(top, upper[i], upper[j], cu);
            mb.tri(upper[i], lower[i], upper[j], cm);
            mb.tri(upper[j], lower[i], lower[j], cm2);
            mb.tri(bottom, lower[j], lower[i], cb);
        }
    };
    let cw = crown;
    let blob_defs = [
        (
            Vector3::new(0.0, 0.6, 0.0),
            Vector3::new(0.42 * cw, 0.26 * cw, 0.42 * cw),
        ),
        (
            Vector3::new(0.24 * cw, 0.52, 0.12 * cw),
            Vector3::new(0.24 * cw, 0.18 * cw, 0.24 * cw),
        ),
        (
            Vector3::new(-0.26 * cw, 0.55, -0.1 * cw),
            Vector3::new(0.22 * cw, 0.17 * cw, 0.22 * cw),
        ),
        (
            Vector3::new(0.01, 0.78, -0.03),
            Vector3::new(0.24 * cw, 0.18 * cw, 0.24 * cw),
        ),
    ];
    for (c, r) in blob_defs {
        blob(c, r, &mut mb, &mut state);
    }

    let mut leaves = MeshBuilder::new();
    for (c, r) in blob_defs {
        let cards = if r.x > 0.25 { 8 } else { 5 };
        for _ in 0..cards {
            let theta = randf(&mut state) * std::f32::consts::TAU;
            let cosphi = -0.25 + randf(&mut state) * 1.15;
            let sinphi = (1.0 - cosphi * cosphi).max(0.0).sqrt();
            let dir = Vector3::new(theta.cos() * sinphi, cosphi, theta.sin() * sinphi);
            let pos = c + Vector3::new(dir.x * r.x, dir.y * r.y, dir.z * r.z) * 0.85;
            let (t0, b0) = frame(dir);
            let roll = randf(&mut state) * std::f32::consts::TAU;
            let t = t0 * roll.cos() + b0 * roll.sin();
            let b = dir.cross(t).normalized();
            let hs = (0.12 + randf(&mut state) * 0.07) * crown;
            let sway = ((pos.y - 0.4) / 0.6).clamp(0.2, 1.0);
            let col = Color::from_rgba(1.0, 1.0, 1.0, sway);
            leaves.card(
                [
                    pos - t * hs - b * hs,
                    pos + t * hs - b * hs,
                    pos + t * hs + b * hs,
                    pos - t * hs + b * hs,
                ],
                col,
            );
        }
    }

    for (i, c) in mb.colors.iter_mut().enumerate() {
        let y = mb.verts[i].y;
        let w = if c.a < 0.5 {
            0.0
        } else {
            ((y - 0.4) / 0.6).clamp(0.0, 1.0)
        };
        c.a = w;
    }

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &mb.arrays(false));
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &leaves.arrays(true));
    am
}
