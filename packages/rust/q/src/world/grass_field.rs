use godot::classes::image::Format as ImageFormat;
use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{
    Engine, Image, ImageTexture, Mesh, QuadMesh, RenderingServer, Shader, ShaderMaterial,
};
use godot::prelude::*;

use crate::world::grass_compute::BladeCompute;

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
    #[export]
    #[init(val = 250.0)]
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
    compute_attempts: i32,
}

#[godot_api]
impl INode3D for QGrassField {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
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

        self.build_card_material(card_count, transition_count);

        let mut card_mesh = QuadMesh::new_gd();
        card_mesh.set_size(Vector2::new(1.0, 1.0));
        card_mesh.set_center_offset(Vector3::new(0.0, 0.5, 0.0));

        let detailed: Gd<Mesh> = load(DETAILED_MESH);
        let simple: Gd<Mesh> = load(SIMPLE_MESH);

        let mut rs = RenderingServer::singleton();
        let mut blade_layouts: Vec<f32> =
            Vec::with_capacity(self.layout_variants.max(1) as usize * blade_count * 12);
        for v in 0..self.layout_variants {
            let blade_buf = self.build_layout_buffer(
                (self.layout_seed as u32) ^ hash32(v as u32),
                blade_count,
                self.chunk_size,
            );
            blade_layouts.extend_from_slice(blade_buf.as_slice());
            self.blade_multimeshes.push(vec![
                Self::make_tiers(&mut rs, detailed.get_rid(), &blade_buf, blade_count),
                Self::make_tiers(&mut rs, simple.get_rid(), &blade_buf, blade_count),
            ]);
            let card_buf = self.build_layout_buffer(
                (self.layout_seed as u32) ^ hash32(7919 + v as u32),
                card_count,
                self.card_chunk_size,
            );
            self.card_multimeshes.push(Self::make_tiers(
                &mut rs,
                card_mesh.get_rid(),
                &card_buf,
                card_count,
            ));
            let trans_buf = self.build_layout_buffer(
                (self.layout_seed as u32) ^ hash32(104729 + v as u32),
                transition_count,
                self.card_chunk_size,
            );
            self.transition_multimeshes.push(Self::make_tiers(
                &mut rs,
                card_mesh.get_rid(),
                &trans_buf,
                transition_count,
            ));
        }
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
        self.blade_grid = Some(self.build_grid(blade_radius_cells, self.chunk_size));
        self.card_grid = Some(self.build_grid(card_radius_cells, self.card_chunk_size));
        self.transition_grid = Some(self.build_grid(transition_radius_cells, self.card_chunk_size));

        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("total_blades", &(blade_count as f32).to_variant());
        }
        self.sync_fade_parameters();

        if godot::classes::Os::singleton().get_environment("GRASS_NO_COMPUTE") == GString::from("1")
        {
            self.compute_blades = false;
        }
        if self.compute_blades {
            self.blade_compute = self.build_blade_compute(&blade_layouts, blade_count);
            if self.blade_compute.is_none() {
                self.compute_blades = false;
            }
        }
        let mode = if self.blade_compute.is_some() {
            1.0f32
        } else {
            0.0f32
        };
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("compute_mode", &mode.to_variant());
        }
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
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
            self.refresh_card_grid(card_center);
            self.refresh_transition_grid(card_center);
        }

        if origin.distance_squared_to(self.last_lod_position) >= LOD_UPDATE_DISTANCE_SQ {
            self.last_lod_position = origin;
            self.update_tiers(origin);
        }

        if self.blade_compute.is_some() {
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
            (pi * self.lod_near_exit * self.lod_near_exit * self.blades_per_sqm * 1.6) as u32;
        let full_area = pi * self.thin_start * self.thin_start;
        let band_area =
            pi * (self.blade_range * self.blade_range - self.thin_start * self.thin_start);
        let cap_far = ((full_area + band_area * 0.55) * self.blades_per_sqm * 1.25) as u32;
        let extent = self.world_half_extent + self.blade_range + 50.0;
        let world_aabb = Aabb::new(
            Vector3::new(-extent, -40.0, -extent),
            Vector3::new(extent * 2.0, 120.0, extent * 2.0),
        );
        let mat = self.grass_material.as_ref()?;
        let heightmap = mat
            .get_shader_parameter("heightmap")
            .try_to::<Gd<godot::classes::Texture2D>>()
            .ok()?
            .get_rid();
        let terrain_extent = mat
            .get_shader_parameter("terrain_extent")
            .try_to::<f32>()
            .unwrap_or(self.world_half_extent);
        let water_level = mat
            .get_shader_parameter("water_level")
            .try_to::<f32>()
            .unwrap_or(-1.4);
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
        for (dx, dz) in &grid.offsets {
            let coord = (center.0 + dx, center.1 + dz);
            let cx = *dx as f32 * cell;
            let cz = *dz as f32 * cell;
            if cx * cx + cz * cz > attach_sq || !self.in_world(coord, cell) {
                continue;
            }
            let variant = self.layout_index(coord);
            entries.push(coord.0 as f32 * cell);
            entries.push(coord.1 as f32 * cell);
            entries.push((variant * blade_count * 12) as f32);
            entries.push(variant as f32);
        }
        self.blade_grid = Some(grid);
        if let Some(bc) = self.blade_compute.as_mut() {
            bc.update_cells(&entries);
        }
    }

    fn step_compute(&mut self) {
        if !self.base().is_visible_in_tree() {
            return;
        }
        let online = match self.blade_compute.as_mut() {
            Some(bc) => bc.online() || bc.try_finalize(),
            None => return,
        };
        if !online {
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
        if let Some(bc) = self.blade_compute.as_mut() {
            bc.dispatch(cam_pos, &planes, ts, br, ln);
        }
    }

    fn disable_compute(&mut self) {
        if let Some(mut bc) = self.blade_compute.take() {
            bc.free();
        }
        self.compute_blades = false;
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("compute_mode", &0.0f32.to_variant());
        }
        self.last_blade_center = None;
        godot_warn!("[QGrassField] compute path unavailable, falling back to classic blades");
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

        if let Some(mut grid) = self.card_grid.take() {
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

        if let Some(mut grid) = self.transition_grid.take() {
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

    fn build_layout_buffer(&self, seed: u32, count: usize, extent: f32) -> PackedFloat32Array {
        let mut state = hash32(seed | 1);
        let mut buf = vec![0.0f32; count * 12];
        for i in 0..count {
            let o = i * 12;
            let yaw = randf(&mut state) * std::f32::consts::TAU;
            let tilt_dir = randf(&mut state) * std::f32::consts::TAU;
            let tilt = randf_range(&mut state, 0.0, 0.25);
            let s = randf_range(&mut state, 0.75, 1.3);
            let axis = Vector3::new(tilt_dir.cos(), 0.0, tilt_dir.sin());
            let basis = (Basis::from_axis_angle(axis, tilt)
                * Basis::from_axis_angle(Vector3::UP, yaw))
            .scaled(Vector3::new(s, s, s));
            buf[o] = basis.col_a().x;
            buf[o + 1] = basis.col_b().x;
            buf[o + 2] = basis.col_c().x;
            buf[o + 3] = randf(&mut state) * extent;
            buf[o + 4] = basis.col_a().y;
            buf[o + 5] = basis.col_b().y;
            buf[o + 6] = basis.col_c().y;
            buf[o + 8] = basis.col_a().z;
            buf[o + 9] = basis.col_b().z;
            buf[o + 10] = basis.col_c().z;
            buf[o + 11] = randf(&mut state) * extent;
        }
        PackedFloat32Array::from(buf.as_slice())
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
                for xx in ((cx - half) as i32)..=((cx + half) as i32) {
                    if xx >= 0 && xx < w {
                        img.set_pixel(xx, h - 1 - yy, Color::WHITE);
                    }
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
