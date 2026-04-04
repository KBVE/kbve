//! Sprite atlas material — debug version with NoFrustumCulling + AlphaMode::Blend.

use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::render::storage::ShaderStorageBuffer;
use bevy::shader::ShaderRef;

const SHADER_PATH: &str = "shaders/sprite_sheet.wgsl";

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct SpriteAnimData {
    pub frame: u32,
    pub flip: u32,
    pub _pad1: u32,
    pub _pad2: u32,
}

impl Default for SpriteAnimData {
    fn default() -> Self {
        Self {
            frame: 0,
            flip: 0,
            _pad1: 0,
            _pad2: 0,
        }
    }
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct SpriteAtlasMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub atlas: Handle<Image>,

    #[storage(2, read_only)]
    pub anim_data: Handle<ShaderStorageBuffer>,

    #[uniform(3)]
    pub atlas_grid: UVec2,

    #[uniform(4)]
    pub tint: LinearRgba,
}

impl Material for SpriteAtlasMaterial {
    fn vertex_shader() -> ShaderRef {
        SHADER_PATH.into()
    }

    fn fragment_shader() -> ShaderRef {
        SHADER_PATH.into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}
