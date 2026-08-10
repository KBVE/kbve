use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::mesh::PrimitiveType;
use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::{ArrayMesh, Engine, PhysicsServer3D, ShaderMaterial};
use godot::prelude::*;

use crate::world::flora_compute::FloraCompute;
use crate::world::terrain::QTerrain;

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

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QTreeField {
    base: Base<Node3D>,

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
    #[init(val = 3.6)]
    height_min: f32,
    #[export]
    #[init(val = 6.5)]
    height_max: f32,
    #[export]
    #[init(val = 90.0)]
    mesh_range: f32,
    #[export]
    #[init(val = 0.3)]
    trunk_collider_radius: f32,

    near_compute: Option<FloraCompute>,
    far_compute: Option<FloraCompute>,
    attempts: i32,
    candidates: Vec<f32>,
    near_mesh: Option<Gd<ArrayMesh>>,
    far_mesh: Option<Gd<ArrayMesh>>,
    player: Option<Gd<Node3D>>,
    last_player_pos: Vector3,
    #[init(val = Rid::Invalid)]
    body: Rid,
    #[init(val = Rid::Invalid)]
    trunk_shape: Rid,
    extent: f32,
}

#[godot_api]
impl INode3D for QTreeField {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.player = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok());
        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        let Some(terrain) = terrain else {
            godot_error!("[QTreeField] no QTerrain found; trees disabled");
            return;
        };
        let (heights, res, extent, water) = {
            let t = terrain.bind();
            let Some((h, r)) = t.cpu_heights() else {
                godot_error!("[QTreeField] terrain has no CPU heights; trees disabled");
                return;
            };
            (h.to_vec(), r, t.world_extent(), t.water())
        };
        self.extent = extent;

        let sample = |x: f32, z: f32| -> f32 {
            let u = ((x + extent) / (extent * 2.0)).clamp(0.001, 0.999);
            let v = ((z + extent) / (extent * 2.0)).clamp(0.001, 0.999);
            let px = ((u * res as f32) as i32).clamp(0, res - 1);
            let py = ((v * res as f32) as i32).clamp(0, res - 1);
            heights[(py * res + px) as usize]
        };

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
                let h = sample(x, z);
                let low = sample(x + 1.5, z)
                    .min(sample(x - 1.5, z))
                    .min(sample(x, z + 1.5))
                    .min(sample(x, z - 1.5));
                if low < water + 0.6 {
                    continue;
                }
                let rank = randf(&mut state);
                let kind = (randf(&mut state) * 3.0).floor();
                let phase = randf(&mut state) * std::f32::consts::TAU;
                let scale =
                    self.height_min + randf(&mut state) * (self.height_max - self.height_min);
                cand.extend_from_slice(&[x, h - 0.15, z, scale, rank, kind, phase, 0.0]);
            }
        }
        if cand.is_empty() {
            godot_error!("[QTreeField] no tree candidates survived placement");
            return;
        }
        self.candidates = cand;

        let mut near = build_skeleton_tree_mesh(self.tree_seed as u32);
        if let Some(m) = self.bark_material.as_ref() {
            near.surface_set_material(0, m);
        }
        if let Some(m) = self.leaf_material.as_ref() {
            near.surface_set_material(1, m);
        }
        let mut far = build_far_tree_mesh(self.tree_seed as u32);
        if let Some(m) = self.tree_material.as_ref() {
            far.surface_set_material(0, m);
        }
        if let Some(m) = self.leaf_material.as_ref() {
            far.surface_set_material(1, m);
        }
        self.near_mesh = Some(near);
        self.far_mesh = Some(far);
        self.build_colliders();

        let count = (self.candidates.len() / 8) as u32;
        let world = self.base().get_world_3d();
        let (Some(world), Some(near_rid), Some(far_rid)) = (
            world,
            self.near_mesh.as_ref().map(|m| m.get_rid()),
            self.far_mesh.as_ref().map(|m| m.get_rid()),
        ) else {
            return;
        };
        let e = extent + 10.0;
        let aabb = Aabb::new(
            Vector3::new(-e, -40.0, -e),
            Vector3::new(e * 2.0, 120.0, e * 2.0),
        );
        let scenario = world.get_scenario();
        self.near_compute = FloraCompute::new(
            scenario,
            aabb,
            near_rid,
            Rid::Invalid,
            &self.candidates,
            count,
            self.mesh_range,
            0.0,
            false,
            true,
            2,
        );
        self.far_compute = FloraCompute::new(
            scenario,
            aabb,
            far_rid,
            Rid::Invalid,
            &self.candidates,
            count,
            extent * 8.0,
            self.mesh_range,
            false,
            true,
            2,
        );
        if self.near_compute.is_none() || self.far_compute.is_none() {
            godot_error!("[QTreeField] compute unavailable; trees disabled");
            self.free_computes();
        }
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() || !self.base().is_visible_in_tree() {
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
                if let Some(m) = self.leaf_material.as_mut() {
                    let obj = p + Vector3::new(0.0, 1.1, 0.0);
                    m.set_shader_parameter("object_position", &obj.to_variant());
                }
            }
        }
        if self.near_compute.is_none() {
            return;
        }
        let near_online = self
            .near_compute
            .as_mut()
            .is_some_and(|fc| fc.online() || fc.try_finalize());
        let far_online = self
            .far_compute
            .as_mut()
            .is_some_and(|fc| fc.online() || fc.try_finalize());
        if !near_online || !far_online {
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
        if let Some(fc) = self.near_compute.as_mut() {
            fc.dispatch(cam_pos, &planes);
        }
        if let Some(fc) = self.far_compute.as_mut() {
            fc.dispatch(cam_pos, &planes);
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                for fc in [self.near_compute.as_mut(), self.far_compute.as_mut()]
                    .into_iter()
                    .flatten()
                {
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
        if let Some(fc) = self.near_compute.as_mut() {
            near = fc.survivor_count().min(fc.cap()) as i64;
        }
        if let Some(fc) = self.far_compute.as_mut() {
            far = fc.survivor_count().min(fc.cap()) as i64;
        }
        let _ = d.insert("active", self.near_compute.is_some());
        let _ = d.insert("instances", near + far);
        let _ = d.insert("near", near);
        let _ = d.insert("far", far);
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
}

impl QTreeField {
    fn build_colliders(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let space = world.get_space();
        let mut ps = PhysicsServer3D::singleton();
        let shape = ps.cylinder_shape_create();
        let mut data = VarDictionary::new();
        let _ = data.insert("radius", self.trunk_collider_radius);
        let _ = data.insert("height", 4.0);
        ps.shape_set_data(shape, &data.to_variant());
        let body = ps.body_create();
        ps.body_set_mode(body, BodyMode::STATIC);
        ps.body_set_space(body, space);
        for c in self.candidates.chunks_exact(8) {
            let t = Transform3D::IDENTITY.translated(Vector3::new(c[0], c[1] + 2.0, c[2]));
            ps.body_add_shape_ex(body, shape).transform(t).done();
        }
        self.body = body;
        self.trunk_shape = shape;
    }

    fn free_computes(&mut self) {
        for mut fc in [self.near_compute.take(), self.far_compute.take()]
            .into_iter()
            .flatten()
        {
            fc.free();
        }
    }

    fn free_all(&mut self) {
        self.free_computes();
        let mut ps = PhysicsServer3D::singleton();
        for rid in [self.body, self.trunk_shape] {
            if rid.is_valid() {
                ps.free_rid(rid);
            }
        }
        self.body = Rid::Invalid;
        self.trunk_shape = Rid::Invalid;
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

fn leaf_cluster(
    leaves: &mut MeshBuilder,
    pos: Vector3,
    n_cards: u32,
    cluster_r: f32,
    card_size: f32,
    sway: f32,
    state: &mut u32,
) {
    let golden = 2.399963;
    let spin = randf(state) * std::f32::consts::TAU;
    for i in 0..n_cards {
        let f = (i as f32 + 0.5) / n_cards as f32;
        let cosphi = (1.0 - 2.0 * f) * 0.6;
        let sinphi = (1.0 - cosphi * cosphi).max(0.0).sqrt();
        let theta = spin + golden * i as f32;
        let dir = Vector3::new(theta.cos() * sinphi, cosphi, theta.sin() * sinphi);
        let c = pos + dir * cluster_r * (0.8 + randf(state) * 0.4);
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
    sides: u32,
    depth: u32,
    sway: f32,
    state: &mut u32,
) {
    let segs = if depth == 0 { 3 } else { 2 };
    let col = Color::from_rgba(1.0, 1.0, 1.0, sway);
    let mut p = start;
    let mut d = dir;
    let mut prev: Option<Vec<i32>> = None;
    let mut v = 0.0f32;
    for i in 0..=segs {
        let f = i as f32 / segs as f32;
        let r = r0 + (r1 - r0) * f;
        let (t, b) = frame(d);
        let ring = bark.ring(p, t, b, r, sides, v, col);
        if let Some(pr) = prev.as_ref() {
            bark.bridge(pr, &ring);
        }
        prev = Some(ring);
        if i < segs {
            let step = len / segs as f32;
            let (t2, b2) = frame(d);
            let jitter = (t2 * (randf(state) - 0.5) + b2 * (randf(state) - 0.5)) * step * 0.35;
            d = (d * step + jitter + Vector3::UP * step * 0.06).normalized();
            p = p + d * step;
            v += step;
        }
    }
    let tip = p;
    if depth < 2 {
        let n_children = if depth == 0 { 6 } else { 3 };
        let az0 = randf(state) * std::f32::consts::TAU;
        for c in 0..n_children {
            let leader = depth == 0 && c >= n_children - 2;
            let frac = if depth == 0 {
                if leader {
                    1.0
                } else {
                    0.5 + 0.5 * (c as f32 / (n_children - 3).max(1) as f32)
                }
            } else {
                0.45 + 0.55 * (c as f32 / (n_children - 1).max(1) as f32)
            };
            let bp = start + (tip - start) * frac;
            let (t, b) = frame(dir);
            let az = az0
                + std::f32::consts::TAU * c as f32 / n_children as f32
                + (randf(state) - 0.5) * 0.9;
            let out = t * az.cos() + b * az.sin();
            let up_mix = if leader {
                0.65 + randf(state) * 0.25
            } else if depth == 0 {
                0.22 + randf(state) * 0.35
            } else {
                0.3 + randf(state) * 0.45
            };
            let cd = (out * (1.0 - up_mix) + Vector3::UP * up_mix + dir * 0.2).normalized();
            let cl = len * (0.55 + randf(state) * 0.25);
            let cr0 = ((r0 + (r1 - r0) * frac) * 0.55).max(0.006);
            let child_sway = (sway + 0.3).min(0.9);
            limb(
                bark,
                leaves,
                bp,
                cd,
                cl,
                cr0,
                (cr0 * 0.4).max(0.004),
                sides.saturating_sub(1).max(3),
                depth + 1,
                child_sway,
                state,
            );
        }
        if depth > 0 {
            leaf_cluster(leaves, tip, 14, 0.1, 0.055, (sway + 0.3).min(0.9), state);
        }
    } else {
        leaf_cluster(leaves, tip, 18, 0.13, 0.06, 0.9, state);
        leaf_cluster(
            leaves,
            start + (tip - start) * 0.55,
            8,
            0.085,
            0.05,
            (sway + 0.2).min(0.9),
            state,
        );
    }
}

fn build_skeleton_tree_mesh(seed: u32) -> Gd<ArrayMesh> {
    let mut bark = MeshBuilder::new();
    let mut leaves = MeshBuilder::new();
    let mut state = hash32(seed | 1);

    for _ in 0..4 {
        let az = randf(&mut state) * std::f32::consts::TAU;
        let out = Vector3::new(az.cos(), 0.0, az.sin());
        let dir = (out * 0.8 - Vector3::UP * 0.5).normalized();
        let start = Vector3::new(0.0, 0.045, 0.0) + out * 0.02;
        let len = 0.06 + randf(&mut state) * 0.04;
        let col = Color::from_rgba(1.0, 1.0, 1.0, 0.0);
        let (t, b) = frame(dir);
        let r0 = bark.ring(start, t, b, 0.028, 4, 0.0, col);
        let r1 = bark.ring(start + dir * len, t, b, 0.006, 4, len, col);
        bark.bridge(&r0, &r1);
    }

    {
        let col = Color::from_rgba(1.0, 1.0, 1.0, 0.0);
        let (t, b) = frame(Vector3::UP);
        let flare = bark.ring(Vector3::new(0.0, 0.0, 0.0), t, b, 0.085, 6, 0.0, col);
        let neck = bark.ring(Vector3::new(0.0, 0.07, 0.0), t, b, 0.055, 6, 0.07, col);
        bark.bridge(&flare, &neck);
    }
    let lean = Vector3::new(
        (randf(&mut state) - 0.5) * 0.2,
        1.0,
        (randf(&mut state) - 0.5) * 0.2,
    )
    .normalized();
    limb(
        &mut bark,
        &mut leaves,
        Vector3::new(0.0, 0.05, 0.0),
        lean,
        0.42,
        0.054,
        0.03,
        6,
        0,
        0.0,
        &mut state,
    );

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &bark.arrays(true));
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &leaves.arrays(true));
    am
}

fn build_far_tree_mesh(seed: u32) -> Gd<ArrayMesh> {
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
    let blob_defs = [
        (Vector3::new(0.0, 0.64, 0.0), Vector3::new(0.32, 0.32, 0.32)),
        (Vector3::new(0.15, 0.5, 0.09), Vector3::new(0.2, 0.2, 0.2)),
        (
            Vector3::new(-0.16, 0.52, -0.07),
            Vector3::new(0.19, 0.19, 0.19),
        ),
        (Vector3::new(0.01, 0.9, -0.03), Vector3::new(0.2, 0.2, 0.2)),
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
            let hs = 0.22 + randf(&mut state) * 0.12;
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
