//! Water surface material: colour and transparency driven by depth baked into the mesh.

use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

/// Path of the fragment shader backing [`WaterExtension`].
pub const WATER_SHADER: &str = "shaders/water.wgsl";

/// The water material: a [`StandardMaterial`] with depth-driven tint and alpha on top.
pub type WaterMaterial = ExtendedMaterial<StandardMaterial, WaterExtension>;

/// Uniform half of [`WaterExtension`], mirrored by `WaterParams` in the shader.
#[derive(Clone, Copy, Debug, Reflect, ShaderType)]
pub struct WaterParams {
    pub shallow_color: Vec4,
    pub deep_color: Vec4,
    /// Depth in meters over which the shore fades in from fully transparent.
    pub shore_fade: f32,
    /// Depth in meters at which the deep colour fully takes over.
    pub deep_at: f32,
    /// Opacity of water at full depth.
    pub max_alpha: f32,
    /// Scale of the surface ripple normals.
    pub ripple_strength: f32,
}

impl Default for WaterParams {
    fn default() -> Self {
        Self {
            shallow_color: Vec4::new(0.30, 0.52, 0.48, 1.0),
            deep_color: Vec4::new(0.05, 0.16, 0.28, 1.0),
            shore_fade: 0.85,
            deep_at: 3.0,
            max_alpha: 0.82,
            ripple_strength: 0.06,
        }
    }
}

/// Extension bindings; indices start at 100 to clear [`StandardMaterial`].
#[derive(Asset, AsBindGroup, Reflect, Clone, Debug)]
pub struct WaterExtension {
    #[uniform(100)]
    pub params: WaterParams,
}

impl MaterialExtension for WaterExtension {
    fn fragment_shader() -> ShaderRef {
        WATER_SHADER.into()
    }
}

/// The water material with the transparency the shader assumes.
pub fn water_material() -> WaterMaterial {
    WaterMaterial {
        base: StandardMaterial {
            base_color: Color::WHITE,
            perceptual_roughness: 0.08,
            metallic: 0.0,
            reflectance: 0.5,
            alpha_mode: AlphaMode::Blend,
            cull_mode: None,
            ..default()
        },
        extension: WaterExtension {
            params: WaterParams::default(),
        },
    }
}
