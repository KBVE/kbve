//! GPU-driven sprite sheet material.
//!
//! Replaces per-frame `insert_attribute(UV_0)` mesh uploads with a uniform
//! buffer that the vertex shader reads to compute atlas UVs on the GPU.
//! Used by both frog and wraith sprite creatures.

use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

/// Uniform block matching the WGSL `SpriteUniforms` struct.
#[derive(ShaderType, Clone, Copy, Debug)]
pub struct SpriteUniforms {
    /// RGBA tint applied to the texture sample (used for day/night).
    pub tint: Vec4,
    /// Current frame column in the atlas (0-based).
    pub frame_col: f32,
    /// Current frame row in the atlas (0-based).
    pub frame_row: f32,
    /// Total columns in the sprite sheet.
    pub sheet_cols: f32,
    /// Total rows in the sprite sheet.
    pub sheet_rows: f32,
    /// >0.5 to flip horizontally.
    pub flip: f32,
    /// Alpha discard threshold (0.5 for mask, 0.01 for blend).
    pub alpha_cutoff: f32,
    pub _pad0: f32,
    pub _pad1: f32,
}

impl Default for SpriteUniforms {
    fn default() -> Self {
        Self {
            tint: Vec4::ONE,
            frame_col: 0.0,
            frame_row: 0.0,
            sheet_cols: 1.0,
            sheet_rows: 1.0,
            flip: 0.0,
            alpha_cutoff: 0.5,
            _pad0: 0.0,
            _pad1: 0.0,
        }
    }
}

/// Custom material for sprite-sheet creatures.
///
/// Bind layout:
/// - binding(0): `SpriteUniforms` uniform buffer
/// - binding(1): sprite atlas texture
/// - binding(2): sampler
#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct SpriteSheetMaterial {
    #[uniform(0)]
    pub uniforms: SpriteUniforms,
    #[texture(1)]
    #[sampler(2)]
    pub texture: Handle<Image>,
}

/// Component that stores the SpriteSheetMaterial handle on sprite creatures.
/// Used instead of `Creature.mat_handle` (which is typed StandardMaterial).
#[derive(Component)]
pub struct SpriteMatHandle(pub Handle<SpriteSheetMaterial>);

impl Material for SpriteSheetMaterial {
    fn vertex_shader() -> ShaderRef {
        "shaders/sprite_sheet.wgsl".into()
    }

    fn fragment_shader() -> ShaderRef {
        "shaders/sprite_sheet.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        if self.uniforms.alpha_cutoff > 0.4 {
            AlphaMode::Mask(self.uniforms.alpha_cutoff)
        } else {
            AlphaMode::Blend
        }
    }
}
