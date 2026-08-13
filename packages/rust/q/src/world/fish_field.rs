use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{Engine, Mesh, MeshInstance3D, PackedScene, RenderingServer, ShaderMaterial};
use godot::prelude::*;

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
pub struct QFishField {
    base: Base<Node3D>,

    init_done: bool,

    #[export]
    terrain_path: NodePath,
    #[export]
    fish_model: Option<Gd<PackedScene>>,
    #[export]
    fish_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 8812)]
    fish_seed: i32,
    #[export]
    #[init(val = 90)]
    count: i32,
    #[export]
    #[init(val = 18)]
    pods: i32,
    #[export]
    #[init(val = 2)]
    pod_min: i32,
    #[export]
    #[init(val = 6)]
    pod_max: i32,
    #[export]
    #[init(val = 0.3)]
    school_chance: f32,
    #[export]
    #[init(val = 14)]
    school_min: i32,
    #[export]
    #[init(val = 34)]
    school_max: i32,
    #[export]
    #[init(val = 1.1)]
    pod_radius: f32,
    #[export]
    #[init(val = 0.28)]
    pod_spread_per_fish: f32,
    #[export]
    #[init(val = 120.0)]
    span: f32,
    #[export]
    #[init(val = 0.35)]
    depth_min: f32,
    #[export]
    #[init(val = 1.1)]
    depth_max: f32,
    #[export]
    #[init(val = 0.6)]
    bank_margin: f32,
    #[export]
    #[init(val = 0.3)]
    bed_clearance: f32,
    #[export]
    #[init(val = 70.0)]
    fade_end: f32,

    #[init(val = Rid::Invalid)]
    mm: Rid,
    #[init(val = Rid::Invalid)]
    inst: Rid,
    placed: i32,
    mesh: Option<Gd<Mesh>>,
}

impl QFishField {
    fn late_init(&mut self) -> bool {
        let _t = super::ReadyTimer::start("fish");

        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        let Some(terrain) = terrain else {
            godot_error!("[QFishField] no QTerrain found; fish disabled");
            return true;
        };

        let (water, width) = {
            let t = terrain.bind();
            if t.cpu_heights().is_none() {
                return false;
            }
            (t.water(), t.river_width_value())
        };

        let Some(mesh) = self.model_mesh() else {
            godot_error!("[QFishField] no mesh in fish_model; fish disabled");
            return true;
        };
        self.mesh = Some(mesh);

        let mut state = hash32(self.fish_seed as u32 | 1);
        let total = self.count.max(0) as usize;
        let pods = self.pods.max(1);
        let half_default = (width * 0.5 - self.bank_margin).max(0.4);

        let mut buf: Vec<f32> = Vec::with_capacity(total * 16);
        let mut placed = 0i32;
        for _ in 0..pods {
            if placed as usize >= total {
                break;
            }
            let pod_z = -self.span + randf(&mut state) * self.span * 2.0;
            let school = randf(&mut state) < self.school_chance;
            let (lo, hi) = if school {
                (self.school_min, self.school_max)
            } else {
                (self.pod_min, self.pod_max)
            };
            let span_n = (hi - lo).max(0) as f32;
            let want = lo + (randf(&mut state) * (span_n + 0.999)) as i32;
            let want = want.max(1).min(total as i32 - placed);
            let spread = self.pod_radius + want as f32 * self.pod_spread_per_fish;
            for _ in 0..want {
                let z = pod_z + (randf(&mut state) - 0.5) * spread * 2.0;
                let x = {
                    let t = terrain.bind();
                    t.river_center(z) + (randf(&mut state) - 0.5) * half_default * 2.0
                };
                let bed = terrain.bind().sample_height(x, z);
                let headroom = water - bed - self.bed_clearance;
                if headroom < self.depth_min {
                    continue;
                }
                let deepest = self.depth_max.min(headroom);
                let depth = self.depth_min + randf(&mut state) * (deepest - self.depth_min);
                let y = water - depth;

                let yaw = (randf(&mut state) - 0.5) * std::f32::consts::TAU;
                let (s, c) = yaw.sin_cos();
                let phase = randf(&mut state);
                let rate = randf(&mut state);
                let size = randf(&mut state);
                buf.extend_from_slice(&[
                    c, 0.0, s, x, 0.0, 1.0, 0.0, y, -s, 0.0, c, z, phase, rate, size, 1.0,
                ]);
                placed += 1;
            }
        }

        godot_print!("[q] fish placed={placed}");
        if placed == 0 {
            godot_warn!("[QFishField] no fish survived placement");
            return true;
        }
        self.placed = placed;

        if let Some(m) = self.fish_material.as_mut() {
            let fe = self.fade_end;
            m.set_shader_parameter("fade_end", &fe.to_variant());
            m.set_shader_parameter("water_level", &water.to_variant());
        }
        self.build(&buf, water);
        true
    }

    fn model_mesh(&self) -> Option<Gd<Mesh>> {
        let root = self.fish_model.as_ref()?.instantiate()?;
        let mut stack = vec![root.clone()];
        let mut found = None;
        while let Some(node) = stack.pop() {
            if let Ok(mi) = node.clone().try_cast::<MeshInstance3D>() {
                if let Some(mesh) = mi.get_mesh() {
                    found = Some(mesh);
                    break;
                }
            }
            for child in node.get_children().iter_shared() {
                stack.push(child);
            }
        }
        root.free();
        found
    }

    fn build(&mut self, buf: &[f32], water: f32) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let Some(mesh) = self.mesh.as_ref().map(|m| m.get_rid()) else {
            return;
        };
        let mut rs = RenderingServer::singleton();
        let mm = rs.multimesh_create();
        rs.multimesh_allocate_data_ex(mm, self.placed, MultimeshTransformFormat::TRANSFORM_3D)
            .custom_data_format(true)
            .done();
        rs.multimesh_set_mesh(mm, mesh);
        rs.multimesh_set_buffer(mm, &PackedFloat32Array::from(buf));

        let inst = rs.instance_create();
        rs.instance_set_scenario(inst, world.get_scenario());
        rs.instance_set_base(inst, mm);
        if let Some(material) = self.fish_material.as_ref().map(|m| m.get_rid()) {
            rs.instance_geometry_set_material_override(inst, material);
        }
        rs.instance_geometry_set_cast_shadows_setting(inst, ShadowCastingSetting::OFF);
        let e = self.span + 8.0;
        rs.instance_set_custom_aabb(
            inst,
            Aabb::new(
                Vector3::new(-e, water - self.depth_max - 2.0, -e),
                Vector3::new(e * 2.0, self.depth_max + 4.0, e * 2.0),
            ),
        );
        rs.instance_set_transform(inst, Transform3D::IDENTITY);
        self.mm = mm;
        self.inst = inst;
    }

    fn free_all(&mut self) {
        let mut rs = RenderingServer::singleton();
        for rid in [self.inst, self.mm] {
            if rid.is_valid() {
                rs.free_rid(rid);
            }
        }
        self.inst = Rid::Invalid;
        self.mm = Rid::Invalid;
    }
}

#[godot_api]
impl INode3D for QFishField {
    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() || self.init_done {
            return;
        }
        if super::q_hidden("fish") || self.late_init() {
            self.init_done = true;
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                if self.inst.is_valid() {
                    let visible = self.base().is_visible_in_tree();
                    RenderingServer::singleton().instance_set_visible(self.inst, visible);
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QFishField {
    #[func]
    fn get_fish_stats(&self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let _ = d.insert("instances", self.placed as i64);
        d
    }
}
