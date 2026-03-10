use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::light::{
    CascadeShadowConfigBuilder, Cascades, DirectionalLightShadowMap, SimulationLightSystems,
};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use bevy_rapier3d::prelude::*;

use super::camera::IsometricCamera;
use super::player::Player;
use super::scene_objects::{
    FlowerArchetype, HoverOutline, Interactable, InteractableKind, on_pointer_out, on_pointer_over,
};
use super::terrain::{CHUNK_SIZE, TerrainMap, hash2d};
use super::water::{WATER_LEVEL, WaterMaterial};

pub const TILE_SIZE: f32 = 1.0;
/// Thin cap on top of each column — bright surface that contrasts with darker body.
const CAP_HEIGHT: f32 = 0.06;
/// Per-side inset on the cap where a cliff edge faces a lower neighbor.
const EDGE_INSET: f32 = 0.10;

// ---------------------------------------------------------------------------
// Vertex color constants (replaces per-tile materials)
// ---------------------------------------------------------------------------

/// Height-band base colors: grass, dirt, stone, snow
const BAND_COLORS: [(f32, f32, f32); 4] = [
    (0.3, 0.6, 0.2),
    (0.55, 0.4, 0.25),
    (0.5, 0.5, 0.5),
    (0.9, 0.9, 0.95),
];

/// Body darkness factor (45% darker than cap).
const BODY_DARKEN: f32 = 0.55;

/// 12 noise-varied grass cap shades.
const GRASS_SHADES: [(f32, f32, f32); 12] = [
    (0.22, 0.50, 0.15),
    (0.28, 0.55, 0.18),
    (0.30, 0.60, 0.20),
    (0.34, 0.62, 0.22),
    (0.38, 0.65, 0.22),
    (0.42, 0.58, 0.20),
    (0.35, 0.52, 0.18),
    (0.45, 0.55, 0.25),
    (0.26, 0.48, 0.16),
    (0.40, 0.60, 0.18),
    (0.32, 0.58, 0.24),
    (0.48, 0.52, 0.22),
];

/// Convert a single sRGB channel to linear (matches Bevy's Color::srgb internal conversion).
fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn body_vertex_color(band: usize) -> [f32; 4] {
    let (r, g, b) = BAND_COLORS[band];
    [
        srgb_to_linear(r * BODY_DARKEN),
        srgb_to_linear(g * BODY_DARKEN),
        srgb_to_linear(b * BODY_DARKEN),
        1.0,
    ]
}

fn cap_vertex_color(band: usize, tx: i32, tz: i32) -> [f32; 4] {
    if band == 0 {
        let idx = (hash2d(tx + 1337, tz) * 12.0) as usize % 12;
        let (r, g, b) = GRASS_SHADES[idx];
        [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
    } else {
        let (r, g, b) = BAND_COLORS[band];
        let d: f32 = 0.04;
        let sign = if (tx + tz) & 1 == 0 { 1.0 } else { -1.0 };
        [
            srgb_to_linear(r + d * sign),
            srgb_to_linear(g + d * sign),
            srgb_to_linear(b + d * sign),
            1.0,
        ]
    }
}

// ---------------------------------------------------------------------------
// Vegetation vertex color constants
// ---------------------------------------------------------------------------

/// Snap vegetation jitter to the pixel grid (1/PIXEL_DENSITY = 1/32 world units).
/// Matches the camera snap step so edges never land between pixels.
const VEG_SNAP: f32 = 1.0 / 32.0;

/// Grass type colors (sRGB, converted to linear at use).
const VEG_GRASS_TUFT: (f32, f32, f32) = (0.25, 0.55, 0.15);
const VEG_GRASS_TALL: (f32, f32, f32) = (0.20, 0.50, 0.12);
const VEG_GRASS_BLADE: (f32, f32, f32) = (0.22, 0.48, 0.14);
const VEG_FLOWER_COLORS: [(f32, f32, f32); 4] = [
    (0.95, 0.95, 0.90),
    (0.90, 0.55, 0.65),
    (0.85, 0.35, 0.45),
    (0.95, 0.85, 0.30),
];

/// 4-shade bark palette (sRGB): [dark, mid_dark, mid_light, highlight].
#[derive(Clone, Copy)]
struct BarkPalette {
    dark: (f32, f32, f32),
    mid_dark: (f32, f32, f32),
    mid_light: (f32, f32, f32),
    highlight: (f32, f32, f32),
}

/// Per-preset bark palettes — each tree species has distinct bark color.
/// Wider contrast range (dark↔highlight) so shader furrow breakup creates
/// visible furrow/ridge texture within each toon band.
const BARK_PALETTES: [BarkPalette; 6] = [
    // 0: Conifer — dark reddish-brown, deep furrowed
    BarkPalette {
        dark: (0.16, 0.08, 0.03),
        mid_dark: (0.28, 0.16, 0.08),
        mid_light: (0.40, 0.24, 0.14),
        highlight: (0.52, 0.34, 0.20),
    },
    // 1: Tall — grey bark, chalky
    BarkPalette {
        dark: (0.22, 0.20, 0.17),
        mid_dark: (0.35, 0.33, 0.29),
        mid_light: (0.48, 0.46, 0.42),
        highlight: (0.62, 0.59, 0.54),
    },
    // 2: Bushy — rough warm brown
    BarkPalette {
        dark: (0.20, 0.12, 0.04),
        mid_dark: (0.34, 0.22, 0.10),
        mid_light: (0.46, 0.32, 0.18),
        highlight: (0.58, 0.44, 0.26),
    },
    // 3: Oak — dark furrowed brown
    BarkPalette {
        dark: (0.14, 0.09, 0.03),
        mid_dark: (0.26, 0.18, 0.08),
        mid_light: (0.38, 0.26, 0.15),
        highlight: (0.50, 0.36, 0.22),
    },
    // 4: Round — smooth lighter bark
    BarkPalette {
        dark: (0.26, 0.22, 0.15),
        mid_dark: (0.38, 0.34, 0.25),
        mid_light: (0.52, 0.46, 0.36),
        highlight: (0.66, 0.59, 0.47),
    },
    // 5: Willow — light grey-green bark
    BarkPalette {
        dark: (0.24, 0.24, 0.17),
        mid_dark: (0.36, 0.36, 0.27),
        mid_light: (0.50, 0.50, 0.40),
        highlight: (0.62, 0.62, 0.52),
    },
];

/// Per-preset canopy base colors (sRGB).
const PRESET_CANOPY_COLORS: [(f32, f32, f32); 6] = [
    (0.18, 0.38, 0.22), // Conifer: dark blue-green needles
    (0.30, 0.56, 0.20), // Tall: mid green
    (0.38, 0.58, 0.18), // Bushy: warm yellow-green
    (0.26, 0.52, 0.20), // Oak: rich deep green
    (0.36, 0.62, 0.26), // Round: bright green
    (0.38, 0.56, 0.16), // Willow: yellow-green, airy
];

/// Canopy volume shape for scattered leaf card distribution.
#[derive(Clone, Copy)]
enum CanopyShape {
    Cone {
        radius: f32,
        height: f32,
        center_y_offset: f32,
    },
    Ellipsoid {
        rx: f32,
        ry: f32,
        rz: f32,
        center_y_offset: f32,
    },
}

#[derive(Clone, Copy)]
struct TreePreset {
    trunk_h: f32,
    trunk_r: f32,
    canopy: CanopyShape,
}

const TREE_PRESETS: [TreePreset; 6] = [
    // 0: Conifer — tall, narrow cone, dark blue-green
    TreePreset {
        trunk_h: 1.60,
        trunk_r: 0.10,
        canopy: CanopyShape::Cone {
            radius: 0.75,
            height: 2.2,
            center_y_offset: -0.15,
        },
    },
    // 1: Tall — tall trunk, upright moderate crown
    TreePreset {
        trunk_h: 1.50,
        trunk_r: 0.12,
        canopy: CanopyShape::Ellipsoid {
            rx: 0.90,
            ry: 1.05,
            rz: 0.85,
            center_y_offset: 0.40,
        },
    },
    // 2: Bushy — short trunk, widest crown
    TreePreset {
        trunk_h: 1.10,
        trunk_r: 0.14,
        canopy: CanopyShape::Ellipsoid {
            rx: 1.20,
            ry: 0.75,
            rz: 1.25,
            center_y_offset: 0.30,
        },
    },
    // 3: Oak — thick trunk, broad heavy crown
    TreePreset {
        trunk_h: 1.30,
        trunk_r: 0.16,
        canopy: CanopyShape::Ellipsoid {
            rx: 1.10,
            ry: 0.90,
            rz: 1.00,
            center_y_offset: 0.40,
        },
    },
    // 4: Round — medium trunk, compact ball
    TreePreset {
        trunk_h: 1.05,
        trunk_r: 0.12,
        canopy: CanopyShape::Ellipsoid {
            rx: 0.85,
            ry: 0.80,
            rz: 0.85,
            center_y_offset: 0.35,
        },
    },
    // 5: Willow — tall trunk, wide droopy crown
    TreePreset {
        trunk_h: 1.40,
        trunk_r: 0.13,
        canopy: CanopyShape::Ellipsoid {
            rx: 1.15,
            ry: 0.65, // shorter vertically — droopy spread
            rz: 1.10,
            center_y_offset: 0.30,
        },
    },
];

fn srgb_color(r: f32, g: f32, b: f32) -> [f32; 4] {
    [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
}

fn lerp3(a: (f32, f32, f32), b: (f32, f32, f32), t: f32) -> (f32, f32, f32) {
    (
        a.0 + (b.0 - a.0) * t,
        a.1 + (b.1 - a.1) * t,
        a.2 + (b.2 - a.2) * t,
    )
}

/// Per-face bark colors based on vertical position along trunk.
/// `y_frac`: 0.0 = base, 1.0 = top.
/// Returns `[top_cap, bottom, lit, shadow, semi_shadow, semi_lit]`.
/// Wide contrast: lit uses highlight directly, shadow uses dark directly.
/// No lerp-blending that compresses the range in linear space.
fn bark_face_colors_with(y_frac: f32, bp: &BarkPalette) -> [[f32; 4]; 6] {
    let root = if y_frac < 0.15 { 0.82 } else { 1.0 };
    let apply = |c: (f32, f32, f32)| srgb_color(c.0 * root, c.1 * root, c.2 * root);

    // Maximum contrast: lit gets highlight, shadow gets dark.
    // Only slight y_frac influence to keep some vertical variation.
    let lit = lerp3(bp.mid_light, bp.highlight, 0.5 + y_frac * 0.5);
    let shadow = lerp3(bp.dark, bp.mid_dark, y_frac * 0.3);
    let semi_l = bp.mid_light;
    let semi_s = bp.mid_dark;
    let top = bp.highlight;

    [
        apply(top),
        apply(bp.dark),
        apply(lit),
        apply(shadow),
        apply(semi_s),
        apply(semi_l),
    ]
}

// ---------------------------------------------------------------------------
// Combined mesh helpers
// ---------------------------------------------------------------------------

/// Push exposed faces of a terrain body column. Skips:
/// - Bottom (-Y): underground, never visible from isometric camera
/// - Side faces hidden by equal/taller neighbor columns (eliminates z-fighting)
/// Top (+Y) is kept because the cap has edge insets at cliffs that expose it.
fn push_terrain_body(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    color: [f32; 4],
    this_body_h: f32,
    neighbor_body_h: [f32; 4], // [+x, -x, +z, -z]
) {
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    // +Y (top): always kept — visible through cap edge insets at cliffs.
    // Cap is offset +0.001 upward to prevent z-fighting with this face.
    {
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [cx - hx, cy + hy, cz - hz],
            [cx + hx, cy + hy, cz - hz],
            [cx + hx, cy + hy, cz + hz],
            [cx - hx, cy + hy, cz + hz],
        ]);
        nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
        col.extend(std::iter::repeat(color).take(4));
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    // +X face: only if neighbor is shorter
    if neighbor_body_h[0] < this_body_h {
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [cx + hx, cy - hy, cz - hz],
            [cx + hx, cy - hy, cz + hz],
            [cx + hx, cy + hy, cz + hz],
            [cx + hx, cy + hy, cz - hz],
        ]);
        nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);
        col.extend(std::iter::repeat(color).take(4));
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    // -X face
    if neighbor_body_h[1] < this_body_h {
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [cx - hx, cy - hy, cz + hz],
            [cx - hx, cy - hy, cz - hz],
            [cx - hx, cy + hy, cz - hz],
            [cx - hx, cy + hy, cz + hz],
        ]);
        nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);
        col.extend(std::iter::repeat(color).take(4));
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    // +Z face
    if neighbor_body_h[2] < this_body_h {
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [cx + hx, cy - hy, cz + hz],
            [cx - hx, cy - hy, cz + hz],
            [cx - hx, cy + hy, cz + hz],
            [cx + hx, cy + hy, cz + hz],
        ]);
        nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);
        col.extend(std::iter::repeat(color).take(4));
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    // -Z face
    if neighbor_body_h[3] < this_body_h {
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [cx - hx, cy - hy, cz - hz],
            [cx + hx, cy - hy, cz - hz],
            [cx + hx, cy + hy, cz - hz],
            [cx - hx, cy + hy, cz - hz],
        ]);
        nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);
        col.extend(std::iter::repeat(color).take(4));
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }
}

/// Append one axis-aligned cuboid (24 vertices, 36 indices) to shared buffers.
fn push_cuboid(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    // +Y (top)
    pos.extend_from_slice(&[
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);

    // -Y (bottom)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);

    // +X (right)
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);

    // -X (left)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);

    // +Z (front)
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);

    // -Z (back)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);

    col.extend(std::iter::repeat(color).take(24));

    // 6 faces × 2 triangles (CCW winding for Bevy front-faces)
    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Two-section 8-sided trunk: flared trapezoid base + straight upper section.
///
/// ```text
///    |  |       ← top_r (narrow)
///    |  |       ← upper section (70% of height)
///    |  |
///   /    \      ← mid_r at flare point
///  /      \     ← flared base section (30% of height)
/// /________\    ← base_r (wide)
/// ```
///
/// Per-face bark ridges (alternating brightness) + radial wobble for organic feel.
/// Buttress root quads extend from the flare outward.
fn push_tapered_trunk(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    base_y: f32,
    height: f32,
    base_r: f32,
    top_r: f32,
    root_count: i32,
    seed: f32,
    bp: &BarkPalette,
) {
    const SIDES: usize = 6;
    let tau = std::f32::consts::TAU;

    // Flare split: bottom 30% is the wide trapezoid base
    let flare_frac = 0.30;
    let flare_h = height * flare_frac;
    // Mid radius where flare meets upper trunk — much narrower than base
    let mid_r = top_r * 1.15; // just slightly wider than top

    // Stronger wobble for rougher silhouette (organic, not geometric)
    let wobble = |i: usize, section: u8| -> f32 {
        let s = seed * 11.3 + i as f32 * 2.7 + section as f32 * 5.0;
        1.0 + s.sin() * 0.15
    };

    // Pure brightness scale — NO hue shift. All faces stay the same bark hue,
    // just lighter or darker. This makes pixel art bark look like wood.
    let brighten = |c: [f32; 4], factor: f32| -> [f32; 4] {
        [
            (c[0] * factor).min(1.0),
            (c[1] * factor).min(1.0),
            (c[2] * factor).min(1.0),
            1.0,
        ]
    };

    // Per-face brightness: 3 levels cycling around the trunk.
    // Creates clear lit/mid/shadow pattern, same hue throughout.
    let face_brightness = |i: usize| -> f32 {
        let shifted = (i + ((seed * 4.0) as usize)) % SIDES;
        match shifted % 3 {
            0 => 1.25, // lit face
            1 => 1.0,  // mid face
            _ => 0.75, // shadow face
        }
    };

    // Emit a 6-sided prism section. Each face FLAT-SHADED (all 4 verts same color).
    // Same bark hue, brightness-only variation between faces.
    let mut emit_section = |y_bot: f32,
                            y_top: f32,
                            r_bot: f32,
                            r_top: f32,
                            bark_frac: f32,
                            wobble_bot: u8,
                            wobble_top: u8| {
        // Single base color for this band (mid-tone from palette)
        let base_col = bark_face_colors_with(bark_frac, bp)[4]; // semi-shadow = mid

        for i in 0..SIDES {
            let a0 = (i as f32) / (SIDES as f32) * tau;
            let a1 = ((i + 1) as f32) / (SIDES as f32) * tau;
            let (c0, s0) = (a0.cos(), a0.sin());
            let (c1, s1) = (a1.cos(), a1.sin());

            let wb0 = wobble(i, wobble_bot);
            let wb1 = wobble(i + 1, wobble_bot);
            let wt0 = wobble(i, wobble_top);
            let wt1 = wobble(i + 1, wobble_top);

            // Same hue, different brightness per face + small random jitter
            let fb = face_brightness(i);
            let jitter = 1.0 + ((seed * 5.7 + i as f32 * 2.3).sin()) * 0.05;
            let fc = brighten(base_col, fb * jitter);

            let b = pos.len() as u32;
            pos.extend_from_slice(&[
                [c0 * r_bot * wb0, y_bot, s0 * r_bot * wb0],
                [c1 * r_bot * wb1, y_bot, s1 * r_bot * wb1],
                [c1 * r_top * wt1, y_top, s1 * r_top * wt1],
                [c0 * r_top * wt0, y_top, s0 * r_top * wt0],
            ]);
            let nx = (c0 + c1) * 0.5;
            let nz = (s0 + s1) * 0.5;
            let len = (nx * nx + nz * nz).sqrt().max(0.001);
            nor.extend_from_slice(&[[nx / len, 0.0, nz / len]; 4]);
            col.extend_from_slice(&[fc, fc, fc, fc]);
            idx.extend_from_slice(&[b, b + 2, b + 1, b, b + 3, b + 2]);
        }
    };

    // 3 vertical sections with slightly different bark_frac for subtle banding
    emit_section(base_y, base_y + flare_h, base_r, mid_r, 0.15, 0, 1);
    let mid_h = base_y + flare_h;
    let upper_h = height - flare_h;
    let r_mid2 = mid_r + (top_r - mid_r) * 0.5;
    emit_section(mid_h, mid_h + upper_h * 0.5, mid_r, r_mid2, 0.40, 1, 2);
    emit_section(
        mid_h + upper_h * 0.5,
        base_y + height,
        r_mid2,
        top_r,
        0.30,
        2,
        3,
    );

    // Top cap
    let cap_base = pos.len() as u32;
    let top_col = bark_face_colors_with(0.9, bp)[0];
    for i in 0..SIDES {
        let a = (i as f32) / (SIDES as f32) * tau;
        let w = wobble(i, 3);
        pos.push([a.cos() * top_r * w, base_y + height, a.sin() * top_r * w]);
        nor.push([0.0, 1.0, 0.0]);
        col.push(top_col);
    }
    for i in 1..(SIDES as u32 - 1) {
        idx.extend_from_slice(&[cap_base, cap_base + i, cap_base + i + 1]);
    }

    // Buttress roots: quad ridges from flare outward, tapering to ground
    let root_phase = seed * 3.7;
    for ri in 0..root_count {
        let angle = root_phase
            + (ri as f32 / root_count as f32) * tau
            + ((seed * 7.3 + ri as f32 * 2.1).sin()) * 0.50;
        let (rc, rs) = (angle.cos(), angle.sin());
        let fin_len = base_r * (1.5 + ((seed * 5.1 + ri as f32 * 3.3).sin()) * 0.5);
        let fin_h = flare_h * (0.7 + ((seed * 4.7 + ri as f32 * 1.9).cos()) * 0.2); // root height tied to flare
        let fin_thick_base = base_r * 0.30;
        let fin_thick_tip = base_r * 0.06;

        let root_dark = bark_face_colors_with(0.02, bp)[2];
        let root_light = bark_face_colors_with(0.10, bp)[2];
        let perp_x = -rs;
        let perp_z = rc;
        // Trunk radius at root attachment height — interpolate along the flare taper
        // so root connects flush to the trunk surface, not floating at base_r
        let flare_t = (fin_h / flare_h).min(1.0);
        let attach_r = base_r + (mid_r - base_r) * flare_t;
        let b = pos.len() as u32;
        pos.extend_from_slice(&[
            [
                rc * attach_r + perp_x * fin_thick_base,
                base_y + fin_h,
                rs * attach_r + perp_z * fin_thick_base,
            ],
            [
                rc * attach_r - perp_x * fin_thick_base,
                base_y + fin_h,
                rs * attach_r - perp_z * fin_thick_base,
            ],
            [
                rc * fin_len - perp_x * fin_thick_tip,
                base_y,
                rs * fin_len - perp_z * fin_thick_tip,
            ],
            [
                rc * fin_len + perp_x * fin_thick_tip,
                base_y,
                rs * fin_len + perp_z * fin_thick_tip,
            ],
        ]);
        nor.extend_from_slice(&[[0.0, 0.5, 0.0]; 4]);
        col.extend_from_slice(&[root_light, root_light, root_dark, root_dark]);
        idx.extend_from_slice(&[b, b + 1, b + 2, b + 1, b + 3, b + 2]);
        idx.extend_from_slice(&[b, b + 2, b + 1, b + 1, b + 2, b + 3]);
    }
}

/// Sheared cuboid for branch stubs — bottom vertices anchored, top shifted by `(sx, sz)`.
fn push_branch_stub(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    base_center: Vec3,
    half: Vec3,
    shear: (f32, f32),
    face_colors: [[f32; 4]; 6],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (base_center.x, base_center.y, base_center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);
    let (sx, sz) = shear;

    // +Y (top, sheared)
    pos.extend_from_slice(&[
        [cx - hx + sx, cy + hy, cz - hz + sz],
        [cx + hx + sx, cy + hy, cz - hz + sz],
        [cx + hx + sx, cy + hy, cz + hz + sz],
        [cx - hx + sx, cy + hy, cz + hz + sz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[0]).take(4));

    // -Y (bottom, anchored)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[1]).take(4));

    // +X (bottom→top sheared)
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx + sx, cy + hy, cz + hz + sz],
        [cx + hx + sx, cy + hy, cz - hz + sz],
    ]);
    nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[2]).take(4));

    // -X
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx + sx, cy + hy, cz - hz + sz],
        [cx - hx + sx, cy + hy, cz + hz + sz],
    ]);
    nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[3]).take(4));

    // +Z
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx + sx, cy + hy, cz + hz + sz],
        [cx + hx + sx, cy + hy, cz + hz + sz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);
    col.extend(std::iter::repeat(face_colors[4]).take(4));

    // -Z
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx + sx, cy + hy, cz - hz + sz],
        [cx - hx + sx, cy + hy, cz - hz + sz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);
    col.extend(std::iter::repeat(face_colors[5]).take(4));

    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Append a crossed-plane (2 quads at 90°) with rotation and scale baked into vertices.
fn push_crossed_planes(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    origin: Vec3,
    hw: f32,
    h: f32,
    scale: f32,
    rot_y: f32,
    color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (sin_r, cos_r) = rot_y.sin_cos();
    let s = scale;

    let xform = |lx: f32, ly: f32, lz: f32| -> [f32; 3] {
        let sx = lx * s;
        let sz = lz * s;
        [
            origin.x + sx * cos_r - sz * sin_r,
            origin.y + ly * s,
            origin.z + sx * sin_r + sz * cos_r,
        ]
    };

    // Quad 1: along local X
    pos.extend_from_slice(&[
        xform(-hw, 0.0, 0.0),
        xform(hw, 0.0, 0.0),
        xform(hw, h, 0.0),
        xform(-hw, h, 0.0),
    ]);
    let n1 = [sin_r, 0.0, cos_r];
    nor.extend_from_slice(&[n1; 4]);

    // Quad 2: along local Z
    pos.extend_from_slice(&[
        xform(0.0, 0.0, -hw),
        xform(0.0, 0.0, hw),
        xform(0.0, h, hw),
        xform(0.0, h, -hw),
    ]);
    let n2 = [cos_r, 0.0, -sin_r];
    nor.extend_from_slice(&[n2; 4]);

    col.extend(std::iter::repeat(color).take(8));

    for q in 0..2u32 {
        let f = base + q * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Append a single tapered blade (1 quad) with rotation and scale baked into vertices.
fn push_blade(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    origin: Vec3,
    hw: f32,
    h: f32,
    scale: f32,
    rot_y: f32,
    color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (sin_r, cos_r) = rot_y.sin_cos();
    let s = scale;
    let taper = 0.6;

    let xform = |lx: f32, ly: f32, lz: f32| -> [f32; 3] {
        let sx = lx * s;
        let sz = lz * s;
        [
            origin.x + sx * cos_r - sz * sin_r,
            origin.y + ly * s,
            origin.z + sx * sin_r + sz * cos_r,
        ]
    };

    pos.extend_from_slice(&[
        xform(-hw, 0.0, 0.0),
        xform(hw, 0.0, 0.0),
        xform(hw * taper, h, 0.0),
        xform(-hw * taper, h, 0.0),
    ]);
    let n = [sin_r, 0.0, cos_r];
    nor.extend_from_slice(&[n; 4]);
    col.extend(std::iter::repeat(color).take(4));

    let f = base;
    idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
}

/// Assemble a Bevy Mesh from the combined vertex buffers.
fn build_chunk_mesh(
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    indices: Vec<u32>,
) -> Mesh {
    let uv_count = positions.len();
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, vec![[0.0f32, 0.0]; uv_count])
    .with_inserted_indices(Indices::U32(indices))
}

// ---------------------------------------------------------------------------
// Procedural pixel flora: mask-based sprite generation
// ---------------------------------------------------------------------------

/// Pixel roles in a flower mask.
/// 0 = transparent, 1 = stem, 2 = petal, 3 = center/pistil
const FLORA_TRANSPARENT: u8 = 0;
const FLORA_STEM: u8 = 1;
const FLORA_PETAL: u8 = 2;
const FLORA_CENTER: u8 = 3;

/// 16×16 species masks (row 0 = top of texture = top of flower).
/// Each mask defines the silhouette + part mapping for one species.
#[rustfmt::skip]
const MASK_POPPY: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,2,3,3,2,2,2,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,3,2,2,0,0,0,0],
    [0,0,0,0,2,2,2,3,3,2,2,2,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

#[rustfmt::skip]
const MASK_DAISY: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,2,2,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

#[rustfmt::skip]
const MASK_LAVENDER: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,3,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,3,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,3,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

#[rustfmt::skip]
const MASK_BELL: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,2,2,2,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,0,0,0,2,2,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

#[rustfmt::skip]
const MASK_WILDFLOWER: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,0,0,0,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,2,0,2,2,2,0,0,0,0,0],
    [0,0,0,0,0,2,3,0,3,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,2,2,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,2,3,2,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,1,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

/// Sunflower: tall flower with large round head, thick stem
#[rustfmt::skip]
const MASK_SUNFLOWER: [[u8; 16]; 16] = [
    [0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,2,2,2,2,2,2,0,0,0,0],
    [0,0,0,2,2,2,3,3,3,3,2,2,2,0,0,0],
    [0,0,0,2,2,3,3,3,3,3,3,2,2,0,0,0],
    [0,0,0,2,2,3,3,3,3,3,3,2,2,0,0,0],
    [0,0,0,2,2,2,3,3,3,3,2,2,2,0,0,0],
    [0,0,0,0,2,2,2,2,2,2,2,2,0,0,0,0],
    [0,0,0,0,0,2,2,1,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

/// Rose: classic rose shape — tight spiral petals, thorny stem
#[rustfmt::skip]
const MASK_ROSE: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,2,2,0,0,0,0,0],
    [0,0,0,0,2,3,3,3,3,3,2,0,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,2,2,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

/// Cornflower: spiky star-shaped petals on thin stem
#[rustfmt::skip]
const MASK_CORNFLOWER: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,0,2,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,2,2,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,0,2,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

/// Allium: round pom-pom head on long thin stem
#[rustfmt::skip]
const MASK_ALLIUM: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,0,0,0,0,0,0],
    [0,0,0,0,2,2,3,2,3,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,2,3,2,2,2,0,0,0,0,0],
    [0,0,0,0,0,2,3,2,3,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

/// Blue Orchid: three petals fanning outward on curved stem
#[rustfmt::skip]
const MASK_BLUE_ORCHID: [[u8; 16]; 16] = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,3,2,2,0,0,0,0,0],
    [0,0,0,0,2,2,3,3,3,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,2,3,2,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
];

const NUM_FLORA_SPECIES: usize = 10;

const FLORA_MASKS: [&[[u8; 16]; 16]; NUM_FLORA_SPECIES] = [
    &MASK_POPPY,
    &MASK_DAISY,
    &MASK_LAVENDER,
    &MASK_BELL,
    &MASK_WILDFLOWER,
    &MASK_SUNFLOWER,
    &MASK_ROSE,
    &MASK_CORNFLOWER,
    &MASK_ALLIUM,
    &MASK_BLUE_ORCHID,
];

/// Flora palette: (stem_rgb, petal_rgb, center_rgb) in sRGB 0–255.
struct FloraPalette {
    stem: [u8; 3],
    petal: [u8; 3],
    center: [u8; 3],
}

/// One palette per archetype — order matches FLORA_MASKS / FlowerArchetype.
const FLORA_PALETTES: [FloraPalette; NUM_FLORA_SPECIES] = [
    FloraPalette {
        stem: [45, 100, 30],
        petal: [210, 55, 65],
        center: [60, 45, 20],
    }, // 0 Poppy/Tulip — red
    FloraPalette {
        stem: [50, 110, 35],
        petal: [240, 240, 220],
        center: [220, 190, 50],
    }, // 1 Daisy — white
    FloraPalette {
        stem: [45, 105, 30],
        petal: [140, 100, 180],
        center: [180, 140, 210],
    }, // 2 Lavender — purple
    FloraPalette {
        stem: [40, 100, 28],
        petal: [80, 140, 210],
        center: [50, 100, 160],
    }, // 3 Bell — blue
    FloraPalette {
        stem: [50, 105, 35],
        petal: [240, 200, 50],
        center: [200, 140, 30],
    }, // 4 Wildflower — gold
    FloraPalette {
        stem: [55, 120, 40],
        petal: [255, 210, 30],
        center: [100, 70, 25],
    }, // 5 Sunflower — bright yellow
    FloraPalette {
        stem: [40, 90, 25],
        petal: [190, 30, 45],
        center: [130, 20, 35],
    }, // 6 Rose — deep red
    FloraPalette {
        stem: [45, 100, 30],
        petal: [70, 100, 200],
        center: [90, 80, 160],
    }, // 7 Cornflower — blue
    FloraPalette {
        stem: [45, 110, 30],
        petal: [180, 120, 200],
        center: [220, 180, 240],
    }, // 8 Allium — pink-purple
    FloraPalette {
        stem: [40, 105, 35],
        petal: [60, 160, 220],
        center: [240, 230, 200],
    }, // 9 Blue Orchid — cyan
];

/// Generate the flower texture atlas: (N×16)×16 RGBA (N species × 16×16).
/// Pure procedural — no external assets.
fn generate_flora_atlas() -> (Vec<u8>, u32, u32) {
    let atlas_w: u32 = NUM_FLORA_SPECIES as u32 * 16;
    let atlas_h: u32 = 16;
    let mut pixels = vec![0u8; (atlas_w * atlas_h * 4) as usize];

    for (species, (mask, palette)) in FLORA_MASKS.iter().zip(FLORA_PALETTES.iter()).enumerate() {
        let x_offset = species as u32 * 16;
        for row in 0..16u32 {
            for col in 0..16u32 {
                let role = mask[row as usize][col as usize];
                if role == FLORA_TRANSPARENT {
                    continue; // stays [0,0,0,0]
                }
                let rgb = match role {
                    FLORA_STEM => palette.stem,
                    FLORA_PETAL => palette.petal,
                    FLORA_CENTER => palette.center,
                    _ => [255, 0, 255], // debug magenta
                };
                let px = ((x_offset + col) + row * atlas_w) as usize * 4;
                pixels[px] = rgb[0];
                pixels[px + 1] = rgb[1];
                pixels[px + 2] = rgb[2];
                pixels[px + 3] = 255;
            }
        }
    }

    (pixels, atlas_w, atlas_h)
}

/// Push a 3-zone canopy dome with clean flat band colors and per-dome tilt.
/// Zones: sun plate (~8%), foliage body (~65%), underside (~27%).
/// NO per-vertex color variation — depth from overlapping masses only.
/// Per-dome XZ tilt breaks spherical symmetry — highlights shift off-center.
fn push_dome(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    rx: f32,
    ry: f32,
    rz: f32,
    color_top: [f32; 4],    // sun plate
    color_mid: [f32; 4],    // foliage body
    color_bottom: [f32; 4], // underside volume
) {
    const SEGMENTS: u32 = 12;
    let tau = std::f32::consts::TAU;

    // Wobble: scales up with ring height for irregular silhouettes
    let wobble = |angle: f32, ring: u32| -> f32 {
        let seed = center.x * 5.0 + center.z * 7.0 + ring as f32 * 3.0;
        let strength = 1.0 + ring as f32 * 0.5;
        // Stronger wobble (18%+12%) breaks circular outlines into chunky lumps
        1.0 + ((angle * 1.5 + seed).sin() * 0.18 + (angle * 2.3 - seed * 0.6).cos() * 0.12)
            * strength
    };

    // ── PER-DOME TILT ────────────────────────────────────────────────────
    // Small XZ tilt breaks spherical symmetry — shifts the entire dome
    // geometry off-axis so highlights land on sides, not always on top.
    let tilt_seed = center.x * 4.1 + center.z * 6.7;
    let tilt_x = ((tilt_seed * 2.9).sin()) * 0.12; // ±0.12 radians (~7°)
    let tilt_z = ((tilt_seed * 3.7).cos()) * 0.12;

    // ── HIGHLIGHT DIRECTION OFFSET ───────────────────────────────────────
    // Per-dome randomized cap — side/split/small highlights, not centered
    let hl_seed = center.x * 3.7 + center.z * 5.3;
    let hl_angle = ((hl_seed * 2.1).sin() * 0.5 + 0.5) * tau;
    let hl_dist = 0.20 + ((hl_seed * 4.3).cos() * 0.5 + 0.5) * 0.25; // 0.20-0.45
    let cap_ox = hl_angle.cos() * rx * hl_dist;
    let cap_oz = hl_angle.sin() * rz * hl_dist;

    // ── RING GEOMETRY ────────────────────────────────────────────────────
    // Substantial underside for "heavy" feel, dominant body, thin sun plate
    // Target: ~18% underside, ~55% body, ~17% sun cap, ~10% cap fan
    let ring_geo: [(f32, f32); 3] = [
        (0.0, 1.0),   // equator
        (0.18, 0.95), // low ring — visible underside, "hanging" weight
        (0.73, 0.68), // mid ring — body→sun plate
    ];

    // ── EMIT RING — FLAT BAND COLOR + TILT ───────────────────────────────
    let mut emit_ring = |ring_idx: u32, y_frac: f32, r_scale: f32, band_color: [f32; 4]| -> u32 {
        let base = pos.len() as u32;
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * tau;
            let (s, c) = angle.sin_cos();
            let w = wobble(angle, ring_idx);
            // Local dome position before tilt
            let lx = c * rx * r_scale * w;
            let ly = ry * y_frac;
            let lz = s * rz * r_scale * w;
            // Apply small XZ tilt: rotate vertex position around dome center
            // tilt_x rotates around X axis (tilts forward/back)
            // tilt_z rotates around Z axis (tilts left/right)
            let ty = ly * (1.0 - tilt_x.abs() * 0.5) + lz * tilt_x;
            let tz = lz * (1.0 - tilt_x.abs() * 0.5) - ly * tilt_x;
            let tx = lx * (1.0 - tilt_z.abs() * 0.5) + ty * tilt_z;
            let final_y = ty * (1.0 - tilt_z.abs() * 0.5) - lx * tilt_z;
            pos.push([center.x + tx, center.y + final_y, center.z + tz]);
            let nx = c * r_scale;
            let ny = y_frac + 0.1;
            let nz = s * r_scale;
            let nlen = (nx * nx + ny * ny + nz * nz).sqrt().max(0.001);
            nor.push([nx / nlen, ny / nlen, nz / nlen]);
            col.push(band_color);
        }
        base
    };

    // Band 0: equator→ring1 — underside volume (thin)
    let b0_bot = emit_ring(0, ring_geo[0].0, ring_geo[0].1, color_bottom);
    let b0_top = emit_ring(1, ring_geo[1].0, ring_geo[1].1, color_bottom);
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[
            b0_bot + i,
            b0_top + i,
            b0_bot + j,
            b0_bot + j,
            b0_top + i,
            b0_top + j,
        ]);
    }

    // Band 1: ring1→ring2 — foliage body (dominant, ~60% coverage)
    let b1_bot = emit_ring(1, ring_geo[1].0, ring_geo[1].1, color_mid);
    let b1_top = emit_ring(2, ring_geo[2].0, ring_geo[2].1, color_mid);
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[
            b1_bot + i,
            b1_top + i,
            b1_bot + j,
            b1_bot + j,
            b1_top + i,
            b1_top + j,
        ]);
    }

    // Band 2: ring2→cap — sun cap (thin, directional)
    let b2_bot = emit_ring(2, ring_geo[2].0, ring_geo[2].1, color_top);
    let cap_vi = pos.len() as u32;
    pos.push([center.x + cap_ox, center.y + ry, center.z + cap_oz]);
    nor.push([0.0, 1.0, 0.0]);
    col.push(color_top);
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[b2_bot + i, cap_vi, b2_bot + j]);
    }

    // Bottom disc (seals dome)
    let bot_vi = pos.len() as u32;
    pos.push([center.x, center.y, center.z]);
    nor.push([0.0, -1.0, 0.0]);
    col.push(color_bottom);
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[bot_vi, b0_bot + j, b0_bot + i]);
    }
}

// ---------------------------------------------------------------------------
// Flower mesh (UV-mapped billboard cards)
// ---------------------------------------------------------------------------

/// Build a UV-mapped flower mesh: two crossed planes (MC-style X pattern)
/// textured from the procedural flora atlas.  `arch_idx` selects which 16×16
/// region of the 80×16 atlas to sample (0–4).
///
/// At 32 px/unit: 16 texels = 0.5 world units.
/// Each plane is 0.5 wide × 0.5 tall, centered at origin, base at y=0.
fn build_flower_mesh(arch_idx: usize) -> Mesh {
    let hw = 0.25; // half-width = 8/32
    let h = 0.5; // height = 16/32

    // UV region for this archetype in the N×16 atlas
    let u0 = arch_idx as f32 / NUM_FLORA_SPECIES as f32;
    let u1 = (arch_idx + 1) as f32 / NUM_FLORA_SPECIES as f32;

    let mut positions: Vec<[f32; 3]> = Vec::with_capacity(16);
    let mut normals: Vec<[f32; 3]> = Vec::with_capacity(16);
    let mut uvs: Vec<[f32; 2]> = Vec::with_capacity(16);
    let mut indices: Vec<u32> = Vec::with_capacity(24);

    // Two crossed planes at 45° (MC flower X pattern).
    // Each plane rendered double-sided via duplicate reversed-winding face.
    let sin45 = std::f32::consts::FRAC_1_SQRT_2;
    for &(dx, dz) in &[(sin45, sin45), (sin45, -sin45)] {
        let nx = -dz;
        let nz = dx;

        // Front face
        let base = positions.len() as u32;
        positions.extend_from_slice(&[
            [-hw * dx, 0.0, -hw * dz],
            [hw * dx, 0.0, hw * dz],
            [hw * dx, h, hw * dz],
            [-hw * dx, h, -hw * dz],
        ]);
        normals.extend_from_slice(&[[nx, 0.0, nz]; 4]);
        uvs.extend_from_slice(&[[u0, 1.0], [u1, 1.0], [u1, 0.0], [u0, 0.0]]);
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);

        // Back face (reversed winding for double-sided)
        let base = positions.len() as u32;
        positions.extend_from_slice(&[
            [-hw * dx, 0.0, -hw * dz],
            [hw * dx, 0.0, hw * dz],
            [hw * dx, h, hw * dz],
            [-hw * dx, h, -hw * dz],
        ]);
        normals.extend_from_slice(&[[-nx, 0.0, -nz]; 4]);
        uvs.extend_from_slice(&[[u1, 1.0], [u0, 1.0], [u0, 0.0], [u1, 0.0]]);
        indices.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    let vert_count = positions.len();
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_COLOR,
        vec![[1.0f32, 1.0, 1.0, 1.0]; vert_count],
    )
    .with_inserted_indices(Indices::U32(indices))
}

// ---------------------------------------------------------------------------
// Pre-created materials
// ---------------------------------------------------------------------------

#[derive(Resource)]
struct TileMaterials {
    chunk_body_mat: Handle<StandardMaterial>,
    chunk_cap_mat: Handle<StandardMaterial>,
    /// Unlit, matte material for tree trunk+canopy domes — vertex colors carry all tonal info.
    tree_body_mat: Handle<StandardMaterial>,
    /// Double-sided, vertex-colored material for grass crossed-planes.
    chunk_veg_mat: Handle<StandardMaterial>,
    /// Per-archetype flower meshes (UV-mapped crossed planes into atlas).
    flower_meshes: [Handle<Mesh>; NUM_FLORA_SPECIES],
    /// Shared material for all flowers: atlas texture + alpha cutoff.
    flower_mat: Handle<StandardMaterial>,
    /// Animated water surface material.
    water_mat: Handle<WaterMaterial>,
}

/// Per-group vegetation vertex buffers (3 groups per chunk for wind animation).
struct VegBuffers {
    pos: Vec<[f32; 3]>,
    nor: Vec<[f32; 3]>,
    col: Vec<[f32; 4]>,
    idx: Vec<u32>,
}

/// Global wind state. Speed in MPH drives all sway amplitudes.
#[derive(Resource)]
struct WindState {
    speed_mph: f32,        // 0 = calm, 5 = gentle breeze, 15 = moderate, 30 = strong
    direction: (f32, f32), // normalized XZ direction
}

impl Default for WindState {
    fn default() -> Self {
        Self {
            speed_mph: 8.0,            // gentle breeze
            direction: (0.707, 0.707), // NE
        }
    }
}

/// Attached to tree entities. Rotation pivot at ground → canopy moves, trunk base stays.
/// `stiffness` = inverse flexibility. Thick trunks resist more (higher = less sway).
#[derive(Component)]
struct TreeWindSway {
    base_rotation: Quat,
    phase: f32,
    stiffness: f32, // 1.0 = flexible sapling, 2.0+ = thick oak
}

/// Attached to small vegetation (flowers, grass) for gentle translation sway.
#[derive(Component)]
struct WindSway {
    base_translation: Vec3,
    phase: f32,
}

/// Marker on trees for occlusion detection against the player.
#[derive(Component)]
struct TreeOccluder;

/// The player silhouette indicator (dots/ring visible through trees).
#[derive(Component)]
struct PlayerOcclusionIndicator;

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<WindState>();
        app.init_resource::<WindStreakPool>();
        app.add_systems(
            Startup,
            (
                setup_tile_materials,
                spawn_lighting,
                spawn_occlusion_indicator,
            ),
        );
        app.add_systems(
            Update,
            (
                process_chunk_spawns_and_despawns,
                animate_tree_wind,
                animate_veg_wind,
                update_player_occlusion,
                spawn_wind_streaks,
                animate_wind_streaks,
            ),
        );
        app.add_systems(
            PostUpdate,
            stabilize_shadow_cascades.after(SimulationLightSystems::UpdateDirectionalLightCascades),
        );
    }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

fn setup_tile_materials(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut water_materials: ResMut<Assets<WaterMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    let chunk_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
        ..default()
    });
    let chunk_cap_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
        ..default()
    });
    // Unlit tree material: vertex colors carry all tonal info (highlight/mid/shadow/deep).
    // No PBR lighting means the toon post-process bands cleanly painted colors.
    let tree_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        unlit: true,
        ..default()
    });
    let chunk_veg_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
        cull_mode: None,
        double_sided: true,
        ..default()
    });

    // Generate procedural flower atlas (80×16 RGBA, 5 species × 16×16)
    let (atlas_pixels, aw, ah) = generate_flora_atlas();
    let mut atlas_img = Image::new(
        bevy::render::render_resource::Extent3d {
            width: aw,
            height: ah,
            depth_or_array_layers: 1,
        },
        bevy::render::render_resource::TextureDimension::D2,
        atlas_pixels,
        bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    atlas_img.sampler = ImageSampler::nearest();
    let atlas_handle = images.add(atlas_img);

    // Shared flower material: atlas texture, alpha cutoff, double-sided
    let flower_mat = materials.add(StandardMaterial {
        base_color_texture: Some(atlas_handle),
        alpha_mode: AlphaMode::Mask(0.5),
        cull_mode: None,
        double_sided: true,
        unlit: false,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
        ..default()
    });

    // Per-archetype meshes: crossed planes with UVs into the atlas
    let flower_meshes = std::array::from_fn(|i| meshes.add(build_flower_mesh(i)));

    let water_mat = water_materials.add(WaterMaterial::default());

    commands.insert_resource(TileMaterials {
        chunk_body_mat,
        chunk_cap_mat,
        tree_body_mat,
        chunk_veg_mat,
        flower_meshes,
        flower_mat,
        water_mat,
    });
}

fn spawn_lighting(mut commands: Commands) {
    commands.insert_resource(GlobalAmbientLight {
        color: Color::WHITE,
        brightness: 200.0,
        ..default()
    });
    // Single cascade + pixelated shadow map + texel-snapping stabilisation.
    // Shadow map sized so each shadow texel ≈ 1 scene pixel (32 px/unit).
    // 1024 over 80 units = ~12.8 texels/unit → shadows are ~2.5× chunkier than
    // scene pixels, giving that crisp pixel-art shadow look that blends in.
    commands.insert_resource(DirectionalLightShadowMap { size: 1024 });
    commands.spawn((
        DirectionalLight {
            illuminance: 6000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(12.0, 15.0, -5.0).looking_at(Vec3::ZERO, Vec3::Y),
        CascadeShadowConfigBuilder {
            num_cascades: 1,
            minimum_distance: 0.1,
            maximum_distance: 80.0,
            ..default()
        }
        .build(),
    ));
}

/// Stabilise directional shadow maps by texel-snapping the cascade projection.
///
/// Bevy recomputes the cascade frustum from the camera every frame. When the
/// frustum centre moves by sub-texel amounts, shadow edges land on different
/// texels → visible 1-2 px "swimming" on the low-res render target.
///
/// Fix: snap the clip-space translation of each cascade's `clip_from_world`
/// matrix to shadow-texel boundaries so the shadow grid stays locked to the
/// world.
fn stabilize_shadow_cascades(
    shadow_map: Res<DirectionalLightShadowMap>,
    mut query: Query<&mut Cascades, With<DirectionalLight>>,
) {
    let texel_clip = 2.0 / shadow_map.size as f32;
    for mut cascades in query.iter_mut() {
        for cascade_list in cascades.cascades.values_mut() {
            for cascade in cascade_list.iter_mut() {
                let mut m = cascade.clip_from_world;
                m.w_axis.x = (m.w_axis.x / texel_clip).floor() * texel_clip;
                m.w_axis.y = (m.w_axis.y / texel_clip).floor() * texel_clip;
                cascade.clip_from_world = m;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Wind animation for vegetation groups
// ---------------------------------------------------------------------------

fn animate_tree_wind(
    time: Res<Time>,
    wind: Res<WindState>,
    mut query: Query<(&mut Transform, &TreeWindSway)>,
) {
    let t = time.elapsed_secs();
    let spd = wind.speed_mph;
    if spd < 0.5 {
        return;
    } // dead calm — skip entirely

    // Wind speed → sway parameters (all scale from speed)
    // At 10 MPH: ~1.5° max sway. At 30 MPH: ~4.5°. Sublinear so it doesn't go crazy.
    let base_amp = (spd / 10.0).sqrt() * 0.025; // radians
    // Constant lean into wind — barely visible at low speed, noticeable at high
    let lean = (spd / 10.0).min(3.0) * 0.005; // max ~0.015 rad (~0.9°)
    // Gust speed scales with wind (faster wind = faster oscillation)
    let gust_speed = 0.5 + spd * 0.03;

    let (dx, dz) = wind.direction;

    for (mut tf, tree) in &mut query {
        let amp = base_amp / tree.stiffness;
        // Primary gust along wind direction
        let gust = (t * gust_speed + tree.phase).sin() * amp
            + (t * gust_speed * 2.1 + tree.phase * 2.3).sin() * amp * 0.3;
        // Cross-wind flutter (perpendicular, much weaker)
        let flutter = (t * gust_speed * 2.7 + tree.phase * 1.6).sin() * amp * 0.12;
        // Compose: lean + gust along wind dir, flutter perpendicular
        let rx = dx * (lean + gust) + (-dz) * flutter;
        let rz = dz * (lean + gust) + dx * flutter;
        // Rotation around X tilts forward/back (Z-axis sway), around Z tilts left/right (X-axis sway)
        let wind_rot = Quat::from_euler(EulerRot::XYZ, rz, 0.0, -rx);
        tf.rotation = tree.base_rotation * wind_rot;
    }
}

fn animate_veg_wind(
    time: Res<Time>,
    wind: Res<WindState>,
    mut query: Query<(&mut Transform, &WindSway)>,
) {
    let t = time.elapsed_secs();
    let spd = wind.speed_mph;
    if spd < 0.5 {
        return;
    }

    // Vegetation is very flexible — moves more than trees at same wind speed
    let veg_amp = (spd / 10.0).sqrt() * 0.035;
    let gust_speed = 0.8 + spd * 0.04;
    let (dx, dz) = wind.direction;

    for (mut tf, sway) in &mut query {
        let gust = (t * gust_speed + sway.phase).sin() * veg_amp
            + (t * gust_speed * 2.1 + sway.phase * 1.8).sin() * veg_amp * 0.4;
        let flutter = (t * gust_speed * 3.0 + sway.phase * 1.3).sin() * veg_amp * 0.2;
        let ox = dx * gust + (-dz) * flutter;
        let oz = dz * gust + dx * flutter;
        tf.translation = sway.base_translation + Vec3::new(ox, 0.0, oz);
    }
}

// ---------------------------------------------------------------------------
// Tree occlusion fade (player behind tree → tree becomes transparent)
// ---------------------------------------------------------------------------

/// Direction from scene toward camera in XZ (normalized).
/// Camera is at offset (+15, +20, +15) → "toward camera" is (+1, +1) normalized.
const CAM_DIR_XZ: (f32, f32) = (0.707, 0.707);

/// Build a small ring mesh (8 dots arranged in a circle) for the occlusion indicator.
fn build_indicator_mesh() -> Mesh {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut colors = Vec::new();
    let mut indices = Vec::new();

    let dot_count = 8;
    let ring_r = 0.35;
    let dot_r = 0.06;

    for i in 0..dot_count {
        let angle = (i as f32 / dot_count as f32) * std::f32::consts::TAU;
        let cx = angle.cos() * ring_r;
        let cz = angle.sin() * ring_r;
        let base = positions.len() as u32;

        // Small diamond/quad for each dot
        positions.extend_from_slice(&[
            [cx - dot_r, 0.0, cz],
            [cx + dot_r, 0.0, cz],
            [cx, 0.0, cz + dot_r],
            [cx, 0.0, cz - dot_r],
        ]);
        normals.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
        // Bright white-blue dots
        colors.extend_from_slice(&[[0.7_f32, 0.85, 1.0, 1.0]; 4]);
        indices.extend_from_slice(&[
            base,
            base + 1,
            base + 2,
            base,
            base + 2,
            base + 3,
            base,
            base + 3,
            base + 1,
            base + 1,
            base + 3,
            base + 2,
        ]);
    }

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_indices(Indices::U32(indices))
}

fn spawn_occlusion_indicator(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let mesh = meshes.add(build_indicator_mesh());
    let mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        unlit: true,
        // No depth test — renders on top of everything
        depth_bias: f32::MAX,
        ..default()
    });

    commands.spawn((
        Mesh3d(mesh),
        MeshMaterial3d(mat),
        Transform::from_xyz(0.0, -100.0, 0.0), // hidden initially
        Visibility::Hidden,
        PlayerOcclusionIndicator,
    ));
}

fn update_player_occlusion(
    player_q: Query<&Transform, With<Player>>,
    tree_q: Query<
        &Transform,
        (
            With<TreeOccluder>,
            Without<Player>,
            Without<PlayerOcclusionIndicator>,
        ),
    >,
    mut indicator_q: Query<
        (&mut Transform, &mut Visibility),
        (
            With<PlayerOcclusionIndicator>,
            Without<Player>,
            Without<TreeOccluder>,
        ),
    >,
) {
    let Ok(player_tf) = player_q.single() else {
        return;
    };
    let Ok((mut ind_tf, mut ind_vis)) = indicator_q.single_mut() else {
        return;
    };
    let pp = player_tf.translation;

    // Check if any tree occludes the player
    let mut occluded = false;
    for tree_tf in &tree_q {
        let tp = tree_tf.translation;
        let dx = tp.x - pp.x;
        let dz = tp.z - pp.z;
        let dist_xz = (dx * dx + dz * dz).sqrt();
        let dot = dx * CAM_DIR_XZ.0 + dz * CAM_DIR_XZ.1;
        let y_diff = (tp.y - pp.y).abs();

        if dot > 0.3 && dist_xz < 2.5 && y_diff < 3.0 {
            occluded = true;
            break;
        }
    }

    if occluded {
        *ind_vis = Visibility::Visible;
        // Place indicator at player position, slightly above head
        ind_tf.translation = Vec3::new(pp.x, pp.y + 1.2, pp.z);
    } else {
        *ind_vis = Visibility::Hidden;
    }
}

// ---------------------------------------------------------------------------
// Wind streaks (Wind Waker-style visual wind trails)
// ---------------------------------------------------------------------------

const WIND_STREAK_COUNT: usize = 10;
const WIND_STREAK_LIFETIME: f32 = 2.8; // seconds per streak cycle

#[derive(Component)]
struct WindStreak {
    age: f32,
    lifetime: f32,
    start_pos: Vec3,
    speed: f32,     // world units/sec along wind direction
    drift_off: f32, // cross-wind offset for variety
    mat_handle: Handle<StandardMaterial>,
}

#[derive(Resource, Default)]
struct WindStreakPool {
    initialized: bool,
}

/// Thin elongated quad mesh for a single wind streak.
fn build_streak_mesh() -> Mesh {
    // Thin line: 0.6 long × 0.012 tall, centered at origin
    let hw = 0.30;
    let hh = 0.006;
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-hw, -hh, 0.0],
            [hw, -hh, 0.0],
            [hw, hh, 0.0],
            [-hw, hh, 0.0],
        ],
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 1.0]; 4])
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, vec![[1.0_f32, 1.0, 1.0, 1.0]; 4])
    .with_inserted_indices(Indices::U32(vec![0, 1, 2, 0, 2, 3]))
}

fn spawn_wind_streaks(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<WindStreakPool>,
) {
    if pool.initialized {
        return;
    }
    pool.initialized = true;

    let streak_mesh = meshes.add(build_streak_mesh());

    for i in 0..WIND_STREAK_COUNT {
        let phase = i as f32 / WIND_STREAK_COUNT as f32;
        // Each streak gets its own material so we can fade alpha independently
        let mat = materials.add(StandardMaterial {
            base_color: Color::srgba(1.0, 1.0, 1.0, 0.0),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            ..default()
        });
        let mat_clone = mat.clone();
        commands.spawn((
            Mesh3d(streak_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            WindStreak {
                age: phase * WIND_STREAK_LIFETIME,
                lifetime: WIND_STREAK_LIFETIME + (phase - 0.5) * 0.6,
                start_pos: Vec3::ZERO,
                speed: 2.5 + phase * 1.5,
                drift_off: (phase * 7.3).sin() * 0.3,
                mat_handle: mat_clone,
            },
        ));
    }
}

fn animate_wind_streaks(
    time: Res<Time>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut streak_q: Query<
        (&mut Transform, &mut WindStreak, &mut Visibility),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let spd = wind.speed_mph;
    if spd < 1.0 {
        for (_, _, mut vis) in &mut streak_q {
            *vis = Visibility::Hidden;
        }
        return;
    }

    let (wd_x, wd_z) = wind.direction;
    let wind_dir = Vec3::new(wd_x, 0.0, wd_z);
    let cross = Vec3::new(-wd_z, 0.0, wd_x);
    let cam_pos = cam_tf.translation;
    // Scene center: camera looks down at an offset, streaks spawn around the viewed area
    let scene_center = Vec3::new(cam_pos.x - 15.0, 0.0, cam_pos.z - 15.0);

    // Subtle opacity: barely-there wisps, not cartoon lines
    let opacity_scale = ((spd - 2.0) / 15.0).clamp(0.0, 1.0) * 0.16;

    for (mut tf, mut streak, mut vis) in &mut streak_q {
        streak.age += dt;
        if streak.age >= streak.lifetime {
            streak.age = 0.0;
            let seed = streak.drift_off * 17.3 + time.elapsed_secs() * 3.1;
            let spread_along = seed.sin() * 8.0;
            let spread_cross = (seed * 2.7).cos() * 6.0;
            let height = 1.8 + ((seed * 1.3).sin() * 0.5 + 0.5) * 3.0;
            streak.start_pos = scene_center
                + wind_dir * spread_along
                + cross * (spread_cross + streak.drift_off * 4.0)
                + Vec3::Y * height;
            streak.speed = 2.0 + ((seed * 0.7).cos() * 0.5 + 0.5) * 2.0;
            streak.lifetime = WIND_STREAK_LIFETIME + (seed * 0.4).sin() * 0.5;
        }

        let t_frac = streak.age / streak.lifetime;
        // Gentle fade in/out — long tails, soft appearance
        let alpha = if t_frac < 0.25 {
            t_frac / 0.25
        } else if t_frac > 0.75 {
            (1.0 - t_frac) / 0.25
        } else {
            1.0
        } * opacity_scale;

        if alpha < 0.003 {
            *vis = Visibility::Hidden;
            if let Some(mat) = materials.get_mut(&streak.mat_handle) {
                mat.base_color = Color::srgba(1.0, 1.0, 1.0, 0.0);
            }
            continue;
        }
        *vis = Visibility::Visible;

        // Set per-streak alpha
        if let Some(mat) = materials.get_mut(&streak.mat_handle) {
            mat.base_color = Color::srgba(1.0, 1.0, 1.0, alpha);
        }

        // Drift along wind direction
        let travel = wind_dir * streak.speed * streak.age * (spd / 8.0);
        let pos = streak.start_pos + travel;
        // Billboard: face camera, long axis aligned with wind
        let to_cam = (cam_pos - pos).normalize_or_zero();
        tf.translation = pos;
        tf.look_to(to_cam, Vec3::Y);
        // Stretch with wind speed — longer wisps at higher speed
        let length_scale = 0.7 + spd * 0.05;
        tf.scale = Vec3::new(length_scale, 1.0, 1.0);
    }
}

// ---------------------------------------------------------------------------
// Chunk spawn / despawn (combined meshes + compound collider)
// ---------------------------------------------------------------------------

fn process_chunk_spawns_and_despawns(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut terrain: ResMut<TerrainMap>,
    tile_materials: Option<Res<TileMaterials>>,
    player_query: Query<&Transform, With<Player>>,
) {
    let Some(tile_materials) = tile_materials else {
        return;
    };

    // Despawn chunks (all at once — despawning is cheap)
    let despawns: Vec<(i32, i32, Vec<Entity>)> = terrain.chunks_to_despawn.drain(..).collect();
    for (_cx, _cz, entities) in despawns {
        for entity in entities {
            commands.entity(entity).despawn();
        }
    }

    // Rate-limiting: always spawn player's chunk + neighbors immediately,
    // rate-limit distant chunks to avoid frame spikes.
    let player_chunk = player_query.single().ok().map(|tf| {
        TerrainMap::tile_to_chunk(
            tf.translation.x.round() as i32,
            tf.translation.z.round() as i32,
        )
    });

    #[cfg(target_arch = "wasm32")]
    const MAX_DISTANT_SPAWNS: usize = 1;
    #[cfg(not(target_arch = "wasm32"))]
    const MAX_DISTANT_SPAWNS: usize = 2;

    let mut near: Vec<(i32, i32)> = Vec::new();
    let mut far: Vec<(i32, i32)> = Vec::new();
    for (cx, cz) in terrain.chunks_to_spawn.drain(..) {
        let is_near = player_chunk
            .map(|(pcx, pcz)| (cx - pcx).abs() <= 1 && (cz - pcz).abs() <= 1)
            .unwrap_or(true);
        if is_near {
            near.push((cx, cz));
        } else {
            far.push((cx, cz));
        }
    }
    far.truncate(MAX_DISTANT_SPAWNS);
    let mut spawns = near;
    spawns.extend(far);

    for (cx, cz) in &spawns {
        let mut entities = Vec::new();
        let base_x = cx * CHUNK_SIZE;
        let base_z = cz * CHUNK_SIZE;

        // ---- Build combined body, cap, vegetation meshes + compound collider ----
        let tile_count = (CHUNK_SIZE * CHUNK_SIZE) as usize;
        let mut body_pos = Vec::with_capacity(tile_count * 24);
        let mut body_nor = Vec::with_capacity(tile_count * 24);
        let mut body_col = Vec::with_capacity(tile_count * 24);
        let mut body_idx = Vec::with_capacity(tile_count * 36);

        let mut cap_pos = Vec::with_capacity(tile_count * 24);
        let mut cap_nor = Vec::with_capacity(tile_count * 24);
        let mut cap_col = Vec::with_capacity(tile_count * 24);
        let mut cap_idx = Vec::with_capacity(tile_count * 36);

        let mut veg_groups: [VegBuffers; 3] = std::array::from_fn(|_| VegBuffers {
            pos: Vec::new(),
            nor: Vec::new(),
            col: Vec::new(),
            idx: Vec::new(),
        });

        let mut collider_shapes: Vec<(Vec3, Quat, Collider)> = Vec::with_capacity(tile_count);

        // Water surface quads for tiles below water level
        let mut water_pos: Vec<[f32; 3]> = Vec::new();
        let mut water_nor: Vec<[f32; 3]> = Vec::new();
        let mut water_col: Vec<[f32; 4]> = Vec::new();
        let mut water_idx: Vec<u32> = Vec::new();

        for dx in 0..CHUNK_SIZE {
            for dz in 0..CHUNK_SIZE {
                let tx = base_x + dx;
                let tz = base_z + dz;
                let h = terrain.height_at(tx, tz);
                let column_h = h.max(0.5);

                let band = match h as i32 {
                    0..=1 => 0,
                    2..=3 => 1,
                    4..=5 => 2,
                    _ => 3,
                };

                // Chunk-local position
                let lx = dx as f32 * TILE_SIZE;
                let lz = dz as f32 * TILE_SIZE;

                // --- Body column (face-culled: skip top/bottom + hidden sides) ---
                let body_h = column_h - CAP_HEIGHT;
                let mut nb = |ntx: i32, ntz: i32| -> f32 {
                    terrain.height_at(ntx, ntz).max(0.5) - CAP_HEIGHT
                };
                push_terrain_body(
                    &mut body_pos,
                    &mut body_nor,
                    &mut body_col,
                    &mut body_idx,
                    Vec3::new(lx, body_h / 2.0, lz),
                    Vec3::new(TILE_SIZE / 2.0, body_h / 2.0, TILE_SIZE / 2.0),
                    body_vertex_color(band),
                    body_h,
                    [
                        nb(tx + 1, tz),
                        nb(tx - 1, tz),
                        nb(tx, tz + 1),
                        nb(tx, tz - 1),
                    ],
                );

                // Collider sub-shape (relative to chunk entity)
                collider_shapes.push((
                    Vec3::new(lx, body_h / 2.0, lz),
                    Quat::IDENTITY,
                    Collider::cuboid(TILE_SIZE / 2.0, body_h / 2.0, TILE_SIZE / 2.0),
                ));

                // --- Cap cuboid (with edge insets) ---
                let inset = |nh: f32| if h - nh >= 1.0 { EDGE_INSET } else { 0.0 };
                let inset_nx = inset(terrain.height_at(tx - 1, tz));
                let inset_px = inset(terrain.height_at(tx + 1, tz));
                let inset_nz = inset(terrain.height_at(tx, tz - 1));
                let inset_pz = inset(terrain.height_at(tx, tz + 1));

                let cap_w = TILE_SIZE - inset_nx - inset_px;
                let cap_d = TILE_SIZE - inset_nz - inset_pz;
                let cap_offset_x = (inset_nx - inset_px) / 2.0;
                let cap_offset_z = (inset_nz - inset_pz) / 2.0;

                push_cuboid(
                    &mut cap_pos,
                    &mut cap_nor,
                    &mut cap_col,
                    &mut cap_idx,
                    Vec3::new(
                        lx + cap_offset_x,
                        body_h + CAP_HEIGHT / 2.0 + 0.005,
                        lz + cap_offset_z,
                    ),
                    Vec3::new(cap_w / 2.0, CAP_HEIGHT / 2.0, cap_d / 2.0),
                    cap_vertex_color(band, tx, tz),
                );

                // --- Water surface (tiles below water level) ---
                if h < WATER_LEVEL {
                    let wy = WATER_LEVEL;
                    let half = TILE_SIZE / 2.0;
                    let base_vert = water_pos.len() as u32;

                    // Flat quad facing up at water level
                    // Check neighbors to set foam alpha (1.0 = no foam, < 1.0 = foam edge)
                    let mut is_edge =
                        |ntx: i32, ntz: i32| -> bool { terrain.height_at(ntx, ntz) >= WATER_LEVEL };
                    let has_land_neighbor = is_edge(tx - 1, tz)
                        || is_edge(tx + 1, tz)
                        || is_edge(tx, tz - 1)
                        || is_edge(tx, tz + 1);
                    let foam_alpha = if has_land_neighbor { 0.3 } else { 1.0 };

                    water_pos.extend_from_slice(&[
                        [lx - half, wy, lz - half],
                        [lx + half, wy, lz - half],
                        [lx + half, wy, lz + half],
                        [lx - half, wy, lz + half],
                    ]);
                    water_nor.extend_from_slice(&[
                        [0.0, 1.0, 0.0],
                        [0.0, 1.0, 0.0],
                        [0.0, 1.0, 0.0],
                        [0.0, 1.0, 0.0],
                    ]);
                    water_col.extend_from_slice(&[
                        [1.0, 1.0, 1.0, foam_alpha],
                        [1.0, 1.0, 1.0, foam_alpha],
                        [1.0, 1.0, 1.0, foam_alpha],
                        [1.0, 1.0, 1.0, foam_alpha],
                    ]);
                    water_idx.extend_from_slice(&[
                        base_vert,
                        base_vert + 1,
                        base_vert + 2,
                        base_vert,
                        base_vert + 2,
                        base_vert + 3,
                    ]);
                }

                // --- Vegetation (grass band only) ---
                if band == 0 {
                    let grass_slots: [(i32, i32, f32, u8); 5] = [
                        (7919, 3571, 0.40, 0),
                        (2131, 8461, 0.18, 1),
                        (4253, 6173, 0.25, 0),
                        (6091, 1429, 0.30, 2),
                        (9371, 2749, 0.08, 3),
                    ];

                    for (slot_idx, &(seed_x, seed_z, density, kind)) in
                        grass_slots.iter().enumerate()
                    {
                        #[cfg(target_arch = "wasm32")]
                        let density = density * 0.5;

                        let noise = hash2d(tx + seed_x, tz + seed_z);
                        if noise >= density {
                            continue;
                        }

                        // Quantize jitter to pixel grid for stable edges
                        let jx = ((hash2d(tx + seed_x + 100, tz + seed_z) - 0.5) * 0.85 / VEG_SNAP)
                            .round()
                            * VEG_SNAP;
                        let jz = ((hash2d(tx + seed_x, tz + seed_z + 100) - 0.5) * 0.85 / VEG_SNAP)
                            .round()
                            * VEG_SNAP;
                        let scale_noise = hash2d(tx + seed_x + 200, tz + seed_z + 200);
                        let scale = 0.7 + scale_noise * 0.7;
                        let rot_y =
                            hash2d(tx + seed_x + 300, tz + seed_z + 300) * std::f32::consts::TAU;

                        let y_offset = match kind {
                            3 => 0.15,
                            _ => 0.0,
                        };
                        let origin =
                            Vec3::new(lx + jx, body_h + CAP_HEIGHT + y_offset + 0.002, lz + jz);

                        let color = match kind {
                            1 => srgb_color(VEG_GRASS_TALL.0, VEG_GRASS_TALL.1, VEG_GRASS_TALL.2),
                            2 => {
                                srgb_color(VEG_GRASS_BLADE.0, VEG_GRASS_BLADE.1, VEG_GRASS_BLADE.2)
                            }
                            3 => {
                                let fi = (hash2d(tx + seed_x + 400, tz) * 4.0) as usize % 4;
                                let (r, g, b) = VEG_FLOWER_COLORS[fi];
                                srgb_color(r, g, b)
                            }
                            _ => srgb_color(VEG_GRASS_TUFT.0, VEG_GRASS_TUFT.1, VEG_GRASS_TUFT.2),
                        };

                        // Route to one of 3 wind groups
                        let group = &mut veg_groups[slot_idx % 3];

                        match kind {
                            2 => push_blade(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.10,
                                0.40,
                                scale,
                                rot_y,
                                color,
                            ),
                            1 => push_crossed_planes(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.13,
                                0.50,
                                scale,
                                rot_y,
                                color,
                            ),
                            3 => push_crossed_planes(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.10,
                                0.16,
                                scale,
                                rot_y,
                                color,
                            ),
                            _ => push_crossed_planes(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.20,
                                0.30,
                                scale,
                                rot_y,
                                color,
                            ),
                        }
                    }

                    // --- Trees (individual entities for selectability) ---
                    let tree_noise = hash2d(tx + 11317, tz + 5471);
                    if tree_noise < 0.055 {
                        let jx = (hash2d(tx + 11417, tz + 5471) - 0.5) * 0.3;
                        let jz = (hash2d(tx + 11317, tz + 5571) - 0.5) * 0.3;
                        let preset_idx = (hash2d(tx + 11617, tz + 5771) * 6.0) as usize % 6;
                        let bark_palette = &BARK_PALETTES[preset_idx];
                        let size_scale = 1.10 + hash2d(tx + 11717, tz + 5871) * 1.10; // 1.10–2.20

                        let preset = TREE_PRESETS[preset_idx];
                        // Bump count determined early so trunk scales with canopy mass
                        let bump_count =
                            3 + (hash2d(tx * 31337 + tz * 17389 + 80, 6080) * 3.99) as i32; // 3–6
                        // More canopy lobes → thicker, taller trunk to support the mass
                        let mass_scale = 1.0 + (bump_count - 3) as f32 * 0.12; // 1.0 at 3 bumps, 1.24 at 5
                        let trunk_h = preset.trunk_h * size_scale * mass_scale;
                        let trunk_r =
                            preset.trunk_r * size_scale * (1.0 + (bump_count - 3) as f32 * 0.08);

                        let world_x = tx as f32 * TILE_SIZE + jx;
                        let world_z = tz as f32 * TILE_SIZE + jz;
                        let tree_base_y = column_h + 0.002;

                        // Build trunk mesh: root flare + trunk + branches (max ~6 cuboids)
                        let max_cuboids = 2 + 4; // root flare + trunk + up to 4 branches
                        let mut tp = Vec::with_capacity(max_cuboids * 24);
                        let mut tn = Vec::with_capacity(max_cuboids * 24);
                        let mut tc = Vec::with_capacity(max_cuboids * 24);
                        let mut ti = Vec::with_capacity(max_cuboids * 36);

                        // --- Tapered trunk with buttress roots ---
                        let root_count = 3 + (hash2d(tx + 12017, tz + 6171) * 2.0) as i32; // 3–4 roots
                        let trunk_seed = tx as f32 * 0.137 + tz as f32 * 0.293;
                        push_tapered_trunk(
                            &mut tp,
                            &mut tn,
                            &mut tc,
                            &mut ti,
                            0.0,            // base_y
                            trunk_h,        // height
                            trunk_r * 2.2,  // base radius (wide trapezoid flare)
                            trunk_r * 0.70, // top radius (narrow at canopy)
                            root_count,
                            trunk_seed,
                            bark_palette,
                        );

                        // --- Branches: scale with tree size ---
                        // Small trees: 2-3 thin stubs. Large trees: 3-5 thick limbs.
                        let branch_count = if size_scale > 1.6 {
                            3 + (hash2d(tx + 11817, tz + 5971) * 2.99) as i32 // 3-5
                        } else {
                            2 + (hash2d(tx + 11817, tz + 5971) * 2.0) as i32 // 2-3
                        };
                        let branch_zone_base = trunk_h * 0.50;
                        let branch_zone_h = trunk_h * 0.40;
                        for bi in 0..branch_count {
                            let angle =
                                hash2d(tx + 13000 + bi * 173, tz + 7000) * std::f32::consts::TAU;
                            let y_pos = branch_zone_base
                                + hash2d(tx + 13100 + bi * 173, tz + 7100) * branch_zone_h;
                            // Larger trees get longer, thicker branches
                            let len_base = if size_scale > 1.6 { 0.14 } else { 0.10 };
                            let len_range = if size_scale > 1.6 { 0.16 } else { 0.12 };
                            let branch_len = (len_base
                                + hash2d(tx + 13200 + bi * 173, tz + 7200) * len_range)
                                * size_scale;
                            let thick_scale = if size_scale > 1.6 { 0.55 } else { 0.45 };
                            let branch_thick = trunk_r * thick_scale;
                            push_branch_stub(
                                &mut tp,
                                &mut tn,
                                &mut tc,
                                &mut ti,
                                Vec3::new(
                                    angle.cos() * trunk_r * 0.8,
                                    y_pos,
                                    angle.sin() * trunk_r * 0.8,
                                ),
                                Vec3::new(branch_thick, branch_thick * 0.7, branch_thick),
                                (angle.cos() * branch_len, angle.sin() * branch_len),
                                bark_face_colors_with(y_pos / trunk_h, bark_palette),
                            );
                        }

                        // --- 3-dome canopy volumes + edge breakup cards ---
                        let canopy_base = PRESET_CANOPY_COLORS[preset_idx];
                        let seed_base = tx * 31337 + tz * 17389;
                        let mut max_hw: f32 = trunk_r;
                        let mut total_h: f32 = trunk_h;

                        // Derive canopy dimensions from shape
                        // IMPORTANT: dome bottom = canopy_center_y (dome extends upward only).
                        // So canopy_center_y must sit BELOW trunk top to avoid floating canopy.
                        // Trunk penetrates 35-50% into canopy (visible trunk = 50-65%).
                        // Canopy width scales slightly super-linearly with size:
                        // bigger trees get proportionally wider canopies.
                        // Small tree (1.1×): no boost. Large tree (2.2×): +18% extra spread.
                        let canopy_spread = 1.0 + (size_scale - 1.1).max(0.0) * 0.16;
                        let (canopy_rx, canopy_ry) = match preset.canopy {
                            CanopyShape::Cone { radius, height, .. } => (
                                radius * size_scale * canopy_spread,
                                height * size_scale * 0.5,
                            ),
                            CanopyShape::Ellipsoid { rx, ry, .. } => {
                                (rx * size_scale * canopy_spread, ry * size_scale)
                            }
                        };
                        // Canopy base sits at 85-94% of trunk height.
                        // Top 6-15% of trunk hidden — connected but trunk clearly visible.
                        let base_frac = match preset_idx {
                            0 => 0.94, // Conifer: cone sits near trunk top
                            1 => 0.90, // Tall: slight overlap
                            2 => 0.85, // Bushy: a bit more overlap
                            3 => 0.87, // Oak: moderate
                            4 => 0.87, // Round: moderate
                            5 => 0.82, // Willow: droopy canopy sits lower
                            _ => 0.88,
                        };
                        let canopy_center_y = trunk_h * base_frac;

                        // Per-tree hue/brightness jitter — moderate for cohesive forest
                        let tree_bright = 0.82 + hash2d(seed_base + 500, 7700) * 0.28; // 0.82–1.10
                        let tree_hj = (hash2d(seed_base + 501, 7701) - 0.5) * 0.20; // ±0.10 hue
                        let tb = (
                            (canopy_base.0 + tree_hj) * tree_bright,
                            (canopy_base.1 + tree_hj * 0.3) * tree_bright,
                            (canopy_base.2 - tree_hj * 0.5) * tree_bright,
                        );

                        // 4-zone banded canopy — sharp steps, NOT smooth gradient.
                        // Each band is a distinct readable tone like painted foliage.
                        // Sun cap: warm, clearly brighter than body
                        let c_highlight = srgb_color(
                            (tb.0 * 1.15 + 0.03).min(1.0),
                            (tb.1 * 1.10 + 0.02).min(1.0),
                            (tb.2 * 0.88).min(1.0),
                        );
                        // Mid: base color — used as sun cap on main mass
                        let c_mid = srgb_color(tb.0, tb.1, tb.2);
                        // Underside: clearly darker + cooler — visible step down
                        let c_shadow = srgb_color(tb.0 * 0.45, tb.1 * 0.58, tb.2 * 0.65);

                        // Per-tree rotation (all offsets rotated for variety)
                        let tree_rot = hash2d(seed_base + 72, 6072) * std::f32::consts::TAU;
                        let (rot_sin, rot_cos) = tree_rot.sin_cos();
                        let rot = |ox: f32, oz: f32| -> (f32, f32) {
                            (ox * rot_cos - oz * rot_sin, ox * rot_sin + oz * rot_cos)
                        };
                        // Per-tree shape jitter — enough asymmetry for organic feel
                        let jit_sx = 0.84 + hash2d(seed_base + 70, 6070) * 0.32; // 0.84–1.16
                        let jit_sz = 0.84 + hash2d(seed_base + 71, 6071) * 0.32;

                        // Foliage body: clear step down from mid, dominates ~55%
                        // Halfway between mid and shadow — readable as its own band
                        let c_body = srgb_color(tb.0 * 0.72, tb.1 * 0.78, tb.2 * 0.82);

                        // ═══════════════════════════════════════════════════════
                        // CLUSTER VOLUME: big main dome + 3-5 edge bumps that
                        // overlap the rim to break the circular silhouette.
                        // Lobes overlap ~50% with main mass — connected, not separated.
                        // ═══════════════════════════════════════════════════════

                        // Per-tree canopy Y jitter (symmetric, small — anchoring is already correct)
                        let canopy_center_y =
                            canopy_center_y + (hash2d(seed_base + 81, 6081) - 0.5) * trunk_h * 0.10;

                        // bump_count already computed above (tied to trunk scaling)
                        let has_top = hash2d(seed_base + 17, 6017) < 0.60;

                        // --- Main mass: big solid dome — the core canopy volume ---
                        // Tall vertical radius so it reads as one cohesive mass,
                        // not a pancake. Trunk should disappear ~40-50% into this.
                        let main_rx =
                            canopy_rx * (0.88 + hash2d(seed_base + 20, 6020) * 0.12) * jit_sx;
                        let main_ry = canopy_ry * (0.60 + hash2d(seed_base + 22, 6022) * 0.15);
                        let main_rz =
                            canopy_rx * (0.85 + hash2d(seed_base + 21, 6021) * 0.14) * jit_sz;
                        let main_y = canopy_center_y;
                        push_dome(
                            &mut tp,
                            &mut tn,
                            &mut tc,
                            &mut ti,
                            Vec3::new(0.0, main_y, 0.0),
                            main_rx,
                            main_ry,
                            main_rz,
                            c_mid,
                            c_body,
                            c_shadow,
                        );
                        max_hw = max_hw.max(main_rx.max(main_rz));
                        total_h = total_h.max(main_y + main_ry);

                        // --- Edge bumps: overlapping lobes that break the silhouette ---
                        // Offset close enough to merge with main mass, but big enough
                        // to create visible rim breakup. Think "leaf clusters" not "blobs."
                        for li in 0..bump_count {
                            let li_seed = seed_base + 200 + li * 137;

                            // Fully independent angle per lobe
                            let angle = hash2d(li_seed + 50, 6150) * std::f32::consts::TAU;

                            // Offset: 35–60% — heavily inside main, poking out at rim
                            let dist = canopy_rx * (0.35 + hash2d(li_seed + 1, 6101) * 0.25);
                            let lx = angle.cos() * dist;
                            let lz = angle.sin() * dist;

                            // Height: centered on main mass, ±20% spread for variety
                            let ly_frac = -0.20 + hash2d(li_seed + 2, 6102) * 0.40;
                            let ly_raw = canopy_center_y + canopy_ry * ly_frac;

                            // Size: 50–80% of canopy radius — substantial bumps
                            let size_t = hash2d(li_seed + 8, 6108);
                            let l_rx = canopy_rx * (0.50 + size_t * 0.30) * jit_sx;
                            let l_rz = canopy_rx * (0.48 + size_t * 0.28) * jit_sz;
                            // Vertical: 30-50% of canopy ry — chunky, not flat
                            let squash = 0.60 + hash2d(li_seed + 3, 6103) * 0.25;
                            let l_ry =
                                canopy_ry * (0.30 + hash2d(li_seed + 5, 6105) * 0.20) * squash;

                            let ly = ly_raw;

                            let (ct, cm, cb) = if hash2d(li_seed + 7, 6107) < 0.50 {
                                (c_mid, c_body, c_shadow)
                            } else {
                                (c_body, c_shadow, c_shadow)
                            };

                            push_dome(
                                &mut tp,
                                &mut tn,
                                &mut tc,
                                &mut ti,
                                Vec3::new(lx, ly, lz),
                                l_rx,
                                l_ry,
                                l_rz,
                                ct,
                                cm,
                                cb,
                            );
                            max_hw = max_hw.max(lx.abs() + l_rx.max(l_rz));
                            total_h = total_h.max(ly + l_ry);
                        }

                        // --- Top shelf: highlight cap merged INTO main mass ---
                        // Sits inside the canopy, not above it. Creates a bright
                        // sun-facing zone within the foliage volume.
                        if has_top {
                            let (ts_ox, ts_oz) = rot(
                                (hash2d(seed_base + 10, 6010) - 0.5) * canopy_rx * 0.30,
                                (hash2d(seed_base + 11, 6011) - 0.5) * canopy_rx * 0.30,
                            );
                            let stretch = 0.65 + hash2d(seed_base + 15, 6015) * 0.55;
                            let inv_stretch = 1.30 - stretch;
                            let ts_rx =
                                canopy_rx * (0.40 + hash2d(seed_base + 12, 6012) * 0.25) * stretch;
                            let ts_ry = canopy_ry * (0.15 + hash2d(seed_base + 18, 6018) * 0.12);
                            let ts_rz = canopy_rx
                                * (0.35 + hash2d(seed_base + 13, 6013) * 0.25)
                                * inv_stretch;
                            // Sit inside upper third of main mass, NOT above it
                            let ts_y = main_y + main_ry * 0.15;
                            push_dome(
                                &mut tp,
                                &mut tn,
                                &mut tc,
                                &mut ti,
                                Vec3::new(ts_ox, ts_y, ts_oz),
                                ts_rx,
                                ts_ry,
                                ts_rz,
                                c_highlight,
                                c_highlight,
                                c_mid,
                            );
                            max_hw = max_hw.max(ts_ox.abs() + ts_rx.max(ts_rz));
                            total_h = total_h.max(ts_y + ts_ry);
                        }

                        // --- Primary branch sub-canopies ---
                        // Branches carry foliage outward past the main canopy edge.
                        // This is the natural "overhang" — structurally grounded in
                        // the branch system, not an artificial filler.
                        // More trees get them (>1.3×), bigger reach, more count.
                        if size_scale > 1.30 {
                            // Scale branch count with tree size: 1-2 for medium, 2-3 for large
                            let pb_count = if size_scale > 1.70 {
                                2 + (hash2d(seed_base + 300, 7300) * 1.99) as i32 // 2-3
                            } else {
                                1 + (hash2d(seed_base + 300, 7300) * 1.99) as i32 // 1-2
                            };
                            for pi in 0..pb_count {
                                let pi_seed = seed_base + 400 + pi * 191;
                                let pb_angle = hash2d(pi_seed + 1, 7401) * std::f32::consts::TAU;
                                // Branch exits trunk at 55-80% height
                                let pb_y_frac = 0.55 + hash2d(pi_seed + 2, 7402) * 0.25;
                                let pb_y = trunk_h * pb_y_frac;
                                // Branch reaches further: 55-90% of canopy radius
                                // This creates the overhang — foliage past the main dome edge
                                let pb_reach =
                                    canopy_rx * (0.55 + hash2d(pi_seed + 3, 7403) * 0.35);
                                let pb_cx = pb_angle.cos() * pb_reach;
                                let pb_cz = pb_angle.sin() * pb_reach;
                                // Sub-canopy dome: 40-65% of main canopy size
                                let pb_size = 0.40 + hash2d(pi_seed + 4, 7404) * 0.25;
                                let pb_rx = canopy_rx * pb_size * jit_sx;
                                let pb_rz = canopy_rx * pb_size * jit_sz;
                                let pb_ry = canopy_ry * pb_size * 0.65;
                                // Dome center overlaps with main canopy bottom
                                let pb_dome_y = pb_y + pb_ry * 0.3;

                                // Use mid/body colors so it blends with main canopy
                                let (pct, pcm, pcb) = if hash2d(pi_seed + 7, 7407) < 0.5 {
                                    (c_mid, c_body, c_shadow)
                                } else {
                                    (c_body, c_shadow, c_shadow)
                                };

                                push_dome(
                                    &mut tp,
                                    &mut tn,
                                    &mut tc,
                                    &mut ti,
                                    Vec3::new(pb_cx, pb_dome_y, pb_cz),
                                    pb_rx,
                                    pb_ry,
                                    pb_rz,
                                    pct,
                                    pcm,
                                    pcb,
                                );
                                max_hw = max_hw.max(pb_cx.abs() + pb_rx.max(pb_rz));
                                total_h = total_h.max(pb_dome_y + pb_ry);
                            }
                        }

                        // 2-shape collider: trunk + canopy envelope
                        let canopy_h = total_h - trunk_h;
                        let collider_shapes = vec![
                            (
                                Vec3::new(0.0, trunk_h / 2.0, 0.0),
                                Quat::IDENTITY,
                                Collider::cuboid(trunk_r, trunk_h / 2.0, trunk_r),
                            ),
                            (
                                Vec3::new(0.0, trunk_h + canopy_h / 2.0, 0.0),
                                Quat::IDENTITY,
                                Collider::cuboid(max_hw * 0.7, canopy_h / 2.0, max_hw * 0.7),
                            ),
                        ];

                        let tree_mesh = meshes.add(build_chunk_mesh(tp, tn, tc, ti));
                        let tilt_x = (hash2d(tx * 4591 + 1277, tz * 3307) - 0.5) * 0.26; // ±7.5°
                        let tilt_z = (hash2d(tx * 5303, tz * 4219 + 1901) - 0.5) * 0.26;
                        let rot_y =
                            hash2d(tx * 6737 + 3119, tz * 5417 + 2309) * std::f32::consts::TAU;
                        let base_rot = Quat::from_euler(EulerRot::XYZ, tilt_x, rot_y, tilt_z);
                        let wind_phase =
                            hash2d(tx * 7919 + 4391, tz * 6133 + 2707) * std::f32::consts::TAU;
                        // Stiffness from trunk thickness: thicker trunk resists wind more
                        // trunk_r ~0.10 → stiffness ~1.0, trunk_r ~0.20 → stiffness ~2.0
                        let wind_stiffness = (trunk_r / 0.10).max(0.5);
                        let tree_entity = commands
                            .spawn((
                                Mesh3d(tree_mesh),
                                MeshMaterial3d(tile_materials.tree_body_mat.clone()),
                                Transform::from_xyz(world_x, tree_base_y, world_z)
                                    .with_rotation(base_rot),
                                RigidBody::Fixed,
                                Collider::compound(collider_shapes),
                                HoverOutline {
                                    half_extents: Vec3::new(max_hw, total_h / 2.0, max_hw),
                                },
                                Interactable {
                                    kind: InteractableKind::Tree,
                                },
                                TreeWindSway {
                                    base_rotation: base_rot,
                                    phase: wind_phase,
                                    stiffness: wind_stiffness,
                                },
                                TreeOccluder,
                            ))
                            .observe(on_pointer_over)
                            .observe(on_pointer_out)
                            .id();
                        entities.push(tree_entity);
                    }

                    // --- Flowers (pass-through billboard cards) ---
                    let flower_noise = hash2d(tx + 13721, tz + 8293);
                    if flower_noise < 0.12 {
                        let arch_idx = (hash2d(tx + 13821, tz + 8393) * NUM_FLORA_SPECIES as f32)
                            as usize
                            % NUM_FLORA_SPECIES;
                        let archetype = match arch_idx {
                            0 => FlowerArchetype::Tulip,
                            1 => FlowerArchetype::Daisy,
                            2 => FlowerArchetype::Lavender,
                            3 => FlowerArchetype::Bell,
                            4 => FlowerArchetype::Wildflower,
                            5 => FlowerArchetype::Sunflower,
                            6 => FlowerArchetype::Rose,
                            7 => FlowerArchetype::Cornflower,
                            8 => FlowerArchetype::Allium,
                            _ => FlowerArchetype::BlueOrchid,
                        };

                        let jx = (hash2d(tx + 13921, tz + 8293) - 0.5) * 0.6;
                        let jz = (hash2d(tx + 13721, tz + 8493) - 0.5) * 0.6;
                        let world_x = tx as f32 * TILE_SIZE + jx;
                        let world_z = tz as f32 * TILE_SIZE + jz;
                        let flower_y = column_h + 0.002;

                        let flower_entity = commands
                            .spawn((
                                Mesh3d(tile_materials.flower_meshes[arch_idx].clone()),
                                MeshMaterial3d(tile_materials.flower_mat.clone()),
                                Transform::from_xyz(world_x, flower_y, world_z),
                                Pickable::IGNORE,
                                archetype,
                            ))
                            .id();
                        entities.push(flower_entity);
                    }
                }
            }
        }

        // Spawn body entity (combined mesh + compound collider)
        let body_mesh = meshes.add(build_chunk_mesh(body_pos, body_nor, body_col, body_idx));
        let body_entity = commands
            .spawn((
                Mesh3d(body_mesh),
                MeshMaterial3d(tile_materials.chunk_body_mat.clone()),
                Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                Pickable::IGNORE,
                RigidBody::Fixed,
                Collider::compound(collider_shapes),
            ))
            .id();
        entities.push(body_entity);

        // Spawn cap entity (combined mesh, no collider)
        let cap_mesh = meshes.add(build_chunk_mesh(cap_pos, cap_nor, cap_col, cap_idx));
        let cap_entity = commands
            .spawn((
                Mesh3d(cap_mesh),
                MeshMaterial3d(tile_materials.chunk_cap_mat.clone()),
                Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                Pickable::IGNORE,
            ))
            .id();
        entities.push(cap_entity);

        // Spawn water entity (combined mesh, transparent material)
        if !water_pos.is_empty() {
            let water_mesh =
                meshes.add(build_chunk_mesh(water_pos, water_nor, water_col, water_idx));
            let water_entity = commands
                .spawn((
                    Mesh3d(water_mesh),
                    MeshMaterial3d(tile_materials.water_mat.clone()),
                    Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(water_entity);
        }

        // Spawn vegetation entities (3 wind groups per chunk)
        let base_veg = Vec3::new(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE);
        for (group_idx, veg) in veg_groups.into_iter().enumerate() {
            if veg.pos.is_empty() {
                continue;
            }
            let veg_mesh = meshes.add(build_chunk_mesh(veg.pos, veg.nor, veg.col, veg.idx));
            let veg_entity = commands
                .spawn((
                    Mesh3d(veg_mesh),
                    MeshMaterial3d(tile_materials.chunk_veg_mat.clone()),
                    Transform::from_translation(base_veg),
                    Pickable::IGNORE,
                    WindSway {
                        base_translation: base_veg,
                        phase: group_idx as f32 * 2.1,
                    },
                ))
                .id();
            entities.push(veg_entity);
        }

        terrain.link_chunk_entities(*cx, *cz, entities);
    }
}
