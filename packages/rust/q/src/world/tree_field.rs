use fastnoise_lite::{FastNoiseLite, NoiseType};
use godot::classes::mesh::PrimitiveType;
use godot::classes::notify::Node3DNotification;
use godot::classes::physics_server_3d::BodyMode;
use godot::classes::rendering_server::MultimeshTransformFormat;
use godot::classes::{
    ArrayMesh, Engine, PhysicsServer3D, RenderingServer, ShaderMaterial, Texture2D,
};
use godot::prelude::*;
use godot::tools::try_load;

use std::collections::HashMap;

use crate::world::flora_compute::{FloraCompute, HarvestPass, TerrainOcclusion};
use crate::world::harvest::{Entry, HarvestKind, Ledger, ScatterCore, Tree, stable_id};
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

/// Passes per species: near mesh, far mesh, stump.
const LODS: usize = 3;

/// One felled trunk on its way over.
///
/// A single-instance multimesh rather than a MeshInstance3D: the bark and leaf
/// shaders read kind, yaw and the LOD fade out of INSTANCE_CUSTOM, which only
/// multimesh custom data feeds. A plain mesh instance would read zeroes there
/// and discard every fragment.
struct FallingTree {
    mm: Rid,
    inst: Rid,
    base: Vector3,
    axis: Vector3,
    scale: f32,
    elapsed: f32,
    fall: f32,
    linger: f32,
}

impl FallingTree {
    fn transform(&self) -> Transform3D {
        let t = (self.elapsed / self.fall).clamp(0.0, 1.0);
        let angle = std::f32::consts::FRAC_PI_2 * t * t;
        let sink = ((self.elapsed - self.fall) / self.linger).clamp(0.0, 1.0);
        let basis = Basis::from_axis_angle(self.axis, angle).scaled(Vector3::ONE * self.scale);
        Transform3D::new(
            basis,
            self.base - Vector3::UP * sink * sink * self.scale * 0.12,
        )
    }

    fn done(&self) -> bool {
        self.elapsed >= self.fall + self.linger
    }

    fn free(&mut self) {
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

const TRUNK_BUCKETS: [f32; 3] = [5.0, 7.5, 10.5];
const TRUNK_COLLIDER_SPAN: f32 = 0.55;
/// How far the base is pushed into the ground, so the cut of the bole never shows
/// as a seam floating over the surface. Metres, not scaled: a big tree wants the
/// same few centimetres of cover a small one does.
const TRUNK_SINK: f32 = 0.17;
/// Footprint the flare covers, as a fraction of tree height. Deliberately smaller
/// than the root reach — the roots dive as they splay, so they stay covered on their
/// own, and sizing to them instead would perch the trunk on the highest ground for
/// metres around.
const TRUNK_FOOT: f32 = 0.05;

/// The ground a trunk rests on, which is the highest point under its footprint
/// rather than the point at its centre.
///
/// Callers still owe the model's own offset: the bole starts at [`BOLE_BASE_Y`] in
/// model units and the model is scaled by tree height, so seating an instance origin
/// on the ground buries a tall tree's flare by most of a metre.
///
/// A tree seated on the centre sample has its base buried wherever the ground rises
/// across the flare — every slope, and every local bump the placement grid steps over.
/// Taking the high point instead leaves the base at or above the surface all round and
/// lets [`TRUNK_SINK`] hide the seam on the low side.
fn trunk_rest(sample: &impl Fn(f32, f32) -> f32, x: f32, z: f32, scale: f32) -> f32 {
    let r = (scale * TRUNK_FOOT).clamp(0.5, 1.6);
    let d = r * std::f32::consts::FRAC_1_SQRT_2;
    let mut h = sample(x, z);
    for (ox, oz) in [
        (r, 0.0),
        (-r, 0.0),
        (0.0, r),
        (0.0, -r),
        (d, d),
        (d, -d),
        (-d, d),
        (-d, -d),
    ] {
        h = h.max(sample(x + ox, z + oz));
    }
    h
}

fn trunk_bucket(scale: f32) -> usize {
    if scale < 6.2 {
        0
    } else if scale < 9.0 {
        1
    } else {
        2
    }
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
        height: (7.0, 12.5),
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
        height: (5.5, 10.0),
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
        height: (4.5, 8.0),
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
    /// Draw distance for stumps, which are small enough to vanish long before a
    /// standing tree would.
    #[export]
    #[init(val = 70.0)]
    stump_range: f32,
    /// Seconds a felled trunk takes to go over, and how long it lies there before
    /// it is cleaned up.
    #[export]
    #[init(val = 1.6)]
    fall_seconds: f32,
    #[export]
    #[init(val = 4.0)]
    fall_linger: f32,

    computes: Vec<FloraCompute>,
    attempts: i32,
    candidates: Vec<f32>,
    core: ScatterCore<Tree>,
    ledger: Ledger,
    /// Id of each stride-8 candidate, in the same order.
    cand_ids: Vec<u64>,
    /// Where a tree lives in the GPU buffers: the index of its near compute in
    /// `computes` (far is the next one), and its slot within that buffer.
    instance_of: HashMap<u64, (u32, u32)>,
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
    falling: Vec<FallingTree>,
    extent: f32,
    origin: Vector2,
}

impl QTreeField {
    /// True once the terrain has re-baked somewhere else, so this scatter is
    /// for ground the player has walked off.
    fn window_moved(&self) -> bool {
        let node = self.base().clone().upcast::<godot::classes::Node>();
        crate::world::resolve_terrain(&node, &self.terrain_path)
            .map(|t| t.bind().window_origin() != self.origin)
            .unwrap_or(false)
    }

    /// What the player felled goes into the ledger first and is replayed after,
    /// so ground they walk back to keeps its stumps.
    fn rescatter(&mut self) {
        let _t = crate::world::StallTimer::start("trees.rescatter");
        let damage: Vec<(u64, u8)> = self.core.damage().collect();
        for (id, stage) in damage {
            self.ledger.record(id, stage);
        }
        self.free_all();
        self.candidates.clear();
        self.cand_ids.clear();
        self.instance_of.clear();
        self.meshes.clear();
        self.mesh_tris.clear();
        self.leaf_mats.clear();
        self.bark_mats.clear();
        self.init_done = false;
    }

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

        let grid = crate::world::ScatterGrid::new(self.grid_size, terra.origin, extent);
        let cells = grid.cells();
        self.origin = terra.origin;
        let seed64 = self.tree_seed as u32 as u64;
        let mut cand: Vec<f32> = Vec::new();
        let mut cand_ids: Vec<u64> = Vec::new();
        self.core.clear();
        self.instance_of.clear();
        for iz in 0..cells {
            for ix in 0..cells {
                let mut state = grid.seed(self.tree_seed as u32, ix, iz);
                let jx = (randf(&mut state) - 0.5) * (self.grid_size - 4.0);
                let jz = (randf(&mut state) - 0.5) * (self.grid_size - 4.0);
                let (cx, cz) = grid.centre(ix, iz);
                let (x, z) = (cx + jx, cz + jz);
                if !grid.inside(x, z, 4.0) {
                    continue;
                }
                if noise.get_noise_2d(x, z) < self.grove_threshold {
                    continue;
                }
                if terra.on_road(x, z) > 0.12 {
                    continue;
                }
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
                let h = trunk_rest(&sample, x, z, scale) - BOLE_BASE_Y * scale - TRUNK_SINK;
                let (gx, gz) = grid.global(ix, iz);
                let id = stable_id(seed64, gx, gz, 0);
                cand.extend_from_slice(&[x, h, z, scale, rank, kind as f32, phase, 0.0]);
                cand_ids.push(id);
                self.core.insert(Entry {
                    id,
                    pos: Vector3::new(x, h, z),
                    up: Vector3::UP,
                    scale,
                    yaw: phase,
                    variant: kind as u8,
                    ore: 0,
                    amount: 0,
                });
            }
        }
        if cand.is_empty() {
            godot_error!("[QTreeField] no tree candidates survived placement");
            return true;
        }
        self.candidates = cand;
        self.cand_ids = cand_ids;
        let ledger = std::mem::take(&mut self.ledger);
        self.core.restore(&ledger);
        self.ledger = ledger;
        self.build_colliders();

        {
            let mut terrain = terrain;
            let mut tb = terrain.bind_mut();
            for c in self.candidates.chunks_exact(8) {
                tb.stamp_clearance(c[0], c[2], 0.9 + c[3] * 0.14);
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
            let mut cands: Vec<f32> = Vec::new();
            let mut ids: Vec<u64> = Vec::new();
            for (c, id) in self.candidates.chunks_exact(8).zip(self.cand_ids.iter()) {
                if c[5] as usize != i {
                    continue;
                }
                cands.extend_from_slice(c);
                // Anything the ledger already felled starts culled, so walking
                // back to old ground does not stand the trees up again.
                if !self.core.alive(*id) {
                    let last = cands.len() - 1;
                    cands[last] = 1.0;
                }
                ids.push(*id);
            }
            if cands.is_empty() {
                continue;
            }
            let count = (cands.len() / 8) as u32;
            let seed = (self.tree_seed as u32).wrapping_add(sp.seed_off);

            let leaf_mat = self.leaf_material.as_ref().map(|m| m.duplicate_resource());
            let mut leaf_aspect = 1.0f32;
            if let Some(mut lm) = leaf_mat.clone() {
                if let Ok(tex) = try_load::<Texture2D>(sp.leaf_tex) {
                    let size = tex.get_size();
                    if size.y > 0.0 {
                        leaf_aspect = size.x / size.y;
                    }
                    lm.set_shader_parameter("albedo_tex", &tex.to_variant());
                }
            }
            let bark_mat = self.bark_material.as_ref().map(|m| {
                let mut dup = m.duplicate_resource();
                dup.set_shader_parameter("bark_color", &sp.bark_color.to_variant());
                dup
            });

            let (mut near, crown) = build_skeleton_tree_mesh(seed, sp, leaf_aspect);
            // Wind and canopy shading are normalised against the mesh the shader
            // is actually drawing, so retuning the generator cannot desync them.
            for mat in [leaf_mat.as_ref(), bark_mat.as_ref()].into_iter().flatten() {
                let mut m = mat.clone();
                m.set_shader_parameter("crown_top", &crown.top.to_variant());
                m.set_shader_parameter("crown_base", &crown.leaf_lo.to_variant());
            }
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
            let mut stump = build_stump_mesh(seed);
            if let Some(m) = bark_mat.as_ref() {
                stump.surface_set_material(0, m);
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
                HarvestPass::Standing,
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
                HarvestPass::Standing,
            );
            let stump_c = FloraCompute::new(
                scenario,
                aabb,
                stump.get_rid(),
                Rid::Invalid,
                &cands,
                count,
                self.stump_range,
                0.0,
                (0.0, 0.0, false),
                false,
                false,
                true,
                1,
                TerrainOcclusion::new(occl_h, occl_res, extent, 25.0),
                HarvestPass::Remains,
            );
            match (near_c, far_c, stump_c) {
                (Some(n), Some(f), Some(s)) => {
                    let base = self.computes.len() as u32;
                    for (slot, id) in ids.iter().enumerate() {
                        self.instance_of.insert(*id, (base, slot as u32));
                    }
                    self.computes.push(n);
                    self.computes.push(f);
                    self.computes.push(s);
                    self.mesh_tris.push((near.get_faces().len() / 3) as u64);
                    self.mesh_tris.push((far.get_faces().len() / 3) as u64);
                    self.mesh_tris.push((stump.get_faces().len() / 3) as u64);
                    self.meshes.push(near);
                    self.meshes.push(far);
                    self.meshes.push(stump);
                    if let Some(lm) = leaf_mat {
                        self.leaf_mats.push(lm);
                    }
                    if let Some(bm) = bark_mat {
                        self.bark_mats.push(bm);
                    }
                }
                (n, f, s) => {
                    for mut c in [n, f, s].into_iter().flatten() {
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
    fn process(&mut self, delta: f64) {
        if Engine::singleton().is_editor_hint() || !self.base().is_visible_in_tree() {
            return;
        }
        if !self.init_done {
            if super::q_hidden("trees") || self.late_init() {
                self.init_done = true;
            }
            return;
        }
        self.tick_falling(delta as f32);
        if self.window_moved() {
            self.rescatter();
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
    #[signal]
    fn tree_felled(id: i64, ore: GString, amount: i64);

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
        let table = Tree::drop_table();
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
        if out.broken {
            let away = self
                .core
                .get(id as u64)
                .map(|e| {
                    let from = self
                        .player
                        .as_ref()
                        .map(|p| p.get_global_position())
                        .unwrap_or(e.pos - Vector3::FORWARD);
                    e.pos - from
                })
                .unwrap_or(Vector3::FORWARD);
            self.spawn_falling(id as u64, away);
            self.cull_instance(id as u64);
            self.build_colliders();
            self.signals()
                .tree_felled()
                .emit(id, &GString::from(out.ore), out.amount as i64);
        }
        d
    }

    #[func]
    fn get_tree_stats(&mut self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let mut near: i64 = 0;
        let mut far: i64 = 0;
        let mut near_tris: i64 = 0;
        let mut far_tris: i64 = 0;
        let mut stumps: i64 = 0;
        for (i, fc) in self.computes.iter_mut().enumerate() {
            let n = fc.survivor_count().min(fc.cap()) as i64;
            let t = n * self.mesh_tris.get(i).copied().unwrap_or(0) as i64;
            match i % LODS {
                0 => {
                    near += n;
                    near_tris += t;
                }
                1 => {
                    far += n;
                    far_tris += t;
                }
                _ => stumps += n,
            }
        }
        let _ = d.insert("active", !self.computes.is_empty());
        let _ = d.insert("instances", near + far);
        let _ = d.insert("near", near);
        let _ = d.insert("far", far);
        let _ = d.insert("stumps", stumps);
        let _ = d.insert("falling", self.falling.len() as i64);
        let _ = d.insert("near_tris", near_tris);
        let _ = d.insert("far_tris", far_tris);
        let _ = d.insert("species", (self.computes.len() / LODS) as i64);
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

    /// Every trunk as flat `x, z, radius` triples, for a flow field to route
    /// around. The radius is the trunk collider's, so what the field closes and
    /// what a body actually hits are the same thing.
    #[func]
    fn obstacle_discs(&self) -> PackedFloat32Array {
        let scale_r = self.trunk_collider_radius / TRUNK_BUCKETS[1];
        let mut out = PackedFloat32Array::new();
        for c in self.candidates.chunks_exact(8) {
            out.push(c[0]);
            out.push(c[2]);
            out.push(scale_r * TRUNK_BUCKETS[trunk_bucket(c[3])]);
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
    /// Frees the trunk body and its shapes, leaving the computes alone.
    ///
    /// Felling rebuilds colliders without touching the GPU buffers, so this is
    /// the physics half of `free_all` on its own.
    fn free_colliders(&mut self) {
        let mut ps = PhysicsServer3D::singleton();
        for rid in std::iter::once(self.body).chain(self.trunk_shapes.drain(..)) {
            if rid.is_valid() {
                ps.free_rid(rid);
            }
        }
        self.body = Rid::Invalid;
    }

    fn build_colliders(&mut self) {
        self.free_colliders();
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let space = world.get_space();
        let mut ps = PhysicsServer3D::singleton();
        let scale_r = self.trunk_collider_radius / TRUNK_BUCKETS[1];
        let shapes: Vec<Rid> = TRUNK_BUCKETS
            .iter()
            .map(|s| {
                let shape = ps.cylinder_shape_create();
                let mut data = VarDictionary::new();
                let _ = data.insert("radius", scale_r * s);
                let _ = data.insert("height", s * TRUNK_COLLIDER_SPAN);
                ps.shape_set_data(shape, &data.to_variant());
                shape
            })
            .collect();
        let body = ps.body_create();
        ps.body_set_mode(body, BodyMode::STATIC);
        ps.body_set_space(body, space);
        for (c, id) in self.candidates.chunks_exact(8).zip(self.cand_ids.iter()) {
            if !self.core.alive(*id) {
                continue;
            }
            let bi = trunk_bucket(c[3]);
            let half = TRUNK_BUCKETS[bi] * TRUNK_COLLIDER_SPAN * 0.5;
            let t = Transform3D::IDENTITY.translated(Vector3::new(c[0], c[1] + half, c[2]));
            ps.body_add_shape_ex(body, shapes[bi]).transform(t).done();
        }
        self.body = body;
        self.trunk_shapes = shapes;
    }

    /// Flips a tree from standing to felled across every pass at once. The near
    /// and far LODs read the flag straight and drop it; the stump pass reads it
    /// inverted and picks it up.
    fn cull_instance(&mut self, id: u64) {
        let Some(&(base, slot)) = self.instance_of.get(&id) else {
            return;
        };
        for c in 0..LODS as u32 {
            if let Some(fc) = self.computes.get_mut((base + c) as usize) {
                fc.set_harvested(slot, true);
            }
        }
    }

    /// Stands a copy of the tree up where the instance was, so the cull can drop
    /// the standing one on the same frame without the trunk blinking out.
    fn spawn_falling(&mut self, id: u64, toward: Vector3) {
        let Some(&(base, _)) = self.instance_of.get(&id) else {
            return;
        };
        let Some(mesh) = self.meshes.get(base as usize) else {
            return;
        };
        let Some(e) = self.core.get(id) else {
            return;
        };
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let dir = Vector3::new(toward.x, 0.0, toward.z);
        let dir = if dir.length_squared() < 1e-4 {
            Vector3::FORWARD
        } else {
            dir.normalized()
        };
        let axis = Vector3::UP.cross(dir).normalized();

        let mut rs = RenderingServer::singleton();
        let mm = rs.multimesh_create();
        rs.multimesh_allocate_data_ex(mm, 1, MultimeshTransformFormat::TRANSFORM_3D)
            .custom_data_format(true)
            .done();
        rs.multimesh_set_mesh(mm, mesh.get_rid());
        rs.multimesh_instance_set_custom_data(
            mm,
            0,
            Color::from_rgba(0.0, e.variant as f32, e.yaw, 1.0),
        );
        let inst = rs.instance_create();
        rs.instance_set_scenario(inst, world.get_scenario());
        rs.instance_set_base(inst, mm);

        let f = FallingTree {
            mm,
            inst,
            base: e.pos,
            axis,
            scale: e.scale,
            elapsed: 0.0,
            fall: self.fall_seconds.max(0.1),
            linger: self.fall_linger.max(0.1),
        };
        rs.multimesh_instance_set_transform(mm, 0, f.transform());
        rs.instance_set_transform(inst, Transform3D::IDENTITY);
        self.falling.push(f);
    }

    fn tick_falling(&mut self, delta: f32) {
        if self.falling.is_empty() {
            return;
        }
        let mut rs = RenderingServer::singleton();
        for f in self.falling.iter_mut() {
            f.elapsed += delta;
            rs.multimesh_instance_set_transform(f.mm, 0, f.transform());
        }
        let mut i = 0;
        while i < self.falling.len() {
            if self.falling[i].done() {
                self.falling[i].free();
                self.falling.swap_remove(i);
            } else {
                i += 1;
            }
        }
    }

    fn free_falling(&mut self) {
        for f in self.falling.iter_mut() {
            f.free();
        }
        self.falling.clear();
    }

    fn free_computes(&mut self) {
        for mut fc in self.computes.drain(..) {
            fc.free();
        }
    }

    fn free_all(&mut self) {
        self.free_computes();
        self.free_colliders();
        self.free_falling();
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
        self.ring_fluted(center, t, b, r, sides, v, col, 0.0, 0.0)
    }

    #[allow(clippy::too_many_arguments)]
    fn ring_fluted(
        &mut self,
        center: Vector3,
        t: Vector3,
        b: Vector3,
        r: f32,
        sides: u32,
        v: f32,
        col: Color,
        warp: f32,
        phase: f32,
    ) -> Vec<i32> {
        let mut out = Vec::with_capacity(sides as usize + 1);
        for i in 0..=sides {
            let a = std::f32::consts::TAU * i as f32 / sides as f32;
            let dir = t * a.cos() + b * a.sin();
            let lobe = (a * FLUTES + phase).sin();
            let rr = r * (1.0 + warp * lobe);
            let base = self.verts.len() as i32;
            self.verts.push(center + dir * rr);
            let slope = -warp * FLUTES * (a * FLUTES + phase).cos();
            let tangential = -t * a.sin() + b * a.cos();
            self.normals.push((dir + tangential * slope).normalized());
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

const FLUTES: f32 = 3.0;
const FLUTE_DEPTH: f32 = 0.13;
const FLUTE_TOP: f32 = 0.45;
const FLARE_GAIN: f32 = 1.0;
const FLARE_SPAN: f32 = 0.14;

const BOLE_BASE_Y: f32 = -0.06;
const BOLE_LEN: f32 = 0.95;
const BOLE_R0: f32 = 0.048;
const BOLE_R1: f32 = 0.011;
const BOLE_TAPER: f32 = 0.58;
const BOLE_SIDES: u32 = 9;
const STUMP_CUT: f32 = 0.055;

fn bole_flare(f: f32) -> f32 {
    let u = (1.0 - (f / FLARE_SPAN).min(1.0)).max(0.0);
    1.0 + FLARE_GAIN * u * u * u
}

fn bole_flute(f: f32) -> f32 {
    FLUTE_DEPTH * (1.0 - (f / FLUTE_TOP).min(1.0)).powf(1.3)
}

fn bole_radius(f: f32) -> f32 {
    BOLE_R0 + (BOLE_R1 - BOLE_R0) * f.powf(BOLE_TAPER)
}

/// How far up its twig the card band reaches; 1.0 would close over the tuft's ends.
const TUFT_BAND: f32 = 0.85;
/// Tuft radius along the twig and across it, both in units of `cluster_r`.
const TUFT_ALONG: f32 = 1.6;
const TUFT_ACROSS: f32 = 0.8;

#[allow(clippy::too_many_arguments)]
fn leaf_cluster(
    leaves: &mut MeshBuilder,
    pos: Vector3,
    axis: Vector3,
    n_cards: u32,
    cluster_r: f32,
    card_size: f32,
    card_aspect: f32,
    sway: f32,
    state: &mut u32,
) {
    let golden = 2.399963;
    let spin = randf(state) * std::f32::consts::TAU;
    let (ax_t, ax_b) = frame(axis);
    let stretch = card_aspect.max(0.01).sqrt();
    for i in 0..n_cards {
        let f = (i as f32 + 0.5) / n_cards as f32;
        let cosphi = (1.0 - 2.0 * f) * TUFT_BAND;
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
        let sx = t * (hs * stretch);
        let sy = b * (hs / stretch);
        let col = Color::from_rgba(1.0, 1.0, 1.0, sway);
        leaves.card([c - sx - sy, c + sx - sy, c + sx + sy, c - sx + sy], col);
    }
}

#[allow(clippy::too_many_arguments)]
fn root_web(
    bark: &mut MeshBuilder,
    base_y: f32,
    nodes: &[Vector3],
    segd: &[Vector3],
    r0: f32,
    radius_at: &dyn Fn(f32) -> f32,
    flute_phase: f32,
    col: Color,
    state: &mut u32,
) {
    let segs = segd.len();
    if segs == 0 {
        return;
    }
    let lobe0 = (std::f32::consts::FRAC_PI_2 - flute_phase) / FLUTES;
    let per_lobe = 2 + (randf(state) * 2.0) as u32;
    let n_roots = FLUTES as u32 * per_lobe;
    for i in 0..n_roots {
        let lobe = (i % FLUTES as u32) as f32;
        let within = (i / FLUTES as u32) as f32 - (per_lobe as f32 - 1.0) * 0.5;
        let az = lobe0
            + std::f32::consts::TAU * lobe / FLUTES
            + within * 0.42
            + (randf(state) - 0.5) * 0.3;
        let f = 0.01 + randf(state) * 0.05;
        let ff = f * segs as f32;
        let i0 = (ff as usize).min(segs - 1);
        let bp = nodes[i0] + (nodes[i0 + 1] - nodes[i0]) * (ff - i0 as f32);
        let pd = segd[i0];
        let (t, b) = frame(pd);
        let out = t * az.cos() + b * az.sin();
        let rr = radius_at(f) * (0.34 + randf(state) * 0.2);
        let reach = r0 * (4.0 + randf(state) * 3.0);
        let sink = base_y - r0 * (0.9 + randf(state) * 0.7);
        let rd = (out - Vector3::UP * 0.2).normalized();
        let (rt, rb) = frame(rd);
        let wobble = (randf(state) - 0.5) * 0.6;
        let mut prev_ring: Option<Vec<i32>> = None;
        for k in 0..=5 {
            let tt = k as f32 / 5.0;
            let sway_az = az + wobble * tt;
            let dirk = t * sway_az.cos() + b * sway_az.sin();
            let horiz = Vector3::new(dirk.x, 0.0, dirk.z).normalized();
            let u = ((tt - 0.2) / 0.8).clamp(0.0, 1.0);
            let yk = bp.y + (sink - bp.y) * (u * u * (3.0 - 2.0 * u));
            let pos = Vector3::new(bp.x, yk, bp.z) + horiz * reach * tt;
            let rk = (rr * (1.0 - tt).powf(1.5)).max(0.003);
            let squash = 1.0 + 1.5 * (1.0 - tt).powi(2);
            let ring = bark.ring(pos, rt * squash, rb / squash, rk, 5, reach * tt, col);
            if let Some(pr) = prev_ring.as_ref() {
                bark.bridge(pr, &ring);
            }
            prev_ring = Some(ring);
        }
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
    leaf_aspect: f32,
    g: &Growth,
    state: &mut u32,
) {
    let segs = match depth {
        0 => 7,
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
                (0.62 + 0.28 * u.powf(0.65)).min(0.9)
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
    let flare = |f: f32| if depth > 0 { 1.0 } else { bole_flare(f) };
    let flute = |f: f32| if depth > 0 { 0.0 } else { bole_flute(f) };
    let flute_phase = randf(state) * std::f32::consts::TAU;
    let (mut ft, _) = frame(segd[0]);
    let mut fb;
    let mut prev: Option<Vec<i32>> = None;
    let mut first: Option<Vec<i32>> = None;
    let mut v = 0.0f32;
    for i in 0..=segs {
        let f = i as f32 / segs as f32;
        let r = r_of(f) * flare(f);
        let n = if i == 0 {
            segd[0]
        } else if i == segs {
            segd[segs - 1]
        } else {
            (segd[i - 1] + segd[i]).normalized()
        };
        ft = (ft - n * ft.dot(n)).normalized();
        fb = n.cross(ft).normalized();
        let ring = bark.ring_fluted(nodes[i], ft, fb, r, sides, v, col, flute(f), flute_phase);
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
        root_web(
            bark,
            start.y,
            &nodes,
            &segd,
            r0,
            &|f| r_of(f) * flare(f),
            flute_phase,
            col,
            state,
        );
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
                (sides * 2 / 3).max(3),
                depth + 1,
                child_sway,
                crown,
                leaf_aspect,
                g,
                state,
            );
        }
        if depth > 0 {
            leaf_cluster(
                leaves,
                tip,
                segd[segs - 1],
                (12.0 * crown) as u32,
                0.10 * crown,
                0.036 * crown,
                leaf_aspect,
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
            (20.0 * crown) as u32,
            0.115 * crown,
            0.036 * crown,
            leaf_aspect,
            0.9,
            state,
        );
        leaf_cluster(
            leaves,
            start + (tip - start) * 0.78,
            twig,
            (11.0 * crown) as u32,
            0.088 * crown,
            0.033 * crown,
            leaf_aspect,
            (sway + 0.25).min(0.9),
            state,
        );
        leaf_cluster(
            leaves,
            start + (tip - start) * 0.55,
            twig,
            (7.0 * crown) as u32,
            0.072 * crown,
            0.031 * crown,
            leaf_aspect,
            (sway + 0.2).min(0.9),
            state,
        );
    }
}

fn build_skeleton_tree_mesh(
    seed: u32,
    sp: &TreeSpecies,
    leaf_aspect: f32,
) -> (Gd<ArrayMesh>, CrownExtent) {
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
        Vector3::new(0.0, BOLE_BASE_Y, 0.0),
        lean,
        BOLE_LEN,
        BOLE_R0,
        BOLE_R1,
        BOLE_TAPER,
        Vector3::ZERO,
        BOLE_SIDES,
        0,
        0.0,
        crown,
        leaf_aspect,
        &sp.growth,
        &mut state,
    );

    let mut lo = f32::MAX;
    let mut hi = f32::MIN;
    for v in &leaves.verts {
        lo = lo.min(v.y);
        hi = hi.max(v.y);
    }
    let mut top = hi;
    for v in &bark.verts {
        top = top.max(v.y);
    }

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &bark.arrays(true));
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &leaves.arrays(true));
    (am, CrownExtent { top, leaf_lo: lo })
}

pub struct CrownExtent {
    pub top: f32,
    pub leaf_lo: f32,
}

fn build_stump_mesh(seed: u32) -> Gd<ArrayMesh> {
    let mut bark = MeshBuilder::new();
    let mut state = hash32(seed | 1);
    let col = Color::from_rgba(1.0, 1.0, 1.0, 0.0);
    let flute_phase = randf(&mut state) * std::f32::consts::TAU;

    let rings = 4usize;
    let cut = STUMP_CUT;
    let mut nodes: Vec<Vector3> = Vec::with_capacity(rings + 1);
    let mut segd: Vec<Vector3> = Vec::with_capacity(rings);
    let mut prev: Option<Vec<i32>> = None;
    let mut top_ring: Vec<i32> = Vec::new();
    for i in 0..=rings {
        let t = i as f32 / rings as f32;
        let f = cut * t;
        let y = BOLE_BASE_Y + BOLE_LEN * f;
        let c = Vector3::new(0.0, y, 0.0);
        nodes.push(c);
        if i > 0 {
            segd.push(Vector3::UP);
        }
        let r = bole_radius(f) * bole_flare(f);
        let ring = bark.ring_fluted(
            c,
            Vector3::RIGHT,
            Vector3::BACK,
            r,
            BOLE_SIDES,
            BOLE_LEN * f,
            col,
            bole_flute(f),
            flute_phase,
        );
        if let Some(pr) = prev.as_ref() {
            bark.bridge(pr, &ring);
        }
        if i == rings {
            top_ring = ring.clone();
        }
        prev = Some(ring);
    }

    let cut_y = BOLE_BASE_Y + BOLE_LEN * cut;
    let centre = Vector3::new(0.0, cut_y - BOLE_R0 * 0.12, 0.0);
    let pts: Vec<Vector3> = top_ring.iter().map(|i| bark.verts[*i as usize]).collect();
    let heart = Color::from_rgba(0.0, 1.0, 1.0, 0.0);
    for w in pts.windows(2) {
        bark.tri(centre, w[1], w[0], heart);
    }

    root_web(
        &mut bark,
        BOLE_BASE_Y,
        &nodes,
        &segd,
        BOLE_R0,
        &|f| bole_radius(f * cut) * bole_flare(f * cut),
        flute_phase,
        col,
        &mut state,
    );

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &bark.arrays(true));
    am
}

fn build_far_tree_mesh(seed: u32, crown: f32) -> Gd<ArrayMesh> {
    let mut mb = MeshBuilder::new();
    let mut state = hash32(seed | 1);

    let trunk = Color::from_rgba(0.36, 0.26, 0.18, 0.0);
    let sides = 6;
    let r0 = 0.062;
    let r1 = 0.026;
    let top = 1.0;
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
            Vector3::new(0.0, 1.24, 0.0),
            Vector3::new(0.56 * cw, 0.35 * cw, 0.56 * cw),
        ),
        (
            Vector3::new(0.32 * cw, 1.06, 0.16 * cw),
            Vector3::new(0.32 * cw, 0.24 * cw, 0.32 * cw),
        ),
        (
            Vector3::new(-0.35 * cw, 1.12, -0.13 * cw),
            Vector3::new(0.3 * cw, 0.23 * cw, 0.3 * cw),
        ),
        (
            Vector3::new(0.01, 1.6, -0.04),
            Vector3::new(0.32 * cw, 0.24 * cw, 0.32 * cw),
        ),
    ];
    for (c, r) in blob_defs {
        blob(c, r, &mut mb, &mut state);
    }

    let mut leaves = MeshBuilder::new();
    for (c, r) in blob_defs {
        let cards = if r.x > 0.4 { 9 } else { 6 };
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
            let hs = (0.16 + randf(&mut state) * 0.09) * crown;
            let sway = ((pos.y - 0.9) / 1.0).clamp(0.2, 1.0);
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
            ((y - 0.9) / 1.0).clamp(0.0, 1.0)
        };
        c.a = w;
    }

    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &mb.arrays(false));
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &leaves.arrays(true));
    am
}
