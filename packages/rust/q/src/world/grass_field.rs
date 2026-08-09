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

const MESH_DETAILED: usize = 0;
const MESH_SIMPLE: usize = 1;
const MESH_CARD: usize = 2;

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

struct ChunkSlot {
    card: Rid,
    blade: Option<Rid>,
    blade_near: bool,
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
    #[init(val = 250.0)]
    blades_per_sqm: f32,
    #[export]
    #[init(val = 6.5)]
    lod_near_enter: f32,
    #[export]
    #[init(val = 8.0)]
    lod_near_exit: f32,
    #[export]
    #[init(val = 16.0)]
    grass_fade_out_start: f32,
    #[export]
    #[init(val = 14.0)]
    fade_tail: f32,
    #[export]
    #[init(val = 40.0)]
    blade_range: f32,
    #[export]
    #[init(val = 140.0)]
    grass_fade_out_end: f32,
    #[export]
    #[init(val = 0.02)]
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

    multimeshes: Vec<Vec<Rid>>,
    chunks: HashMap<(i32, i32), ChunkSlot>,
    pool: Vec<Rid>,
    pending: Vec<(i32, i32)>,
    last_center: Option<(i32, i32)>,
    last_lod_position: Vector3,
    card_material: Option<Gd<ShaderMaterial>>,
    #[init(val = Vec::new())]
    kept_resources: Vec<Gd<Mesh>>,
    card_mesh: Option<Gd<QuadMesh>>,
    chunk_aabb: Aabb,
}

#[godot_api]
impl INode3D for QGrassField {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.last_lod_position = Vector3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let count = (self.chunk_size * self.chunk_size * self.blades_per_sqm) as usize;
        let card_count = ((count as f32 * self.card_ratio) as usize).max(4);
        self.chunk_aabb = Aabb::new(
            Vector3::new(-0.5, -8.0, -0.5),
            Vector3::new(self.chunk_size + 1.0, 16.0, self.chunk_size + 1.0),
        );

        self.build_card_material();

        let mut card_mesh = QuadMesh::new_gd();
        card_mesh.set_size(Vector2::new(1.0, 1.0));
        card_mesh.set_center_offset(Vector3::new(0.0, 0.5, 0.0));

        let detailed: Gd<Mesh> = load(DETAILED_MESH);
        let simple: Gd<Mesh> = load(SIMPLE_MESH);

        let mut rs = RenderingServer::singleton();
        for v in 0..self.layout_variants {
            let buf = self.build_layout_buffer(self.layout_seed + v as i64, count);
            self.multimeshes.push(vec![
                Self::make_multimesh(&mut rs, detailed.get_rid(), &buf, count),
                Self::make_multimesh(&mut rs, simple.get_rid(), &buf, count),
                Self::make_multimesh(&mut rs, card_mesh.get_rid(), &buf, card_count),
            ]);
        }
        self.kept_resources.push(detailed);
        self.kept_resources.push(simple);
        self.card_mesh = Some(card_mesh);

        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("total_blades", &(count as f32).to_variant());
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

        let center = (
            (origin.x / self.chunk_size).floor() as i32,
            (origin.z / self.chunk_size).floor() as i32,
        );
        if self.last_center != Some(center) {
            self.last_center = Some(center);
            self.refresh_chunks(center, origin);
            self.notify_event("player/moved_chunk", Vector2i::new(center.0, center.1));
        }

        let spawned = self.drain_pending();
        if spawned || origin.distance_squared_to(self.last_lod_position) >= LOD_UPDATE_DISTANCE_SQ {
            self.last_lod_position = origin;
            self.update_lods(origin);
        }
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                let mut rs = RenderingServer::singleton();
                for slot in self.chunks.values() {
                    rs.instance_set_visible(slot.card, visible);
                    if let Some(blade) = slot.blade {
                        rs.instance_set_visible(blade, visible);
                    }
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
        let fs = self.grass_fade_out_start;
        let ft = self.fade_tail;
        let br = self.blade_range;
        let fe = self.grass_fade_out_end;
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("fade_start", &fs.to_variant());
            m.set_shader_parameter("fade_tail", &ft.to_variant());
            m.set_shader_parameter("blade_range", &br.to_variant());
        }
        if let Some(m) = self.card_material.as_mut() {
            m.set_shader_parameter("blade_range", &br.to_variant());
            m.set_shader_parameter("fade_end", &fe.to_variant());
        }
    }

    fn chunk_center(&self, coord: (i32, i32)) -> Vector2 {
        Vector2::new(
            (coord.0 as f32 + 0.5) * self.chunk_size,
            (coord.1 as f32 + 0.5) * self.chunk_size,
        )
    }

    fn in_bounds(&self, coord: (i32, i32)) -> bool {
        let min_x = coord.0 as f32 * self.chunk_size;
        let min_z = coord.1 as f32 * self.chunk_size;
        min_x >= -self.world_half_extent
            && min_x + self.chunk_size <= self.world_half_extent
            && min_z >= -self.world_half_extent
            && min_z + self.chunk_size <= self.world_half_extent
    }

    fn layout_index(&self, coord: (i32, i32)) -> usize {
        let h = (coord.0.wrapping_mul(73856093)) ^ (coord.1.wrapping_mul(19349663));
        h.rem_euclid(self.layout_variants.max(1)) as usize
    }

    fn half_diagonal(&self) -> f32 {
        self.chunk_size * std::f32::consts::FRAC_1_SQRT_2
    }

    fn blade_attach_distance(&self) -> f32 {
        self.blade_range + self.half_diagonal()
    }

    fn refresh_chunks(&mut self, center: (i32, i32), p: Vector3) {
        let margin = self.grass_fade_out_end + self.half_diagonal() + 10.0;
        let view_chunks = (margin / self.chunk_size).ceil() as i32;
        let player_xz = Vector2::new(p.x, p.z);
        let mut needed: HashMap<(i32, i32), bool> = HashMap::new();
        for dx in -view_chunks..=view_chunks {
            for dz in -view_chunks..=view_chunks {
                let coord = (center.0 + dx, center.1 + dz);
                if !self.in_bounds(coord) {
                    continue;
                }
                if self.chunk_center(coord).distance_to(player_xz) > margin {
                    continue;
                }
                needed.insert(coord, true);
                if !self.chunks.contains_key(&coord) && !self.pending.contains(&coord) {
                    self.pending.push(coord);
                }
            }
        }

        let mut rs = RenderingServer::singleton();
        let to_remove: Vec<(i32, i32)> = self
            .chunks
            .keys()
            .filter(|c| !needed.contains_key(c))
            .copied()
            .collect();
        for coord in to_remove {
            if let Some(slot) = self.chunks.remove(&coord) {
                rs.instance_set_visible(slot.card, false);
                self.pool.push(slot.card);
                if let Some(blade) = slot.blade {
                    rs.instance_set_visible(blade, false);
                    self.pool.push(blade);
                }
            }
        }

        self.pending.retain(|c| needed.contains_key(c));
        self.pending.sort_by_key(|c| {
            let dx = (c.0 - center.0) as i64;
            let dz = (c.1 - center.1) as i64;
            dx * dx + dz * dz
        });
    }

    fn drain_pending(&mut self) -> bool {
        let budget = self
            .pending
            .len()
            .min(self.max_chunks_spawned_per_frame.max(0) as usize);
        for _ in 0..budget {
            let coord = self.pending.remove(0);
            self.spawn_chunk(coord);
        }
        budget > 0
    }

    fn alloc_instance(&mut self) -> Option<Rid> {
        if let Some(rid) = self.pool.pop() {
            return Some(rid);
        }
        let world = self.base().get_world_3d()?;
        let mut rs = RenderingServer::singleton();
        let rid = rs.instance_create();
        rs.instance_set_scenario(rid, world.get_scenario());
        rs.instance_geometry_set_cast_shadows_setting(rid, ShadowCastingSetting::OFF);
        Some(rid)
    }

    fn assign_instance(&self, rid: Rid, coord: (i32, i32), mesh_kind: usize) {
        let mm = self.multimeshes[self.layout_index(coord)][mesh_kind];
        let material = if mesh_kind == MESH_CARD {
            self.card_material.as_ref()
        } else {
            self.grass_material.as_ref()
        };
        let material_rid = material.map(|m| m.get_rid()).unwrap_or(Rid::Invalid);
        let mut rs = RenderingServer::singleton();
        rs.instance_set_base(rid, mm);
        rs.instance_set_custom_aabb(rid, self.chunk_aabb);
        rs.instance_geometry_set_material_override(rid, material_rid);
        let xf = Transform3D::new(
            Basis::IDENTITY,
            Vector3::new(
                coord.0 as f32 * self.chunk_size,
                0.0,
                coord.1 as f32 * self.chunk_size,
            ),
        );
        rs.instance_set_transform(rid, xf);
        rs.instance_set_visible(rid, self.base().is_visible_in_tree());
    }

    fn spawn_chunk(&mut self, coord: (i32, i32)) {
        let Some(origin) = self.view_origin() else {
            return;
        };
        let dist = self
            .chunk_center(coord)
            .distance_to(Vector2::new(origin.x, origin.z));

        let Some(card) = self.alloc_instance() else {
            return;
        };
        self.assign_instance(card, coord, MESH_CARD);

        let mut blade = None;
        let mut blade_near = false;
        if dist < self.blade_attach_distance() {
            if let Some(rid) = self.alloc_instance() {
                blade_near = dist <= self.lod_near_enter;
                let kind = if blade_near {
                    MESH_DETAILED
                } else {
                    MESH_SIMPLE
                };
                self.assign_instance(rid, coord, kind);
                blade = Some(rid);
            }
        }

        self.chunks.insert(
            coord,
            ChunkSlot {
                card,
                blade,
                blade_near,
            },
        );
        self.notify_event("world/chunk_spawned", Vector2i::new(coord.0, coord.1));
    }

    fn update_lods(&mut self, p: Vector3) {
        let player_xz = Vector2::new(p.x, p.z);
        let attach = self.blade_attach_distance();
        let detach = attach + 3.0;
        let coords: Vec<(i32, i32)> = self.chunks.keys().copied().collect();
        for coord in coords {
            let dist = self.chunk_center(coord).distance_to(player_xz);
            let slot = &self.chunks[&coord];
            let has_blade = slot.blade.is_some();
            let was_near = slot.blade_near;

            if has_blade && dist > detach {
                let slot = self.chunks.get_mut(&coord).unwrap();
                if let Some(rid) = slot.blade.take() {
                    RenderingServer::singleton().instance_set_visible(rid, false);
                    self.pool.push(rid);
                }
            } else if !has_blade && dist < attach {
                if let Some(rid) = self.alloc_instance() {
                    let near = dist <= self.lod_near_enter;
                    let kind = if near { MESH_DETAILED } else { MESH_SIMPLE };
                    self.assign_instance(rid, coord, kind);
                    let slot = self.chunks.get_mut(&coord).unwrap();
                    slot.blade = Some(rid);
                    slot.blade_near = near;
                }
            } else if has_blade {
                let near = if was_near {
                    dist <= self.lod_near_exit
                } else {
                    dist < self.lod_near_enter
                };
                if near != was_near {
                    let kind = if near { MESH_DETAILED } else { MESH_SIMPLE };
                    let rid = self.chunks[&coord].blade.unwrap();
                    self.assign_instance(rid, coord, kind);
                    self.chunks.get_mut(&coord).unwrap().blade_near = near;
                }
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

    fn build_layout_buffer(&self, seed: i64, count: usize) -> PackedFloat32Array {
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
            buf[o + 3] = rng.randf() * self.chunk_size;
            buf[o + 4] = basis.col_a().y;
            buf[o + 5] = basis.col_b().y;
            buf[o + 6] = basis.col_c().y;
            buf[o + 8] = basis.col_a().z;
            buf[o + 9] = basis.col_b().z;
            buf[o + 10] = basis.col_c().z;
            buf[o + 11] = rng.randf() * self.chunk_size;
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
        for (_, slot) in self.chunks.drain() {
            rs.free_rid(slot.card);
            if let Some(blade) = slot.blade {
                rs.free_rid(blade);
            }
        }
        for rid in self.pool.drain(..) {
            rs.free_rid(rid);
        }
        for group in self.multimeshes.drain(..) {
            for mm in group {
                rs.free_rid(mm);
            }
        }
    }
}
