//! Ground material: world-space tiling over mipped layer arrays, blended by slope and height.

use bevy::asset::RenderAssetUsages;
use bevy::image::{
    ImageAddressMode, ImageFilterMode, ImageLoaderSettings, ImageSampler, ImageSamplerDescriptor,
};
use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::render_resource::{
    AsBindGroup, Extent3d, ShaderType, TextureDataOrder, TextureDescriptor, TextureDimension,
    TextureFormat, TextureUsages,
};
use bevy::shader::ShaderRef;

/// Path of the fragment shader backing [`TerrainExtension`].
pub const TERRAIN_SHADER: &str = "shaders/terrain.wgsl";

/// Strip of stacked ground colours, in the order the shader indexes them.
pub const ALBEDO_STRIP: &str = "terrain/ground_albedo.png";

/// Strip of stacked ground normals, matching [`ALBEDO_STRIP`] layer for layer.
pub const NORMAL_STRIP: &str = "terrain/ground_normal.png";

/// Number of ground layers packed into each array texture.
pub const LAYER_COUNT: u32 = 4;

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
    /// Albedo multiplier at the water line.
    pub wet_darkening: f32,
    /// Roughness of fully soaked ground.
    pub wet_roughness: f32,
    /// How far the sampled normals tilt the surface.
    pub normal_strength: f32,
    /// Scale of the second, rotated sampling that regions are mixed toward.
    pub variant_scale: f32,
    /// How often the world switches between the two samplings, in cycles per meter.
    pub variant_frequency: f32,
}

impl Default for TerrainParams {
    fn default() -> Self {
        Self {
            tile_scale: 0.09,
            macro_scale: 0.045,
            rock_slope: 0.42,
            sand_level: -8.0,
            snow_level: 30.0,
            blend_range: 5.0,
            macro_strength: 0.55,
            wet_darkening: 0.52,
            wet_roughness: 0.22,
            normal_strength: 1.2,
            variant_scale: 0.43,
            variant_frequency: 0.012,
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
    #[texture(103, dimension = "2d_array")]
    #[sampler(104)]
    pub normals: Handle<Image>,
}

impl MaterialExtension for TerrainExtension {
    fn fragment_shader() -> ShaderRef {
        TERRAIN_SHADER.into()
    }
}

/// Loads the two strips; normals must not be read as colour or the vectors are skewed by gamma.
pub fn load_ground_strips(assets: &AssetServer) -> (Handle<Image>, Handle<Image>) {
    (
        assets.load(ALBEDO_STRIP),
        assets
            .load_builder()
            .with_settings(|settings: &mut ImageLoaderSettings| settings.is_srgb = false)
            .load(NORMAL_STRIP),
    )
}

/// Decode table for the strips, built once because the slicing does millions of these.
fn srgb_table() -> [f32; 256] {
    let mut table = [0.0; 256];
    for (index, entry) in table.iter_mut().enumerate() {
        let value = index as f32 / 255.0;
        *entry = if value <= 0.040_45 {
            value / 12.92
        } else {
            ((value + 0.055) / 1.055).powf(2.4)
        };
    }
    table
}

fn linear_to_srgb(value: f32) -> u8 {
    let value = value.clamp(0.0, 1.0);
    let encoded = if value <= 0.003_130_8 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0 + 0.5) as u8
}

/// Averages one level down to half resolution on each axis.
fn downsample(level: &[[f32; 4]], size: u32) -> Vec<[f32; 4]> {
    let half = (size / 2).max(1);
    let mut next = Vec::with_capacity((half * half) as usize);
    for y in 0..half {
        for x in 0..half {
            let mut sum = [0.0; 4];
            for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                let texel = level[((y * 2 + dy) * size + (x * 2 + dx)) as usize];
                for channel in 0..4 {
                    sum[channel] += texel[channel];
                }
            }
            next.push(sum.map(|total| total * 0.25));
        }
    }
    next
}

fn encode(level: &[[f32; 4]], srgb: bool, into: &mut Vec<u8>) {
    for texel in level {
        if srgb {
            into.extend_from_slice(&[
                linear_to_srgb(texel[0]),
                linear_to_srgb(texel[1]),
                linear_to_srgb(texel[2]),
                255,
            ]);
        } else {
            let vector = Vec3::new(texel[0], texel[1], texel[2]) * 2.0 - Vec3::ONE;
            let unit = vector.normalize_or(Vec3::Z) * 0.5 + Vec3::splat(0.5);
            into.extend_from_slice(&[
                (unit.x * 255.0 + 0.5) as u8,
                (unit.y * 255.0 + 0.5) as u8,
                (unit.z * 255.0 + 0.5) as u8,
                255,
            ]);
        }
    }
}

/// Slices a stacked strip into an array texture with a full mip chain.
///
/// Bevy 0.19 generates no mipmaps, and a ground plane at a grazing angle is the worst case for
/// the shimmer you get without them, so the chain is built here rather than left to the loader.
/// Colour is filtered in linear space and normals are re-normalised, because averaging either one
/// in its stored encoding bends it.
pub fn layer_array(strip: &Image, srgb: bool) -> Option<Image> {
    let size = strip.texture_descriptor.size;
    let (width, height) = (size.width, size.height);
    if width == 0 || height != width * LAYER_COUNT {
        return None;
    }
    let source = strip.data.as_ref()?;
    if source.len() < (width * height * 4) as usize {
        return None;
    }

    let decode = srgb_table();
    let mip_level_count = width.ilog2() + 1;
    let mut data = Vec::new();
    for layer in 0..LAYER_COUNT {
        let mut level: Vec<[f32; 4]> = (0..width * width)
            .map(|index| {
                let x = index % width;
                let y = layer * width + index / width;
                let at = ((y * width + x) * 4) as usize;
                if srgb {
                    [
                        decode[source[at] as usize],
                        decode[source[at + 1] as usize],
                        decode[source[at + 2] as usize],
                        1.0,
                    ]
                } else {
                    [
                        source[at] as f32 / 255.0,
                        source[at + 1] as f32 / 255.0,
                        source[at + 2] as f32 / 255.0,
                        1.0,
                    ]
                }
            })
            .collect();

        let mut level_size = width;
        loop {
            encode(&level, srgb, &mut data);
            if level_size == 1 {
                break;
            }
            level = downsample(&level, level_size);
            level_size /= 2;
        }
    }

    Some(Image {
        data: Some(data),
        data_order: TextureDataOrder::LayerMajor,
        texture_descriptor: TextureDescriptor {
            label: Some("terrain_layers"),
            size: Extent3d {
                width,
                height: width,
                depth_or_array_layers: LAYER_COUNT,
            },
            mip_level_count,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: if srgb {
                TextureFormat::Rgba8UnormSrgb
            } else {
                TextureFormat::Rgba8Unorm
            },
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
    })
}
