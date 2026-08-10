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

    hills: Option<FastNoiseLite>,
    river: Option<FastNoiseLite>,
    heights: Vec<f32>,
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

        for m in [self.grass_material.as_mut(), self.ground_material.as_mut()]
            .into_iter()
            .flatten()
        {
            if let Some(t) = tex.as_ref() {
                m.set_shader_parameter("heightmap", &t.to_variant());
            }
            m.set_shader_parameter("terrain_extent", &self.extent.to_variant());
        }
        if let Some(m) = self.grass_material.as_mut() {
            m.set_shader_parameter("water_level", &self.water_level.to_variant());
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

        let mut plane = PlaneMesh::new_gd();
        plane.set_size(Vector2::new(
            self.river_wander * 2.0 + self.river_width * 8.0,
            self.extent * 2.0,
        ));
        let mut water = MeshInstance3D::new_alloc();
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
