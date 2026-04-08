use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use avian3d::prelude::*;

use std::collections::HashSet;

use crossbeam_channel::{Receiver, Sender};
use dashmap::DashSet;

use super::camera::IsometricCamera;
use super::mushrooms;
use super::player::Player;
use super::rocks;
use super::scene_objects::{
    FlowerArchetype, HoverOutline, Interactable, InteractableKind, MushroomKind, RockKind,
    on_pointer_out, on_pointer_over,
};
use super::terrain::{CHUNK_SIZE, MAX_HEIGHT, NOISE_SCALE, TerrainMap, hash2d, terrain_height};
use super::water::{WATER_LEVEL, WaterMaterial};
use super::weather::{BlobShadow, BlobShadowAssets};

pub const TILE_SIZE: f32 = 1.0;

/// Tile coordinate component — attached to world objects (trees, rocks, flowers,
/// mushrooms) so they can be looked up and despawned when collected.
#[derive(Component, Clone, Copy, Debug)]
pub struct TileCoord {
    pub tx: i32,
    pub tz: i32,
}

/// Tracks tiles whose objects have been collected (removed by the server).
/// Checked during chunk spawning to skip collected objects.
#[derive(Resource, Default)]
pub struct CollectedTiles(pub std::collections::HashSet<(i32, i32)>);

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
    (0.62, 0.48, 0.32), // dirt — brighter so shadows don't crush it
    (0.58, 0.58, 0.58), // stone — brighter
    (0.9, 0.9, 0.95),
];

/// Body darkness factor — gentle darkening so PBR shadows don't double-crush.
const BODY_DARKEN: f32 = 0.72;

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
pub(super) fn srgb_to_linear(c: f32) -> f32 {
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
        grass_shade_linear(tx, tz)
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

/// Linear-space grass shade for a single tile (used for blending).
fn grass_shade_linear(tx: i32, tz: i32) -> [f32; 4] {
    let idx = (hash2d(tx + 1337, tz) * 12.0) as usize % 12;
    let (r, g, b) = GRASS_SHADES[idx];
    [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
}

#[allow(dead_code)]
fn blended_grass_corner(
    tx0: i32,
    tz0: i32,
    tx1: i32,
    tz1: i32,
    tx2: i32,
    tz2: i32,
    tx3: i32,
    tz3: i32,
) -> [f32; 4] {
    let a = grass_shade_linear(tx0, tz0);
    let b = grass_shade_linear(tx1, tz1);
    let c = grass_shade_linear(tx2, tz2);
    let d = grass_shade_linear(tx3, tz3);
    [
        (a[0] + b[0] + c[0] + d[0]) * 0.25,
        (a[1] + b[1] + c[1] + d[1]) * 0.25,
        (a[2] + b[2] + c[2] + d[2]) * 0.25,
        1.0,
    ]
}

// ---------------------------------------------------------------------------
// Vegetation vertex color constants
// ---------------------------------------------------------------------------

/// Snap vegetation jitter to the pixel grid (1/PIXEL_DENSITY = 1/32 world units).
/// Matches the camera snap step so edges never land between pixels.
#[allow(dead_code)]
const VEG_SNAP: f32 = 1.0 / 32.0;

// ---------------------------------------------------------------------------
// Pixel-art grass masks (8×8) — disabled for now, kept for future use
// ---------------------------------------------------------------------------

#[allow(dead_code)]
const GRASS_TRANSPARENT: u8 = 0;

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_A: [[u8; 8]; 8] = [
    [0,0,4,0,0,0,4,0],
    [0,0,3,0,0,0,3,0],
    [0,0,3,0,0,4,3,0],
    [0,0,2,0,0,3,2,0],
    [0,0,2,0,0,2,2,0],
    [0,0,1,0,0,2,1,0],
    [0,0,1,0,0,1,1,0],
    [0,0,1,0,0,1,1,0],
];

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_B: [[u8; 8]; 8] = [
    [0,0,0,4,0,0,0,0],
    [0,0,0,3,0,0,4,0],
    [0,0,0,3,0,0,3,0],
    [0,0,0,2,0,0,3,0],
    [0,4,0,2,0,0,2,0],
    [0,3,0,1,0,0,2,0],
    [0,2,0,1,0,0,1,0],
    [0,1,0,1,0,0,1,0],
];

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_C: [[u8; 8]; 8] = [
    [0,4,0,0,4,0,0,0],
    [0,3,0,0,3,0,0,0],
    [0,3,0,0,3,0,4,0],
    [0,2,0,0,2,0,3,0],
    [0,2,0,0,2,0,3,0],
    [0,1,0,0,1,0,2,0],
    [0,1,0,0,1,0,1,0],
    [0,1,0,0,1,0,1,0],
];

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_D: [[u8; 8]; 8] = [
    [0,0,0,4,0,4,0,0],
    [0,0,0,3,0,3,0,0],
    [0,0,0,3,0,3,0,0],
    [0,0,0,2,0,2,0,0],
    [0,0,0,2,0,2,0,0],
    [0,0,0,1,0,1,0,0],
    [0,0,0,1,0,1,0,0],
    [0,0,0,1,0,1,0,0],
];

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_E: [[u8; 8]; 8] = [
    [0,0,4,0,0,0,0,0],
    [0,0,3,0,0,4,0,0],
    [0,0,3,0,0,3,0,0],
    [0,0,2,0,0,3,0,0],
    [0,0,2,0,0,2,0,0],
    [0,0,1,0,0,2,0,0],
    [0,0,1,0,0,1,0,0],
    [0,0,1,0,0,1,0,0],
];

#[allow(dead_code)]
#[rustfmt::skip]
const GRASS_MASK_F: [[u8; 8]; 8] = [
    [0,4,0,0,0,0,0,4],
    [0,3,0,0,4,0,0,3],
    [0,3,0,0,3,0,0,3],
    [0,2,0,0,3,0,0,2],
    [0,2,0,0,2,0,0,2],
    [0,1,0,0,2,0,0,1],
    [0,1,0,0,1,0,0,1],
    [0,1,0,0,1,0,0,1],
];

#[allow(dead_code)]
const NUM_GRASS_VARIANTS: usize = 6;

#[allow(dead_code)]
const GRASS_MASKS: [&[[u8; 8]; 8]; NUM_GRASS_VARIANTS] = [
    &GRASS_MASK_A,
    &GRASS_MASK_B,
    &GRASS_MASK_C,
    &GRASS_MASK_D,
    &GRASS_MASK_E,
    &GRASS_MASK_F,
];

#[allow(dead_code)]
struct GrassPalette {
    deep: [u8; 3],      // role 1 — darkest base
    shadow: [u8; 3],    // role 2
    mid: [u8; 3],       // role 3
    highlight: [u8; 3], // role 4 — sun-kissed tips
}

#[allow(dead_code)]
const GRASS_PALETTE: GrassPalette = GrassPalette {
    deep: [46, 90, 36],         // #2E5A24
    shadow: [79, 138, 60],      // #4F8A3C
    mid: [127, 191, 91],        // #7FBF5B
    highlight: [166, 217, 106], // #A6D96A
};

#[allow(dead_code)]
fn generate_grass_atlas() -> (Vec<u8>, u32, u32) {
    let atlas_w: u32 = NUM_GRASS_VARIANTS as u32 * 8;
    let atlas_h: u32 = 8;
    let mut pixels = vec![0u8; (atlas_w * atlas_h * 4) as usize];

    for (variant, mask) in GRASS_MASKS.iter().enumerate() {
        let x_offset = variant as u32 * 8;
        for row in 0..8u32 {
            for col in 0..8u32 {
                let role = mask[row as usize][col as usize];
                if role == GRASS_TRANSPARENT {
                    continue;
                }
                let rgb = match role {
                    1 => GRASS_PALETTE.deep,
                    2 => GRASS_PALETTE.shadow,
                    3 => GRASS_PALETTE.mid,
                    4 => GRASS_PALETTE.highlight,
                    _ => [255, 0, 255],
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

/// Build a UV-mapped grass tuft mesh: two crossed planes (MC-style X pattern)
/// textured from the procedural grass atlas. `variant_idx` selects which 8×8
/// region of the atlas to sample.
///
#[allow(dead_code)]
fn build_grass_tuft_mesh(variant_idx: usize) -> Mesh {
    let hw = 0.20; // half-width (narrower)
    let h = 0.55; // height (taller)

    // UV region for this variant in the atlas
    let u0 = variant_idx as f32 / NUM_GRASS_VARIANTS as f32;
    let u1 = (variant_idx + 1) as f32 / NUM_GRASS_VARIANTS as f32;

    let mut positions: Vec<[f32; 3]> = Vec::with_capacity(16);
    let mut normals: Vec<[f32; 3]> = Vec::with_capacity(16);
    let mut uvs: Vec<[f32; 2]> = Vec::with_capacity(16);
    let mut indices: Vec<u32> = Vec::with_capacity(24);

    // Two crossed planes at 45° (MC-style X pattern).
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

pub(super) fn srgb_color(r: f32, g: f32, b: f32) -> [f32; 4] {
    [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
}

pub(super) fn lerp3(a: (f32, f32, f32), b: (f32, f32, f32), t: f32) -> (f32, f32, f32) {
    (
        a.0 + (b.0 - a.0) * t,
        a.1 + (b.1 - a.1) * t,
        a.2 + (b.2 - a.2) * t,
    )
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

/// Like `push_cuboid` but assigns per-corner colors to the top (+Y) face for
/// smooth cross-tile blending. Side/bottom faces use `side_color`.
/// Corner order: [(-x,-z), (+x,-z), (+x,+z), (-x,+z)]
#[allow(dead_code)]
fn push_cuboid_blended_top(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    top_corners: [[f32; 4]; 4],
    side_color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    // +Y (top) — blended corner colors
    pos.extend_from_slice(&[
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
    col.extend_from_slice(&top_corners);

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

    // Side/bottom faces get uniform color (5 faces × 4 verts = 20)
    col.extend(std::iter::repeat(side_color).take(20));

    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Assemble a Bevy Mesh from the combined vertex buffers.
pub(super) fn build_chunk_mesh(
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

/// Tileset grid: 8×8 tiles in a 256×256 sheet. Each tile = 1/8 of UV space.
const TILESET_COLS: f32 = 8.0;
const TILESET_ROWS: f32 = 8.0;
/// Number of grass tile rows in the tileset (rows 0-3).
const GRASS_TILE_ROWS: usize = 4;

/// Grass blade atlas: 4×4 grid of 32×32 sprites in a 128×128 sheet.
const BLADE_ATLAS_COLS: usize = 4;
const BLADE_ATLAS_ROWS: usize = 4;
const NUM_GRASS_BLADE_VARIANTS: usize = BLADE_ATLAS_COLS * BLADE_ATLAS_ROWS;

/// Build a crossed-plane billboard mesh for a grass blade sprite.
/// UV-mapped into the 4×4 grass blade atlas.
fn build_grass_blade_mesh(variant_idx: usize) -> Mesh {
    let hw = 0.75; // half-width (large to survive pixelation)
    let h = 1.20; // height

    let col = variant_idx % BLADE_ATLAS_COLS;
    let row = variant_idx / BLADE_ATLAS_COLS;
    let u0 = col as f32 / BLADE_ATLAS_COLS as f32;
    let u1 = (col + 1) as f32 / BLADE_ATLAS_COLS as f32;
    let v0 = row as f32 / BLADE_ATLAS_ROWS as f32;
    let v1 = (row + 1) as f32 / BLADE_ATLAS_ROWS as f32;

    // Snap vertex positions to pixel grid to prevent pixel swim
    let snap = |v: f32| -> f32 { (v / VEG_SNAP).round() * VEG_SNAP };
    let hw_s = snap(hw);
    let h_s = snap(h);

    // Quad oriented to face the isometric camera (offset 15,20,15 → view dir normalized).
    // Camera looks from (+x,+y,+z) toward origin, so the quad normal should point
    // toward the camera. We use a flat billboard perpendicular to the XZ camera direction.
    // Camera XZ direction is (1,0,1)/sqrt(2), so quad lies along (-1,0,1)/sqrt(2).
    let s = std::f32::consts::FRAC_1_SQRT_2;
    let dx = snap(-s * hw);
    let dz = snap(s * hw);

    let positions = vec![
        [dx, 0.0, dz],
        [-dx, 0.0, -dz],
        [-dx, h_s, -dz],
        [dx, h_s, dz],
        // Back face
        [dx, 0.0, dz],
        [-dx, 0.0, -dz],
        [-dx, h_s, -dz],
        [dx, h_s, dz],
    ];
    let normals = vec![
        [s, 0.0, s],
        [s, 0.0, s],
        [s, 0.0, s],
        [s, 0.0, s],
        [-s, 0.0, -s],
        [-s, 0.0, -s],
        [-s, 0.0, -s],
        [-s, 0.0, -s],
    ];
    let uvs = vec![
        [u0, v1],
        [u1, v1],
        [u1, v0],
        [u0, v0],
        [u1, v1],
        [u0, v1],
        [u0, v0],
        [u1, v0],
    ];
    let indices = vec![
        0, 1, 2, 0, 2, 3, // front
        4, 6, 5, 4, 7, 6, // back
    ];

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

/// Push a cuboid where the top face is UV-mapped into a tileset tile,
/// and side/bottom faces use a solid vertex color (no texture detail needed).
fn push_cuboid_uv_top(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    uvs: &mut Vec<[f32; 2]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    tile_col: usize,
    tile_row: usize,
    side_color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    let u0 = tile_col as f32 / TILESET_COLS;
    let u1 = (tile_col + 1) as f32 / TILESET_COLS;
    let v0 = tile_row as f32 / TILESET_ROWS;
    let v1 = (tile_row + 1) as f32 / TILESET_ROWS;

    // +Y (top) — UV-mapped to tileset tile
    pos.extend_from_slice(&[
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
    col.extend_from_slice(&[[1.0, 1.0, 1.0, 1.0]; 4]); // white — let texture provide color
    uvs.extend_from_slice(&[[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);

    // -Y (bottom)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);
    col.extend_from_slice(&[side_color; 4]);
    uvs.extend_from_slice(&[[0.0, 0.0]; 4]);

    // +X
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);
    col.extend_from_slice(&[side_color; 4]);
    uvs.extend_from_slice(&[[0.0, 0.0]; 4]);

    // -X
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);
    col.extend_from_slice(&[side_color; 4]);
    uvs.extend_from_slice(&[[0.0, 0.0]; 4]);

    // +Z
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);
    col.extend_from_slice(&[side_color; 4]);
    uvs.extend_from_slice(&[[0.0, 0.0]; 4]);

    // -Z
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);
    col.extend_from_slice(&[side_color; 4]);
    uvs.extend_from_slice(&[[0.0, 0.0]; 4]);

    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Assemble a Bevy Mesh with explicit UV coordinates (for textured tiles).
fn build_chunk_mesh_uv(
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
pub(super) struct TileMaterials {
    chunk_body_mat: Handle<StandardMaterial>,
    chunk_cap_mat: Handle<StandardMaterial>,
    /// Unlit tree material — base_color modulated by day/night cycle in weather.rs.
    pub(super) tree_body_mat: Handle<StandardMaterial>,
    /// Textured grass cap material (tileset-based).
    grass_cap_mat: Handle<StandardMaterial>,
    /// Alpha-masked material for grass blade billboards (disabled — pixel swim).
    #[allow(dead_code)]
    grass_blade_mat: Handle<StandardMaterial>,
    /// Per-variant grass blade meshes (disabled — pixel swim).
    #[allow(dead_code)]
    grass_blade_meshes: [Handle<Mesh>; NUM_GRASS_BLADE_VARIANTS],
    /// Per-archetype flower meshes (UV-mapped crossed planes into atlas).
    flower_meshes: [Handle<Mesh>; NUM_FLORA_SPECIES],
    /// Lit, matte material for rocks — receives dynamic shadows unlike tree_body_mat.
    rock_body_mat: Handle<StandardMaterial>,
    /// Shared material for all flowers: atlas texture + alpha cutoff.
    flower_mat: Handle<StandardMaterial>,
    /// Animated water surface material.
    water_mat: Handle<WaterMaterial>,
}

/// Inserted once the player's spawn-area chunks (and their colliders) have
/// been spawned. Player movement is frozen until this resource exists.
#[derive(Resource)]
pub struct TerrainReady;

// ---------------------------------------------------------------------------
// Async chunk computation pipeline
// ---------------------------------------------------------------------------

/// Raw mesh vertex data — Send-safe, no Bevy types.
#[derive(Default)]
struct RawMeshData {
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    indices: Vec<u32>,
}

/// Raw mesh vertex data with UV coordinates.
#[derive(Default)]
struct RawMeshDataUV {
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    uvs: Vec<[f32; 2]>,
    indices: Vec<u32>,
}

/// Vegetation spawn decision (computed off-thread, materialized on main thread).
/// Rocks and mushrooms are merged into per-chunk meshes — only trees and
/// flowers remain as individual entity spawns.
#[allow(dead_code)]
enum VegetationSpawn {
    Tree {
        tx: i32,
        tz: i32,
        column_h: f32,
    },
    Flower {
        tx: i32,
        tz: i32,
        arch_idx: usize,
        world_x: f32,
        world_z: f32,
        flower_y: f32,
    },
}

/// Interaction metadata for a rock whose mesh is merged into the chunk.
/// Spawned as a lightweight invisible entity (no Mesh3d, no Collider).
struct RockMeta {
    tx: i32,
    tz: i32,
    world_x: f32,
    world_z: f32,
    rock_y: f32,
    kind: RockKind,
    max_hw: f32,
    total_h: f32,
}

/// Interaction metadata for a mushroom whose mesh is merged into the chunk.
struct MushroomMeta {
    tx: i32,
    tz: i32,
    world_x: f32,
    world_z: f32,
    mush_y: f32,
    kind: MushroomKind,
    max_hw: f32,
    total_h: f32,
}

/// Complete geometry for one chunk, computed off the main thread.
struct ChunkGeometry {
    cx: i32,
    cz: i32,
    is_near: bool,
    body: RawMeshData,
    cap: RawMeshData,
    grass: RawMeshDataUV,
    water: RawMeshData,
    /// Merged rock mesh — all rocks in this chunk baked into one draw call.
    rock_body: RawMeshData,
    /// Merged mushroom mesh — all mushrooms baked into one draw call.
    mushroom_body: RawMeshData,
    /// Merged tree mesh — all trees in this chunk (Low/Medium tier only).
    tree_body: RawMeshData,
    /// Collider sub-shapes: (position, full_extents) in chunk-local space.
    colliders: Vec<(Vec3, Vec3)>,
    vegetation: Vec<VegetationSpawn>,
    /// Interaction metadata for merged rocks (lightweight entities, no mesh).
    rock_metas: Vec<RockMeta>,
    /// Interaction metadata for merged mushrooms.
    mushroom_metas: Vec<MushroomMeta>,
    /// Interaction metadata for merged trees (Low/Medium tier only).
    tree_metas: Vec<super::trees::TreeMeta>,
}

/// Crossbeam MPSC channel for completed chunk geometries.
/// Workers send results via the Sender; the main thread drains via the Receiver.
/// Lock-free on the receive side — no contention with worker threads.
#[derive(Resource)]
struct ChunkResultChannel {
    tx: Sender<ChunkGeometry>,
    rx: Receiver<ChunkGeometry>,
}

impl Default for ChunkResultChannel {
    fn default() -> Self {
        let (tx, rx) = crossbeam_channel::unbounded();
        Self { tx, rx }
    }
}

/// Tracks which chunks are currently in-flight (dispatched but not yet finalized).
/// Prevents duplicate dispatches for the same chunk coordinates.
#[derive(Resource, Default)]
struct InFlightChunks(DashSet<(i32, i32)>);

/// Tracks the player's previous chunk position for speculative precomputation.
#[derive(Resource, Default)]
struct PlayerChunkHistory {
    prev: Option<(i32, i32)>,
    curr: Option<(i32, i32)>,
}

/// Pure function: compute all mesh geometry + vegetation decisions for a chunk.
/// Runs on a web worker (WASM) or compute thread pool (desktop).
fn compute_chunk_geometry(
    seed: u32,
    cx: i32,
    cz: i32,
    is_near: bool,
    collected: HashSet<(i32, i32)>,
    merge_trees: bool,
) -> ChunkGeometry {
    let base_x = cx * CHUNK_SIZE;
    let base_z = cz * CHUNK_SIZE;
    let tile_count = (CHUNK_SIZE * CHUNK_SIZE) as usize;

    // Height lookup — pure, no TerrainMap needed.
    let h_at = |tx: i32, tz: i32| -> f32 { terrain_height(tx, tz, seed, MAX_HEIGHT, NOISE_SCALE) };

    let mut body = RawMeshData {
        positions: Vec::with_capacity(tile_count * 24),
        normals: Vec::with_capacity(tile_count * 24),
        colors: Vec::with_capacity(tile_count * 24),
        indices: Vec::with_capacity(tile_count * 36),
    };
    let mut cap = RawMeshData {
        positions: Vec::with_capacity(tile_count * 24),
        normals: Vec::with_capacity(tile_count * 24),
        colors: Vec::with_capacity(tile_count * 24),
        indices: Vec::with_capacity(tile_count * 36),
    };
    let mut grass = RawMeshDataUV::default();
    let mut water = RawMeshData::default();
    let mut rock_body = RawMeshData::default();
    let mut mushroom_body = RawMeshData::default();
    let mut tree_body = RawMeshData::default();
    let mut colliders: Vec<(Vec3, Vec3)> = Vec::with_capacity(tile_count);
    let mut vegetation = Vec::new();
    let mut rock_metas = Vec::new();
    let mut mushroom_metas = Vec::new();
    let mut tree_metas: Vec<super::trees::TreeMeta> = Vec::new();

    for dx in 0..CHUNK_SIZE {
        for dz in 0..CHUNK_SIZE {
            let tx = base_x + dx;
            let tz = base_z + dz;
            let h = h_at(tx, tz);
            let column_h = h.max(0.5);

            let band = match h as i32 {
                0..=1 => 0,
                2..=3 => 1,
                4..=5 => 2,
                _ => 3,
            };

            let lx = dx as f32 * TILE_SIZE;
            let lz = dz as f32 * TILE_SIZE;

            // --- Body column ---
            let body_h = column_h - CAP_HEIGHT;
            let nb = |ntx: i32, ntz: i32| -> f32 { h_at(ntx, ntz).max(0.5) - CAP_HEIGHT };
            push_terrain_body(
                &mut body.positions,
                &mut body.normals,
                &mut body.colors,
                &mut body.indices,
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

            // --- Collider sub-shape ---
            colliders.push((
                Vec3::new(lx, column_h / 2.0, lz),
                Vec3::new(TILE_SIZE, column_h, TILE_SIZE),
            ));

            // --- Cap / grass ---
            let inset = |nh: f32| if h - nh >= 1.0 { EDGE_INSET } else { 0.0 };
            let inset_nx = inset(h_at(tx - 1, tz));
            let inset_px = inset(h_at(tx + 1, tz));
            let inset_nz = inset(h_at(tx, tz - 1));
            let inset_pz = inset(h_at(tx, tz + 1));

            let cap_w = TILE_SIZE - inset_nx - inset_px;
            let cap_d = TILE_SIZE - inset_nz - inset_pz;
            let cap_offset_x = (inset_nx - inset_px) / 2.0;
            let cap_offset_z = (inset_nz - inset_pz) / 2.0;

            let cap_center = Vec3::new(
                lx + cap_offset_x,
                body_h + CAP_HEIGHT / 2.0 + 0.005,
                lz + cap_offset_z,
            );
            let cap_half = Vec3::new(cap_w / 2.0, CAP_HEIGHT / 2.0, cap_d / 2.0);

            if band == 0 {
                let tile_hash = hash2d(tx + 5701, tz + 3109);
                let tile_idx = (tile_hash * (GRASS_TILE_ROWS as f32 * TILESET_COLS)) as usize;
                let tile_col_idx = tile_idx % TILESET_COLS as usize;
                let tile_row_idx = tile_idx / TILESET_COLS as usize;
                let side = cap_vertex_color(band, tx, tz);
                push_cuboid_uv_top(
                    &mut grass.positions,
                    &mut grass.normals,
                    &mut grass.colors,
                    &mut grass.uvs,
                    &mut grass.indices,
                    cap_center,
                    cap_half,
                    tile_col_idx,
                    tile_row_idx,
                    side,
                );
            } else {
                push_cuboid(
                    &mut cap.positions,
                    &mut cap.normals,
                    &mut cap.colors,
                    &mut cap.indices,
                    cap_center,
                    cap_half,
                    cap_vertex_color(band, tx, tz),
                );
            }

            // --- Water surface ---
            if h < WATER_LEVEL {
                let wy = WATER_LEVEL;
                let half = TILE_SIZE / 2.0;
                let base_vert = water.positions.len() as u32;

                let is_edge = |ntx: i32, ntz: i32| -> bool { h_at(ntx, ntz) >= WATER_LEVEL };
                let has_land_neighbor = is_edge(tx - 1, tz)
                    || is_edge(tx + 1, tz)
                    || is_edge(tx, tz - 1)
                    || is_edge(tx, tz + 1);
                let foam_alpha = if has_land_neighbor { 0.3 } else { 1.0 };

                water.positions.extend_from_slice(&[
                    [lx - half, wy, lz - half],
                    [lx + half, wy, lz - half],
                    [lx + half, wy, lz + half],
                    [lx - half, wy, lz + half],
                ]);
                water.normals.extend_from_slice(&[
                    [0.0, 1.0, 0.0],
                    [0.0, 1.0, 0.0],
                    [0.0, 1.0, 0.0],
                    [0.0, 1.0, 0.0],
                ]);
                water.colors.extend_from_slice(&[
                    [1.0, 1.0, 1.0, foam_alpha],
                    [1.0, 1.0, 1.0, foam_alpha],
                    [1.0, 1.0, 1.0, foam_alpha],
                    [1.0, 1.0, 1.0, foam_alpha],
                ]);
                water.indices.extend_from_slice(&[
                    base_vert,
                    base_vert + 1,
                    base_vert + 2,
                    base_vert,
                    base_vert + 2,
                    base_vert + 3,
                ]);
            }

            // --- Vegetation decisions (band 0 only) ---
            if band == 0 {
                let mut tile_occupied = false;

                // Trees
                let tree_noise = hash2d(tx + 11317, tz + 5471);
                if tree_noise < 0.055 {
                    tile_occupied = true;
                    if !collected.contains(&(tx, tz)) {
                        if merge_trees {
                            let meta = super::trees::push_tree_vertices(
                                tx,
                                tz,
                                column_h,
                                &mut tree_body.positions,
                                &mut tree_body.normals,
                                &mut tree_body.colors,
                                &mut tree_body.indices,
                            );
                            tree_metas.push(meta);
                        } else {
                            vegetation.push(VegetationSpawn::Tree { tx, tz, column_h });
                        }
                    }
                }

                // Rocks — merge vertices into per-chunk mesh
                if !tile_occupied {
                    let rock_noise = hash2d(tx + 19457, tz + 12391);
                    if rock_noise < 0.025 {
                        tile_occupied = true;
                        if !collected.contains(&(tx, tz)) {
                            let jx = ((hash2d(tx + 19557, tz + 12391) - 0.5) * 0.4 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let jz = ((hash2d(tx + 19457, tz + 12491) - 0.5) * 0.4 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let world_x = tx as f32 * TILE_SIZE + jx;
                            let world_z = tz as f32 * TILE_SIZE + jz;
                            let rock_y = column_h + 0.002;
                            let kind = rocks::rock_kind_from_hash(tx, tz);
                            let rot_y =
                                hash2d(tx * 8311 + 2477, tz * 7193 + 3319) * std::f32::consts::TAU;
                            let params = rocks::RockParams {
                                world_x,
                                world_z,
                                base_y: rock_y,
                                kind,
                                tx,
                                tz,
                            };
                            let (max_hw, total_h) = rocks::push_rock_vertices(
                                &params,
                                rot_y,
                                &mut rock_body.positions,
                                &mut rock_body.normals,
                                &mut rock_body.colors,
                                &mut rock_body.indices,
                            );
                            rock_metas.push(RockMeta {
                                tx,
                                tz,
                                world_x,
                                world_z,
                                rock_y,
                                kind,
                                max_hw,
                                total_h,
                            });
                        }
                    }
                }

                // Flowers
                if !tile_occupied {
                    let flower_noise = hash2d(tx + 13721, tz + 8293);
                    if flower_noise < 0.12 {
                        tile_occupied = true;
                        if !collected.contains(&(tx, tz)) {
                            let arch_idx =
                                (hash2d(tx + 13821, tz + 8393) * NUM_FLORA_SPECIES as f32) as usize
                                    % NUM_FLORA_SPECIES;
                            let jx = ((hash2d(tx + 13921, tz + 8293) - 0.5) * 0.6 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let jz = ((hash2d(tx + 13721, tz + 8493) - 0.5) * 0.6 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let world_x = tx as f32 * TILE_SIZE + jx;
                            let world_z = tz as f32 * TILE_SIZE + jz;
                            let flower_y = column_h + 0.002;
                            vegetation.push(VegetationSpawn::Flower {
                                tx,
                                tz,
                                arch_idx,
                                world_x,
                                world_z,
                                flower_y,
                            });
                        }
                    }
                }

                // Mushrooms — merge vertices into per-chunk mesh
                if !tile_occupied {
                    let mush_noise = hash2d(tx + 23017, tz + 17293);
                    if mush_noise < 0.04 {
                        if !collected.contains(&(tx, tz)) {
                            let jx = ((hash2d(tx + 23117, tz + 17293) - 0.5) * 0.5 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let jz = ((hash2d(tx + 23017, tz + 17393) - 0.5) * 0.5 / VEG_SNAP)
                                .round()
                                * VEG_SNAP;
                            let world_x = tx as f32 * TILE_SIZE + jx;
                            let world_z = tz as f32 * TILE_SIZE + jz;
                            let mush_y = column_h + 0.002;
                            let kind = mushrooms::mushroom_kind_from_hash(tx, tz);
                            let rot_y =
                                hash2d(tx * 9311 + 3477, tz * 8193 + 4319) * std::f32::consts::TAU;
                            let params = mushrooms::MushroomParams { tx, tz, kind };
                            let (max_hw, total_h) = mushrooms::push_mushroom_vertices(
                                &params,
                                world_x,
                                world_z,
                                mush_y,
                                rot_y,
                                &mut mushroom_body.positions,
                                &mut mushroom_body.normals,
                                &mut mushroom_body.colors,
                                &mut mushroom_body.indices,
                            );
                            mushroom_metas.push(MushroomMeta {
                                tx,
                                tz,
                                world_x,
                                world_z,
                                mush_y,
                                kind,
                                max_hw,
                                total_h,
                            });
                        }
                    }
                }
            }
        }
    }

    ChunkGeometry {
        cx,
        cz,
        is_near,
        body,
        cap,
        grass,
        water,
        rock_body,
        mushroom_body,
        tree_body,
        colliders,
        vegetation,
        rock_metas,
        mushroom_metas,
        tree_metas,
    }
}

/// Spawn a chunk computation on the appropriate thread pool.
fn dispatch_chunk_task(
    seed: u32,
    cx: i32,
    cz: i32,
    is_near: bool,
    collected: HashSet<(i32, i32)>,
    tx: Sender<ChunkGeometry>,
    in_flight: &DashSet<(i32, i32)>,
    merge_trees: bool,
) {
    // Skip if already in-flight.
    if !in_flight.insert((cx, cz)) {
        return;
    }

    bevy_tasker::spawn(async move {
        let geometry = compute_chunk_geometry(seed, cx, cz, is_near, collected, merge_trees);
        let _ = tx.send(geometry);
    })
    .detach();
}

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CollectedTiles>();
        app.init_resource::<ChunkResultChannel>();
        app.init_resource::<InFlightChunks>();
        app.init_resource::<PlayerChunkHistory>();
        app.add_systems(Startup, setup_tile_materials);
        // Run chunk spawning before player movement so colliders exist
        // before the first shape cast of each frame.
        app.add_systems(
            Update,
            process_chunk_spawns_and_despawns.before(super::player::PlayerMovement),
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
    asset_server: Res<AssetServer>,
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
    // Unlit tree material: vertex colors carry all tonal info.
    // base_color is modulated by the day/night system in weather.rs to darken at night.
    let tree_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        unlit: true,
        ..default()
    });
    // Lit rock material: vertex colors for base tone, PBR lighting adds shadows.
    let rock_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
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

    // Grass cap material: tileset texture, lit
    let grass_tileset: Handle<Image> = asset_server.load("textures/grass_tileset.png");
    let grass_cap_mat = materials.add(StandardMaterial {
        base_color_texture: Some(grass_tileset),
        perceptual_roughness: 0.95,
        reflectance: 0.0,
        ..default()
    });

    // Grass blade billboard material + meshes
    let grass_blade_tex: Handle<Image> = asset_server.load("textures/grass_blades.png");
    let grass_blade_mat = materials.add(StandardMaterial {
        base_color_texture: Some(grass_blade_tex),
        alpha_mode: AlphaMode::Mask(0.5),
        cull_mode: None,
        double_sided: true,
        unlit: true,
        ..default()
    });
    let grass_blade_meshes = std::array::from_fn(|i| meshes.add(build_grass_blade_mesh(i)));

    let water_mat = water_materials.add(WaterMaterial::default());

    commands.insert_resource(TileMaterials {
        chunk_body_mat,
        chunk_cap_mat,
        tree_body_mat,
        grass_cap_mat,
        grass_blade_mat,
        grass_blade_meshes,
        rock_body_mat,
        flower_meshes,
        flower_mat,
        water_mat,
    });
}

// ---------------------------------------------------------------------------
// Chunk spawn / despawn (combined meshes + compound collider)
// ---------------------------------------------------------------------------

fn process_chunk_spawns_and_despawns(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut terrain: ResMut<TerrainMap>,
    chunk_channel: Res<ChunkResultChannel>,
    in_flight: Res<InFlightChunks>,
    mut chunk_history: ResMut<PlayerChunkHistory>,
    tile_materials: Option<Res<TileMaterials>>,
    blob_shadow: Option<Res<BlobShadowAssets>>,
    player_query: Query<&Transform, With<Player>>,
    collected_tiles: Res<CollectedTiles>,
    terrain_ready: Option<Res<TerrainReady>>,
    perf_tier: Res<super::PerfTier>,
) {
    let Some(tile_materials) = tile_materials else {
        return;
    };
    let Some(blob_shadow) = blob_shadow else {
        return;
    };

    // ── Phase 1: Despawn chunks (cheap — all at once) ──────────────────────
    let despawns: Vec<(i32, i32, Vec<Entity>)> = terrain.chunks_to_despawn.drain(..).collect();
    for (_cx, _cz, entities) in despawns {
        for entity in entities {
            commands.entity(entity).despawn();
        }
    }

    // ── Phase 2: Dispatch async tasks for new chunks ───────────────────────
    let player_chunk = player_query.single().ok().map(|tf| {
        TerrainMap::tile_to_chunk(
            tf.translation.x.round() as i32,
            tf.translation.z.round() as i32,
        )
    });

    let seed = terrain.seed;
    let collected = collected_tiles.0.clone();
    let tx = chunk_channel.tx.clone();
    let merge_trees = *perf_tier != super::PerfTier::High;

    for (cx, cz) in terrain.chunks_to_spawn.drain(..) {
        let is_near = player_chunk
            .map(|(pcx, pcz)| (cx - pcx).abs() <= 1 && (cz - pcz).abs() <= 1)
            .unwrap_or(true);

        // Submit ALL chunks to the thread pool / web workers — no rate
        // limiting on submission. The workers run in parallel; finalization
        // (entity spawning) is rate-limited below.
        dispatch_chunk_task(
            seed,
            cx,
            cz,
            is_near,
            collected.clone(),
            tx.clone(),
            &in_flight.0,
            merge_trees,
        );
    }

    // ── Phase 2b: Speculative precomputation ──────────────────────────────
    // Predict player movement direction from chunk history and speculatively
    // dispatch chunks 1-2 rings ahead in that direction.
    if let Some((pcx, pcz)) = player_chunk {
        let prev = chunk_history.curr;
        chunk_history.curr = Some((pcx, pcz));
        chunk_history.prev = prev;

        if let (Some((prev_cx, prev_cz)), Some((curr_cx, curr_cz))) =
            (chunk_history.prev, chunk_history.curr)
        {
            let dx = (curr_cx - prev_cx).clamp(-1, 1);
            let dz = (curr_cz - prev_cz).clamp(-1, 1);
            if dx != 0 || dz != 0 {
                // Speculatively compute 2 rings ahead in the movement direction.
                for ring in 1..=2i32 {
                    let spec_cx = curr_cx + dx * ring;
                    let spec_cz = curr_cz + dz * ring;
                    // Also compute the two adjacent chunks to cover diagonal movement.
                    for &(ox, oz) in &[(0, 0), (dz, dx), (-dz, -dx)] {
                        let scx = spec_cx + ox;
                        let scz = spec_cz + oz;
                        // Only dispatch if terrain doesn't already have this chunk.
                        if !terrain.is_chunk_loaded(scx, scz) {
                            dispatch_chunk_task(
                                seed,
                                scx,
                                scz,
                                false,
                                collected.clone(),
                                tx.clone(),
                                &in_flight.0,
                                merge_trees,
                            );
                        }
                    }
                }
            }
        }
    }

    // ── Phase 3: Finalize completed chunks ─────────────────────────────────
    // Drain the crossbeam channel — lock-free, no contention with workers.
    let mut results: Vec<ChunkGeometry> = chunk_channel.rx.try_iter().collect();

    // Mark drained chunks as no longer in-flight.
    for g in &results {
        in_flight.0.remove(&(g.cx, g.cz));
    }

    // Sort near chunks first so they get priority.
    results.sort_by_key(|g| if g.is_near { 0i32 } else { 1 });

    // Finalization budget: each chunk spawns dozens of entities + colliders.
    // On mobile WASM, limit to 1 distant chunk per frame to avoid frame spikes.
    let max_distant_finalizes: usize = match *perf_tier {
        super::PerfTier::Low => 1,
        super::PerfTier::Medium => 2,
        super::PerfTier::High => 8,
    };

    let mut far_finalized = 0usize;
    let mut had_near = false;

    for geometry in results {
        // Skip speculative chunks whose terrain data hasn't been loaded yet.
        // Re-queue them — they'll finalize once the terrain system catches up.
        if !terrain.is_chunk_loaded(geometry.cx, geometry.cz) {
            let _ = chunk_channel.tx.send(geometry);
            continue;
        }

        if !geometry.is_near {
            far_finalized += 1;
            if far_finalized > max_distant_finalizes {
                // Re-queue for next frame via the channel.
                let _ = chunk_channel.tx.send(geometry);
                continue;
            }
        } else {
            had_near = true;
        }

        let cx = geometry.cx;
        let cz = geometry.cz;
        let base_x = cx * CHUNK_SIZE;
        let base_z = cz * CHUNK_SIZE;
        let mut entities = Vec::new();

        // ── Terrain meshes from pre-computed vertex data ───────────────
        let body_mesh = meshes.add(build_chunk_mesh(
            geometry.body.positions,
            geometry.body.normals,
            geometry.body.colors,
            geometry.body.indices,
        ));
        let collider_shapes: Vec<(Vec3, Quat, Collider)> = geometry
            .colliders
            .iter()
            .map(|(pos, ext)| (*pos, Quat::IDENTITY, Collider::cuboid(ext.x, ext.y, ext.z)))
            .collect();

        let body_entity = commands
            .spawn((
                Mesh3d(body_mesh),
                MeshMaterial3d(tile_materials.chunk_body_mat.clone()),
                Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                Pickable::IGNORE,
                RigidBody::Static,
                Collider::compound(collider_shapes),
            ))
            .id();
        entities.push(body_entity);

        if !geometry.cap.positions.is_empty() {
            let cap_mesh = meshes.add(build_chunk_mesh(
                geometry.cap.positions,
                geometry.cap.normals,
                geometry.cap.colors,
                geometry.cap.indices,
            ));
            let cap_entity = commands
                .spawn((
                    Mesh3d(cap_mesh),
                    MeshMaterial3d(tile_materials.chunk_cap_mat.clone()),
                    Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(cap_entity);
        }

        if !geometry.grass.positions.is_empty() {
            let grass_mesh = meshes.add(build_chunk_mesh_uv(
                geometry.grass.positions,
                geometry.grass.normals,
                geometry.grass.colors,
                geometry.grass.uvs,
                geometry.grass.indices,
            ));
            let grass_entity = commands
                .spawn((
                    Mesh3d(grass_mesh),
                    MeshMaterial3d(tile_materials.grass_cap_mat.clone()),
                    Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(grass_entity);
        }

        if !geometry.water.positions.is_empty() {
            let water_mesh = meshes.add(build_chunk_mesh(
                geometry.water.positions,
                geometry.water.normals,
                geometry.water.colors,
                geometry.water.indices,
            ));
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

        // ── Merged rock mesh (single draw call per chunk) ──────────────
        if !geometry.rock_body.positions.is_empty() {
            let rock_mesh = meshes.add(build_chunk_mesh(
                geometry.rock_body.positions,
                geometry.rock_body.normals,
                geometry.rock_body.colors,
                geometry.rock_body.indices,
            ));
            let rock_mesh_entity = commands
                .spawn((
                    Mesh3d(rock_mesh),
                    MeshMaterial3d(tile_materials.rock_body_mat.clone()),
                    Transform::IDENTITY,
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(rock_mesh_entity);
        }

        // Lightweight interaction entities for each rock (no mesh, no collider).
        for rm in geometry.rock_metas {
            let mut rock_cmd = commands.spawn((
                Transform::from_xyz(rm.world_x, rm.rock_y, rm.world_z),
                Visibility::Hidden,
                HoverOutline {
                    half_extents: Vec3::new(rm.max_hw, rm.total_h / 2.0, rm.max_hw),
                },
                Interactable {
                    kind: InteractableKind::Rock,
                },
                rm.kind,
                TileCoord {
                    tx: rm.tx,
                    tz: rm.tz,
                },
            ));
            if *perf_tier == super::PerfTier::High {
                rock_cmd.insert((
                    RigidBody::Static,
                    Collider::cuboid(rm.max_hw * 1.6, rm.total_h, rm.max_hw * 1.6),
                ));
            }
            let rock_entity = rock_cmd
                .observe(on_pointer_over)
                .observe(on_pointer_out)
                .id();
            entities.push(rock_entity);

            let shadow_entity = commands
                .spawn((
                    Mesh3d(blob_shadow.mesh.clone()),
                    MeshMaterial3d(blob_shadow.material.clone()),
                    Transform::from_xyz(rm.world_x, rm.rock_y + 0.001, rm.world_z),
                    BlobShadow {
                        anchor: Vec3::new(rm.world_x, rm.rock_y + 0.001, rm.world_z),
                        radius: rm.max_hw * 1.4,
                        object_height: rm.total_h,
                    },
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(shadow_entity);
        }

        // ── Merged mushroom mesh (single draw call per chunk) ─────────
        if !geometry.mushroom_body.positions.is_empty() {
            let mush_mesh = meshes.add(build_chunk_mesh(
                geometry.mushroom_body.positions,
                geometry.mushroom_body.normals,
                geometry.mushroom_body.colors,
                geometry.mushroom_body.indices,
            ));
            let mush_mesh_entity = commands
                .spawn((
                    Mesh3d(mush_mesh),
                    MeshMaterial3d(tile_materials.tree_body_mat.clone()),
                    Transform::IDENTITY,
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(mush_mesh_entity);
        }

        // Lightweight interaction entities for each mushroom.
        for mm in geometry.mushroom_metas {
            let mut mush_cmd = commands.spawn((
                Transform::from_xyz(mm.world_x, mm.mush_y, mm.world_z),
                Visibility::Hidden,
                HoverOutline {
                    half_extents: Vec3::new(mm.max_hw, mm.total_h / 2.0, mm.max_hw),
                },
                Interactable {
                    kind: InteractableKind::Mushroom,
                },
                mm.kind,
                TileCoord {
                    tx: mm.tx,
                    tz: mm.tz,
                },
            ));
            if *perf_tier == super::PerfTier::High {
                mush_cmd.insert((
                    RigidBody::Static,
                    Collider::cuboid(mm.max_hw * 1.6, mm.total_h, mm.max_hw * 1.6),
                    Sensor,
                ));
            }
            let mush_entity = mush_cmd
                .observe(on_pointer_over)
                .observe(on_pointer_out)
                .id();
            entities.push(mush_entity);
        }

        // ── Merged tree mesh (single draw call per chunk, Low/Medium) ──
        if !geometry.tree_body.positions.is_empty() {
            let tree_mesh = meshes.add(build_chunk_mesh(
                geometry.tree_body.positions,
                geometry.tree_body.normals,
                geometry.tree_body.colors,
                geometry.tree_body.indices,
            ));
            let tree_mesh_entity = commands
                .spawn((
                    Mesh3d(tree_mesh),
                    MeshMaterial3d(tile_materials.tree_body_mat.clone()),
                    Transform::IDENTITY,
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(tree_mesh_entity);
        }

        // Lightweight interaction entities for each merged tree.
        for tm in geometry.tree_metas {
            let mut tree_cmd = commands.spawn((
                Transform::from_xyz(tm.world_x, tm.tree_y, tm.world_z),
                Visibility::Hidden,
                HoverOutline {
                    half_extents: Vec3::new(tm.max_hw, tm.total_h / 2.0, tm.max_hw),
                },
                Interactable {
                    kind: InteractableKind::Tree,
                },
                TileCoord {
                    tx: tm.tx,
                    tz: tm.tz,
                },
            ));
            // Merged trees still need player collision on all tiers.
            tree_cmd.insert((
                RigidBody::Static,
                Collider::cuboid(tm.trunk_r * 2.0, tm.trunk_h, tm.trunk_r * 2.0),
            ));
            let tree_entity = tree_cmd
                .observe(on_pointer_over)
                .observe(on_pointer_out)
                .id();
            entities.push(tree_entity);

            let shadow_entity = commands
                .spawn((
                    Mesh3d(blob_shadow.mesh.clone()),
                    MeshMaterial3d(blob_shadow.material.clone()),
                    Transform::from_xyz(tm.world_x, tm.tree_y + 0.001, tm.world_z),
                    BlobShadow {
                        anchor: Vec3::new(tm.world_x, tm.tree_y + 0.001, tm.world_z),
                        radius: tm.shadow_radius,
                        object_height: tm.shadow_height,
                    },
                    Pickable::IGNORE,
                ))
                .id();
            entities.push(shadow_entity);
        }

        // ── Vegetation entities (trees + flowers — still individual) ──
        for veg in geometry.vegetation {
            match veg {
                VegetationSpawn::Tree { tx, tz, column_h } => {
                    let (tree_entity, shadow_entity) = super::trees::spawn_tree_entity(
                        &mut commands,
                        &mut meshes,
                        tile_materials.tree_body_mat.clone(),
                        blob_shadow.mesh.clone(),
                        blob_shadow.material.clone(),
                        tx,
                        tz,
                        column_h,
                    );
                    commands.entity(tree_entity).insert(TileCoord { tx, tz });
                    entities.push(tree_entity);
                    entities.push(shadow_entity);
                }
                VegetationSpawn::Flower {
                    tx,
                    tz,
                    arch_idx,
                    world_x,
                    world_z,
                    flower_y,
                } => {
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
                    let mut flower_cmd = commands.spawn((
                        Mesh3d(tile_materials.flower_meshes[arch_idx].clone()),
                        MeshMaterial3d(tile_materials.flower_mat.clone()),
                        Transform::from_xyz(world_x, flower_y, world_z),
                        HoverOutline {
                            half_extents: Vec3::new(0.2, 0.25, 0.2),
                        },
                        Interactable {
                            kind: InteractableKind::Flower,
                        },
                        archetype,
                        TileCoord { tx, tz },
                    ));
                    // Only add physics colliders on High tier (desktop native).
                    // WASM hover uses tile-based HoverMap, not avian3d raycasts,
                    // so sensor colliders are pure overhead on the physics broadphase.
                    if *perf_tier == super::PerfTier::High {
                        flower_cmd.insert((
                            RigidBody::Static,
                            Collider::cuboid(0.4, 0.5, 0.4),
                            Sensor,
                        ));
                    }
                    let flower_entity = flower_cmd
                        .observe(on_pointer_over)
                        .observe(on_pointer_out)
                        .id();
                    entities.push(flower_entity);
                }
            }
        }

        terrain.link_chunk_entities(cx, cz, entities);
    }

    // Once at least one near chunk has been finalized (with colliders),
    // insert TerrainReady so the player controller can start moving.
    if had_near && terrain_ready.is_none() {
        commands.insert_resource(TerrainReady);
        info!("[tilemap] TerrainReady — spawn-area colliders are live");
    }
}
