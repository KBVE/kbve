use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{Engine, QuadMesh, RenderingServer, ShaderMaterial};
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
pub struct QFloraField {
    base: Base<Node3D>,

    #[export]
    terrain_path: NodePath,
    #[export]
    player_path: NodePath,
    #[export]
    flora_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 4242)]
    flora_seed: i32,
    #[export]
    #[init(val = 0.05)]
    density: f32,
    #[export]
    #[init(val = 70.0)]
    fade_end: f32,
    #[export]
    #[init(val = 0.045)]
    patch_frequency: f32,
    #[export]
    #[init(val = 0.3)]
    patch_threshold: f32,
    #[export]
    #[init(val = 0.55)]
    scale_min: f32,
    #[export]
    #[init(val = 1.1)]
    scale_max: f32,
    #[export]
    #[init(val = 3)]
    kind_count: i32,

    compute: Option<FloraCompute>,
    attempts: i32,
    candidates: Vec<f32>,
    #[init(val = Rid::Invalid)]
    classic_mm: Rid,
    #[init(val = Rid::Invalid)]
    classic_inst: Rid,
    player: Option<Gd<Node3D>>,
    quad: Option<Gd<QuadMesh>>,
    last_shader_origin: Vector3,
    extent: f32,
}

#[godot_api]
impl INode3D for QFloraField {
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
            godot_error!("[QFloraField] no QTerrain found; flora disabled");
            return;
        };
        let (heights, res, extent, water) = {
            let t = terrain.bind();
            let Some((h, r)) = t.cpu_heights() else {
                godot_error!("[QFloraField] terrain has no CPU heights; flora disabled");
                return;
            };
            (h.to_vec(), r, t.world_extent(), t.water())
        };
        self.extent = extent;

        let mut noise = FastNoiseLite::with_seed(self.flora_seed + 13);
        noise.set_noise_type(Some(NoiseType::OpenSimplex2S));
        noise.set_frequency(Some(self.patch_frequency));

        let sample = |x: f32, z: f32| -> f32 {
            let u = ((x + extent) / (extent * 2.0)).clamp(0.001, 0.999);
            let v = ((z + extent) / (extent * 2.0)).clamp(0.001, 0.999);
            let px = ((u * res as f32) as i32).clamp(0, res - 1);
            let py = ((v * res as f32) as i32).clamp(0, res - 1);
            heights[(py * res + px) as usize]
        };

        let attempts = ((extent * 2.0) * (extent * 2.0) * self.density) as usize;
        let mut state = hash32(self.flora_seed as u32 | 1);
        let mut cand: Vec<f32> = Vec::new();
        for _ in 0..attempts {
            let x = -extent + 2.0 + randf(&mut state) * (extent - 2.0) * 2.0;
            let z = -extent + 2.0 + randf(&mut state) * (extent - 2.0) * 2.0;
            let rank = randf(&mut state);
            let kind = (randf(&mut state) * self.kind_count as f32).floor();
            let phase = randf(&mut state) * std::f32::consts::TAU;
            let scale = self.scale_min + randf(&mut state) * (self.scale_max - self.scale_min);
            if noise.get_noise_2d(x, z) < self.patch_threshold {
                continue;
            }
            let h = sample(x, z);
            if h < water + 0.35 {
                continue;
            }
            let edge = sample(x + 1.2, z).min(sample(x - 1.2, z));
            if edge < water + 0.35 {
                continue;
            }
            cand.extend_from_slice(&[x, h, z, scale, rank, kind, phase, 0.0]);
        }
        if cand.is_empty() {
            godot_error!("[QFloraField] no candidates survived placement");
            return;
        }
        self.candidates = cand;

        let mut quad = QuadMesh::new_gd();
        quad.set_size(Vector2::new(1.0, 1.0));
        quad.set_center_offset(Vector3::new(0.0, 0.5, 0.0));
        self.quad = Some(quad);

        if let Some(m) = self.flora_material.as_mut() {
            let fe = self.fade_end;
            m.set_shader_parameter("fade_end", &fe.to_variant());
        }

        let count = (self.candidates.len() / 8) as f32;
        let world_area = (extent * 2.0) * (extent * 2.0);
        let visible_area = std::f32::consts::PI * self.fade_end * self.fade_end;
        let cap = ((count * visible_area / world_area * 1.6) as u32)
            .clamp(64, (self.candidates.len() / 8) as u32);

        if godot::classes::Os::singleton().get_environment("FLORA_NO_COMPUTE") != GString::from("1")
        {
            self.compute = self.build_compute(cap);
        }
        if self.compute.is_none() {
            self.build_classic();
        }
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let Some(origin) = self.view_origin() else {
            return;
        };
        if origin.distance_squared_to(self.last_shader_origin) > 0.0004 {
            self.last_shader_origin = origin;
            let player_pos = self
                .player
                .as_ref()
                .filter(|p| p.is_instance_valid())
                .map(|p| p.get_global_position());
            if let Some(m) = self.flora_material.as_mut() {
                let flat = Vector3::new(origin.x, 0.0, origin.z);
                m.set_shader_parameter("fade_origin", &flat.to_variant());
                if let Some(p) = player_pos {
                    let obj = Vector3::new(p.x, 0.0, p.z);
                    m.set_shader_parameter("object_position", &obj.to_variant());
                }
            }
        }
        self.step_compute();
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                if let Some(fc) = self.compute.as_mut() {
                    fc.set_visible(visible);
                }
                if self.classic_inst.is_valid() {
                    RenderingServer::singleton().instance_set_visible(self.classic_inst, visible);
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QFloraField {
    #[func]
    fn get_flora_stats(&mut self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let active = self.compute.is_some();
        let mut instances: i64 = 0;
        let mut util: i64 = 0;
        if let Some(fc) = self.compute.as_mut() {
            let raw = fc.survivor_count();
            let cap = fc.cap();
            instances = raw.min(cap) as i64;
            util = (raw as u64 * 100 / cap.max(1) as u64) as i64;
        } else if self.classic_mm.is_valid() {
            instances = (self.candidates.len() / 8) as i64;
        }
        let cap_total: i64 = self
            .compute
            .as_ref()
            .map(|c| c.cap() as i64)
            .unwrap_or(instances);
        let _ = d.insert("active", active);
        let _ = d.insert("instances", instances);
        let _ = d.insert("cap", cap_total);
        let _ = d.insert("util", util);
        let _ = d.insert("candidates", (self.candidates.len() / 8) as i64);
        d
    }
}

impl QFloraField {
    fn view_origin(&self) -> Option<Vector3> {
        let cam = self.base().get_viewport()?.get_camera_3d();
        if let Some(cam) = cam {
            return Some(cam.get_global_position());
        }
        self.player
            .as_ref()
            .filter(|p| p.is_instance_valid())
            .map(|p| p.get_global_position())
    }

    fn world_aabb(&self) -> Aabb {
        let e = self.extent + 10.0;
        Aabb::new(
            Vector3::new(-e, -40.0, -e),
            Vector3::new(e * 2.0, 120.0, e * 2.0),
        )
    }

    fn build_compute(&mut self, cap: u32) -> Option<FloraCompute> {
        let world = self.base().get_world_3d()?;
        let scenario = world.get_scenario();
        let mesh = self.quad.as_ref()?.get_rid();
        let material = self.flora_material.as_ref().map(|m| m.get_rid())?;
        FloraCompute::new(
            scenario,
            self.world_aabb(),
            mesh,
            material,
            &self.candidates,
            cap,
            self.fade_end,
            false,
        )
    }

    fn build_classic(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let Some(mesh) = self.quad.as_ref().map(|q| q.get_rid()) else {
            return;
        };
        let Some(material) = self.flora_material.as_ref().map(|m| m.get_rid()) else {
            return;
        };
        let count = self.candidates.len() / 8;
        let mut rs = RenderingServer::singleton();
        let mm = rs.multimesh_create();
        rs.multimesh_allocate_data_ex(mm, count as i32, MultimeshTransformFormat::TRANSFORM_3D)
            .custom_data_format(true)
            .done();
        rs.multimesh_set_mesh(mm, mesh);
        let mut buf: Vec<f32> = Vec::with_capacity(count * 16);
        for c in self.candidates.chunks_exact(8) {
            let &[x, y, z, s, rank, kind, phase, _] = c else {
                continue;
            };
            buf.extend_from_slice(&[
                s, 0.0, 0.0, x, 0.0, s, 0.0, y, 0.0, 0.0, s, z, rank, kind, phase, 0.0,
            ]);
        }
        rs.multimesh_set_buffer(mm, &PackedFloat32Array::from(buf.as_slice()));
        let inst = rs.instance_create();
        rs.instance_set_scenario(inst, world.get_scenario());
        rs.instance_set_base(inst, mm);
        rs.instance_geometry_set_material_override(inst, material);
        rs.instance_geometry_set_cast_shadows_setting(inst, ShadowCastingSetting::OFF);
        rs.instance_set_custom_aabb(inst, self.world_aabb());
        rs.instance_set_transform(inst, Transform3D::IDENTITY);
        self.classic_mm = mm;
        self.classic_inst = inst;
    }

    fn step_compute(&mut self) {
        if !self.base().is_visible_in_tree() {
            return;
        }
        let online = match self.compute.as_mut() {
            Some(fc) => fc.online() || fc.try_finalize(),
            None => return,
        };
        if !online {
            self.attempts += 1;
            if self.attempts > 300 {
                if let Some(mut fc) = self.compute.take() {
                    fc.free();
                }
                godot_warn!("[QFloraField] compute never came online; classic fallback");
                self.build_classic();
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
        if let Some(fc) = self.compute.as_mut() {
            fc.dispatch(cam_pos, &planes);
        }
    }

    fn free_all(&mut self) {
        if let Some(mut fc) = self.compute.take() {
            fc.free();
        }
        let mut rs = RenderingServer::singleton();
        for rid in [self.classic_inst, self.classic_mm] {
            if rid.is_valid() {
                rs.free_rid(rid);
            }
        }
        self.classic_inst = Rid::Invalid;
        self.classic_mm = Rid::Invalid;
    }
}
