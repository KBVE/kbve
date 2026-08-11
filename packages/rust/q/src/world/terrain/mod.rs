mod river;
mod road;
mod water;

use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};
use godot::classes::image::Format as ImageFormat;
use godot::classes::notify::Node3DNotification;
use godot::classes::{
    CollisionShape3D, Engine, HeightMapShape3D, Image, ImageTexture, RenderingDevice,
    ShaderMaterial, StaticBody3D, Texture2Drd,
};
use godot::prelude::*;

fn make_noise(seed: i32, frequency: f32, octaves: i32) -> FastNoiseLite {
    let mut n = FastNoiseLite::with_seed(seed);
    n.set_noise_type(Some(NoiseType::OpenSimplex2S));
    n.set_frequency(Some(frequency));
    n.set_fractal_type(Some(FractalType::FBm));
    n.set_fractal_octaves(Some(octaves));
    n.set_fractal_lacunarity(Some(2.0));
    n.set_fractal_gain(Some(0.5));
    n
}

pub(super) struct HeightGen {
    hills: FastNoiseLite,
    river: FastNoiseLite,
    hill_amplitude: f32,
    hill_base: f32,
    river_wander: f32,
    river_width: f32,
    water_level: f32,
    riverbed_depth: f32,
}

impl HeightGen {
    fn from_terrain(t: &QTerrain) -> Self {
        Self {
            hills: make_noise(t.terrain_seed, t.hill_frequency, 4),
            river: make_noise(t.terrain_seed + 7, t.river_wander_frequency, 5),
            hill_amplitude: t.hill_amplitude,
            hill_base: t.hill_base,
            river_wander: t.river_wander,
            river_width: t.river_width,
            water_level: t.water_level,
            riverbed_depth: t.riverbed_depth,
        }
    }

    fn height(&self, x: f32, z: f32) -> f32 {
        let h = self.hills.get_noise_2d(x, z) * self.hill_amplitude + self.hill_base;
        let river_x = self.river.get_noise_2d(z, 0.0) * self.river_wander;
        let d = (x - river_x).abs();
        let t = (-(d * d) / (2.0 * self.river_width * self.river_width)).exp();
        let m = (t * 1.15).clamp(0.0, 1.0);
        h + (self.water_level - self.riverbed_depth - h) * m
    }

    fn river_x(&self, z: f32) -> f32 {
        self.river.get_noise_2d(z, 0.0) * self.river_wander
    }

    /// Low-frequency drift used to keep the trunk road from being a ruler line.
    fn wander(&self, x: f32) -> f32 {
        self.river.get_noise_2d(x * 0.35, 500.0)
    }

    fn bake(&self, extent: f32, res: i32) -> Vec<f32> {
        let step = extent * 2.0 / (res - 1) as f32;
        let mut heights = vec![0.0f32; (res * res) as usize];
        for iy in 0..res {
            let z = -extent + iy as f32 * step;
            for ix in 0..res {
                let x = -extent + ix as f32 * step;
                heights[(iy * res + ix) as usize] = self.height(x, z);
            }
        }
        heights
    }
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QTerrain {
    base: Base<Node3D>,

    #[export]
    #[init(val = 1337)]
    terrain_seed: i32,
    #[export]
    #[init(val = 4.0)]
    hill_amplitude: f32,
    #[export]
    #[init(val = 3.5)]
    hill_base: f32,
    #[export]
    #[init(val = 0.008)]
    hill_frequency: f32,
    #[export]
    #[init(val = 60.0)]
    river_wander: f32,
    #[export]
    #[init(val = 0.004)]
    river_wander_frequency: f32,
    #[export]
    #[init(val = 7.0)]
    river_width: f32,
    #[export]
    #[init(val = -1.4)]
    water_level: f32,
    #[export]
    #[init(val = 1.2)]
    riverbed_depth: f32,
    #[export]
    #[init(val = 256.0)]
    extent: f32,
    #[export]
    #[init(val = 513)]
    resolution: i32,
    #[export]
    #[init(val = true)]
    wake_enabled: bool,
    #[export]
    player_path: NodePath,
    #[export]
    grass_material: Option<Gd<ShaderMaterial>>,
    #[export]
    ground_material: Option<Gd<ShaderMaterial>>,
    #[export]
    water_material: Option<Gd<ShaderMaterial>>,
    #[export]
    riverbed_material: Option<Gd<ShaderMaterial>>,
    #[export]
    bridge_material: Option<Gd<ShaderMaterial>>,
    #[export]
    abutment_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 3.2)]
    road_width: f32,
    #[export]
    #[init(val = 1.4)]
    road_tile_scale: f32,

    player: Option<Gd<Node3D>>,
    water_rd: Option<Gd<RenderingDevice>>,
    #[init(val = Rid::Invalid)]
    pattern_tex: Rid,
    #[init(val = Rid::Invalid)]
    pattern_shader: Rid,
    #[init(val = Rid::Invalid)]
    pattern_pipeline: Rid,
    #[init(val = Rid::Invalid)]
    pattern_set: Rid,
    pattern_wrap: Option<Gd<Texture2Drd>>,
    water_time: f32,
    #[init(val = f32::MIN)]
    pattern_zc: f32,
    #[init(val = [Rid::Invalid; 2])]
    wake_tex: [Rid; 2],
    #[init(val = [Rid::Invalid; 2])]
    wake_sets: [Rid; 2],
    #[init(val = Rid::Invalid)]
    wake_shader: Rid,
    #[init(val = Rid::Invalid)]
    wake_pipeline: Rid,
    #[init(val = Rid::Invalid)]
    wake_sampler: Rid,
    wake_wraps: Vec<Gd<Texture2Drd>>,
    wake_idx: usize,
    wake_energy: f32,
    wake_active: bool,
    wake_origin: Vector2,
    last_player_pos: Vector3,
    hgen: Option<HeightGen>,
    gen_rx: Option<std::sync::mpsc::Receiver<Vec<f32>>>,
    gen_t0: Option<std::time::Instant>,
    heights: Vec<f32>,
    texture: Option<Gd<ImageTexture>>,
    clearance: Vec<u8>,
    clearance_res: i32,
    clearance_tex: Option<Gd<ImageTexture>>,
    clearance_dirty: bool,
    road_tex: Option<Gd<ImageTexture>>,
    road_mask: Vec<u8>,
    road_res: i32,
    road: Option<road::RoadNetwork>,
}

#[godot_api]
impl INode3D for QTerrain {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let _t = crate::world::ReadyTimer::start("terrain");
        if std::env::var("Q_NO_WAKE").is_ok() {
            self.wake_enabled = false;
        }
        if std::env::var("Q_NO_VSYNC").is_ok() {
            godot::classes::DisplayServer::singleton()
                .window_set_vsync_mode(godot::classes::display_server::VSyncMode::DISABLED);
        }
        self.hgen = Some(HeightGen::from_terrain(self));
        self.gen_t0 = Some(std::time::Instant::now());
        let worker_gen = HeightGen::from_terrain(self);
        let extent = self.extent;
        let res = self.resolution.max(2);
        let (tx, rx) = std::sync::mpsc::channel();
        let job = move || {
            let _ = tx.send(worker_gen.bake(extent, res));
        };
        let rt = Engine::singleton()
            .get_singleton(crate::threads::runtime::RuntimeManager::SINGLETON)
            .and_then(|s| s.try_cast::<crate::threads::runtime::RuntimeManager>().ok());
        match rt {
            Some(rt) => {
                rt.bind().spawn_blocking(job);
            }
            None => {
                std::thread::spawn(job);
            }
        }
        self.gen_rx = Some(rx);
    }

    fn process(&mut self, delta: f64) {
        if let Some(rx) = self.gen_rx.as_ref() {
            match rx.try_recv() {
                Ok(h) => {
                    self.gen_rx = None;
                    self.finish_init(h);
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => return,
                Err(_) => {
                    self.gen_rx = None;
                    return;
                }
            }
        }
        if self.heights.is_empty() {
            return;
        }
        if let Some(p) = self.player.as_ref().map(|p| p.get_global_position()) {
            if let Some(m) = self.water_material.as_mut() {
                m.set_shader_parameter("player_position", &p.to_variant());
            }
            if self.wake_enabled {
                self.dispatch_wake(delta as f32, p);
            }
            self.last_player_pos = p;
        }
        self.water_time += delta as f32;
        self.dispatch_water_fx();
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        if what == Node3DNotification::PREDELETE {
            self.free_water_fx();
        }
    }
}

impl QTerrain {
    fn finish_init(&mut self, heights: Vec<f32>) {
        let res = self.resolution.max(2);
        let bytes: Vec<u8> = heights.iter().flat_map(|h| h.to_le_bytes()).collect();
        let data = PackedByteArray::from(bytes.as_slice());
        let tex = Image::create_from_data(res, res, false, ImageFormat::RF, &data)
            .and_then(|img| ImageTexture::create_from_image(&img));
        self.texture = tex.clone();

        for m in [
            self.grass_material.as_mut(),
            self.ground_material.as_mut(),
            self.riverbed_material.as_mut(),
        ]
        .into_iter()
        .flatten()
        {
            if let Some(t) = tex.as_ref() {
                m.set_shader_parameter("heightmap", &t.to_variant());
            }
            m.set_shader_parameter("terrain_extent", &self.extent.to_variant());
        }
        for m in [
            self.grass_material.as_mut(),
            self.riverbed_material.as_mut(),
        ]
        .into_iter()
        .flatten()
        {
            m.set_shader_parameter("water_level", &self.water_level.to_variant());
        }
        if let Some(m) = self.water_material.as_mut() {
            m.set_shader_parameter("terrain_extent", &self.extent.to_variant());
        }

        self.bake_clearance(&heights, res);

        let mut shape = HeightMapShape3D::new_gd();
        shape.set_map_width(res);
        shape.set_map_depth(res);
        shape.set_map_data(&PackedFloat32Array::from(heights.as_slice()));
        let mut col = CollisionShape3D::new_alloc();
        col.set_shape(&shape);
        let mut body = StaticBody3D::new_alloc();
        body.add_child(&col);
        self.base_mut().add_child(&body);

        if crate::world::q_hidden("pom") {
            if let Some(m) = self.riverbed_material.as_mut() {
                m.set_shader_parameter("pom_depth", &0.0f32.to_variant());
                m.set_shader_parameter("pom_fade_end", &0.0f32.to_variant());
            }
        }
        self.build_river_planes();

        self.heights = heights;

        if !crate::world::q_hidden("road") {
            self.build_road();
        }

        let player = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok());
        self.player = player.clone();
        if let Some(mut player) = player {
            let p = player.get_global_position();
            let spawn = std::env::var("Q_SPAWN").unwrap_or_default();
            if spawn == "river" {
                let rx = self.hgen.as_ref().map(|g| g.river_x(p.z)).unwrap_or(0.0);
                player.set_global_position(Vector3::new(rx, self.water_level + 0.6, p.z));
            } else if spawn == "road" {
                let target = self
                    .road
                    .as_ref()
                    .map(|r| r.point_near_x(r.crossing.x + r.half_span + 20.0))
                    .unwrap_or(Vector2::ZERO);
                let (rx, rz) = (target.x, target.y);
                player.set_global_position(Vector3::new(rx, self.height(rx, rz) + 1.0, rz));
            } else {
                let mut sx = p.x;
                while self.height(sx, p.z) < self.water_level + 1.0 && sx < self.extent {
                    sx += 4.0;
                }
                player.set_global_position(Vector3::new(sx, self.height(sx, p.z) + 1.0, p.z));
            }
        }
        self.setup_water_fx();
        if let Some(t0) = self.gen_t0.take() {
            godot_print!("[q] terrain gen+apply {}ms", t0.elapsed().as_millis());
        }
    }
}

#[godot_api]
impl QTerrain {
    #[func]
    fn height_at(&self, x: f32, z: f32) -> f32 {
        self.height(x, z)
    }
}

impl QTerrain {
    fn bake_clearance(&mut self, heights: &[f32], hres: i32) {
        let cres = 512;
        let cstep = self.extent * 2.0 / (cres - 1) as f32;
        let mut clearance = vec![0u8; (cres * cres) as usize];
        for iy in 0..cres {
            let z = -self.extent + iy as f32 * cstep;
            for ix in 0..cres {
                let x = -self.extent + ix as f32 * cstep;
                let u = ((x + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
                let v = ((z + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
                let px = ((u * (hres - 1) as f32) as i32).clamp(0, hres - 1);
                let py = ((v * (hres - 1) as f32) as i32).clamp(0, hres - 1);
                let h = heights[(py * hres + px) as usize];
                let t = ((h - (self.water_level + 0.4)) / 2.2).clamp(0.0, 1.0);
                let band = 1.0 - t * t * (3.0 - 2.0 * t);
                clearance[(iy * cres + ix) as usize] = (band * 255.0) as u8;
            }
        }
        let cdata = PackedByteArray::from(clearance.as_slice());
        self.clearance_tex = Image::create_from_data(cres, cres, false, ImageFormat::R8, &cdata)
            .and_then(|img| ImageTexture::create_from_image(&img));
        self.clearance = clearance;
        self.clearance_res = cres;
        if let Some(t) = self.clearance_tex.as_ref() {
            if let Some(m) = self.ground_material.as_mut() {
                m.set_shader_parameter("clearance_tex", &t.to_variant());
            }
        }
    }

    pub fn cpu_heights(&self) -> Option<(&[f32], i32)> {
        if self.heights.is_empty() {
            None
        } else {
            Some((&self.heights, self.resolution.max(2)))
        }
    }

    pub fn heightmap_texture(&self) -> Option<Gd<ImageTexture>> {
        self.texture.clone()
    }

    pub fn world_extent(&self) -> f32 {
        self.extent
    }

    pub fn water(&self) -> f32 {
        self.water_level
    }

    pub fn clearance_texture(&self) -> Option<Gd<ImageTexture>> {
        self.clearance_tex.clone()
    }

    /// Scatter fields snapshot this the same way they snapshot heights, so they
    /// can keep their placement loops off the road without binding per candidate.
    pub fn road_mask(&self) -> Option<(&[u8], i32)> {
        if self.road_mask.is_empty() {
            None
        } else {
            Some((&self.road_mask, self.road_res))
        }
    }

    pub fn stamp_clearance(&mut self, x: f32, z: f32, radius: f32) {
        self.stamp_clearance_band(x, z, radius * 0.55, radius);
    }

    /// Clearance stamp with an explicit fully-cleared core. Scatter props are
    /// happy with a soft blob, but the road needs its carriageway swept to zero
    /// well past the painted edge, so it drives the two radii directly.
    pub fn stamp_clearance_band(&mut self, x: f32, z: f32, inner: f32, radius: f32) {
        let cres = self.clearance_res;
        if cres < 2 || radius <= 0.0 || inner >= radius {
            return;
        }
        let texel = self.extent * 2.0 / (cres - 1) as f32;
        let to_px = |w: f32| ((w + self.extent) / texel).round() as i32;
        let r_px = (radius / texel).ceil() as i32 + 1;
        let cx = to_px(x);
        let cz = to_px(z);
        for py in (cz - r_px).max(0)..=(cz + r_px).min(cres - 1) {
            let wz = -self.extent + py as f32 * texel;
            for px in (cx - r_px).max(0)..=(cx + r_px).min(cres - 1) {
                let wx = -self.extent + px as f32 * texel;
                let d = ((wx - x) * (wx - x) + (wz - z) * (wz - z)).sqrt();
                if d >= radius {
                    continue;
                }
                let t = ((d - inner) / (radius - inner)).clamp(0.0, 1.0);
                let v = ((1.0 - t * t * (3.0 - 2.0 * t)) * 255.0) as u8;
                let idx = (py * cres + px) as usize;
                if v > self.clearance[idx] {
                    self.clearance[idx] = v;
                    self.clearance_dirty = true;
                }
            }
        }
    }

    pub fn flush_clearance(&mut self) {
        if !self.clearance_dirty {
            return;
        }
        self.clearance_dirty = false;
        let cres = self.clearance_res;
        let cdata = PackedByteArray::from(self.clearance.as_slice());
        if let (Some(img), Some(tex)) = (
            Image::create_from_data(cres, cres, false, ImageFormat::R8, &cdata),
            self.clearance_tex.as_mut(),
        ) {
            tex.update(&img);
        }
    }

    fn height(&self, x: f32, z: f32) -> f32 {
        self.hgen.as_ref().map(|g| g.height(x, z)).unwrap_or(0.0)
    }
}
