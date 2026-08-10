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
    tree_material: Option<Gd<ShaderMaterial>>,
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
    #[init(val = 0.3)]
    trunk_collider_radius: f32,

    compute: Option<FloraCompute>,
    attempts: i32,
    candidates: Vec<f32>,
    mesh: Option<Gd<ArrayMesh>>,
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

        self.mesh = Some(build_tree_mesh(self.tree_seed as u32));
        self.build_colliders();

        let count = (self.candidates.len() / 8) as u32;
        let world = self.base().get_world_3d();
        let (Some(world), Some(mesh), Some(material)) = (
            world,
            self.mesh.as_ref().map(|m| m.get_rid()),
            self.tree_material.as_ref().map(|m| m.get_rid()),
        ) else {
            return;
        };
        let e = extent + 10.0;
        let aabb = Aabb::new(
            Vector3::new(-e, -40.0, -e),
            Vector3::new(e * 2.0, 120.0, e * 2.0),
        );
        self.compute = FloraCompute::new(
            world.get_scenario(),
            aabb,
            mesh,
            material,
            &self.candidates,
            count,
            extent * 8.0,
            true,
        );
        if self.compute.is_none() {
            godot_error!("[QTreeField] compute unavailable; trees disabled");
        }
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() || !self.base().is_visible_in_tree() {
            return;
        }
        let online = match self.compute.as_mut() {
            Some(fc) => fc.online() || fc.try_finalize(),
            None => return,
        };
        if !online {
            self.attempts += 1;
            if self.attempts > 300 {
                godot_warn!("[QTreeField] compute never came online");
                if let Some(mut fc) = self.compute.take() {
                    fc.free();
                }
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
        if let Some(fc) = self.compute.as_mut() {
            fc.dispatch(cam.get_global_position(), &planes);
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                if let Some(fc) = self.compute.as_mut() {
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
        let mut instances: i64 = 0;
        if let Some(fc) = self.compute.as_mut() {
            instances = fc.survivor_count().min(fc.cap()) as i64;
        }
        let _ = d.insert("active", self.compute.is_some());
        let _ = d.insert("instances", instances);
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

    fn free_all(&mut self) {
        if let Some(mut fc) = self.compute.take() {
            fc.free();
        }
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
}

impl MeshBuilder {
    fn tri(&mut self, a: Vector3, b: Vector3, c: Vector3, col: Color) {
        let n = (b - a).cross(c - a).normalized();
        self.verts.extend_from_slice(&[a, b, c]);
        self.normals.extend_from_slice(&[n, n, n]);
        self.colors.extend_from_slice(&[col, col, col]);
    }
}

fn build_tree_mesh(seed: u32) -> Gd<ArrayMesh> {
    let mut mb = MeshBuilder {
        verts: Vec::new(),
        normals: Vec::new(),
        colors: Vec::new(),
    };
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
    blob(
        Vector3::new(0.0, 0.64, 0.0),
        Vector3::new(0.32, 0.32, 0.32),
        &mut mb,
        &mut state,
    );
    blob(
        Vector3::new(0.15, 0.5, 0.09),
        Vector3::new(0.2, 0.2, 0.2),
        &mut mb,
        &mut state,
    );
    blob(
        Vector3::new(-0.16, 0.52, -0.07),
        Vector3::new(0.19, 0.19, 0.19),
        &mut mb,
        &mut state,
    );
    blob(
        Vector3::new(0.01, 0.9, -0.03),
        Vector3::new(0.2, 0.2, 0.2),
        &mut mb,
        &mut state,
    );

    let mut sway_colors = PackedColorArray::new();
    for (i, c) in mb.colors.iter().enumerate() {
        let y = mb.verts[i].y;
        let w = if c.a < 0.5 {
            0.0
        } else {
            ((y - 0.4) / 0.6).clamp(0.0, 1.0)
        };
        sway_colors.push(Color::from_rgba(c.r, c.g, c.b, w));
    }

    let mut arrays = VarArray::new();
    arrays.resize(
        godot::classes::mesh::ArrayType::MAX.ord() as usize,
        &Variant::nil(),
    );
    let verts = PackedVector3Array::from(mb.verts.as_slice());
    let normals = PackedVector3Array::from(mb.normals.as_slice());
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
        &sway_colors.to_variant(),
    );
    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &arrays);
    am
}
