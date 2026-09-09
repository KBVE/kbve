//! Ground material: world-space tiling over a mipped layer array, blended by slope and height.

use bevy::asset::RenderAssetUsages;
use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::render_resource::{
    AsBindGroup, Extent3d, ShaderType, TextureDataOrder, TextureDescriptor, TextureDimension,
    TextureFormat, TextureUsages,
};
use bevy::shader::ShaderRef;

use super::world::hash;

/// Path of the fragment shader backing [`TerrainExtension`].
pub const TERRAIN_SHADER: &str = "shaders/terrain.wgsl";

/// Edge length in texels of every layer in the ground array.
const LAYER_SIZE: u32 = 256;

/// Number of ground layers packed into the array texture.
const LAYER_COUNT: u32 = 4;

/// Linear base colors for the grass, rock, sand and snow layers.
const LAYER_COLORS: [[f32; 3]; LAYER_COUNT as usize] = [
    [0.16, 0.30, 0.10],
    [0.34, 0.33, 0.31],
    [0.62, 0.55, 0.36],
    [0.86, 0.88, 0.92],
];

/// The ground material: a [`StandardMaterial`] with the splat blend layered on top.
pub type TerrainMaterial = ExtendedMaterial<StandardMaterial, TerrainExtension>;

/// Uniform half of [`TerrainExtension`], mirrored by `TerrainParams` in the shader.
#[derive(Clone, Copy, Debug, Reflect, ShaderType)]
pub struct TerrainParams {
    /// Texture repeats per world meter.
    pub tile_scale: f32,
    /// Multiplier applied to `tile_scale` for the repetition-breaking tint tap.
    pub macro_scale: f32,
    /// Slope, as `1 - normal.y`, at which rock takes over.
    pub rock_slope: f32,
    /// World height below which sand takes over.
    pub sand_level: f32,
    /// World height above which snow takes over.
    pub snow_level: f32,
    /// Half-width in meters of every height transition.
    pub blend_range: f32,
    /// How strongly the macro tap modulates the detail blend.
    pub macro_strength: f32,
    _pad: f32,
}

impl Default for TerrainParams {
    fn default() -> Self {
        Self {
            tile_scale: 0.12,
            macro_scale: 0.045,
            rock_slope: 0.42,
            sand_level: -8.0,
            snow_level: 30.0,
            blend_range: 5.0,
            macro_strength: 0.35,
            _pad: 0.0,
        }
    }
}

/// Extension bindings; indices start at 100 to clear [`StandardMaterial`].
#[derive(Asset, AsBindGroup, Reflect, Clone, Debug)]
pub struct TerrainExtension {
    #[uniform(100)]
    pub params: TerrainParams,
    #[texture(101, dimension = "2d_array")]
    #[sampler(102)]
    pub layers: Handle<Image>,
}

impl MaterialExtension for TerrainExtension {
    fn fragment_shader() -> ShaderRef {
        TERRAIN_SHADER.into()
    }
}

/// Value noise that wraps every `cells` lattice steps, so a tiled layer has no seam.
fn tileable_noise(x: f32, y: f32, cells: i32, seed: u32) -> f32 {
    let (xi, yi) = (x.floor(), y.floor());
    let (xf, yf) = (x - xi, y - yi);
    let u = xf * xf * (3.0 - 2.0 * xf);
    let v = yf * yf * (3.0 - 2.0 * yf);
    let at = |ox: i32, oy: i32| {
        hash(
            (xi as i32 + ox).rem_euclid(cells),
            (yi as i32 + oy).rem_euclid(cells),
            seed,
        )
    };
    let a = at(0, 0) + (at(1, 0) - at(0, 0)) * u;
    let b = at(0, 1) + (at(1, 1) - at(0, 1)) * u;
    a + (b - a) * v
}

/// Grain for one texel of `layer`, as a linear-space multiplier around 1.0.
fn layer_grain(layer: u32, x: u32, y: u32) -> f32 {
    let seed = 0x9e37_79b9u32.wrapping_mul(layer + 1);
    let mut grain = 0.0;
    let mut amplitude = 0.5;
    let mut cells = 16i32;
    for octave in 0..3u32 {
        let scale = cells as f32 / LAYER_SIZE as f32;
        grain += tileable_noise(
            x as f32 * scale,
            y as f32 * scale,
            cells,
            seed ^ octave.wrapping_mul(0x85eb_ca6b),
        ) * amplitude;
        amplitude *= 0.5;
        cells *= 2;
    }
    0.72 + grain * 0.56
}

fn linear_to_srgb(value: f32) -> u8 {
    let clamped = value.clamp(0.0, 1.0);
    let encoded = if clamped <= 0.003_130_8 {
        clamped * 12.92
    } else {
        1.055 * clamped.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0 + 0.5) as u8
}

/// Box-filters one linear-space level down to half resolution on each axis.
fn downsample(level: &[[f32; 3]], size: u32) -> Vec<[f32; 3]> {
    let half = size / 2;
    let mut next = Vec::with_capacity((half * half) as usize);
    for y in 0..half {
        for x in 0..half {
            let mut sum = [0.0; 3];
            for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                let texel = level[((y * 2 + dy) * size + (x * 2 + dx)) as usize];
                for channel in 0..3 {
                    sum[channel] += texel[channel];
                }
            }
            next.push([sum[0] * 0.25, sum[1] * 0.25, sum[2] * 0.25]);
        }
    }
    next
}

/// Builds the ground array with a full mip chain, which bevy 0.19 will not generate itself.
pub fn terrain_layer_image() -> Image {
    let mip_level_count = LAYER_SIZE.ilog2() + 1;
    let mut data = Vec::new();

    for layer in 0..LAYER_COUNT {
        let base = LAYER_COLORS[layer as usize];
        let mut level: Vec<[f32; 3]> = (0..LAYER_SIZE * LAYER_SIZE)
            .map(|index| {
                let (x, y) = (index % LAYER_SIZE, index / LAYER_SIZE);
                let grain = layer_grain(layer, x, y);
                [base[0] * grain, base[1] * grain, base[2] * grain]
            })
            .collect();

        let mut size = LAYER_SIZE;
        loop {
            for texel in &level {
                data.extend_from_slice(&[
                    linear_to_srgb(texel[0]),
                    linear_to_srgb(texel[1]),
                    linear_to_srgb(texel[2]),
                    255,
                ]);
            }
            if size == 1 {
                break;
            }
            level = downsample(&level, size);
            size /= 2;
        }
    }

    Image {
        data: Some(data),
        data_order: TextureDataOrder::LayerMajor,
        texture_descriptor: TextureDescriptor {
            label: Some("terrain_layers"),
            size: Extent3d {
                width: LAYER_SIZE,
                height: LAYER_SIZE,
                depth_or_array_layers: LAYER_COUNT,
            },
            mip_level_count,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8UnormSrgb,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
            view_formats: &[],
        },
        sampler: ImageSampler::Descriptor(ImageSamplerDescriptor {
            label: Some("terrain_layers".into()),
            address_mode_u: ImageAddressMode::Repeat,
            address_mode_v: ImageAddressMode::Repeat,
            address_mode_w: ImageAddressMode::Repeat,
            mag_filter: ImageFilterMode::Linear,
            min_filter: ImageFilterMode::Linear,
            mipmap_filter: ImageFilterMode::Linear,
            anisotropy_clamp: 8,
            ..default()
        }),
        texture_view_descriptor: None,
        asset_usage: RenderAssetUsages::RENDER_WORLD,
        copy_on_resize: false,
    }
}
