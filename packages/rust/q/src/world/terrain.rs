use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};
use godot::classes::image::Format as ImageFormat;
use godot::classes::{
    CollisionShape3D, Engine, HeightMapShape3D, Image, ImageTexture, MeshInstance3D, PlaneMesh,
    ShaderMaterial, StaticBody3D,
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
    player_path: NodePath,
    #[export]
    grass_material: Option<Gd<ShaderMaterial>>,
    #[export]
    ground_material: Option<Gd<ShaderMaterial>>,
    #[export]
    water_material: Option<Gd<ShaderMaterial>>,
    #[export]
    riverbed_material: Option<Gd<ShaderMaterial>>,

    hills: Option<FastNoiseLite>,
    river: Option<FastNoiseLite>,
    heights: Vec<f32>,
    texture: Option<Gd<ImageTexture>>,
    clearance: Vec<u8>,
    clearance_res: i32,
    clearance_tex: Option<Gd<ImageTexture>>,
    clearance_dirty: bool,
}

#[godot_api]
impl INode3D for QTerrain {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.hills = Some(make_noise(self.terrain_seed, self.hill_frequency, 4));
        self.river = Some(make_noise(
            self.terrain_seed + 7,
            self.river_wander_frequency,
            5,
        ));

        let res = self.resolution.max(2);
        let step = self.extent * 2.0 / (res - 1) as f32;
        let mut heights = vec![0.0f32; (res * res) as usize];
        for iy in 0..res {
            let z = -self.extent + iy as f32 * step;
            for ix in 0..res {
                let x = -self.extent + ix as f32 * step;
                heights[(iy * res + ix) as usize] = self.height(x, z);
            }
        }

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

        let cres = 512;
        let cstep = self.extent * 2.0 / (cres - 1) as f32;
        let hres = res;
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

        let mut shape = HeightMapShape3D::new_gd();
        shape.set_map_width(res);
        shape.set_map_depth(res);
        shape.set_map_data(&PackedFloat32Array::from(heights.as_slice()));
        let mut col = CollisionShape3D::new_alloc();
        col.set_shape(&shape);
        let mut body = StaticBody3D::new_alloc();
        body.add_child(&col);
        self.base_mut().add_child(&body);

        let strip_width = ((self.river_wander * 2.0 + self.river_width * 8.0) / 4.0).ceil() * 4.0;
        let mut bed_plane = PlaneMesh::new_gd();
        bed_plane.set_size(Vector2::new(strip_width, self.extent * 2.0));
        bed_plane.set_subdivide_width(((strip_width * 0.5) as i32 - 1).max(1));
        bed_plane.set_subdivide_depth((self.extent as i32 - 1).max(1));
        let mut bed = MeshInstance3D::new_alloc();
        bed.set_name("Riverbed");
        bed.set_mesh(&bed_plane);
        if let Some(m) = self.riverbed_material.as_ref() {
            bed.set_material_override(m);
        }
        bed.set_extra_cull_margin(16.0);
        self.base_mut().add_child(&bed);

        let mut plane = PlaneMesh::new_gd();
        plane.set_size(Vector2::new(strip_width, self.extent * 2.0));
        let mut water = MeshInstance3D::new_alloc();
        water.set_name("Water");
        water.set_mesh(&plane);
        if let Some(m) = self.water_material.as_ref() {
            water.set_material_override(m);
        }
        water.set_position(Vector3::new(0.0, self.water_level, 0.0));
        water.set_extra_cull_margin(16.0);
        self.base_mut().add_child(&water);

        self.heights = heights;

        let player = self
            .base()
            .get_node_or_null(&self.player_path)
            .and_then(|n| n.try_cast::<Node3D>().ok());
        if let Some(mut player) = player {
            let p = player.get_global_position();
            let mut sx = p.x;
            while self.height(sx, p.z) < self.water_level + 1.0 && sx < self.extent {
                sx += 4.0;
            }
            player.set_global_position(Vector3::new(sx, self.height(sx, p.z) + 1.0, p.z));
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

    pub fn stamp_clearance(&mut self, x: f32, z: f32, radius: f32) {
        let cres = self.clearance_res;
        if cres < 2 || radius <= 0.0 {
            return;
        }
        let texel = self.extent * 2.0 / (cres - 1) as f32;
        let to_px = |w: f32| ((w + self.extent) / texel).round() as i32;
        let r_px = (radius / texel).ceil() as i32 + 1;
        let cx = to_px(x);
        let cz = to_px(z);
        let inner = radius * 0.55;
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
        let (Some(hills), Some(river)) = (self.hills.as_ref(), self.river.as_ref()) else {
            return 0.0;
        };
        let h = hills.get_noise_2d(x, z) * self.hill_amplitude + self.hill_base;
        let river_x = river.get_noise_2d(z, 0.0) * self.river_wander;
        let d = (x - river_x).abs();
        let t = (-(d * d) / (2.0 * self.river_width * self.river_width)).exp();
        let m = (t * 1.15).clamp(0.0, 1.0);
        h + (self.water_level - self.riverbed_depth - h) * m
    }
}
