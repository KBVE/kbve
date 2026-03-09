use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

/// Water level in world units. Tiles with terrain height < WATER_LEVEL
/// get a water surface quad at this Y coordinate.
pub const WATER_LEVEL: f32 = 1.0;

#[derive(ShaderType, Clone, Copy)]
pub struct WaterUniforms {
    pub base_color: Vec4,
    pub deep_color: Vec4,
    pub ripple_speed: f32,
    pub ripple_scale: f32,
    pub highlight_strength: f32,
    pub foam_intensity: f32,
}

impl Default for WaterUniforms {
    fn default() -> Self {
        Self {
            base_color: Vec4::new(0.6, 0.85, 0.95, 0.82),
            deep_color: Vec4::new(0.15, 0.4, 0.7, 0.88),
            ripple_speed: 0.3,
            ripple_scale: 3.0,
            highlight_strength: 0.25,
            foam_intensity: 0.6,
        }
    }
}

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct WaterMaterial {
    #[uniform(0)]
    pub uniforms: WaterUniforms,
}

impl Default for WaterMaterial {
    fn default() -> Self {
        Self {
            uniforms: WaterUniforms::default(),
        }
    }
}

impl Material for WaterMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/water.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}

pub struct WaterPlugin;

impl Plugin for WaterPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<WaterMaterial>::default());
    }
}
