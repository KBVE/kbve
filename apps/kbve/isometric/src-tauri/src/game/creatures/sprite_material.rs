//! Sprite sheet material using automatic instancing + storage buffer.
//!
//! Follows Bevy 0.18's automatic_instancing + storage_buffer examples:
//! - All creatures of the same type share ONE material handle + ONE mesh handle
//! - Per-instance data (frame, flip, tint) stored in a ShaderStorageBuffer
//! - MeshTag on each entity indexes into the storage buffer
//! - Bevy auto-instances all entities with the same mesh+material into one draw call
//!
//! Adding a new creature type = new material with its atlas texture + storage buffer.

use bevy::mesh::MeshTag;
use bevy::prelude::*;
use bevy::render::render_resource::AsBindGroup;
use bevy::render::storage::ShaderStorageBuffer;
use bevy::shader::ShaderRef;

const SHADER_PATH: &str = "shaders/sprite_sheet.wgsl";

/// Per-instance sprite data: 3 vec4s packed into the storage buffer.
/// Index = MeshTag * 3.
///
/// [0] = (frame_col, frame_row, sheet_cols, sheet_rows)
/// [1] = (flip, alpha_cutoff, 0, 0)
/// [2] = (tint_r, tint_g, tint_b, tint_a)
#[derive(Clone, Copy, Debug)]
pub struct SpriteInstanceData {
    pub frame_col: f32,
    pub frame_row: f32,
    pub sheet_cols: f32,
    pub sheet_rows: f32,
    pub flip: f32,
    pub alpha_cutoff: f32,
    pub tint: [f32; 4],
}

impl Default for SpriteInstanceData {
    fn default() -> Self {
        Self {
            frame_col: 0.0,
            frame_row: 0.0,
            sheet_cols: 1.0,
            sheet_rows: 1.0,
            flip: 0.0,
            alpha_cutoff: 0.5,
            tint: [1.0, 1.0, 1.0, 1.0],
        }
    }
}

impl SpriteInstanceData {
    /// Pack into 3 vec4s (12 floats) for the storage buffer.
    pub fn to_floats(&self) -> [[f32; 4]; 3] {
        [
            [
                self.frame_col,
                self.frame_row,
                self.sheet_cols,
                self.sheet_rows,
            ],
            [self.flip, self.alpha_cutoff, 0.0, 0.0],
            self.tint,
        ]
    }
}

/// Custom material for sprite-sheet creatures.
/// Uses storage buffer for per-instance data (indexed by MeshTag).
#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct SpriteSheetMaterial {
    #[storage(0, read_only)]
    pub instance_data: Handle<ShaderStorageBuffer>,
    #[texture(1)]
    #[sampler(2)]
    pub texture: Handle<Image>,
}

impl Material for SpriteSheetMaterial {
    fn vertex_shader() -> ShaderRef {
        SHADER_PATH.into()
    }

    fn fragment_shader() -> ShaderRef {
        SHADER_PATH.into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Mask(0.5)
    }
}

/// Resource holding the shared material + storage buffer for a creature type.
/// Each creature type (frog, wraith, etc.) gets one of these.
#[derive(Resource)]
pub struct SpriteTypeResources {
    pub material: Handle<SpriteSheetMaterial>,
    pub storage_buffer: Handle<ShaderStorageBuffer>,
    pub mesh: Handle<Mesh>,
    /// Current instance data — updated each frame, then flushed to the storage buffer.
    pub instances: Vec<SpriteInstanceData>,
}

/// Component on each sprite creature entity linking it to its slot in the
/// storage buffer. The MeshTag value matches this index.
#[derive(Component)]
pub struct SpriteSlot {
    pub index: u32,
}

/// Flush updated instance data to the GPU storage buffer.
/// Call this once per frame after animation systems update `instances`.
pub fn flush_sprite_buffer(res: &SpriteTypeResources, buffers: &mut Assets<ShaderStorageBuffer>) {
    if let Some(buffer) = buffers.get_mut(&res.storage_buffer) {
        let data: Vec<[f32; 4]> = res
            .instances
            .iter()
            .flat_map(|inst| inst.to_floats())
            .collect();
        buffer.set_data(data);
    }
}
