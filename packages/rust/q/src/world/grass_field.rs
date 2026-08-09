use godot::classes::image::Format as ImageFormat;
use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{
    Engine, Image, ImageTexture, Mesh, QuadMesh, RandomNumberGenerator, RenderingServer, Shader,
    ShaderMaterial,
};
use godot::prelude::*;
use std::collections::HashMap;

const LOD_UPDATE_DISTANCE_SQ: f32 = 0.25;

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

struct BladeSlot {
    instance: Rid,
    near: bool,
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
    #[init(val = 0.011)]
    card_ratio: f32,
    #[export]
    #[init(val = 256.0)]
    world_half_extent: f32,
    #[export]
    #[init(val = 8)]
    max_chunks_spawned_per_frame: i32,
    #[export]
    #[init(val = 1337)]
    layout_seed: i64,
    #[export]
    #[init(val = 4)]
    layout_variants: i32,

    blade_multimeshes: Vec<Vec<Rid>>,
    card_multimeshes: Vec<Rid>,
    blade_chunks: HashMap<(i32, i32), BladeSlot>,
    card_chunks: HashMap<(i32, i32), Rid>,
    blade_pool: Vec<Rid>,
    card_pool: Vec<Rid>,
    card_pending: Vec<(i32, i32)>,
    last_blade_center: Option<(i32, i32)>,
    last_card_center: Option<(i32, i32)>,
    last_lod_position: Vector3,
    card_material: Option<Gd<ShaderMaterial>>,
    #[init(val = Vec::new())]
    kept_resources: Vec<Gd<Mesh>>,
    card_mesh: Option<Gd<QuadMesh>>,
    blade_aabb: Aabb,
    card_aabb: Aabb,
}

#[godot_api]
impl INode3D for QGrassField {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.last_lod_position = Vector3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let blade_count = (self.chunk_size * self.chunk_size * self.blades_per_sqm) as usize;
        let card_count =
            ((self.card_chunk_size * self.card_chunk_size * self.blades_per_sqm * self.card_ratio)
                as usize)
                .max(8);
        self.blade_aabb = Aabb::new(
            Vector3::new(-0.5, -8.0, -0.5),
            Vector3::new(self.chunk_size + 1.0, 16.0, self.chunk_size + 1.0),
        );
        self.card_aabb = Aabb::new(
            Vector3::new(-0.5, -8.0, -0.5),
            Vector3::new(self.card_chunk_size + 1.0, 16.0, self.card_chunk_size + 1.0),
        );

        self.build_card_material();

        let mut card_mesh = QuadMesh::new_gd();
        card_mesh.set_size(Vector2::new(1.0, 1.0));
        card_mesh.set_center_offset(Vector3::new(0.0, 0.5, 0.0));

        let detailed: Gd<Mesh> = load(DETAILED_MESH);
        let simple: Gd<Mesh> = load(SIMPLE_MESH);

        let mut rs = RenderingServer::singleton();
        for v in 0..self.layout_variants {
            let blade_buf =
                self.build_layout_buffer(self.layout_seed + v as i64, blade_count, self.chunk_size);
            self.blade_multimeshes.push(vec![
                Self::make_multimesh(&mut rs, detailed.get_rid(), &blade_buf, blade_count),
                Self::make_multimesh(&mut rs, simple.get_rid(), &blade_buf, blade_count),
            ]);
            let card_buf = self.build_layout_buffer(
                self.layout_seed + 7919 + v as i64,
                card_count,
                self.card_chunk_size,
            );
            self.card_multimeshes.push(Self::make_multimesh(
                &mut rs,
                card_mesh.get_rid(),
                &card_buf,
                card_count,
            ));
        }
        self.kept_resources.push(detailed);
        self.kept_resources.push(simple);
        self.card_mesh = Some(card_mesh);

        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("total_blades", &(blade_count as f32).to_variant());
        }
        self.sync_fade_parameters();
    }

    fn process(&mut self, _delta: f64) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let origin = match self.view_origin() {
            Some(o) => o,
            None => return,
        };
        let flat = Vector3::new(origin.x, 0.0, origin.z);
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("fade_origin", &flat.to_variant());
        }
        if let Some(m) = self.card_material.as_mut() {
            m.set_shader_parameter("fade_origin", &flat.to_variant());
        }
        let player_pos = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok())
            .map(|p| p.get_global_position());
        if let (Some(m), Some(p)) = (self.grass_material.as_mut(), player_pos) {
            let obj = Vector3::new(p.x, 0.0, p.z);
            m.set_shader_parameter("object_position", &obj.to_variant());
        }

        let blade_center = (
            (origin.x / self.chunk_size).floor() as i32,
            (origin.z / self.chunk_size).floor() as i32,
        );
        if self.last_blade_center != Some(blade_center) {
            self.last_blade_center = Some(blade_center);
            self.refresh_blades(blade_center, origin);
            self.notify_event(
                "player/moved_chunk",
                Vector2i::new(blade_center.0, blade_center.1),
            );
        }

        let card_center = (
            (origin.x / self.card_chunk_size).floor() as i32,
            (origin.z / self.card_chunk_size).floor() as i32,
        );
        if self.last_card_center != Some(card_center) {
            self.last_card_center = Some(card_center);
            self.refresh_cards(card_center, origin);
        }

        let spawned = self.drain_card_pending();
        if spawned || origin.distance_squared_to(self.last_lod_position) >= LOD_UPDATE_DISTANCE_SQ {
            self.last_lod_position = origin;
            self.update_blade_lods(origin);
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                let mut rs = RenderingServer::singleton();
                for slot in self.blade_chunks.values() {
                    rs.instance_set_visible(slot.instance, visible);
                }
                for rid in self.card_chunks.values() {
                    rs.instance_set_visible(*rid, visible);
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

impl QGrassField {
    fn view_origin(&self) -> Option<Vector3> {
        let cam = self.base().get_viewport()?.get_camera_3d();
        if let Some(cam) = cam {
            return Some(cam.get_global_position());
        }
        self.base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok())
            .map(|p| p.get_global_position())
    }

    fn notify_event(&mut self, event: &str, payload: Vector2i) {
        let Some(game) = self.base().get_node_or_null("/root/Game") else {
            return;
        };
        let events = game.get("events");
        if let Ok(mut obj) = events.try_to::<Gd<Object>>() {
            obj.call(
                "notify",
                &[StringName::from(event).to_variant(), payload.to_variant()],
            );
        }
    }

    fn sync_fade_parameters(&mut self) {
        let ts = self.thin_start;
        let br = self.blade_range;
        let fe = self.grass_fade_out_end;
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("thin_start", &ts.to_variant());
            m.set_shader_parameter("blade_range", &br.to_variant());
        }
        if let Some(m) = self.card_material.as_mut() {
            m.set_shader_parameter("blade_range", &br.to_variant());
            m.set_shader_parameter("fade_end", &fe.to_variant());
        }
    }

    fn grid_center(&self, coord: (i32, i32), size: f32) -> Vector2 {
        Vector2::new((coord.0 as f32 + 0.5) * size, (coord.1 as f32 + 0.5) * size)
    }

    fn in_bounds(&self, coord: (i32, i32), size: f32) -> bool {
        let min_x = coord.0 as f32 * size;
        let min_z = coord.1 as f32 * size;
        min_x >= -self.world_half_extent
            && min_x + size <= self.world_half_extent
            && min_z >= -self.world_half_extent
            && min_z + size <= self.world_half_extent
    }

    fn layout_index(&self, coord: (i32, i32)) -> usize {
        let h = (coord.0.wrapping_mul(73856093)) ^ (coord.1.wrapping_mul(19349663));
        h.rem_euclid(self.layout_variants.max(1)) as usize
    }

    fn blade_attach_distance(&self) -> f32 {
        self.blade_range + self.chunk_size * std::f32::consts::FRAC_1_SQRT_2
    }

    fn alloc_instance(&mut self, card: bool) -> Option<Rid> {
        let pool = if card {
            &mut self.card_pool
        } else {
            &mut self.blade_pool
        };
        if let Some(rid) = pool.pop() {
            return Some(rid);
        }
        let world = self.base().get_world_3d()?;
        let mut rs = RenderingServer::singleton();
        let rid = rs.instance_create();
        rs.instance_set_scenario(rid, world.get_scenario());
        rs.instance_geometry_set_cast_shadows_setting(rid, ShadowCastingSetting::OFF);
        Some(rid)
    }

    fn assign_instance(
        &self,
        rid: Rid,
        base_mm: Rid,
        material: Option<&Gd<ShaderMaterial>>,
        origin: Vector3,
        aabb: Aabb,
    ) {
        let material_rid = material.map(|m| m.get_rid()).unwrap_or(Rid::Invalid);
        let mut rs = RenderingServer::singleton();
        rs.instance_set_base(rid, base_mm);
        rs.instance_set_custom_aabb(rid, aabb);
        rs.instance_geometry_set_material_override(rid, material_rid);
        rs.instance_set_transform(rid, Transform3D::new(Basis::IDENTITY, origin));
        rs.instance_set_visible(rid, self.base().is_visible_in_tree());
    }

    fn refresh_blades(&mut self, center: (i32, i32), p: Vector3) {
        let margin = self.blade_attach_distance() + 3.0;
        let view_chunks = (margin / self.chunk_size).ceil() as i32;
        let player_xz = Vector2::new(p.x, p.z);
        let mut rs = RenderingServer::singleton();

        let to_remove: Vec<(i32, i32)> = self
            .blade_chunks
            .iter()
            .filter(|(c, _)| {
                self.grid_center(**c, self.chunk_size)
                    .distance_to(player_xz)
                    > margin
            })
            .map(|(c, _)| *c)
            .collect();
        for coord in to_remove {
            if let Some(slot) = self.blade_chunks.remove(&coord) {
                rs.instance_set_visible(slot.instance, false);
                self.blade_pool.push(slot.instance);
            }
        }

        let mut to_add: Vec<(i32, i32)> = Vec::new();
        for dx in -view_chunks..=view_chunks {
            for dz in -view_chunks..=view_chunks {
                let coord = (center.0 + dx, center.1 + dz);
                if !self.in_bounds(coord, self.chunk_size) {
                    continue;
                }
                if self.blade_chunks.contains_key(&coord) {
                    continue;
                }
                if self
                    .grid_center(coord, self.chunk_size)
                    .distance_to(player_xz)
                    > self.blade_attach_distance()
                {
                    continue;
                }
                to_add.push(coord);
            }
        }
        for coord in to_add {
            self.spawn_blade_chunk(coord, player_xz);
        }
    }

    fn spawn_blade_chunk(&mut self, coord: (i32, i32), player_xz: Vector2) {
        let Some(rid) = self.alloc_instance(false) else {
            return;
        };
        let dist = self
            .grid_center(coord, self.chunk_size)
            .distance_to(player_xz);
        let near = dist <= self.lod_near_enter;
        let kind = if near { 0 } else { 1 };
        let mm = self.blade_multimeshes[self.layout_index(coord)][kind];
        let origin = Vector3::new(
            coord.0 as f32 * self.chunk_size,
            0.0,
            coord.1 as f32 * self.chunk_size,
        );
        let material = self.grass_material.clone();
        self.assign_instance(rid, mm, material.as_ref(), origin, self.blade_aabb);
        self.blade_chunks.insert(
            coord,
            BladeSlot {
                instance: rid,
                near,
            },
        );
    }

    fn refresh_cards(&mut self, center: (i32, i32), p: Vector3) {
        let margin =
            self.grass_fade_out_end + self.card_chunk_size * std::f32::consts::FRAC_1_SQRT_2 + 10.0;
        let view_chunks = (margin / self.card_chunk_size).ceil() as i32;
        let player_xz = Vector2::new(p.x, p.z);
        let mut needed: HashMap<(i32, i32), bool> = HashMap::new();
        for dx in -view_chunks..=view_chunks {
            for dz in -view_chunks..=view_chunks {
                let coord = (center.0 + dx, center.1 + dz);
                if !self.in_bounds(coord, self.card_chunk_size) {
                    continue;
                }
                if self
                    .grid_center(coord, self.card_chunk_size)
                    .distance_to(player_xz)
                    > margin
                {
                    continue;
                }
                needed.insert(coord, true);
                if !self.card_chunks.contains_key(&coord) && !self.card_pending.contains(&coord) {
                    self.card_pending.push(coord);
                }
            }
        }

        let mut rs = RenderingServer::singleton();
        let to_remove: Vec<(i32, i32)> = self
            .card_chunks
            .keys()
            .filter(|c| !needed.contains_key(c))
            .copied()
            .collect();
        for coord in to_remove {
            if let Some(rid) = self.card_chunks.remove(&coord) {
                rs.instance_set_visible(rid, false);
                self.card_pool.push(rid);
            }
        }

        self.card_pending.retain(|c| needed.contains_key(c));
        self.card_pending.sort_by_key(|c| {
            let dx = (c.0 - center.0) as i64;
            let dz = (c.1 - center.1) as i64;
            dx * dx + dz * dz
        });
    }

    fn drain_card_pending(&mut self) -> bool {
        let budget = self
            .card_pending
            .len()
            .min(self.max_chunks_spawned_per_frame.max(0) as usize);
        for _ in 0..budget {
            let coord = self.card_pending.remove(0);
            let Some(rid) = self.alloc_instance(true) else {
                continue;
            };
            let mm = self.card_multimeshes[self.layout_index(coord)];
            let origin = Vector3::new(
                coord.0 as f32 * self.card_chunk_size,
                0.0,
                coord.1 as f32 * self.card_chunk_size,
            );
            let material = self.card_material.clone();
            self.assign_instance(rid, mm, material.as_ref(), origin, self.card_aabb);
            self.card_chunks.insert(coord, rid);
        }
        budget > 0
    }

    fn update_blade_lods(&mut self, p: Vector3) {
        let player_xz = Vector2::new(p.x, p.z);
        let swap_radius = self.lod_near_exit + self.chunk_size * 2.0;
        let coords: Vec<(i32, i32)> = self
            .blade_chunks
            .iter()
            .filter(|(c, _)| {
                self.grid_center(**c, self.chunk_size)
                    .distance_to(player_xz)
                    < swap_radius
            })
            .map(|(c, _)| *c)
            .collect();
        for coord in coords {
            let dist = self
                .grid_center(coord, self.chunk_size)
                .distance_to(player_xz);
            let was_near = self.blade_chunks[&coord].near;
            let near = if was_near {
                dist <= self.lod_near_exit
            } else {
                dist < self.lod_near_enter
            };
            if near != was_near {
                let kind = if near { 0 } else { 1 };
                let mm = self.blade_multimeshes[self.layout_index(coord)][kind];
                let rid = self.blade_chunks[&coord].instance;
                RenderingServer::singleton().instance_set_base(rid, mm);
                self.blade_chunks.get_mut(&coord).unwrap().near = near;
            }
        }
    }

    fn make_multimesh(
        rs: &mut Gd<RenderingServer>,
        mesh: Rid,
        buf: &PackedFloat32Array,
        count: usize,
    ) -> Rid {
        let mm = rs.multimesh_create();
        rs.multimesh_allocate_data(mm, count as i32, MultimeshTransformFormat::TRANSFORM_3D);
        rs.multimesh_set_mesh(mm, mesh);
        let slice = buf.subarray(0..count * 12);
        rs.multimesh_set_buffer(mm, &slice);
        mm
    }

    fn build_layout_buffer(&self, seed: i64, count: usize, extent: f32) -> PackedFloat32Array {
        let mut rng = RandomNumberGenerator::new_gd();
        rng.set_seed(seed as u64);
        let mut buf = vec![0.0f32; count * 12];
        for i in 0..count {
            let o = i * 12;
            let yaw = rng.randf() * std::f32::consts::TAU;
            let tilt_dir = rng.randf() * std::f32::consts::TAU;
            let tilt = rng.randf_range(0.0, 0.25);
            let s = rng.randf_range(0.75, 1.3);
            let axis = Vector3::new(tilt_dir.cos(), 0.0, tilt_dir.sin());
            let basis = (Basis::from_axis_angle(axis, tilt)
                * Basis::from_axis_angle(Vector3::UP, yaw))
            .scaled(Vector3::new(s, s, s));
            buf[o] = basis.col_a().x;
            buf[o + 1] = basis.col_b().x;
            buf[o + 2] = basis.col_c().x;
            buf[o + 3] = rng.randf() * extent;
            buf[o + 4] = basis.col_a().y;
            buf[o + 5] = basis.col_b().y;
            buf[o + 6] = basis.col_c().y;
            buf[o + 8] = basis.col_a().z;
            buf[o + 9] = basis.col_b().z;
            buf[o + 10] = basis.col_c().z;
            buf[o + 11] = rng.randf() * extent;
        }
        PackedFloat32Array::from(buf.as_slice())
    }

    fn build_card_material(&mut self) {
        let shader: Gd<Shader> = load(CARD_SHADER);
        let mut mat = ShaderMaterial::new_gd();
        mat.set_shader(&shader);
        mat.set_shader_parameter("card_mask", &self.make_card_mask().to_variant());
        if let Some(src) = self.grass_material.as_ref() {
            for p in CARD_COPY_PARAMS {
                let v = src.get_shader_parameter(*p);
                if !v.is_nil() {
                    mat.set_shader_parameter(*p, &v);
                }
            }
        }
        self.card_material = Some(mat);
    }

    fn make_card_mask(&self) -> Gd<ImageTexture> {
        let w = 128i32;
        let h = 96i32;
        let Some(mut img) = Image::create_empty(w, h, true, ImageFormat::RGBA8) else {
            return ImageTexture::new_gd();
        };
        let mut rng = RandomNumberGenerator::new_gd();
        rng.set_seed(self.layout_seed as u64);
        for _ in 0..16 {
            let base_x = rng.randf_range(6.0, (w - 6) as f32);
            let bh = rng.randf_range(0.4, 1.0) * (h - 2) as f32;
            let lean = rng.randf_range(-16.0, 16.0);
            let bw = rng.randf_range(3.5, 6.0);
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
        let mut rs = RenderingServer::singleton();
        for (_, slot) in self.blade_chunks.drain() {
            rs.free_rid(slot.instance);
        }
        for (_, rid) in self.card_chunks.drain() {
            rs.free_rid(rid);
        }
        let pooled: Vec<Rid> = self
            .blade_pool
            .drain(..)
            .chain(self.card_pool.drain(..))
            .collect();
        for rid in pooled {
            rs.free_rid(rid);
        }
        for group in self.blade_multimeshes.drain(..) {
            for mm in group {
                rs.free_rid(mm);
            }
        }
        for mm in self.card_multimeshes.drain(..) {
            rs.free_rid(mm);
        }
    }
}
