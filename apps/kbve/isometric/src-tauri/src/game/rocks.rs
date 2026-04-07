use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::scene_objects::RockKind;

// ---------------------------------------------------------------------------
// Rock color palettes (sRGB → linear at use)
// ---------------------------------------------------------------------------

/// Stone palette: [highlight, mid, shadow]
const STONE_PALETTE: [(f32, f32, f32); 3] = [
    (0.62, 0.60, 0.56), // highlight — warm gray
    (0.45, 0.43, 0.40), // mid — neutral gray
    (0.28, 0.26, 0.24), // shadow — dark gray
];

/// Mossy rock: green-tinted grays
const MOSSY_PALETTE: [(f32, f32, f32); 3] = [
    (0.48, 0.58, 0.42), // highlight — mossy green
    (0.38, 0.44, 0.34), // mid — green-gray
    (0.24, 0.28, 0.22), // shadow — dark green-gray
];

/// Copper ore accent color (embedded in stone)
const ORE_COPPER_ACCENT: (f32, f32, f32) = (0.72, 0.45, 0.20);
/// Iron ore accent color
const ORE_IRON_ACCENT: (f32, f32, f32) = (0.50, 0.38, 0.35);
/// Crystal ore accent color
const ORE_CRYSTAL_ACCENT: (f32, f32, f32) = (0.55, 0.40, 0.75);

// ---------------------------------------------------------------------------
// Helpers (self-contained, no tilemap dependency)
// ---------------------------------------------------------------------------

fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn srgb_color(r: f32, g: f32, b: f32) -> [f32; 4] {
    [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
}

/// Simple deterministic hash for procedural placement.
fn hash2d(x: i32, z: i32) -> f32 {
    let n = (x.wrapping_mul(374761393) ^ z.wrapping_mul(668265263)).wrapping_add(1376312589);
    let n = n.wrapping_mul(n);
    (n as u32 as f32) / u32::MAX as f32
}

// ---------------------------------------------------------------------------
// Rock dome geometry — chunkier, squashed version of tree domes
// ---------------------------------------------------------------------------

/// Build a squashed dome with irregular wobble for rocky silhouettes.
/// Returns (positions, normals, colors, indices) for a single rock body.
fn push_rock_dome(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    rx: f32,
    ry: f32,
    rz: f32,
    color_top: [f32; 4],
    color_mid: [f32; 4],
    color_bottom: [f32; 4],
) {
    const SEGMENTS: u32 = 10;
    let tau = std::f32::consts::TAU;

    // Chunkier wobble than trees — rocks are lumpy
    let wobble = |angle: f32, ring: u32| -> f32 {
        let seed = center.x * 7.3 + center.z * 11.1 + ring as f32 * 5.0;
        1.0 + ((angle * 1.3 + seed).sin() * 0.22 + (angle * 2.7 - seed * 0.8).cos() * 0.15)
            * (1.0 + ring as f32 * 0.3)
    };

    // Per-dome tilt for asymmetry
    let tilt_seed = center.x * 5.7 + center.z * 8.3;
    let tilt_x = (tilt_seed * 3.1).sin() * 0.15;
    let tilt_z = (tilt_seed * 4.3).cos() * 0.15;

    // Ring geometry: wider base, flatter profile than trees
    let ring_geo: [(f32, f32); 3] = [
        (0.0, 1.0),   // base equator
        (0.12, 0.98), // low ring — barely tapered
        (0.65, 0.55), // mid ring — starts pulling in
    ];

    let mut emit_ring = |ring_idx: u32, y_frac: f32, r_scale: f32, band_color: [f32; 4]| -> u32 {
        let base = pos.len() as u32;
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * tau;
            let (s, c) = angle.sin_cos();
            let w = wobble(angle, ring_idx);
            let lx = c * rx * r_scale * w;
            let ly = ry * y_frac;
            let lz = s * rz * r_scale * w;
            // Apply tilt
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

    // Band 0: base — shadow
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

    // Band 1: body — mid color (dominant)
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

    // Band 2: top cap — highlight
    let b2_bot = emit_ring(2, ring_geo[2].0, ring_geo[2].1, color_top);
    let cap_vi = pos.len() as u32;
    // Off-center cap point for asymmetric top
    let cap_ox = (tilt_seed * 2.1).sin() * rx * 0.15;
    let cap_oz = (tilt_seed * 3.7).cos() * rz * 0.15;
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
        idx.extend_from_slice(&[b0_bot + j, bot_vi, b0_bot + i]);
    }
}

fn build_rock_mesh(
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
// Public API — called from tilemap.rs during chunk generation
// ---------------------------------------------------------------------------

/// Rock generation parameters computed from tile coordinates.
pub struct RockParams {
    pub world_x: f32,
    pub world_z: f32,
    pub base_y: f32,
    pub kind: RockKind,
    pub tx: i32,
    pub tz: i32,
}

/// Build a complete rock mesh and return it along with its bounding dimensions.
/// The mesh is centered at origin; caller positions it via Transform.
pub fn build_rock(
    params: &RockParams,
    meshes: &mut ResMut<Assets<Mesh>>,
) -> (Handle<Mesh>, f32, f32) {
    let seed_base = params.tx * 27449 + params.tz * 19237;

    // Size variation
    let size = 0.25 + hash2d(seed_base + 100, 8100) * 0.35; // 0.25–0.60

    // Pick palette based on kind
    let (base_palette, ore_accent) = match params.kind {
        RockKind::MossyRock => (&MOSSY_PALETTE, None),
        RockKind::OreCopper => (&STONE_PALETTE, Some(ORE_COPPER_ACCENT)),
        RockKind::OreIron => (&STONE_PALETTE, Some(ORE_IRON_ACCENT)),
        RockKind::OreCrystal => (&STONE_PALETTE, Some(ORE_CRYSTAL_ACCENT)),
        _ => (&STONE_PALETTE, None),
    };

    // Per-rock brightness/hue jitter
    let bright = 0.85 + hash2d(seed_base + 200, 8200) * 0.30;
    let hj = (hash2d(seed_base + 201, 8201) - 0.5) * 0.06;

    let jitter = |c: &(f32, f32, f32)| -> (f32, f32, f32) {
        (
            ((c.0 + hj) * bright).clamp(0.0, 1.0),
            ((c.1 + hj * 0.3) * bright).clamp(0.0, 1.0),
            ((c.2 - hj * 0.5) * bright).clamp(0.0, 1.0),
        )
    };

    let hl = jitter(&base_palette[0]);
    let md = jitter(&base_palette[1]);
    let sh = jitter(&base_palette[2]);

    let c_top = srgb_color(hl.0, hl.1, hl.2);
    let c_mid = srgb_color(md.0, md.1, md.2);
    let c_shadow = srgb_color(sh.0, sh.1, sh.2);

    let mut rp = Vec::with_capacity(256);
    let mut rn = Vec::with_capacity(256);
    let mut rc = Vec::with_capacity(256);
    let mut ri = Vec::with_capacity(512);

    // Shape jitter — asymmetric for organic feel
    let jit_sx = 0.80 + hash2d(seed_base + 300, 8300) * 0.40;
    let jit_sz = 0.80 + hash2d(seed_base + 301, 8301) * 0.40;

    // Main rock body — wide, squat dome
    let main_rx = size * 1.2 * jit_sx;
    let main_ry = size * 0.55; // squashed — rocks are flat
    let main_rz = size * 1.1 * jit_sz;
    push_rock_dome(
        &mut rp,
        &mut rn,
        &mut rc,
        &mut ri,
        Vec3::ZERO,
        main_rx,
        main_ry,
        main_rz,
        c_top,
        c_mid,
        c_shadow,
    );

    let mut max_hw = main_rx.max(main_rz);
    let mut total_h = main_ry;

    // 1-3 overlapping bumps for irregular silhouette
    let bump_count = 1 + (hash2d(seed_base + 400, 8400) * 2.99) as i32;
    for bi in 0..bump_count {
        let bi_seed = seed_base + 500 + bi * 157;
        let angle = hash2d(bi_seed + 1, 8501) * std::f32::consts::TAU;
        let dist = main_rx * (0.30 + hash2d(bi_seed + 2, 8502) * 0.25);
        let bx = angle.cos() * dist;
        let bz = angle.sin() * dist;
        let by = main_ry * (-0.10 + hash2d(bi_seed + 3, 8503) * 0.30);
        let b_size = 0.45 + hash2d(bi_seed + 4, 8504) * 0.30;
        let b_rx = main_rx * b_size * jit_sx;
        let b_rz = main_rz * b_size * jit_sz;
        let b_ry = main_ry * b_size * 0.70;

        // Vary bump colors between mid/shadow
        let (bt, bm, bb) = if hash2d(bi_seed + 5, 8505) < 0.5 {
            (c_top, c_mid, c_shadow)
        } else {
            (c_mid, c_shadow, c_shadow)
        };

        push_rock_dome(
            &mut rp,
            &mut rn,
            &mut rc,
            &mut ri,
            Vec3::new(bx, by, bz),
            b_rx,
            b_ry,
            b_rz,
            bt,
            bm,
            bb,
        );
        max_hw = max_hw.max(bx.abs() + b_rx.max(b_rz));
        total_h = total_h.max(by + b_ry);
    }

    // Ore vein: small accent-colored dome on one side
    if let Some(accent) = ore_accent {
        let a = jitter(&accent);
        let c_ore = srgb_color(a.0, a.1, a.2);
        let c_ore_dark = srgb_color(a.0 * 0.65, a.1 * 0.65, a.2 * 0.65);
        let ore_angle = hash2d(seed_base + 700, 8700) * std::f32::consts::TAU;
        let ore_dist = main_rx * 0.50;
        let ox = ore_angle.cos() * ore_dist;
        let oz = ore_angle.sin() * ore_dist;
        let oy = main_ry * 0.20;
        push_rock_dome(
            &mut rp,
            &mut rn,
            &mut rc,
            &mut ri,
            Vec3::new(ox, oy, oz),
            main_rx * 0.30,
            main_ry * 0.35,
            main_rz * 0.28,
            c_ore,
            c_ore,
            c_ore_dark,
        );
    }

    let mesh_handle = meshes.add(build_rock_mesh(rp, rn, rc, ri));
    (mesh_handle, max_hw, total_h)
}

/// Generate rock vertices in world space and push them into the provided raw
/// buffers. Used by `compute_chunk_geometry` to merge rocks into a per-chunk
/// mesh (single draw call). Applies position offset + Y-axis rotation directly
/// to the vertex positions.
///
/// Returns `(max_half_width, total_height)` for interaction bounding boxes.
pub fn push_rock_vertices(
    params: &RockParams,
    rot_y: f32,
    positions: &mut Vec<[f32; 3]>,
    normals: &mut Vec<[f32; 3]>,
    colors: &mut Vec<[f32; 4]>,
    indices: &mut Vec<u32>,
) -> (f32, f32) {
    let seed_base = params.tx * 27449 + params.tz * 19237;
    let size = 0.25 + hash2d(seed_base + 100, 8100) * 0.35;

    let (base_palette, ore_accent) = match params.kind {
        RockKind::MossyRock => (&MOSSY_PALETTE, None),
        RockKind::OreCopper => (&STONE_PALETTE, Some(ORE_COPPER_ACCENT)),
        RockKind::OreIron => (&STONE_PALETTE, Some(ORE_IRON_ACCENT)),
        RockKind::OreCrystal => (&STONE_PALETTE, Some(ORE_CRYSTAL_ACCENT)),
        _ => (&STONE_PALETTE, None),
    };

    let bright = 0.85 + hash2d(seed_base + 200, 8200) * 0.30;
    let hj = (hash2d(seed_base + 201, 8201) - 0.5) * 0.06;
    let jitter = |c: &(f32, f32, f32)| -> (f32, f32, f32) {
        (
            ((c.0 + hj) * bright).clamp(0.0, 1.0),
            ((c.1 + hj * 0.3) * bright).clamp(0.0, 1.0),
            ((c.2 - hj * 0.5) * bright).clamp(0.0, 1.0),
        )
    };

    let hl = jitter(&base_palette[0]);
    let md = jitter(&base_palette[1]);
    let sh = jitter(&base_palette[2]);
    let c_top = srgb_color(hl.0, hl.1, hl.2);
    let c_mid = srgb_color(md.0, md.1, md.2);
    let c_shadow = srgb_color(sh.0, sh.1, sh.2);

    // Generate into local buffers first, then rotate + translate into output.
    let mut lp = Vec::with_capacity(256);
    let mut ln = Vec::with_capacity(256);
    let mut lc = Vec::with_capacity(256);
    let mut li = Vec::with_capacity(512);

    let jit_sx = 0.80 + hash2d(seed_base + 300, 8300) * 0.40;
    let jit_sz = 0.80 + hash2d(seed_base + 301, 8301) * 0.40;

    let main_rx = size * 1.2 * jit_sx;
    let main_ry = size * 0.55;
    let main_rz = size * 1.1 * jit_sz;
    push_rock_dome(
        &mut lp,
        &mut ln,
        &mut lc,
        &mut li,
        Vec3::ZERO,
        main_rx,
        main_ry,
        main_rz,
        c_top,
        c_mid,
        c_shadow,
    );

    let mut max_hw = main_rx.max(main_rz);
    let mut total_h = main_ry;

    let bump_count = 1 + (hash2d(seed_base + 400, 8400) * 2.99) as i32;
    for bi in 0..bump_count {
        let bi_seed = seed_base + 500 + bi * 157;
        let angle = hash2d(bi_seed + 1, 8501) * std::f32::consts::TAU;
        let dist = main_rx * (0.30 + hash2d(bi_seed + 2, 8502) * 0.25);
        let bx = angle.cos() * dist;
        let bz = angle.sin() * dist;
        let by = main_ry * (-0.10 + hash2d(bi_seed + 3, 8503) * 0.30);
        let b_size = 0.45 + hash2d(bi_seed + 4, 8504) * 0.30;
        let b_rx = main_rx * b_size * jit_sx;
        let b_rz = main_rz * b_size * jit_sz;
        let b_ry = main_ry * b_size * 0.70;
        let (bt, bm, bb) = if hash2d(bi_seed + 5, 8505) < 0.5 {
            (c_top, c_mid, c_shadow)
        } else {
            (c_mid, c_shadow, c_shadow)
        };
        push_rock_dome(
            &mut lp,
            &mut ln,
            &mut lc,
            &mut li,
            Vec3::new(bx, by, bz),
            b_rx,
            b_ry,
            b_rz,
            bt,
            bm,
            bb,
        );
        max_hw = max_hw.max(bx.abs() + b_rx.max(b_rz));
        total_h = total_h.max(by + b_ry);
    }

    if let Some(accent) = ore_accent {
        let a = jitter(&accent);
        let c_ore = srgb_color(a.0, a.1, a.2);
        let c_ore_dark = srgb_color(a.0 * 0.65, a.1 * 0.65, a.2 * 0.65);
        let ore_angle = hash2d(seed_base + 700, 8700) * std::f32::consts::TAU;
        let ore_dist = main_rx * 0.50;
        let ox = ore_angle.cos() * ore_dist;
        let oz = ore_angle.sin() * ore_dist;
        let oy = main_ry * 0.20;
        push_rock_dome(
            &mut lp,
            &mut ln,
            &mut lc,
            &mut li,
            Vec3::new(ox, oy, oz),
            main_rx * 0.30,
            main_ry * 0.35,
            main_rz * 0.28,
            c_ore,
            c_ore,
            c_ore_dark,
        );
    }

    // Transform local vertices to world space: rotate by rot_y then translate.
    let (sin_r, cos_r) = rot_y.sin_cos();
    let base_idx = positions.len() as u32;
    for p in &lp {
        let rx = p[0] * cos_r - p[2] * sin_r;
        let rz = p[0] * sin_r + p[2] * cos_r;
        positions.push([
            params.world_x + rx,
            params.base_y + p[1],
            params.world_z + rz,
        ]);
    }
    for n in &ln {
        let rx = n[0] * cos_r - n[2] * sin_r;
        let rz = n[0] * sin_r + n[2] * cos_r;
        normals.push([rx, n[1], rz]);
    }
    colors.extend_from_slice(&lc);
    for i in &li {
        indices.push(base_idx + i);
    }

    (max_hw, total_h)
}

/// Determine what kind of rock to spawn based on tile hash.
pub fn rock_kind_from_hash(tx: i32, tz: i32) -> RockKind {
    let v = hash2d(tx + 20001, tz + 15001);
    if v < 0.40 {
        RockKind::Boulder
    } else if v < 0.55 {
        RockKind::MossyRock
    } else if v < 0.72 {
        RockKind::OreCopper
    } else if v < 0.88 {
        RockKind::OreIron
    } else {
        RockKind::OreCrystal
    }
}
