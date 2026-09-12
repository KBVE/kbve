//! Blood that stays on the ground where a hit landed.
//!
//! Every stain is painted into one coverage mask the terrain shader samples by world
//! position, rather than carried as a list of drops the shader walks per pixel. The
//! mask costs one texture read wherever the ground is drawn, no matter how many hits
//! the fight has produced, and stains that overlap merge on their own because the
//! brush accumulates before the shader thresholds it.

use bevy::asset::RenderAssetUsages;
use bevy::image::{ImageAddressMode, ImageFilterMode, ImageSampler, ImageSamplerDescriptor};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
use combat::{AbilityLanded, Died, Outcome};

use super::terrain::TerrainAssets;
use super::terrain_material::{BloodParams, TerrainMaterial};

pub struct BloodPlugin;

impl Plugin for BloodPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, create_mask)
            .add_systems(Update, (bind_mask, stain_on_hit, pool_on_death));
    }
}

/// Mask resolution on each side.
const TEXELS: u32 = 1024;

/// How many metres of world the mask covers on each side.
const EXTENT: f32 = 128.0;

/// Where the covered square starts, in world metres, so it is centred on the origin.
const ORIGIN: Vec2 = Vec2::splat(-EXTENT * 0.5);

/// Coverage a texel gains at the centre of one hit's brush.
const HIT_WEIGHT: f32 = 0.85;

/// Smallest and largest radius a hit paints, in metres.
const HIT_RADIUS: (f32, f32) = (0.35, 1.1);

/// Damage that paints [`HIT_RADIUS`]'s upper end.
const HEAVY_HIT: f32 = 45.0;

/// Radius of the pool a death leaves, in metres.
const POOL_RADIUS: f32 = 1.5;

/// Coverage a death pool lays down at its centre.
const POOL_WEIGHT: f32 = 1.0;

/// The coverage mask and the patch of world it covers.
#[derive(Resource, Debug)]
pub struct BloodMask {
    pub handle: Handle<Image>,
    pub origin: Vec2,
    pub extent: f32,
}

impl BloodMask {
    /// Where a world position falls in the mask, in texels, or `None` when it is off the patch.
    fn texel_of(&self, world: Vec2) -> Option<Vec2> {
        let local = (world - self.origin) / self.extent;
        (local.cmpge(Vec2::ZERO).all() && local.cmple(Vec2::ONE).all())
            .then(|| local * TEXELS as f32)
    }
}

/// Texels per metre, which the brush works in.
fn texels_per_metre() -> f32 {
    TEXELS as f32 / EXTENT
}

fn create_mask(mut images: ResMut<Assets<Image>>, mut commands: Commands) {
    let mut image = Image::new_fill(
        Extent3d {
            width: TEXELS,
            height: TEXELS,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0],
        TextureFormat::R8Unorm,
        RenderAssetUsages::MAIN_WORLD | RenderAssetUsages::RENDER_WORLD,
    );
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: ImageAddressMode::ClampToEdge,
        address_mode_v: ImageAddressMode::ClampToEdge,
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        ..default()
    });
    commands.insert_resource(BloodMask {
        handle: images.add(image),
        origin: ORIGIN,
        extent: EXTENT,
    });
}

/// Hands the mask to the ground material once, after the terrain has built one.
fn bind_mask(
    mask: Res<BloodMask>,
    assets: Option<Res<TerrainAssets>>,
    mut materials: ResMut<Assets<TerrainMaterial>>,
    mut bound: Local<bool>,
) {
    if *bound {
        return;
    }
    let Some(assets) = assets else {
        return;
    };
    let Some(mut material) = materials.get_mut(&assets.material) else {
        return;
    };
    material.extension.blood = mask.handle.clone();
    material.extension.blood_params = BloodParams {
        origin: mask.origin,
        extent: mask.extent,
        ..default()
    };
    *bound = true;
}

/// Adds one brush of coverage, saturating, so overlapping stains grow into each other.
fn paint(image: &mut Image, centre: Vec2, radius_texels: f32, weight: f32) {
    let Some(data) = image.data.as_mut() else {
        return;
    };
    let radius = radius_texels.max(1.0);
    let low = (centre - radius).floor().max(Vec2::ZERO).as_ivec2();
    let high = (centre + radius)
        .ceil()
        .min(Vec2::splat(TEXELS as f32 - 1.0))
        .as_ivec2();

    for y in low.y..=high.y {
        for x in low.x..=high.x {
            let offset = Vec2::new(x as f32, y as f32) + 0.5 - centre;
            let falloff = 1.0 - (offset.length_squared() / (radius * radius)).min(1.0);
            if falloff <= 0.0 {
                continue;
            }
            let added = weight * falloff * falloff;
            let index = (y as u32 * TEXELS + x as u32) as usize;
            let was = data[index] as f32 / 255.0;
            data[index] = ((was + added).min(1.0) * 255.0 + 0.5) as u8;
        }
    }
}

fn stain_on_hit(
    mut landings: MessageReader<AbilityLanded>,
    bodies: Query<&GlobalTransform>,
    mask: Res<BloodMask>,
    mut images: ResMut<Assets<Image>>,
) {
    for landing in landings.read() {
        let Outcome::Hit { damage, .. } = landing.outcome else {
            continue;
        };
        if damage <= 0 {
            continue;
        }
        let Ok(body) = bodies.get(landing.target) else {
            continue;
        };
        let ground = body.translation().xz();
        let Some(centre) = mask.texel_of(ground) else {
            continue;
        };
        let Some(mut image) = images.get_mut(&mask.handle) else {
            continue;
        };
        let share = (damage as f32 / HEAVY_HIT).clamp(0.0, 1.0);
        let radius = HIT_RADIUS.0 + (HIT_RADIUS.1 - HIT_RADIUS.0) * share;
        paint(&mut image, centre, radius * texels_per_metre(), HIT_WEIGHT);
    }
}

fn pool_on_death(
    mut deaths: MessageReader<Died>,
    bodies: Query<&GlobalTransform>,
    mask: Res<BloodMask>,
    mut images: ResMut<Assets<Image>>,
) {
    for death in deaths.read() {
        let Ok(body) = bodies.get(death.entity) else {
            continue;
        };
        let Some(centre) = mask.texel_of(body.translation().xz()) else {
            continue;
        };
        let Some(mut image) = images.get_mut(&mask.handle) else {
            continue;
        };
        paint(
            &mut image,
            centre,
            POOL_RADIUS * texels_per_metre(),
            POOL_WEIGHT,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mask() -> BloodMask {
        BloodMask {
            handle: Handle::default(),
            origin: ORIGIN,
            extent: EXTENT,
        }
    }

    fn blank() -> Image {
        Image::new_fill(
            Extent3d {
                width: TEXELS,
                height: TEXELS,
                depth_or_array_layers: 1,
            },
            TextureDimension::D2,
            &[0],
            TextureFormat::R8Unorm,
            RenderAssetUsages::MAIN_WORLD,
        )
    }

    fn at(image: &Image, texel: Vec2) -> u8 {
        let index = (texel.y as u32 * TEXELS + texel.x as u32) as usize;
        image.data.as_ref().unwrap()[index]
    }

    #[test]
    fn the_patch_is_centred_on_the_world_origin() {
        let mask = mask();
        let middle = mask.texel_of(Vec2::ZERO).unwrap();
        assert_eq!(middle, Vec2::splat(TEXELS as f32 * 0.5));
    }

    #[test]
    fn ground_outside_the_patch_takes_no_paint() {
        let mask = mask();
        assert!(mask.texel_of(Vec2::splat(EXTENT)).is_none());
        assert!(mask.texel_of(Vec2::splat(-EXTENT)).is_none());
    }

    #[test]
    fn a_brush_is_darkest_at_its_centre_and_fades_out() {
        let mut image = blank();
        let centre = Vec2::splat(TEXELS as f32 * 0.5);
        paint(&mut image, centre, 16.0, 1.0);

        let middle = at(&image, centre);
        let halfway = at(&image, centre + Vec2::new(8.0, 0.0));
        let outside = at(&image, centre + Vec2::new(20.0, 0.0));

        assert!(middle > halfway, "{middle} should exceed {halfway}");
        assert!(halfway > outside, "{halfway} should exceed {outside}");
        assert_eq!(outside, 0);
    }

    #[test]
    fn two_stains_on_the_same_ground_merge_rather_than_replace() {
        let centre = Vec2::splat(TEXELS as f32 * 0.5);

        let mut once = blank();
        paint(&mut once, centre, 16.0, 0.4);

        let mut twice = blank();
        paint(&mut twice, centre, 16.0, 0.4);
        paint(&mut twice, centre, 16.0, 0.4);

        assert!(at(&twice, centre) > at(&once, centre));
    }

    #[test]
    fn coverage_never_wraps_past_full() {
        let mut image = blank();
        let centre = Vec2::splat(TEXELS as f32 * 0.5);
        for _ in 0..12 {
            paint(&mut image, centre, 16.0, 1.0);
        }
        assert_eq!(at(&image, centre), 255);
    }
}
