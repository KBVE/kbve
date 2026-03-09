use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::light::{
    CascadeShadowConfigBuilder, Cascades, DirectionalLightShadowMap, SimulationLightSystems,
};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use bevy_rapier3d::prelude::*;

use super::player::Player;
use super::scene_objects::{
    FlowerArchetype, HoverOutline, Interactable, InteractableKind, on_pointer_out, on_pointer_over,
};
use super::terrain::{CHUNK_SIZE, TerrainMap, hash2d};

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

/// 4-shade bark palette (sRGB): dark shadow → highlight.
const BARK_DARK: (f32, f32, f32) = (0.25, 0.16, 0.08);
const BARK_MID_DARK: (f32, f32, f32) = (0.35, 0.22, 0.12);
const BARK_MID_LIGHT: (f32, f32, f32) = (0.42, 0.29, 0.17);
const BARK_HIGHLIGHT: (f32, f32, f32) = (0.52, 0.36, 0.22);

/// Per-tree canopy hue variants (sRGB). More variation = painterly forest.
/// Ghibli-style midtone greens (warm/cool shift applied per-tone in spawn).
const TREE_CANOPY_COLORS: [(f32, f32, f32); 5] = [
    (0.28, 0.54, 0.18), // neutral forest green
    (0.34, 0.62, 0.22), // mid green
    (0.32, 0.56, 0.17), // warm olive
    (0.30, 0.58, 0.24), // cool green
    (0.36, 0.52, 0.18), // yellow-green
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

const TREE_PRESETS: [TreePreset; 5] = [
    // Conifer: taller trunk, narrower cone
    TreePreset {
        trunk_h: 0.95,
        trunk_r: 0.09,
        canopy: CanopyShape::Cone {
            radius: 0.85,
            height: 2.0,
            center_y_offset: -0.2,
        },
    },
    // Tall: taller trunk, upright oblong crown
    TreePreset {
        trunk_h: 1.05,
        trunk_r: 0.10,
        canopy: CanopyShape::Ellipsoid {
            rx: 0.90,
            ry: 0.95,
            rz: 0.85,
            center_y_offset: 0.45,
        },
    },
    // Bushy: shorter trunk, wider crown
    TreePreset {
        trunk_h: 0.60,
        trunk_r: 0.11,
        canopy: CanopyShape::Ellipsoid {
            rx: 1.15,
            ry: 0.65,
            rz: 1.20,
            center_y_offset: 0.45,
        },
    },
    // Oak: medium trunk, broad heavy crown (asymmetric rx/rz)
    TreePreset {
        trunk_h: 0.80,
        trunk_r: 0.13,
        canopy: CanopyShape::Ellipsoid {
            rx: 1.10,
            ry: 0.80,
            rz: 0.95,
            center_y_offset: 0.55,
        },
    },
    // Round: compact, balanced
    TreePreset {
        trunk_h: 0.65,
        trunk_r: 0.09,
        canopy: CanopyShape::Ellipsoid {
            rx: 0.90,
            ry: 0.75,
            rz: 0.90,
            center_y_offset: 0.50,
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
/// `y_frac`: 0.0 = base, 1.0 = top. Returns `[+Y, -Y, +X, -X, +Z, -Z]`.
fn bark_face_colors(y_frac: f32) -> [[f32; 4]; 6] {
    // Root darkening: bottom 15% of trunk gets 15% darker
    let root = if y_frac < 0.15 { 0.85 } else { 1.0 };
    let apply = |c: (f32, f32, f32)| srgb_color(c.0 * root, c.1 * root, c.2 * root);

    let top = lerp3(BARK_MID_LIGHT, BARK_HIGHLIGHT, y_frac);
    let lit = lerp3(BARK_MID_LIGHT, BARK_HIGHLIGHT, y_frac); // +X sun-facing
    let shadow = lerp3(BARK_DARK, BARK_MID_DARK, y_frac); // -X shadowed
    let semi_s = lerp3(BARK_MID_DARK, BARK_MID_LIGHT, y_frac); // +Z partial shadow
    let semi_l = lerp3(BARK_MID_LIGHT, BARK_HIGHLIGHT, y_frac * 0.7); // -Z partial lit

    [
        apply(top),
        apply(BARK_DARK),
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

/// Like `push_cuboid` but each face gets its own color.
/// `face_colors` order: `[+Y, -Y, +X, -X, +Z, -Z]`.
fn push_cuboid_multicolor(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    face_colors: [[f32; 4]; 6],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    // +Y
    pos.extend_from_slice(&[
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[0]).take(4));

    // -Y
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[1]).take(4));

    // +X
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[2]).take(4));

    // -X
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);
    col.extend(std::iter::repeat(face_colors[3]).take(4));

    // +Z
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);
    col.extend(std::iter::repeat(face_colors[4]).take(4));

    // -Z
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);
    col.extend(std::iter::repeat(face_colors[5]).take(4));

    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
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

// ---------------------------------------------------------------------------
// Alpha-masked leaf cluster canopy (t3ssel8r style)
// ---------------------------------------------------------------------------

/// Number of procedural canopy blob variants in the atlas.
const NUM_BLOB_VARIANTS: usize = 8;
/// Pixel size of each blob tile in the atlas.
const BLOB_TILE: usize = 48;

/// Cheap pseudo-noise for silhouette wobble.
fn blob_noise(x: f32, y: f32, seed: f32) -> f32 {
    let n1 = ((x * 3.0 + seed * 0.37).sin() * (y * 3.0 + seed * 0.73).cos()) * 0.12;
    let n2 = ((x * 7.0 - seed * 0.19).cos() * (y * 7.0 + seed * 0.53).sin()) * 0.06;
    let n3 = ((x * 13.0 + seed * 0.91).sin() * (y * 11.0 - seed * 0.41).cos()) * 0.03;
    n1 + n2 + n3
}

fn blob_hash(x: f32, y: f32) -> f32 {
    ((x * 127.1 + y * 311.7).sin() * 43758.5453).fract().abs()
}

fn blob_smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Generate procedural canopy blob atlas: N variants × BLOB_TILE × BLOB_TILE.
/// Each blob = grayscale brightness (top bright, bottom dark, interior AO) + alpha silhouette.
/// GPU multiplies texture × vertex_color for per-tree hue.
fn generate_blob_atlas() -> (Vec<u8>, u32, u32) {
    let atlas_w = (NUM_BLOB_VARIANTS * BLOB_TILE) as u32;
    let atlas_h = BLOB_TILE as u32;
    let mut pixels = vec![0u8; (atlas_w * atlas_h * 4) as usize];

    for variant in 0..NUM_BLOB_VARIANTS {
        let seed = variant as f32;
        // Per-variant shape variation: wide range of aspect ratios
        let rx = 0.72 + blob_hash(seed * 7.0, 1.0) * 0.22;
        let ry = 0.65 + blob_hash(seed * 13.0, 2.0) * 0.25;
        let x_off = variant * BLOB_TILE;

        for py in 0..BLOB_TILE {
            for px_local in 0..BLOB_TILE {
                let u = (px_local as f32 / (BLOB_TILE - 1) as f32) * 2.0 - 1.0;
                let v = (py as f32 / (BLOB_TILE - 1) as f32) * 2.0 - 1.0;

                // Stronger asymmetry skew
                let skew_x = 0.14 * (v * 1.7 + seed * 0.13).sin();
                let skew_y = 0.10 * (u * 1.1 - seed * 0.07).cos();

                let sx = (u + skew_x) / rx;
                let sy = (v + skew_y) / ry;
                let base_r = (sx * sx + sy * sy).sqrt();

                // Irregular silhouette wobble
                let wobble = blob_noise(u, v, seed);
                let threshold = 1.0 + wobble;

                // Soft alpha edge (wider feather for painterly feel)
                let alpha = 1.0 - blob_smoothstep(threshold - 0.14, threshold, base_r);
                if alpha <= 0.001 {
                    continue;
                }

                // Height gradient: bright top, dark bottom (stronger for painterly depth)
                let top_to_bottom = py as f32 / (BLOB_TILE - 1) as f32;
                let vertical_light = 1.15 + (0.55 - 1.15) * top_to_bottom;

                // Interior darkening (center is deeper into canopy)
                let center_factor = 1.0 - base_r.clamp(0.0, 1.0);
                let interior_shade = 1.0 - center_factor * 0.18;

                // Edge breakup speckles
                let edge_dist = (threshold - base_r).clamp(0.0, 1.0);
                let edge_zone = 1.0 - blob_smoothstep(0.0, 0.18, edge_dist);
                let breakup_rand =
                    blob_hash(px_local as f32 + seed * 11.0, py as f32 + seed * 17.0);
                let breakup = if breakup_rand < 0.06 * edge_zone {
                    0.85
                } else {
                    1.0
                };

                // Subtle noise tint to avoid flat fill
                let noise_tint =
                    0.96 + blob_hash(px_local as f32 + seed * 3.0, py as f32 + seed * 5.0) * 0.08;

                let shade =
                    (vertical_light * interior_shade * breakup * noise_tint).clamp(0.0, 1.0);
                let g = (shade * 255.0) as u8;
                let a = (alpha.clamp(0.0, 1.0) * 255.0) as u8;

                let pixel_idx = ((x_off + px_local) + py * atlas_w as usize) * 4;
                pixels[pixel_idx] = g;
                pixels[pixel_idx + 1] = g;
                pixels[pixel_idx + 2] = g;
                pixels[pixel_idx + 3] = a;
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

/// Push a UV-mapped leaf card (crossed planes, double-sided).
/// UV maps into the leaf atlas based on mask_idx.
fn push_leaf_card(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    uvs: &mut Vec<[f32; 2]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    hw: f32,
    h: f32,
    rot_y: f32,
    mask_idx: usize,
    color: [f32; 4],
) {
    let u0 = mask_idx as f32 / NUM_BLOB_VARIANTS as f32;
    let u1 = (mask_idx + 1) as f32 / NUM_BLOB_VARIANTS as f32;

    let (sin_r, cos_r) = rot_y.sin_cos();
    let sin45 = std::f32::consts::FRAC_1_SQRT_2;

    for &(bx, bz) in &[(sin45, sin45), (sin45, -sin45)] {
        let dx = bx * cos_r - bz * sin_r;
        let dz = bx * sin_r + bz * cos_r;
        let nx = -dz;
        let nz = dx;

        // Front face
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [center.x - hw * dx, center.y, center.z - hw * dz],
            [center.x + hw * dx, center.y, center.z + hw * dz],
            [center.x + hw * dx, center.y + h, center.z + hw * dz],
            [center.x - hw * dx, center.y + h, center.z - hw * dz],
        ]);
        nor.extend_from_slice(&[[nx, 0.0, nz]; 4]);
        col.extend_from_slice(&[color; 4]);
        uvs.extend_from_slice(&[[u0, 1.0], [u1, 1.0], [u1, 0.0], [u0, 0.0]]);
        idx.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);

        // Back face
        let base = pos.len() as u32;
        pos.extend_from_slice(&[
            [center.x - hw * dx, center.y, center.z - hw * dz],
            [center.x + hw * dx, center.y, center.z + hw * dz],
            [center.x + hw * dx, center.y + h, center.z + hw * dz],
            [center.x - hw * dx, center.y + h, center.z - hw * dz],
        ]);
        nor.extend_from_slice(&[[-nx, 0.0, -nz]; 4]);
        col.extend_from_slice(&[color; 4]);
        uvs.extend_from_slice(&[[u1, 1.0], [u0, 1.0], [u0, 0.0], [u1, 0.0]]);
        idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }
}

/// Push a UV-mapped horizontal leaf card (XZ plane, double-sided).
/// Supports asymmetric x/z half-widths and rotation for organic silhouettes.
fn push_leaf_cap(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    uvs: &mut Vec<[f32; 2]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    hx: f32,
    hz: f32,
    rot_y: f32,
    mask_idx: usize,
    color: [f32; 4],
) {
    let u0 = mask_idx as f32 / NUM_BLOB_VARIANTS as f32;
    let u1 = (mask_idx + 1) as f32 / NUM_BLOB_VARIANTS as f32;

    let (sin_r, cos_r) = rot_y.sin_cos();
    // 4 corners in local space, then rotate around Y
    let corners: [(f32, f32); 4] = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)];
    let rot_corners: Vec<(f32, f32)> = corners
        .iter()
        .map(|&(lx, lz)| (lx * cos_r - lz * sin_r, lx * sin_r + lz * cos_r))
        .collect();

    // Top face
    let base = pos.len() as u32;
    for &(rx, rz) in &rot_corners {
        pos.push([center.x + rx, center.y, center.z + rz]);
    }
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
    col.extend_from_slice(&[color; 4]);
    uvs.extend_from_slice(&[[u0, 0.0], [u1, 0.0], [u1, 1.0], [u0, 1.0]]);
    idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);

    // Bottom face (reversed winding)
    let base = pos.len() as u32;
    for &(rx, rz) in rot_corners.iter().rev() {
        pos.push([center.x + rx, center.y, center.z + rz]);
    }
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);
    col.extend_from_slice(&[color; 4]);
    uvs.extend_from_slice(&[[u0, 1.0], [u1, 1.0], [u1, 0.0], [u0, 0.0]]);
    idx.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
}

/// Build canopy mesh with real UVs for alpha-masked leaf atlas.
fn build_canopy_mesh(
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    uvs: Vec<[f32; 2]>,
    indices: Vec<u32>,
) -> Mesh {
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_indices(Indices::U32(indices))
}

/// Leaf card vertex color with strong height-based ambient occlusion.
/// Bottom cards get very dark (deep canopy shadow), top cards get bright.
fn leaf_card_color(base: (f32, f32, f32), height_frac: f32) -> [f32; 4] {
    // Extreme AO: 0.20 at bottom → 1.15 at top (deep canopy shadow → bright crown)
    let brightness = 0.20 + height_frac * 0.95;
    srgb_color(
        (base.0 * brightness).min(1.0),
        (base.1 * brightness).min(1.0),
        (base.2 * brightness).min(1.0),
    )
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
    /// Alpha-masked leaf cluster material for tree canopies.
    canopy_mat: Handle<StandardMaterial>,
}

/// Per-group vegetation vertex buffers (3 groups per chunk for wind animation).
struct VegBuffers {
    pos: Vec<[f32; 3]>,
    nor: Vec<[f32; 3]>,
    col: Vec<[f32; 4]>,
    idx: Vec<u32>,
}

/// Attached to each vegetation group entity for wind sway animation.
#[derive(Component)]
struct WindSway {
    base_translation: Vec3,
    phase: f32,
}

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (setup_tile_materials, spawn_lighting));
        app.add_systems(Update, process_chunk_spawns_and_despawns);
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

    // Generate leaf cluster atlas for canopy billboards
    let (leaf_pixels, lw, lh) = generate_blob_atlas();
    let mut leaf_img = Image::new(
        bevy::render::render_resource::Extent3d {
            width: lw,
            height: lh,
            depth_or_array_layers: 1,
        },
        bevy::render::render_resource::TextureDimension::D2,
        leaf_pixels,
        bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    leaf_img.sampler = ImageSampler::nearest();
    let leaf_handle = images.add(leaf_img);

    let canopy_mat = materials.add(StandardMaterial {
        base_color_texture: Some(leaf_handle),
        alpha_mode: AlphaMode::Mask(0.5),
        cull_mode: None,
        double_sided: true,
        unlit: true,
        ..default()
    });

    commands.insert_resource(TileMaterials {
        chunk_body_mat,
        chunk_cap_mat,
        tree_body_mat,
        chunk_veg_mat,
        flower_meshes,
        flower_mat,
        canopy_mat,
    });
}

fn spawn_lighting(mut commands: Commands) {
    commands.insert_resource(GlobalAmbientLight {
        color: Color::WHITE,
        brightness: 200.0,
        ..default()
    });
    // Single cascade + high-res shadow map + texel-snapping stabilisation.
    // The `stabilize_shadow_cascades` system (PostUpdate) snaps the cascade's
    // clip-space projection to shadow-texel boundaries so the shadow grid
    // stays locked to the world regardless of camera movement.
    commands.insert_resource(DirectionalLightShadowMap { size: 4096 });
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

fn animate_wind(time: Res<Time>, mut query: Query<(&mut Transform, &WindSway)>) {
    let t = time.elapsed_secs();
    for (mut tf, wind) in &mut query {
        // Amplitude = 1 pixel, snapped to pixel grid so edges never land sub-pixel.
        let raw_dx = (t * 1.2 + wind.phase).sin() * VEG_SNAP;
        let raw_dz = (t * 0.9 + wind.phase * 1.4).cos() * VEG_SNAP;
        let dx = (raw_dx / VEG_SNAP).round() * VEG_SNAP;
        let dz = (raw_dz / VEG_SNAP).round() * VEG_SNAP;
        tf.translation = wind.base_translation + Vec3::new(dx, 0.0, dz);
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
                        let leaf_variant = (hash2d(tx + 11517, tz + 5671) * 5.0) as usize % 5;
                        let preset_idx = (hash2d(tx + 11617, tz + 5771) * 5.0) as usize % 5;
                        let size_scale = 1.10 + hash2d(tx + 11717, tz + 5871) * 1.10; // 1.10–2.20

                        let preset = TREE_PRESETS[preset_idx];
                        let trunk_h = preset.trunk_h * size_scale;
                        let trunk_r = preset.trunk_r * size_scale;

                        let world_x = tx as f32 * TILE_SIZE + jx;
                        let world_z = tz as f32 * TILE_SIZE + jz;
                        let tree_base_y = column_h + 0.002;

                        // Build trunk mesh: root flare + trunk + branches (max ~6 cuboids)
                        let max_cuboids = 2 + 4; // root flare + trunk + up to 4 branches
                        let mut tp = Vec::with_capacity(max_cuboids * 24);
                        let mut tn = Vec::with_capacity(max_cuboids * 24);
                        let mut tc = Vec::with_capacity(max_cuboids * 24);
                        let mut ti = Vec::with_capacity(max_cuboids * 36);

                        // --- Root flare (bottom 20% of trunk, wider) ---
                        let root_h = trunk_h * 0.2;
                        let root_r = trunk_r * 1.3;
                        push_cuboid_multicolor(
                            &mut tp,
                            &mut tn,
                            &mut tc,
                            &mut ti,
                            Vec3::new(0.0, root_h / 2.0, 0.0),
                            Vec3::new(root_r, root_h / 2.0, root_r),
                            bark_face_colors(0.05),
                        );

                        // --- Main trunk (top 80%) ---
                        let main_h = trunk_h * 0.8;
                        push_cuboid_multicolor(
                            &mut tp,
                            &mut tn,
                            &mut tc,
                            &mut ti,
                            Vec3::new(0.0, root_h + main_h / 2.0, 0.0),
                            Vec3::new(trunk_r, main_h / 2.0, trunk_r),
                            bark_face_colors(0.55),
                        );

                        // --- Branch stubs (2-4 sheared cuboids in upper trunk) ---
                        let branch_count = 2 + (hash2d(tx + 11817, tz + 5971) * 3.0) as i32;
                        let branch_zone_base = trunk_h * 0.55;
                        let branch_zone_h = trunk_h * 0.35;
                        for bi in 0..branch_count {
                            let angle =
                                hash2d(tx + 13000 + bi * 173, tz + 7000) * std::f32::consts::TAU;
                            let y_pos = branch_zone_base
                                + hash2d(tx + 13100 + bi * 173, tz + 7100) * branch_zone_h;
                            let branch_len = (0.10
                                + hash2d(tx + 13200 + bi * 173, tz + 7200) * 0.12)
                                * size_scale;
                            let branch_thick = trunk_r * 0.45;
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
                                bark_face_colors(0.7),
                            );
                        }

                        // --- 3-dome canopy volumes + edge breakup cards ---
                        let canopy_base = TREE_CANOPY_COLORS[leaf_variant];
                        let seed_base = tx * 31337 + tz * 17389;
                        let mut max_hw: f32 = trunk_r;
                        let mut total_h: f32 = trunk_h;

                        // Derive canopy dimensions from shape
                        let (canopy_rx, canopy_ry, canopy_center_y) = match preset.canopy {
                            CanopyShape::Cone {
                                radius,
                                height,
                                center_y_offset,
                            } => (
                                radius * size_scale,
                                height * size_scale * 0.5,
                                trunk_h + (center_y_offset + height * 0.5) * size_scale,
                            ),
                            CanopyShape::Ellipsoid {
                                rx,
                                ry,
                                center_y_offset,
                                ..
                            } => (
                                rx * size_scale,
                                ry * size_scale,
                                trunk_h + center_y_offset * size_scale,
                            ),
                        };
                        let canopy_bottom = canopy_center_y - canopy_ry;
                        let canopy_span = (canopy_ry * 2.0).max(0.01);

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
                        // Per-tree shape jitter — moderate asymmetry
                        let jit_sx = 0.85 + hash2d(seed_base + 70, 6070) * 0.30; // 0.85–1.15
                        let jit_sz = 0.85 + hash2d(seed_base + 71, 6071) * 0.30;

                        // Foliage body: clear step down from mid, dominates ~55%
                        // Halfway between mid and shadow — readable as its own band
                        let c_body = srgb_color(tb.0 * 0.72, tb.1 * 0.78, tb.2 * 0.82);

                        // ═══════════════════════════════════════════════════════
                        // CLUSTER VOLUME: big main dome + 3-5 edge bumps that
                        // overlap the rim to break the circular silhouette.
                        // Lobes overlap ~50% with main mass — connected, not separated.
                        // ═══════════════════════════════════════════════════════

                        // Per-tree canopy Y jitter so heights vary
                        let canopy_center_y =
                            canopy_center_y + (hash2d(seed_base + 81, 6081) - 0.4) * 0.25;

                        // Edge bump count: 3–5
                        let bump_count = 3 + (hash2d(seed_base + 80, 6080) * 2.99) as i32;
                        let has_top = hash2d(seed_base + 17, 6017) < 0.60;

                        // --- Main mass: big solid dome (full canopy width) ---
                        let main_rx =
                            canopy_rx * (0.85 + hash2d(seed_base + 20, 6020) * 0.20) * jit_sx;
                        let main_ry = canopy_ry * (0.28 + hash2d(seed_base + 22, 6022) * 0.17);
                        let main_rz =
                            canopy_rx * (0.80 + hash2d(seed_base + 21, 6021) * 0.20) * jit_sz;
                        let main_y = canopy_center_y.min(trunk_h + main_ry);
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

                        // --- Edge bumps: overlap the rim of main dome ---
                        // Asymmetric: bumps cluster toward a random "heavy side" so
                        // the canopy reads as lopsided, not radially symmetric.
                        let heavy_angle =
                            hash2d(tx * 7919 + 2953, tz * 6271 + 4391) * std::f32::consts::TAU;
                        for li in 0..bump_count {
                            let li_seed = seed_base + 200 + li * 137;

                            // Random angle biased toward heavy side (±90° cone, 60% of bumps)
                            let angle = if hash2d(li_seed + 9, 6109) < 0.60 {
                                // Cluster near heavy side
                                heavy_angle + (hash2d(li_seed, 6100) - 0.5) * 1.57
                            } else {
                                // Sparse on opposite side
                                heavy_angle
                                    + std::f32::consts::PI
                                    + (hash2d(li_seed, 6100) - 0.5) * 2.0
                            };

                            // Offset: 55–80% — partially inside, partially outside
                            let dist = canopy_rx * (0.55 + hash2d(li_seed + 1, 6101) * 0.25);
                            let lx = angle.cos() * dist;
                            let lz = angle.sin() * dist;

                            // Height stagger: ±15% of canopy center
                            let ly_frac = -0.15 + hash2d(li_seed + 2, 6102) * 0.30;
                            let ly_raw = canopy_center_y + canopy_ry * ly_frac;

                            // Size: 50–85% of canopy radius
                            let size_t = hash2d(li_seed + 8, 6108);
                            let l_rx = canopy_rx * (0.50 + size_t * 0.35) * jit_sx;
                            let l_rz = canopy_rx * (0.47 + size_t * 0.32) * jit_sz;
                            // Vertical squash: 0.50–0.80 — flattened leaf-cluster look
                            let squash = 0.50 + hash2d(li_seed + 3, 6103) * 0.30;
                            let l_ry =
                                canopy_ry * (0.20 + hash2d(li_seed + 5, 6105) * 0.16) * squash;

                            let ly = ly_raw.min(trunk_h + l_ry);

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

                        // --- Top shelf: highlight cap ---
                        if has_top {
                            let (ts_ox, ts_oz) = rot(
                                (hash2d(seed_base + 10, 6010) - 0.5) * canopy_rx * 0.40,
                                (hash2d(seed_base + 11, 6011) - 0.5) * canopy_rx * 0.40,
                            );
                            let stretch = 0.65 + hash2d(seed_base + 15, 6015) * 0.55;
                            let inv_stretch = 1.30 - stretch;
                            let ts_rx =
                                canopy_rx * (0.35 + hash2d(seed_base + 12, 6012) * 0.25) * stretch;
                            let ts_ry = canopy_ry * (0.12 + hash2d(seed_base + 18, 6018) * 0.14);
                            let ts_rz = canopy_rx
                                * (0.30 + hash2d(seed_base + 13, 6013) * 0.25)
                                * inv_stretch;
                            let ts_y =
                                (main_y + main_ry * 0.4).min(canopy_center_y + canopy_ry * 0.20);
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
                        let tree_entity = commands
                            .spawn((
                                Mesh3d(tree_mesh),
                                MeshMaterial3d(tile_materials.tree_body_mat.clone()),
                                {
                                    let tilt_x =
                                        (hash2d(tx * 4591 + 1277, tz * 3307) - 0.5) * 0.175; // ±5°
                                    let tilt_z =
                                        (hash2d(tx * 5303, tz * 4219 + 1901) - 0.5) * 0.175;
                                    Transform::from_xyz(world_x, tree_base_y, world_z)
                                        .with_rotation(Quat::from_euler(
                                            EulerRot::XZY,
                                            tilt_x,
                                            0.0,
                                            tilt_z,
                                        ))
                                },
                                RigidBody::Fixed,
                                Collider::compound(collider_shapes),
                                HoverOutline {
                                    half_extents: Vec3::new(max_hw, total_h / 2.0, max_hw),
                                },
                                Interactable {
                                    kind: InteractableKind::Tree,
                                },
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
