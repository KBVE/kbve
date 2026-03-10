use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::light::{
    CascadeShadowConfigBuilder, Cascades, DirectionalLightShadowMap, SimulationLightSystems,
};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use bevy_rapier3d::prelude::*;

use super::camera::IsometricCamera;
use super::mushrooms;
use super::player::Player;
use super::rocks;
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
/// Each type has a base (root) and tip (sun-kissed) color for painted gradient.
const VEG_GRASS_TUFT_BASE: (f32, f32, f32) = (0.16, 0.38, 0.10);
const VEG_GRASS_TUFT_TIP: (f32, f32, f32) = (0.38, 0.68, 0.22);
const VEG_GRASS_TALL_BASE: (f32, f32, f32) = (0.14, 0.34, 0.08);
const VEG_GRASS_TALL_TIP: (f32, f32, f32) = (0.32, 0.62, 0.18);
const VEG_GRASS_BLADE_BASE: (f32, f32, f32) = (0.15, 0.36, 0.09);
const VEG_GRASS_BLADE_TIP: (f32, f32, f32) = (0.42, 0.72, 0.28);
const VEG_FLOWER_COLORS: [(f32, f32, f32); 4] = [
    (0.95, 0.95, 0.90),
    (0.90, 0.55, 0.65),
    (0.85, 0.35, 0.45),
    (0.95, 0.85, 0.30),
];
/// Flower stem color (dark olive green).
const VEG_FLOWER_STEM: (f32, f32, f32) = (0.18, 0.40, 0.12);

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

/// Append a crossed-plane (2 quads at 90°) with rotation/scale baked in.
/// Uses base→tip color gradient and tapered top for organic silhouette.
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
    color_base: [f32; 4],
    color_tip: [f32; 4],
) {
    let base = pos.len() as u32;
    let (sin_r, cos_r) = rot_y.sin_cos();
    let s = scale;
    let taper = 0.55; // narrower at tips for organic silhouette

    let xform = |lx: f32, ly: f32, lz: f32| -> [f32; 3] {
        let sx = lx * s;
        let sz = lz * s;
        [
            origin.x + sx * cos_r - sz * sin_r,
            origin.y + ly * s,
            origin.z + sx * sin_r + sz * cos_r,
        ]
    };

    // Quad 1: along local X (tapered)
    pos.extend_from_slice(&[
        xform(-hw, 0.0, 0.0),
        xform(hw, 0.0, 0.0),
        xform(hw * taper, h, 0.0),
        xform(-hw * taper, h, 0.0),
    ]);
    let n1 = [sin_r, 0.0, cos_r];
    nor.extend_from_slice(&[n1; 4]);
    col.extend_from_slice(&[color_base, color_base, color_tip, color_tip]);

    // Quad 2: along local Z (tapered)
    pos.extend_from_slice(&[
        xform(0.0, 0.0, -hw),
        xform(0.0, 0.0, hw),
        xform(0.0, h, hw * taper),
        xform(0.0, h, -hw * taper),
    ]);
    let n2 = [cos_r, 0.0, -sin_r];
    nor.extend_from_slice(&[n2; 4]);
    col.extend_from_slice(&[color_base, color_base, color_tip, color_tip]);

    for q in 0..2u32 {
        let f = base + q * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Append a single tapered blade (1 quad) with rotation and scale baked in.
/// Base→tip color gradient for painted look.
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
    color_base: [f32; 4],
    color_tip: [f32; 4],
) {
    let base = pos.len() as u32;
    let (sin_r, cos_r) = rot_y.sin_cos();
    let s = scale;
    let taper = 0.35; // sharper taper for blade shape

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
    col.extend_from_slice(&[color_base, color_base, color_tip, color_tip]);

    let f = base;
    idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
}

/// Append a multi-blade grass cluster: 3-4 tapered blades at varied angles/heights.
/// Creates a clumpy, organic tuft that reads as a single grass clump.
fn push_grass_cluster(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    origin: Vec3,
    hw: f32,
    h: f32,
    scale: f32,
    rot_y: f32,
    color_base: [f32; 4],
    color_tip: [f32; 4],
    blade_count: usize,
    seed: f32,
) {
    let tau = std::f32::consts::TAU;
    for bi in 0..blade_count {
        let fi = bi as f32;
        // Each blade gets its own angle spread around the cluster center
        let blade_rot = rot_y + (fi / blade_count as f32) * tau + (seed + fi * 1.7).sin() * 0.3;
        // Vary height per blade: 60-110% of base height
        let h_var = h * (0.60 + ((seed * 3.1 + fi * 2.3).sin() * 0.5 + 0.5) * 0.50);
        // Slight width variation
        let hw_var = hw * (0.80 + ((seed * 2.7 + fi * 1.9).cos() * 0.5 + 0.5) * 0.30);
        // Small positional offset per blade for clumpy feel
        let ox = ((seed * 4.3 + fi * 3.1).sin()) * hw * 0.4 * scale;
        let oz = ((seed * 5.1 + fi * 2.7).cos()) * hw * 0.4 * scale;
        let blade_origin = Vec3::new(origin.x + ox, origin.y, origin.z + oz);
        push_blade(
            pos,
            nor,
            col,
            idx,
            blade_origin,
            hw_var,
            h_var,
            scale,
            blade_rot,
            color_base,
            color_tip,
        );
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
struct TileMaterials {
    chunk_body_mat: Handle<StandardMaterial>,
    chunk_cap_mat: Handle<StandardMaterial>,
    /// Unlit, matte material for tree trunk+canopy domes — vertex colors carry all tonal info.
    tree_body_mat: Handle<StandardMaterial>,
    /// Double-sided, vertex-colored material for grass crossed-planes.
    chunk_veg_mat: Handle<StandardMaterial>,
    /// Per-archetype flower meshes (UV-mapped crossed planes into atlas).
    flower_meshes: [Handle<Mesh>; NUM_FLORA_SPECIES],
    /// Lit, matte material for rocks — receives dynamic shadows unlike tree_body_mat.
    rock_body_mat: Handle<StandardMaterial>,
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
pub(super) struct WindState {
    pub(super) speed_mph: f32, // 0 = calm, 5 = gentle breeze, 15 = moderate, 30 = strong
    pub(super) direction: (f32, f32), // normalized XZ direction
}

impl Default for WindState {
    fn default() -> Self {
        Self {
            speed_mph: 8.0,            // gentle breeze
            direction: (0.707, 0.707), // NE
        }
    }
}

/// Attached to small vegetation (flowers, grass) for gentle translation sway.
#[derive(Component)]
struct WindSway {
    base_translation: Vec3,
    phase: f32,
}

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<WindState>();
        app.init_resource::<WindStreakPool>();
        app.add_systems(Startup, (setup_tile_materials, spawn_lighting));
        app.add_systems(
            Update,
            (
                process_chunk_spawns_and_despawns,
                animate_veg_wind,
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
    // Lit rock material: vertex colors for base tone, PBR lighting adds shadows.
    let rock_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.0,
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
        rock_body_mat,
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

                        // Per-tuft hue jitter for painterly variety (like trees)
                        let hue_seed = hash2d(tx + seed_x + 500, tz + seed_z + 500);
                        let hj = (hue_seed - 0.5) * 0.08; // ±0.04 hue shift
                        let bright = 0.88 + hash2d(tx + seed_x + 600, tz + seed_z + 600) * 0.24;

                        let jitter_color = |base: (f32, f32, f32)| -> (f32, f32, f32) {
                            (
                                ((base.0 + hj) * bright).clamp(0.0, 1.0),
                                ((base.1 + hj * 0.3) * bright).clamp(0.0, 1.0),
                                ((base.2 - hj * 0.5) * bright).clamp(0.0, 1.0),
                            )
                        };

                        let (col_base, col_tip) = match kind {
                            1 => {
                                let b = jitter_color(VEG_GRASS_TALL_BASE);
                                let t = jitter_color(VEG_GRASS_TALL_TIP);
                                (srgb_color(b.0, b.1, b.2), srgb_color(t.0, t.1, t.2))
                            }
                            2 => {
                                let b = jitter_color(VEG_GRASS_BLADE_BASE);
                                let t = jitter_color(VEG_GRASS_BLADE_TIP);
                                (srgb_color(b.0, b.1, b.2), srgb_color(t.0, t.1, t.2))
                            }
                            3 => {
                                let fi = (hash2d(tx + seed_x + 400, tz) * 4.0) as usize % 4;
                                let (r, g, b) = VEG_FLOWER_COLORS[fi];
                                let stem = jitter_color(VEG_FLOWER_STEM);
                                (srgb_color(stem.0, stem.1, stem.2), srgb_color(r, g, b))
                            }
                            _ => {
                                let b = jitter_color(VEG_GRASS_TUFT_BASE);
                                let t = jitter_color(VEG_GRASS_TUFT_TIP);
                                (srgb_color(b.0, b.1, b.2), srgb_color(t.0, t.1, t.2))
                            }
                        };

                        // Route to one of 3 wind groups
                        let group = &mut veg_groups[slot_idx % 3];
                        let cluster_seed = tx as f32 * 3.7 + tz as f32 * 5.3 + seed_x as f32;

                        match kind {
                            // Blade: 3-blade cluster for chunky grass tufts
                            2 => push_grass_cluster(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.12,
                                0.45,
                                scale,
                                rot_y,
                                col_base,
                                col_tip,
                                3,
                                cluster_seed,
                            ),
                            // Tall grass: crossed planes with gradient
                            1 => push_crossed_planes(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.15,
                                0.55,
                                scale,
                                rot_y,
                                col_base,
                                col_tip,
                            ),
                            // Flowers: stem→blossom gradient
                            3 => push_crossed_planes(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.12,
                                0.20,
                                scale,
                                rot_y,
                                col_base,
                                col_tip,
                            ),
                            // Default tuft: 4-blade cluster for clumpy feel
                            _ => push_grass_cluster(
                                &mut group.pos,
                                &mut group.nor,
                                &mut group.col,
                                &mut group.idx,
                                origin,
                                0.18,
                                0.32,
                                scale,
                                rot_y,
                                col_base,
                                col_tip,
                                4,
                                cluster_seed,
                            ),
                        }
                    }

                    // --- Overlap-aware spawn: trees > rocks > flowers ---
                    let mut tile_occupied = false;

                    // Trees (highest priority)
                    let tree_noise = hash2d(tx + 11317, tz + 5471);
                    if tree_noise < 0.055 {
                        tile_occupied = true;
                        let tree_entity = super::trees::spawn_tree_entity(
                            &mut commands,
                            &mut meshes,
                            tile_materials.tree_body_mat.clone(),
                            tx,
                            tz,
                            column_h,
                        );
                        entities.push(tree_entity);
                    }

                    // Rocks (skip if tree already on this tile)
                    if !tile_occupied {
                        let rock_noise = hash2d(tx + 19457, tz + 12391);
                        if rock_noise < 0.025 {
                            tile_occupied = true;
                            let jx = (hash2d(tx + 19557, tz + 12391) - 0.5) * 0.4;
                            let jz = (hash2d(tx + 19457, tz + 12491) - 0.5) * 0.4;
                            let world_x = tx as f32 * TILE_SIZE + jx;
                            let world_z = tz as f32 * TILE_SIZE + jz;
                            let rock_y = column_h + 0.002;

                            let kind = rocks::rock_kind_from_hash(tx, tz);
                            let params = rocks::RockParams {
                                world_x,
                                world_z,
                                base_y: rock_y,
                                kind,
                                tx,
                                tz,
                            };
                            let (rock_mesh, max_hw, total_h) =
                                rocks::build_rock(&params, &mut meshes);

                            let rot_y =
                                hash2d(tx * 8311 + 2477, tz * 7193 + 3319) * std::f32::consts::TAU;
                            let rock_entity = commands
                                .spawn((
                                    Mesh3d(rock_mesh),
                                    MeshMaterial3d(tile_materials.rock_body_mat.clone()),
                                    Transform::from_xyz(world_x, rock_y, world_z)
                                        .with_rotation(Quat::from_rotation_y(rot_y)),
                                    RigidBody::Fixed,
                                    Collider::cuboid(max_hw * 0.8, total_h / 2.0, max_hw * 0.8),
                                    HoverOutline {
                                        half_extents: Vec3::new(max_hw, total_h / 2.0, max_hw),
                                    },
                                    Interactable {
                                        kind: InteractableKind::Rock,
                                    },
                                    kind,
                                ))
                                .observe(on_pointer_over)
                                .observe(on_pointer_out)
                                .id();
                            entities.push(rock_entity);
                        }
                    }

                    // Flowers (skip if tree or rock already on this tile)
                    if !tile_occupied {
                        let flower_noise = hash2d(tx + 13721, tz + 8293);
                        if flower_noise < 0.12 {
                            tile_occupied = true;
                            let arch_idx =
                                (hash2d(tx + 13821, tz + 8393) * NUM_FLORA_SPECIES as f32) as usize
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
                                    RigidBody::Fixed,
                                    Collider::cuboid(0.2, 0.25, 0.2),
                                    Sensor,
                                    HoverOutline {
                                        half_extents: Vec3::new(0.2, 0.25, 0.2),
                                    },
                                    Interactable {
                                        kind: InteractableKind::Flower,
                                    },
                                    archetype,
                                ))
                                .observe(on_pointer_over)
                                .observe(on_pointer_out)
                                .id();
                            entities.push(flower_entity);
                        }
                    }

                    // Mushrooms (skip if anything else on this tile)
                    if !tile_occupied {
                        let mush_noise = hash2d(tx + 23017, tz + 17293);
                        if mush_noise < 0.04 {
                            let jx = (hash2d(tx + 23117, tz + 17293) - 0.5) * 0.5;
                            let jz = (hash2d(tx + 23017, tz + 17393) - 0.5) * 0.5;
                            let world_x = tx as f32 * TILE_SIZE + jx;
                            let world_z = tz as f32 * TILE_SIZE + jz;
                            let mush_y = column_h + 0.002;

                            let kind = mushrooms::mushroom_kind_from_hash(tx, tz);
                            let params = mushrooms::MushroomParams { tx, tz, kind };
                            let (mush_mesh, max_hw, total_h) =
                                mushrooms::build_mushroom(&params, &mut meshes);

                            let rot_y =
                                hash2d(tx * 9311 + 3477, tz * 8193 + 4319) * std::f32::consts::TAU;
                            let mush_entity = commands
                                .spawn((
                                    Mesh3d(mush_mesh),
                                    MeshMaterial3d(tile_materials.tree_body_mat.clone()),
                                    Transform::from_xyz(world_x, mush_y, world_z)
                                        .with_rotation(Quat::from_rotation_y(rot_y)),
                                    RigidBody::Fixed,
                                    Collider::cuboid(max_hw * 0.8, total_h / 2.0, max_hw * 0.8),
                                    Sensor,
                                    HoverOutline {
                                        half_extents: Vec3::new(max_hw, total_h / 2.0, max_hw),
                                    },
                                    Interactable {
                                        kind: InteractableKind::Mushroom,
                                    },
                                    kind,
                                ))
                                .observe(on_pointer_over)
                                .observe(on_pointer_out)
                                .id();
                            entities.push(mush_entity);
                        }
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
