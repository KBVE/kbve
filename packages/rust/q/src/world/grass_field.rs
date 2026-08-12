use godot::classes::image::Format as ImageFormat;
use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{
    Engine, Image, ImageTexture, Mesh, QuadMesh, RenderingServer, Shader, ShaderMaterial,
};
use godot::prelude::*;

use crate::world::grass_compute::{BladeCompute, CardCompute, CardParams};
use crate::world::terrain::QTerrain;

const LOD_UPDATE_DISTANCE_SQ: f32 = 0.25;
const TIER_FRACTIONS: [f32; 4] = [1.0, 0.5, 0.25, 0.125];
const CARD_TAIL: f32 = 45.0;
const CARD_FLOOR: f32 = 0.05;

const DETAILED_MESH: &str = "res://assets/biomes/grassland/grass/grass-stalk.obj";
const SIMPLE_MESH: &str = "res://assets/biomes/grassland/grass/grass-stalk-simple.obj";
const CARD_SHADER: &str = "res://assets/biomes/grassland/grass/grass_card.gdshader";

const CARD_COPY_PARAMS: &[&str] = &[
    "size_small",
    "size_large",
    "color_small",
    "color_large",
    "patch_noise",
    "patch_scale",
    "wind_noise",
    "wind_strength",
    "cloud_shadow_strength",
    "cloud_shadow_scale",
    "cloud_shadow_speed",
    "distance_growth",
    "heightmap",
    "terrain_extent",
    "water_level",
];

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

fn randf_range(state: &mut u32, from: f32, to: f32) -> f32 {
    from + randf(state) * (to - from)
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn tier_for(fraction: f32) -> Option<usize> {
    if fraction <= 0.004 {
        return None;
    }
    let needed = (fraction * 1.05 + 0.03).min(1.0);
    for i in (0..TIER_FRACTIONS.len()).rev() {
        if TIER_FRACTIONS[i] >= needed {
            return Some(i);
        }
    }
    Some(0)
}

struct Slot {
    rid: Rid,
    coord: (i32, i32),
    active: bool,
    near: bool,
    tier: usize,
}

struct RingGrid {
    width: i32,
    cell_size: f32,
    slots: Vec<Slot>,
    offsets: Vec<(i32, i32)>,
}

impl RingGrid {
    fn new(radius_cells: i32, cell_size: f32) -> Self {
        let width = radius_cells * 2 + 1;
        let mut offsets: Vec<(i32, i32)> = Vec::with_capacity((width * width) as usize);
        for dx in -radius_cells..=radius_cells {
            for dz in -radius_cells..=radius_cells {
                offsets.push((dx, dz));
            }
        }
        offsets.sort_unstable_by_key(|(x, z)| x * x + z * z);
        Self {
            width,
            cell_size,
            slots: Vec::new(),
            offsets,
        }
    }

    fn index(&self, coord: (i32, i32)) -> usize {
        let lx = coord.0.rem_euclid(self.width) as usize;
        let lz = coord.1.rem_euclid(self.width) as usize;
        lz * self.width as usize + lx
    }

    fn half_diagonal(&self) -> f32 {
        self.cell_size * std::f32::consts::FRAC_1_SQRT_2
    }
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QGrassField {
    base: Base<Node3D>,

    init_done: bool,
    #[export]
    player_path: NodePath,
    #[export]
    grass_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 5.0)]
    chunk_size: f32,
    #[export]
    #[init(val = 20.0)]
    card_chunk_size: f32,
    /// Near-camera density is where grass cost lives: 250 -> 150 roughly halved
    /// frame time in an open field for very little visible thinning, while
    /// cutting blade_range over the same span bought a fraction of that.
    #[export]
    #[init(val = 150.0)]
    blades_per_sqm: f32,
    #[export]
    #[init(val = 6.5)]
    lod_near_enter: f32,
    #[export]
    #[init(val = 8.0)]
    lod_near_exit: f32,
    #[export]
    #[init(val = 25.0)]
    thin_start: f32,
    #[export]
    #[init(val = 40.0)]
    blade_range: f32,
    #[export]
    #[init(val = 200.0)]
    grass_fade_out_end: f32,
    #[export]
    #[init(val = 0.008)]
    card_ratio: f32,
    #[export]
    #[init(val = 0.028)]
    transition_ratio: f32,
    #[export]
    #[init(val = 60.0)]
    transition_out_start: f32,
    #[export]
    #[init(val = 100.0)]
    transition_out_end: f32,
    /// The billboard card and transition tiers are a local addition; the
    /// upstream design this is based on goes blades straight to the ground
    /// impostor. Cards fade by rescaling an alpha-tested cutout, which crawls
    /// under motion, so they are off by default.
    #[export]
    #[init(val = true)]
    billboards: bool,
    #[export]
    #[init(val = 256.0)]
    world_half_extent: f32,
    #[export]
    #[init(val = 1337)]
    layout_seed: i64,
    #[export]
    #[init(val = 4)]
    layout_variants: i32,

    blade_multimeshes: Vec<Vec<Vec<Rid>>>,
    card_multimeshes: Vec<Vec<Rid>>,
    transition_multimeshes: Vec<Vec<Rid>>,
    blade_grid: Option<RingGrid>,
    card_grid: Option<RingGrid>,
    transition_grid: Option<RingGrid>,
    last_blade_center: Option<(i32, i32)>,
    last_card_center: Option<(i32, i32)>,
    last_lod_position: Vector3,
    last_shader_origin: Vector3,
    player: Option<Gd<Node3D>>,
    card_material: Option<Gd<ShaderMaterial>>,
    transition_material: Option<Gd<ShaderMaterial>>,
    #[init(val = Vec::new())]
    kept_resources: Vec<Gd<Mesh>>,
    card_mesh: Option<Gd<QuadMesh>>,
    blade_aabb: Aabb,
    card_aabb: Aabb,

    #[export]
    #[init(val = true)]
    compute_blades: bool,
    blade_compute: Option<BladeCompute>,
    card_compute: Option<CardCompute>,
    transition_compute: Option<CardCompute>,
    compute_attempts: i32,
    detailed_tris: u64,
    simple_tris: u64,
    blade_params: Vec<f32>,
    card_params: Vec<f32>,
    trans_params: Vec<f32>,
    blade_cells: Vec<f32>,
    card_cells: Vec<f32>,
    trans_cells: Vec<f32>,
    blade_cell_y: Vec<f32>,
    card_cell_y: Vec<f32>,
    trans_cell_y: Vec<f32>,
    classic_built: bool,
    #[export]
    terrain_path: NodePath,
    terrain_image: Option<Gd<Image>>,
    terrain_heights: Vec<f32>,
    terrain_res: i32,
    #[init(val = Rid::Invalid)]
    terrain_heightmap_rid: Rid,
    #[init(val = Rid::Invalid)]
    terrain_clearance_rid: Rid,
    clearance_fallback: Option<Gd<godot::classes::ImageTexture>>,
    terrain_extent_cached: f32,
    water_cached: f32,
}

impl QGrassField {
    fn late_init(&mut self) -> bool {
        let terrain_poll = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        if let Some(t) = terrain_poll.as_ref() {
            if t.bind().cpu_heights().is_none() {
                return false;
            }
        }
        let _t = super::ReadyTimer::start("grass");
        self.last_lod_position = Vector3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        self.last_shader_origin = Vector3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        self.player = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok());
        let blade_count = (self.chunk_size * self.chunk_size * self.blades_per_sqm) as usize;
        let card_count =
            ((self.card_chunk_size * self.card_chunk_size * self.blades_per_sqm * self.card_ratio)
                as usize)
                .max(8);
        let transition_count = ((self.card_chunk_size
            * self.card_chunk_size
            * self.blades_per_sqm
            * self.transition_ratio) as usize)
            .max(8);
        self.blade_aabb = Aabb::new(
            Vector3::new(-0.5, -8.0, -0.5),
            Vector3::new(self.chunk_size + 1.0, 16.0, self.chunk_size + 1.0),
        );
        self.card_aabb = Aabb::new(
            Vector3::new(-0.5, -8.0, -0.5),
            Vector3::new(self.card_chunk_size + 1.0, 16.0, self.card_chunk_size + 1.0),
        );

        if self.billboards {
            self.build_card_material(card_count, transition_count);
        }

        let mut card_mesh = QuadMesh::new_gd();
        card_mesh.set_size(Vector2::new(1.0, 1.0));
        card_mesh.set_center_offset(Vector3::new(0.0, 0.5, 0.0));

        let detailed: Gd<Mesh> = load(DETAILED_MESH);
        let simple: Gd<Mesh> = load(SIMPLE_MESH);
        self.detailed_tris = (detailed.get_faces().len() / 3) as u64;
        self.simple_tris = (simple.get_faces().len() / 3) as u64;

        let variants = self.layout_variants.max(1) as usize;
        let mut blade_params: Vec<f32> = Vec::with_capacity(variants * blade_count * 6);
        let mut card_params: Vec<f32> = Vec::with_capacity(variants * card_count * 6);
        let mut trans_params: Vec<f32> = Vec::with_capacity(variants * transition_count * 6);
        for v in 0..self.layout_variants {
            blade_params.extend(self.build_layout_params(
                (self.layout_seed as u32) ^ hash32(v as u32),
                blade_count,
                self.chunk_size,
            ));
            if self.billboards {
                card_params.extend(self.build_layout_params(
                    (self.layout_seed as u32) ^ hash32(7919 + v as u32),
                    card_count,
                    self.card_chunk_size,
                ));
                trans_params.extend(self.build_layout_params(
                    (self.layout_seed as u32) ^ hash32(104729 + v as u32),
                    transition_count,
                    self.card_chunk_size,
                ));
            }
        }
        self.blade_params = blade_params;
        self.card_params = card_params;
        self.trans_params = trans_params;
        self.kept_resources.push(detailed);
        self.kept_resources.push(simple);
        self.card_mesh = Some(card_mesh);

        let blade_radius_cells = (self.blade_attach_distance() / self.chunk_size).ceil() as i32;
        let card_margin =
            self.grass_fade_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 10.0;
        let card_radius_cells = (card_margin / self.card_chunk_size).ceil() as i32;
        let transition_margin =
            self.transition_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 5.0;
        let transition_radius_cells = (transition_margin / self.card_chunk_size).ceil() as i32;
        self.blade_grid = Some(RingGrid::new(blade_radius_cells, self.chunk_size));
        if self.billboards {
            self.card_grid = Some(RingGrid::new(card_radius_cells, self.card_chunk_size));
            self.transition_grid =
                Some(RingGrid::new(transition_radius_cells, self.card_chunk_size));
        }

        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("total_blades", &(blade_count as f32).to_variant());
        }
        self.sync_fade_parameters();

        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        if let Some(terrain) = terrain {
            let t = terrain.bind();
            if let Some((heights, res)) = t.cpu_heights() {
                self.terrain_heights = heights.to_vec();
                self.terrain_res = res;
            }
            self.terrain_extent_cached = t.world_extent();
            self.water_cached = t.water();
            self.terrain_heightmap_rid = t
                .heightmap_texture()
                .map(|tex| tex.get_rid())
                .unwrap_or(Rid::Invalid);
            self.terrain_clearance_rid = t
                .clearance_texture()
                .map(|tex| tex.get_rid())
                .unwrap_or(Rid::Invalid);
        } else if let Some(mat) = self.grass_material.as_ref() {
            self.terrain_extent_cached = mat
                .get_shader_parameter("terrain_extent")
                .try_to::<f32>()
                .unwrap_or(self.world_half_extent);
            self.water_cached = mat
                .get_shader_parameter("water_level")
                .try_to::<f32>()
                .unwrap_or(-1.4);
            if let Ok(tex) = mat
                .get_shader_parameter("heightmap")
                .try_to::<Gd<godot::classes::Texture2D>>()
            {
                self.terrain_image = tex.get_image();
            }
        }

        if godot::classes::Os::singleton().get_environment("GRASS_NO_COMPUTE") == GString::from("1")
        {
            self.compute_blades = false;
        }
        if self.compute_blades {
            let bp = std::mem::take(&mut self.blade_params);
            let cp = std::mem::take(&mut self.card_params);
            let tp = std::mem::take(&mut self.trans_params);
            self.blade_compute = self.build_blade_compute(&bp, blade_count);
            if self.blade_compute.is_some() && self.billboards {
                self.card_compute = self.build_card_compute(&cp, card_count, false);
                self.transition_compute = self.build_card_compute(&tp, transition_count, true);
            }
            self.blade_params = bp;
            self.card_params = cp;
            self.trans_params = tp;
            let cards_failed = self.billboards
                && (self.card_compute.is_none() || self.transition_compute.is_none());
            if self.blade_compute.is_none() || cards_failed {
                self.teardown_compute();
            }
        }
        if self.blade_compute.is_none() {
            self.ensure_classic();
        }
        let mode = if self.blade_compute.is_some() {
            1.0f32
        } else {
            0.0f32
        };
        self.apply_compute_mode(mode);

        // Per-tier draw toggles. These hide instances but leave the compute
        // dispatch running, so they isolate raster cost from culling cost.
        if super::q_hidden("blades") {
            if let Some(bc) = self.blade_compute.as_mut() {
                bc.set_visible(false);
            }
        }
        if super::q_hidden("cards") {
            if let Some(cc) = self.card_compute.as_mut() {
                cc.set_visible(false);
            }
        }
        if super::q_hidden("transition") {
            if let Some(tc) = self.transition_compute.as_mut() {
                tc.set_visible(false);
            }
        }
        true
    }
}

#[godot_api]
impl INode3D for QGrassField {
    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        if !self.init_done {
            if super::q_hidden("grass") || self.late_init() {
                self.init_done = true;
            }
            return;
        }
        let origin = match self.view_origin() {
            Some(o) => o,
            None => return,
        };
        if origin.distance_squared_to(self.last_shader_origin) > 0.0004 {
            self.last_shader_origin = origin;
            let flat = Vector3::new(origin.x, 0.0, origin.z);
            for m in [
                self.grass_material.as_mut(),
                self.card_material.as_mut(),
                self.transition_material.as_mut(),
            ]
            .into_iter()
            .flatten()
            {
                m.set_shader_parameter("fade_origin", &flat.to_variant());
            }
            let player_pos = self
                .player
                .as_ref()
                .filter(|p| p.is_instance_valid())
                .map(|p| p.get_global_position());
            if let (Some(m), Some(p)) = (self.grass_material.as_mut(), player_pos) {
                let obj = Vector3::new(p.x, 0.0, p.z);
                m.set_shader_parameter("object_position", &obj.to_variant());
            }
        }

        let blade_center = (
            (origin.x / self.chunk_size).floor() as i32,
            (origin.z / self.chunk_size).floor() as i32,
        );
        if self.last_blade_center != Some(blade_center) {
            self.last_blade_center = Some(blade_center);
            let _t = crate::world::StallTimer::start("grass.blade_cells");
            if self.blade_compute.is_some() {
                self.rebuild_compute_cells(blade_center);
            } else {
                self.refresh_blade_grid(blade_center);
            }
        }

        let card_center = (
            (origin.x / self.card_chunk_size).floor() as i32,
            (origin.z / self.card_chunk_size).floor() as i32,
        );
        if self.last_card_center != Some(card_center) {
            self.last_card_center = Some(card_center);
            let _t = crate::world::StallTimer::start("grass.card_cells");
            if self.blade_compute.is_some() {
                self.rebuild_card_cells(card_center);
                self.rebuild_transition_cells(card_center);
            } else {
                self.refresh_card_grid(card_center);
                self.refresh_transition_grid(card_center);
            }
        }

        if origin.distance_squared_to(self.last_lod_position) >= LOD_UPDATE_DISTANCE_SQ {
            self.last_lod_position = origin;
            let _t = crate::world::StallTimer::start("grass.tiers");
            self.update_tiers(origin);
        }

        if self.blade_compute.is_some() {
            let _t = crate::world::StallTimer::start("grass.step_compute");
            self.step_compute();
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                if let Some(bc) = self.blade_compute.as_mut() {
                    bc.set_visible(visible);
                }
                if let Some(cc) = self.card_compute.as_mut() {
                    cc.set_visible(visible);
                }
                if let Some(tc) = self.transition_compute.as_mut() {
                    tc.set_visible(visible);
                }
                let mut rs = RenderingServer::singleton();
                for grid in [
                    self.blade_grid.as_ref(),
                    self.card_grid.as_ref(),
                    self.transition_grid.as_ref(),
                ]
                .into_iter()
                .flatten()
                {
                    for slot in &grid.slots {
                        rs.instance_set_visible(slot.rid, visible && slot.active);
                    }
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QGrassField {
    #[func]
    fn get_grass_stats(&mut self) -> VarDictionary {
        let mut d = VarDictionary::new();
        let mut instances: u64 = 0;
        let mut tris: u64 = 0;
        let mut cap_tris: u64 = 0;
        let active = self.blade_compute.is_some();
        let mut utils: Vec<i64> = Vec::with_capacity(4);
        if let Some(bc) = self.blade_compute.as_mut() {
            let (near_raw, far_raw) = bc.survivor_counts();
            let (cn, cf) = bc.caps();
            let near = near_raw.min(cn);
            let far = far_raw.min(cf);
            instances += (near + far) as u64;
            tris += near as u64 * self.detailed_tris + far as u64 * self.simple_tris;
            cap_tris += cn as u64 * self.detailed_tris + cf as u64 * self.simple_tris;
            utils.push((near_raw as u64 * 100 / cn.max(1) as u64) as i64);
            utils.push((far_raw as u64 * 100 / cf.max(1) as u64) as i64);
        }
        for cc in [self.card_compute.as_mut(), self.transition_compute.as_mut()]
            .into_iter()
            .flatten()
        {
            let raw = cc.survivor_count();
            let cap = cc.cap();
            let n = raw.min(cap) as u64;
            instances += n;
            tris += n * 2;
            cap_tris += cap as u64 * 2;
            utils.push((raw as u64 * 100 / cap.max(1) as u64) as i64);
        }
        let _ = d.insert("active", active);
        let _ = d.insert("instances", instances as i64);
        let _ = d.insert("tris", tris as i64);
        let _ = d.insert("cap_tris", cap_tris as i64);
        let util_arr: Array<i64> = utils.into_iter().collect();
        let _ = d.insert("utils", &util_arr);
        d
    }

    #[func]
    fn set_debug_tint(&mut self, on: bool) {
        let colors = if on {
            [
                Vector3::new(1.0, 0.1, 0.1),
                Vector3::new(0.1, 1.0, 0.1),
                Vector3::new(0.1, 0.2, 1.0),
            ]
        } else {
            [Vector3::ZERO, Vector3::ZERO, Vector3::ZERO]
        };
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("debug_color", &colors[0].to_variant());
        }
        if let Some(m) = self.transition_material.as_mut() {
            m.set_shader_parameter("debug_color", &colors[1].to_variant());
        }
        if let Some(m) = self.card_material.as_mut() {
            m.set_shader_parameter("debug_color", &colors[2].to_variant());
        }
    }
}

impl QGrassField {
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

    fn sync_fade_parameters(&mut self) {
        let ts = self.thin_start;
        let br = self.blade_range;
        let fe = self.grass_fade_out_end;
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("thin_start", &ts.to_variant());
            m.set_shader_parameter("blade_range", &br.to_variant());
        }
        for m in [
            self.card_material.as_mut(),
            self.transition_material.as_mut(),
        ]
        .into_iter()
        .flatten()
        {
            m.set_shader_parameter("blade_range", &br.to_variant());
            m.set_shader_parameter("fade_end", &fe.to_variant());
        }
    }

    fn build_blade_compute(
        &mut self,
        blade_layouts: &[f32],
        blade_count: usize,
    ) -> Option<BladeCompute> {
        let world = self.base().get_world_3d()?;
        let scenario = world.get_scenario();
        let detailed = self.kept_resources.first()?.get_rid();
        let simple = self.kept_resources.get(1)?.get_rid();
        let material = self.grass_material.as_ref().map(|m| m.get_rid())?;
        let cell_capacity = self.blade_grid.as_ref()?.offsets.len() as u32;
        let pi = std::f32::consts::PI;
        let cap_near =
            (pi * self.lod_near_exit * self.lod_near_exit * self.blades_per_sqm * 1.25) as u32;
        let full_area = pi * self.thin_start * self.thin_start;
        let band_area =
            pi * (self.blade_range * self.blade_range - self.thin_start * self.thin_start);
        let cap_far = ((full_area + band_area * 0.55) * self.blades_per_sqm * 1.05) as u32;
        let extent = self.world_half_extent + self.blade_range + 50.0;
        let world_aabb = Aabb::new(
            Vector3::new(-extent, -40.0, -extent),
            Vector3::new(extent * 2.0, 120.0, extent * 2.0),
        );
        let heightmap = self.resolve_heightmap_rid()?;
        let clearance = self.resolve_clearance_rid()?;
        let terrain_extent = self.terrain_extent_cached.max(1.0);
        let water_level = self.water_cached;
        BladeCompute::new(
            scenario,
            world_aabb,
            detailed,
            simple,
            material,
            blade_layouts,
            blade_count as u32,
            cell_capacity,
            cap_near,
            cap_far,
            heightmap,
            clearance,
            terrain_extent,
            water_level,
        )
    }

    fn rebuild_compute_cells(&mut self, center: (i32, i32)) {
        let Some(grid) = self.blade_grid.take() else {
            return;
        };
        let attach = self.blade_attach_distance();
        let attach_sq = attach * attach;
        let cell = grid.cell_size;
        let blade_count = (self.chunk_size * self.chunk_size * self.blades_per_sqm) as usize;
        let mut entries: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 4);
        let mut ys: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 2);
        for (dx, dz) in &grid.offsets {
            let coord = (center.0 + dx, center.1 + dz);
            let cx = *dx as f32 * cell;
            let cz = *dz as f32 * cell;
            if cx * cx + cz * cz > attach_sq || !self.in_world(coord, cell) {
                continue;
            }
            let (ymin, ymax) =
                self.cell_y_range(coord.0 as f32 * cell, coord.1 as f32 * cell, cell);
            if ymax < self.water_cached + 0.25 {
                continue;
            }
            let variant = self.layout_index(coord);
            entries.push(coord.0 as f32 * cell);
            entries.push(coord.1 as f32 * cell);
            entries.push((variant * blade_count * 6) as f32);
            entries.push(variant as f32);
            ys.push(ymin);
            ys.push(ymax);
        }
        self.blade_grid = Some(grid);
        self.blade_cells = entries;
        self.blade_cell_y = ys;
    }

    fn step_compute(&mut self) {
        if !self.base().is_visible_in_tree() {
            return;
        }
        let blade_online = match self.blade_compute.as_mut() {
            Some(bc) => bc.online() || bc.try_finalize(),
            None => return,
        };
        // A tier that was never built is not a tier that failed, so absent
        // counts as online; otherwise running without billboards trips the
        // fallback and drops the whole field to the classic path.
        let card_online = self
            .card_compute
            .as_mut()
            .map_or(true, |c| c.online() || c.try_finalize());
        let trans_online = self
            .transition_compute
            .as_mut()
            .map_or(true, |c| c.online() || c.try_finalize());
        if !blade_online || !card_online || !trans_online {
            self.compute_attempts += 1;
            if self.compute_attempts > 300 {
                self.disable_compute();
            }
            return;
        }
        if self.compute_attempts >= 0 {
            self.compute_attempts = -1;
            if let Some(c) = self.last_blade_center {
                self.rebuild_compute_cells(c);
            }
            if let Some(c) = self.last_card_center {
                self.rebuild_card_cells(c);
                self.rebuild_transition_cells(c);
            }
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
        let (ts, br, ln) = (self.thin_start, self.blade_range, self.lod_near_enter);
        let blade_visible = Self::filter_cells(
            &self.blade_cells,
            &self.blade_cell_y,
            &planes,
            self.chunk_size,
        );
        let card_visible = Self::filter_cells(
            &self.card_cells,
            &self.card_cell_y,
            &planes,
            self.card_chunk_size,
        );
        let trans_visible = Self::filter_cells(
            &self.trans_cells,
            &self.trans_cell_y,
            &planes,
            self.card_chunk_size,
        );
        if let Some(bc) = self.blade_compute.as_mut() {
            bc.update_cells(&blade_visible);
            bc.dispatch(cam_pos, &planes, ts, br, ln);
        }
        if let Some(cc) = self.card_compute.as_mut() {
            cc.update_cells(&card_visible);
            cc.dispatch(cam_pos, &planes);
        }
        if let Some(tc) = self.transition_compute.as_mut() {
            tc.update_cells(&trans_visible);
            tc.dispatch(cam_pos, &planes);
        }
    }

    fn resolve_heightmap_rid(&self) -> Option<Rid> {
        if self.terrain_heightmap_rid.is_valid() {
            return Some(self.terrain_heightmap_rid);
        }
        self.grass_material
            .as_ref()?
            .get_shader_parameter("heightmap")
            .try_to::<Gd<godot::classes::Texture2D>>()
            .ok()
            .map(|t| t.get_rid())
    }

    fn resolve_clearance_rid(&mut self) -> Option<Rid> {
        if self.terrain_clearance_rid.is_valid() {
            return Some(self.terrain_clearance_rid);
        }
        if let Some(tex) = self.clearance_fallback.as_ref() {
            return Some(tex.get_rid());
        }
        let data = PackedByteArray::from(&[0u8][..]);
        let tex = godot::classes::Image::create_from_data(
            1,
            1,
            false,
            godot::classes::image::Format::R8,
            &data,
        )
        .and_then(|img| godot::classes::ImageTexture::create_from_image(&img))?;
        let rid = tex.get_rid();
        self.clearance_fallback = Some(tex);
        Some(rid)
    }

    fn terrain_sample(&self, x: f32, z: f32) -> f32 {
        let e = self.terrain_extent_cached.max(1.0);
        let u = ((x + e) / (e * 2.0)).clamp(0.001, 0.999);
        let v = ((z + e) / (e * 2.0)).clamp(0.001, 0.999);
        if !self.terrain_heights.is_empty() {
            let res = self.terrain_res.max(2);
            let px = ((u * res as f32) as i32).clamp(0, res - 1);
            let py = ((v * res as f32) as i32).clamp(0, res - 1);
            return self.terrain_heights[(py * res + px) as usize];
        }
        let Some(img) = self.terrain_image.as_ref() else {
            return 0.0;
        };
        let px = (u * img.get_width() as f32) as i32;
        let py = (v * img.get_height() as f32) as i32;
        img.get_pixel(
            px.clamp(0, img.get_width() - 1),
            py.clamp(0, img.get_height() - 1),
        )
        .r
    }

    fn cell_y_range(&self, x0: f32, z0: f32, size: f32) -> (f32, f32) {
        if self.terrain_heights.is_empty() && self.terrain_image.is_none() {
            return (-1.0e4, 1.0e4);
        }
        let mut mn = f32::MAX;
        let mut mx = f32::MIN;
        for i in 0..5 {
            for j in 0..5 {
                let h = self.terrain_sample(x0 + size * i as f32 / 4.0, z0 + size * j as f32 / 4.0);
                mn = mn.min(h);
                mx = mx.max(h);
            }
        }
        (mn, mx)
    }

    fn filter_cells(cells: &[f32], ys: &[f32], planes: &[Plane; 4], cell: f32) -> Vec<f32> {
        let rh = cell * std::f32::consts::FRAC_1_SQRT_2 + 3.0;
        let mut out = Vec::with_capacity(cells.len());
        for (i, e) in cells.chunks_exact(4).enumerate() {
            let ymin = ys.get(i * 2).copied().unwrap_or(-1.0e4);
            let ymax = ys.get(i * 2 + 1).copied().unwrap_or(1.0e4);
            let center = Vector3::new(e[0] + cell * 0.5, (ymin + ymax) * 0.5, e[1] + cell * 0.5);
            let vr = (ymax - ymin) * 0.5 + 4.0;
            let mut visible = true;
            for p in planes {
                let horiz = (p.normal.x * p.normal.x + p.normal.z * p.normal.z).sqrt();
                if p.normal.dot(center) - p.d > rh * horiz + vr * p.normal.y.abs() + 2.0 {
                    visible = false;
                    break;
                }
            }
            if visible {
                out.extend_from_slice(e);
            }
        }
        out
    }

    fn teardown_compute(&mut self) {
        if let Some(mut bc) = self.blade_compute.take() {
            bc.free();
        }
        if let Some(mut cc) = self.card_compute.take() {
            cc.free();
        }
        if let Some(mut tc) = self.transition_compute.take() {
            tc.free();
        }
        self.compute_blades = false;
    }

    fn apply_compute_mode(&mut self, mode: f32) {
        for m in [
            self.grass_material.as_mut(),
            self.card_material.as_mut(),
            self.transition_material.as_mut(),
        ]
        .into_iter()
        .flatten()
        {
            m.set_shader_parameter("compute_mode", &mode.to_variant());
        }
    }

    fn disable_compute(&mut self) {
        self.teardown_compute();
        self.apply_compute_mode(0.0);
        self.ensure_classic();
        self.last_blade_center = None;
        self.last_card_center = None;
        godot_warn!("[QGrassField] compute path unavailable, falling back to classic grass");
    }

    fn build_card_compute(
        &mut self,
        layouts: &[f32],
        count_per_cell: usize,
        transition: bool,
    ) -> Option<CardCompute> {
        let world = self.base().get_world_3d()?;
        let scenario = world.get_scenario();
        let mesh = self.card_mesh.as_ref()?.get_rid();
        let material = if transition {
            self.transition_material.as_ref()?.get_rid()
        } else {
            self.card_material.as_ref()?.get_rid()
        };
        let grid = if transition {
            self.transition_grid.as_ref()?
        } else {
            self.card_grid.as_ref()?
        };
        let cell_capacity = grid.offsets.len() as u32;
        let cell = grid.cell_size;
        let heightmap = self.resolve_heightmap_rid()?;
        let terrain_extent = self.terrain_extent_cached.max(1.0);
        let water_level = self.water_cached;
        let margin = if transition {
            self.transition_out_end + cell * std::f32::consts::FRAC_1_SQRT_2 + 5.0
        } else {
            self.grass_fade_out_end + cell * std::f32::consts::FRAC_1_SQRT_2 + 10.0
        };
        let active_cells =
            (std::f32::consts::PI * (margin / cell + 1.0) * (margin / cell + 1.0)).ceil() as u32;
        let survivor_factor = if transition { 0.55 } else { 0.45 };
        let cap = ((active_cells.min(cell_capacity) * count_per_cell as u32) as f32
            * survivor_factor) as u32;
        let params = CardParams {
            blade_range: self.blade_range,
            card_tail: CARD_TAIL,
            card_floor: if transition { 1.0 } else { CARD_FLOOR },
            fade_end: self.grass_fade_out_end,
            band_out_start: if transition {
                self.transition_out_start
            } else {
                0.0
            },
            band_out_end: if transition {
                self.transition_out_end
            } else {
                0.0
            },
            terrain_extent,
            water_level,
            occl_start: if !crate::world::grass_compute::occlusion_enabled() {
                1.0e9
            } else if transition {
                25.0
            } else {
                30.0
            },
            occl_margin: if transition { 1.5 } else { 2.0 },
        };
        let extent = self.world_half_extent + self.grass_fade_out_end + 50.0;
        let world_aabb = Aabb::new(
            Vector3::new(-extent, -40.0, -extent),
            Vector3::new(extent * 2.0, 120.0, extent * 2.0),
        );
        let clearance = self.resolve_clearance_rid()?;
        CardCompute::new(
            scenario,
            world_aabb,
            mesh,
            material,
            layouts,
            count_per_cell as u32,
            cell_capacity,
            cap,
            heightmap,
            clearance,
            &params,
        )
    }

    fn rebuild_card_cells(&mut self, center: (i32, i32)) {
        let Some(grid) = self.card_grid.take() else {
            return;
        };
        let margin =
            self.grass_fade_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 10.0;
        let margin_sq = margin * margin;
        let cell = grid.cell_size;
        let card_count =
            ((self.card_chunk_size * self.card_chunk_size * self.blades_per_sqm * self.card_ratio)
                as usize)
                .max(8);
        let mut entries: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 4);
        let mut ys: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 2);
        for (dx, dz) in &grid.offsets {
            let coord = (center.0 + dx, center.1 + dz);
            let cx = *dx as f32 * cell;
            let cz = *dz as f32 * cell;
            if cx * cx + cz * cz > margin_sq || !self.in_world(coord, cell) {
                continue;
            }
            let (ymin, ymax) =
                self.cell_y_range(coord.0 as f32 * cell, coord.1 as f32 * cell, cell);
            if ymax < self.water_cached + 0.25 {
                continue;
            }
            let variant = self.layout_index(coord);
            entries.push(coord.0 as f32 * cell);
            entries.push(coord.1 as f32 * cell);
            entries.push((variant * card_count * 6) as f32);
            entries.push(variant as f32);
            ys.push(ymin);
            ys.push(ymax);
        }
        self.card_grid = Some(grid);
        self.card_cells = entries;
        self.card_cell_y = ys;
    }

    fn rebuild_transition_cells(&mut self, center: (i32, i32)) {
        let Some(grid) = self.transition_grid.take() else {
            return;
        };
        let margin =
            self.transition_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 5.0;
        let margin_sq = margin * margin;
        let cell = grid.cell_size;
        let half_diag = grid.half_diagonal();
        let far_gate = self.blade_range * 0.55 - 5.0;
        let transition_count = ((self.card_chunk_size
            * self.card_chunk_size
            * self.blades_per_sqm
            * self.transition_ratio) as usize)
            .max(8);
        let mut entries: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 4);
        let mut ys: Vec<f32> = Vec::with_capacity(grid.offsets.len() * 2);
        for (dx, dz) in &grid.offsets {
            let coord = (center.0 + dx, center.1 + dz);
            let cx = *dx as f32 * cell;
            let cz = *dz as f32 * cell;
            let dist_sq = cx * cx + cz * cz;
            if dist_sq > margin_sq || !self.in_world(coord, cell) {
                continue;
            }
            if dist_sq.sqrt() + half_diag < far_gate {
                continue;
            }
            let (ymin, ymax) =
                self.cell_y_range(coord.0 as f32 * cell, coord.1 as f32 * cell, cell);
            if ymax < self.water_cached + 0.25 {
                continue;
            }
            let variant = self.layout_index(coord);
            entries.push(coord.0 as f32 * cell);
            entries.push(coord.1 as f32 * cell);
            entries.push((variant * transition_count * 6) as f32);
            entries.push(variant as f32);
            ys.push(ymin);
            ys.push(ymax);
        }
        self.transition_grid = Some(grid);
        self.trans_cells = entries;
        self.trans_cell_y = ys;
    }

    fn blade_attach_distance(&self) -> f32 {
        self.blade_range + self.chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 3.0
    }

    fn layout_index(&self, coord: (i32, i32)) -> usize {
        let h = (coord.0.wrapping_mul(73856093)) ^ (coord.1.wrapping_mul(19349663));
        h.rem_euclid(self.layout_variants.max(1)) as usize
    }

    fn in_world(&self, coord: (i32, i32), size: f32) -> bool {
        let min_x = coord.0 as f32 * size;
        let min_z = coord.1 as f32 * size;
        min_x >= -self.world_half_extent
            && min_x + size <= self.world_half_extent
            && min_z >= -self.world_half_extent
            && min_z + size <= self.world_half_extent
    }

    fn blade_fraction(&self, near_dist: f32) -> f32 {
        let t = smoothstep(self.thin_start, self.blade_range, near_dist);
        1.0 - t * t
    }

    fn card_fraction(&self, near_dist: f32) -> f32 {
        (-((near_dist - self.blade_range).max(0.0)) / CARD_TAIL)
            .exp()
            .max(CARD_FLOOR)
    }

    fn transition_fraction(&self, near_dist: f32, far_dist: f32) -> f32 {
        if far_dist < self.blade_range * 0.55 - 5.0 {
            return 0.0;
        }
        1.0 - smoothstep(
            self.transition_out_start,
            self.transition_out_end,
            near_dist,
        )
    }

    fn build_grid(&mut self, radius_cells: i32, cell_size: f32) -> RingGrid {
        let mut grid = RingGrid::new(radius_cells, cell_size);
        let count = (grid.width * grid.width) as usize;
        let Some(world) = self.base().get_world_3d() else {
            return grid;
        };
        let scenario = world.get_scenario();
        let mut rs = RenderingServer::singleton();
        grid.slots.reserve(count);
        for _ in 0..count {
            let rid = rs.instance_create();
            rs.instance_set_scenario(rid, scenario);
            rs.instance_geometry_set_cast_shadows_setting(rid, ShadowCastingSetting::OFF);
            rs.instance_set_visible(rid, false);
            grid.slots.push(Slot {
                rid,
                coord: (i32::MAX, i32::MAX),
                active: false,
                near: false,
                tier: 0,
            });
        }
        grid
    }

    fn assign_slot(
        rs: &mut Gd<RenderingServer>,
        slot: &mut Slot,
        coord: (i32, i32),
        mm: Rid,
        material_rid: Rid,
        aabb: Aabb,
        cell: f32,
        visible: bool,
        near: bool,
        tier: usize,
    ) {
        rs.instance_set_base(slot.rid, mm);
        rs.instance_set_custom_aabb(slot.rid, aabb);
        rs.instance_geometry_set_material_override(slot.rid, material_rid);
        rs.instance_set_transform(
            slot.rid,
            Transform3D::new(
                Basis::IDENTITY,
                Vector3::new(coord.0 as f32 * cell, 0.0, coord.1 as f32 * cell),
            ),
        );
        rs.instance_set_visible(slot.rid, visible);
        slot.coord = coord;
        slot.active = true;
        slot.near = near;
        slot.tier = tier;
    }

    fn refresh_blade_grid(&mut self, center: (i32, i32)) {
        let Some(mut grid) = self.blade_grid.take() else {
            return;
        };
        let attach_sq = self.blade_attach_distance() * self.blade_attach_distance();
        let cell = grid.cell_size;
        let half_diag = grid.half_diagonal();
        let visible_root = self.base().is_visible_in_tree();
        let material_rid = self
            .grass_material
            .as_ref()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let near_enter_sq = self.lod_near_enter * self.lod_near_enter;
        let mut rs = RenderingServer::singleton();
        for i in 0..grid.offsets.len() {
            let (dx, dz) = grid.offsets[i];
            let coord = (center.0 + dx, center.1 + dz);
            let cx = dx as f32 * cell;
            let cz = dz as f32 * cell;
            let dist_sq = cx * cx + cz * cz;
            let wanted = dist_sq <= attach_sq && self.in_world(coord, cell);
            let idx = grid.index(coord);
            if !wanted {
                let slot = &mut grid.slots[idx];
                if slot.active && slot.coord == coord {
                    slot.active = false;
                    rs.instance_set_visible(slot.rid, false);
                }
                continue;
            }
            if grid.slots[idx].active && grid.slots[idx].coord == coord {
                continue;
            }
            let near = dist_sq <= near_enter_sq;
            let near_dist = (dist_sq.sqrt() - half_diag).max(0.0);
            let tier = if near {
                0
            } else {
                tier_for(self.blade_fraction(near_dist)).unwrap_or(TIER_FRACTIONS.len() - 1)
            };
            let kind = if near { 0 } else { 1 };
            let mm = self.blade_multimeshes[self.layout_index(coord)][kind][tier];
            Self::assign_slot(
                &mut rs,
                &mut grid.slots[idx],
                coord,
                mm,
                material_rid,
                self.blade_aabb,
                cell,
                visible_root,
                near,
                tier,
            );
        }
        self.blade_grid = Some(grid);
    }

    fn refresh_card_grid(&mut self, center: (i32, i32)) {
        let Some(mut grid) = self.card_grid.take() else {
            return;
        };
        let margin =
            self.grass_fade_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 10.0;
        let margin_sq = margin * margin;
        let cell = grid.cell_size;
        let half_diag = grid.half_diagonal();
        let visible_root = self.base().is_visible_in_tree();
        let material_rid = self
            .card_material
            .as_ref()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let mut rs = RenderingServer::singleton();
        for i in 0..grid.offsets.len() {
            let (dx, dz) = grid.offsets[i];
            let coord = (center.0 + dx, center.1 + dz);
            let cx = dx as f32 * cell;
            let cz = dz as f32 * cell;
            let dist_sq = cx * cx + cz * cz;
            let wanted = dist_sq <= margin_sq && self.in_world(coord, cell);
            let idx = grid.index(coord);
            if !wanted {
                let slot = &mut grid.slots[idx];
                if slot.active && slot.coord == coord {
                    slot.active = false;
                    rs.instance_set_visible(slot.rid, false);
                }
                continue;
            }
            if grid.slots[idx].active && grid.slots[idx].coord == coord {
                continue;
            }
            let near_dist = (dist_sq.sqrt() - half_diag).max(0.0);
            let tier = tier_for(self.card_fraction(near_dist)).unwrap_or(TIER_FRACTIONS.len() - 1);
            let mm = self.card_multimeshes[self.layout_index(coord)][tier];
            Self::assign_slot(
                &mut rs,
                &mut grid.slots[idx],
                coord,
                mm,
                material_rid,
                self.card_aabb,
                cell,
                visible_root,
                false,
                tier,
            );
        }
        self.card_grid = Some(grid);
    }

    fn refresh_transition_grid(&mut self, center: (i32, i32)) {
        let Some(mut grid) = self.transition_grid.take() else {
            return;
        };
        let margin =
            self.transition_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 5.0;
        let margin_sq = margin * margin;
        let cell = grid.cell_size;
        let half_diag = grid.half_diagonal();
        let visible_root = self.base().is_visible_in_tree();
        let material_rid = self
            .transition_material
            .as_ref()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let mut rs = RenderingServer::singleton();
        for i in 0..grid.offsets.len() {
            let (dx, dz) = grid.offsets[i];
            let coord = (center.0 + dx, center.1 + dz);
            let cx = dx as f32 * cell;
            let cz = dz as f32 * cell;
            let dist_sq = cx * cx + cz * cz;
            let dist = dist_sq.sqrt();
            let near_dist = (dist - half_diag).max(0.0);
            let far_dist = dist + half_diag;
            let tier_opt = if dist_sq <= margin_sq && self.in_world(coord, cell) {
                tier_for(self.transition_fraction(near_dist, far_dist))
            } else {
                None
            };
            let idx = grid.index(coord);
            let Some(tier) = tier_opt else {
                let slot = &mut grid.slots[idx];
                if slot.active && slot.coord == coord {
                    slot.active = false;
                    rs.instance_set_visible(slot.rid, false);
                }
                continue;
            };
            if grid.slots[idx].active
                && grid.slots[idx].coord == coord
                && grid.slots[idx].tier == tier
            {
                continue;
            }
            let mm = self.transition_multimeshes[self.layout_index(coord)][tier];
            Self::assign_slot(
                &mut rs,
                &mut grid.slots[idx],
                coord,
                mm,
                material_rid,
                self.card_aabb,
                cell,
                visible_root,
                false,
                tier,
            );
        }
        self.transition_grid = Some(grid);
    }

    fn update_tiers(&mut self, p: Vector3) {
        let player_xz = Vector2::new(p.x, p.z);
        let near_enter_sq = self.lod_near_enter * self.lod_near_enter;
        let near_exit_sq = self.lod_near_exit * self.lod_near_exit;

        let blade_grid_taken = if self.blade_compute.is_none() {
            self.blade_grid.take()
        } else {
            None
        };
        if let Some(mut grid) = blade_grid_taken {
            let cell = grid.cell_size;
            let half_diag = grid.half_diagonal();
            let mut rs = RenderingServer::singleton();
            let mut changes: Vec<(usize, bool, usize, (i32, i32))> = Vec::new();
            for (idx, slot) in grid.slots.iter().enumerate() {
                if !slot.active {
                    continue;
                }
                let cx = (slot.coord.0 as f32 + 0.5) * cell - player_xz.x;
                let cz = (slot.coord.1 as f32 + 0.5) * cell - player_xz.y;
                let dist_sq = cx * cx + cz * cz;
                let near = if slot.near {
                    dist_sq <= near_exit_sq
                } else {
                    dist_sq < near_enter_sq
                };
                let near_dist = (dist_sq.sqrt() - half_diag).max(0.0);
                let tier = if near {
                    0
                } else {
                    tier_for(self.blade_fraction(near_dist)).unwrap_or(TIER_FRACTIONS.len() - 1)
                };
                if near != slot.near || tier != slot.tier {
                    changes.push((idx, near, tier, slot.coord));
                }
            }
            for (idx, near, tier, coord) in changes {
                let kind = if near { 0 } else { 1 };
                let mm = self.blade_multimeshes[self.layout_index(coord)][kind][tier];
                let slot = &mut grid.slots[idx];
                rs.instance_set_base(slot.rid, mm);
                slot.near = near;
                slot.tier = tier;
            }
            self.blade_grid = Some(grid);
        }

        let card_grid_taken = if self.blade_compute.is_none() {
            self.card_grid.take()
        } else {
            None
        };
        if let Some(mut grid) = card_grid_taken {
            let cell = grid.cell_size;
            let half_diag = grid.half_diagonal();
            let mut rs = RenderingServer::singleton();
            let mut changes: Vec<(usize, usize, (i32, i32))> = Vec::new();
            for (idx, slot) in grid.slots.iter().enumerate() {
                if !slot.active {
                    continue;
                }
                let cx = (slot.coord.0 as f32 + 0.5) * cell - player_xz.x;
                let cz = (slot.coord.1 as f32 + 0.5) * cell - player_xz.y;
                let near_dist = ((cx * cx + cz * cz).sqrt() - half_diag).max(0.0);
                let tier =
                    tier_for(self.card_fraction(near_dist)).unwrap_or(TIER_FRACTIONS.len() - 1);
                if tier != slot.tier {
                    changes.push((idx, tier, slot.coord));
                }
            }
            for (idx, tier, coord) in changes {
                let mm = self.card_multimeshes[self.layout_index(coord)][tier];
                let slot = &mut grid.slots[idx];
                rs.instance_set_base(slot.rid, mm);
                slot.tier = tier;
            }
            self.card_grid = Some(grid);
        }

        let transition_grid_taken = if self.blade_compute.is_none() {
            self.transition_grid.take()
        } else {
            None
        };
        if let Some(mut grid) = transition_grid_taken {
            let cell = grid.cell_size;
            let half_diag = grid.half_diagonal();
            let mut rs = RenderingServer::singleton();
            let mut changes: Vec<(usize, Option<usize>, (i32, i32))> = Vec::new();
            for (idx, slot) in grid.slots.iter().enumerate() {
                if !slot.active {
                    continue;
                }
                let cx = (slot.coord.0 as f32 + 0.5) * cell - player_xz.x;
                let cz = (slot.coord.1 as f32 + 0.5) * cell - player_xz.y;
                let dist = (cx * cx + cz * cz).sqrt();
                let tier_opt = tier_for(
                    self.transition_fraction((dist - half_diag).max(0.0), dist + half_diag),
                );
                match tier_opt {
                    Some(t) if t != slot.tier => changes.push((idx, Some(t), slot.coord)),
                    None => changes.push((idx, None, slot.coord)),
                    _ => {}
                }
            }
            for (idx, tier_opt, coord) in changes {
                let slot = &mut grid.slots[idx];
                match tier_opt {
                    Some(t) => {
                        let mm = self.transition_multimeshes[self.layout_index(coord)][t];
                        rs.instance_set_base(slot.rid, mm);
                        slot.tier = t;
                    }
                    None => {
                        slot.active = false;
                        rs.instance_set_visible(slot.rid, false);
                    }
                }
            }
            self.transition_grid = Some(grid);
        }
    }

    fn make_tiers(
        rs: &mut Gd<RenderingServer>,
        mesh: Rid,
        buf: &PackedFloat32Array,
        count: usize,
    ) -> Vec<Rid> {
        TIER_FRACTIONS
            .iter()
            .map(|f| {
                let tier_count = ((count as f32 * f) as usize).max(2);
                let mm = rs.multimesh_create();
                rs.multimesh_allocate_data(
                    mm,
                    tier_count as i32,
                    MultimeshTransformFormat::TRANSFORM_3D,
                );
                rs.multimesh_set_mesh(mm, mesh);
                let slice = buf.subarray(0..tier_count * 12);
                rs.multimesh_set_buffer(mm, &slice);
                mm
            })
            .collect()
    }

    fn build_layout_params(&self, seed: u32, count: usize, extent: f32) -> Vec<f32> {
        let mut state = hash32(seed | 1);
        let mut out = vec![0.0f32; count * 6];
        for i in 0..count {
            let o = i * 6;
            let yaw = randf(&mut state) * std::f32::consts::TAU;
            let tilt_dir = randf(&mut state) * std::f32::consts::TAU;
            let tilt = randf_range(&mut state, 0.0, 0.25);
            let s = randf_range(&mut state, 0.75, 1.3);
            out[o] = randf(&mut state) * extent;
            out[o + 1] = randf(&mut state) * extent;
            out[o + 2] = yaw;
            out[o + 3] = tilt_dir;
            out[o + 4] = tilt;
            out[o + 5] = s;
        }
        out
    }

    fn params_to_transforms(params: &[f32], count: usize) -> PackedFloat32Array {
        let mut buf = vec![0.0f32; count * 12];
        for i in 0..count {
            let p = i * 6;
            let o = i * 12;
            let yaw = params[p + 2];
            let tilt_dir = params[p + 3];
            let tilt = params[p + 4];
            let s = params[p + 5];
            let axis = Vector3::new(tilt_dir.cos(), 0.0, tilt_dir.sin());
            let basis = (Basis::from_axis_angle(axis, tilt)
                * Basis::from_axis_angle(Vector3::UP, yaw))
            .scaled(Vector3::new(s, s, s));
            buf[o] = basis.col_a().x;
            buf[o + 1] = basis.col_b().x;
            buf[o + 2] = basis.col_c().x;
            buf[o + 3] = params[p];
            buf[o + 4] = basis.col_a().y;
            buf[o + 5] = basis.col_b().y;
            buf[o + 6] = basis.col_c().y;
            buf[o + 8] = basis.col_a().z;
            buf[o + 9] = basis.col_b().z;
            buf[o + 10] = basis.col_c().z;
            buf[o + 11] = params[p + 1];
        }
        PackedFloat32Array::from(buf.as_slice())
    }

    fn ensure_classic(&mut self) {
        if self.classic_built {
            return;
        }
        self.classic_built = true;
        let blade_count = (self.chunk_size * self.chunk_size * self.blades_per_sqm) as usize;
        let card_count =
            ((self.card_chunk_size * self.card_chunk_size * self.blades_per_sqm * self.card_ratio)
                as usize)
                .max(8);
        let transition_count = ((self.card_chunk_size
            * self.card_chunk_size
            * self.blades_per_sqm
            * self.transition_ratio) as usize)
            .max(8);
        let detailed = self
            .kept_resources
            .first()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let simple = self
            .kept_resources
            .get(1)
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let card_mesh_rid = self
            .card_mesh
            .as_ref()
            .map(|m| m.get_rid())
            .unwrap_or(Rid::Invalid);
        let mut rs = RenderingServer::singleton();
        for v in 0..self.layout_variants.max(1) as usize {
            let bb = Self::params_to_transforms(
                &self.blade_params[v * blade_count * 6..(v + 1) * blade_count * 6],
                blade_count,
            );
            self.blade_multimeshes.push(vec![
                Self::make_tiers(&mut rs, detailed, &bb, blade_count),
                Self::make_tiers(&mut rs, simple, &bb, blade_count),
            ]);
            if self.billboards {
                let cb = Self::params_to_transforms(
                    &self.card_params[v * card_count * 6..(v + 1) * card_count * 6],
                    card_count,
                );
                self.card_multimeshes.push(Self::make_tiers(
                    &mut rs,
                    card_mesh_rid,
                    &cb,
                    card_count,
                ));
                let tb = Self::params_to_transforms(
                    &self.trans_params[v * transition_count * 6..(v + 1) * transition_count * 6],
                    transition_count,
                );
                self.transition_multimeshes.push(Self::make_tiers(
                    &mut rs,
                    card_mesh_rid,
                    &tb,
                    transition_count,
                ));
            }
        }
        drop(rs);
        self.fill_all_grid_slots();
        self.last_blade_center = None;
        self.last_card_center = None;
    }

    fn fill_all_grid_slots(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let scenario = world.get_scenario();
        let mut rs = RenderingServer::singleton();
        fn fill(rs: &mut Gd<RenderingServer>, scenario: Rid, grid: &mut RingGrid) {
            if !grid.slots.is_empty() {
                return;
            }
            let count = (grid.width * grid.width) as usize;
            grid.slots.reserve(count);
            for _ in 0..count {
                let rid = rs.instance_create();
                rs.instance_set_scenario(rid, scenario);
                rs.instance_geometry_set_cast_shadows_setting(rid, ShadowCastingSetting::OFF);
                rs.instance_set_visible(rid, false);
                grid.slots.push(Slot {
                    rid,
                    coord: (i32::MAX, i32::MAX),
                    active: false,
                    near: false,
                    tier: 0,
                });
            }
        }
        if let Some(mut g) = self.blade_grid.take() {
            fill(&mut rs, scenario, &mut g);
            self.blade_grid = Some(g);
        }
        if let Some(mut g) = self.card_grid.take() {
            fill(&mut rs, scenario, &mut g);
            self.card_grid = Some(g);
        }
        if let Some(mut g) = self.transition_grid.take() {
            fill(&mut rs, scenario, &mut g);
            self.transition_grid = Some(g);
        }
    }

    fn build_card_material(&mut self, card_count: usize, transition_count: usize) {
        let shader: Gd<Shader> = load(CARD_SHADER);
        let mut far = ShaderMaterial::new_gd();
        far.set_shader(&shader);
        far.set_shader_parameter("card_mask", &self.make_card_mask(16, 3.5, 6.0).to_variant());
        far.set_shader_parameter("size_small", &0.35f32.to_variant());
        far.set_shader_parameter("card_total", &(card_count as f32).to_variant());
        let mut trans = ShaderMaterial::new_gd();
        trans.set_shader(&shader);
        trans.set_shader_parameter("card_mask", &self.make_card_mask(30, 4.5, 8.5).to_variant());
        trans.set_shader_parameter("card_floor", &1.0f32.to_variant());
        trans.set_shader_parameter("card_width", &2.6f32.to_variant());
        trans.set_shader_parameter("card_height", &1.45f32.to_variant());
        trans.set_shader_parameter("size_small", &0.42f32.to_variant());
        trans.set_shader_parameter("size_large", &0.62f32.to_variant());
        trans.set_shader_parameter("band_out_start", &self.transition_out_start.to_variant());
        trans.set_shader_parameter("band_out_end", &self.transition_out_end.to_variant());
        trans.set_shader_parameter("card_total", &(transition_count as f32).to_variant());
        if let Some(src) = self.grass_material.as_ref() {
            for p in CARD_COPY_PARAMS {
                let v = src.get_shader_parameter(*p);
                if !v.is_nil() {
                    far.set_shader_parameter(*p, &v);
                    trans.set_shader_parameter(*p, &v);
                }
            }
        }
        if godot::classes::Os::singleton().get_environment("GRASS_DEBUG") == GString::from("1") {
            if let Some(m) = self.grass_material.as_mut() {
                m.set_shader_parameter("debug_color", &Vector3::new(1.0, 0.1, 0.1).to_variant());
            }
            trans.set_shader_parameter("debug_color", &Vector3::new(0.1, 1.0, 0.1).to_variant());
            far.set_shader_parameter("debug_color", &Vector3::new(0.1, 0.2, 1.0).to_variant());
        }
        self.card_material = Some(far);
        self.transition_material = Some(trans);
    }

    fn make_card_mask(&self, strokes: i32, min_w: f32, max_w: f32) -> Gd<ImageTexture> {
        let w = 128i32;
        let h = 96i32;
        let Some(mut img) = Image::create_empty(w, h, true, ImageFormat::RGBA8) else {
            return ImageTexture::new_gd();
        };
        let mut state = hash32((self.layout_seed as u32 ^ strokes as u32) | 1);
        for _ in 0..strokes {
            let base_x = randf_range(&mut state, 6.0, (w - 6) as f32);
            let bh = randf_range(&mut state, 0.4, 1.0) * (h - 2) as f32;
            let lean = randf_range(&mut state, -16.0, 16.0);
            let bw = randf_range(&mut state, min_w, max_w);
            for yy in 0..(bh as i32) {
                let t = yy as f32 / bh;
                let half = bw * (1.0 - t * 0.92) * 0.5;
                let cx = base_x + lean * t * t;
                // Coverage rather than a binary stamp. A hard-edged stroke whose
                // half-width falls below a pixel toward the tip lands on one
                // pixel some rows and two the next, and the ragged result cuts
                // visible lines across the card once it is mipmapped and
                // alpha-tested.
                let left = cx - half;
                let right = cx + half;
                let x0 = left.floor().max(0.0) as i32;
                let x1 = (right.ceil() as i32).min(w);
                let y = h - 1 - yy;
                for xx in x0..x1 {
                    let cover =
                        ((xx as f32 + 1.0).min(right) - (xx as f32).max(left)).clamp(0.0, 1.0);
                    if cover <= 0.0 {
                        continue;
                    }
                    let prev = img.get_pixel(xx, y).a;
                    img.set_pixel(xx, y, Color::from_rgba(1.0, 1.0, 1.0, prev.max(cover)));
                }
            }
        }
        img.generate_mipmaps();
        ImageTexture::create_from_image(&img).unwrap_or_else(ImageTexture::new_gd)
    }

    fn free_all(&mut self) {
        if let Some(mut bc) = self.blade_compute.take() {
            bc.free();
        }
        if let Some(mut cc) = self.card_compute.take() {
            cc.free();
        }
        if let Some(mut tc) = self.transition_compute.take() {
            tc.free();
        }
        let mut rs = RenderingServer::singleton();
        for grid in [
            self.blade_grid.take(),
            self.card_grid.take(),
            self.transition_grid.take(),
        ]
        .into_iter()
        .flatten()
        {
            for slot in grid.slots {
                rs.free_rid(slot.rid);
            }
        }
        for kinds in self.blade_multimeshes.drain(..) {
            for tiers in kinds {
                for mm in tiers {
                    rs.free_rid(mm);
                }
            }
        }
        for tiers in self.card_multimeshes.drain(..) {
            for mm in tiers {
                rs.free_rid(mm);
            }
        }
        for tiers in self.transition_multimeshes.drain(..) {
            for mm in tiers {
                rs.free_rid(mm);
            }
        }
    }
}
