//! Unified day/night tinting for all generic sprite creatures.

use bevy::prelude::*;

use super::super::sprite_material::SpriteAtlasMaterial;
use super::types::{SpriteAtlasPool, SpriteCreatureTypes, TintProfile};
use crate::game::weather::{DayCycle, sun_params};

/// Single system that tints all sprite creature materials based on time of day.
/// Replaces per-creature `tint_xyz_for_daynight` functions.
pub fn tint_sprite_creatures(
    day: Res<DayCycle>,
    atlas_pool: Res<SpriteAtlasPool>,
    types: Res<SpriteCreatureTypes>,
    mut atlas_materials: ResMut<Assets<SpriteAtlasMaterial>>,
) {
    let params = sun_params(day.hour);
    let h = params.sun_height;

    let r = 0.18 + h * 0.92;
    let g = 0.20 + h * 0.90;
    let b = 0.28 + h * 0.75;

    for entry in &atlas_pool.entries {
        let tint_profile = types
            .types
            .iter()
            .find(|t| t.npc_ref == entry.type_key)
            .map(|t| t.tint)
            .unwrap_or(TintProfile::Standard);

        let alpha = match tint_profile {
            TintProfile::Standard => 1.0,
            TintProfile::Ghost => {
                if h < 0.01 {
                    1.0
                } else {
                    0.35 + (1.0 - h) * 0.15
                }
            }
        };

        if let Some(mat) = atlas_materials.get_mut(&entry.material) {
            mat.tint = LinearRgba::new(r, g, b, alpha);
        }
    }
}
