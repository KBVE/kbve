use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::scene_objects::MushroomKind;

// ---------------------------------------------------------------------------
// Color palettes (sRGB)
// ---------------------------------------------------------------------------

/// Porcini: warm brown dome, cream stem
const PORCINI_CAP: [(f32, f32, f32); 3] = [
    (0.55, 0.35, 0.18), // highlight
    (0.42, 0.25, 0.12), // mid
    (0.28, 0.16, 0.08), // shadow
];
const PORCINI_STEM: (f32, f32, f32) = (0.85, 0.80, 0.70);

/// Chanterelle: golden-orange funnel
const CHANTERELLE_CAP: [(f32, f32, f32); 3] = [
    (0.90, 0.70, 0.25), // highlight
    (0.78, 0.55, 0.18), // mid
    (0.58, 0.38, 0.12), // shadow
];
const CHANTERELLE_STEM: (f32, f32, f32) = (0.82, 0.65, 0.30);

/// Fly Agaric: red dome with white spots, white stem
const FLY_AGARIC_CAP: [(f32, f32, f32); 3] = [
    (0.82, 0.14, 0.12), // highlight — bright red
    (0.68, 0.10, 0.09), // mid
    (0.48, 0.08, 0.07), // shadow
];
const FLY_AGARIC_SPOT: (f32, f32, f32) = (0.92, 0.90, 0.84);
const FLY_AGARIC_STEM: (f32, f32, f32) = (0.90, 0.88, 0.82);

// ---------------------------------------------------------------------------
// Helpers
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

fn hash2d(x: i32, z: i32) -> f32 {
    let n = (x.wrapping_mul(374761393) ^ z.wrapping_mul(668265263)).wrapping_add(1376312589);
    let n = n.wrapping_mul(n);
    (n as u32 as f32) / u32::MAX as f32
}

// ---------------------------------------------------------------------------
// Mushroom geometry
// ---------------------------------------------------------------------------

/// Push a dome cap (squashed hemisphere). Used for Porcini and Fly Agaric caps.
fn push_dome_cap(
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
    spot_color: Option<[f32; 4]>,
    seed: f32,
) {
    const SEGMENTS: u32 = 8;
    let tau = std::f32::consts::TAU;

    // 3 rings + cap apex
    let rings: [(f32, f32, [f32; 4]); 3] = [
        (0.0, 1.0, color_bottom), // base equator
        (0.50, 0.85, color_mid),  // mid
        (0.85, 0.40, color_top),  // near top
    ];

    let mut ring_bases = Vec::new();
    for (ri, &(y_frac, r_scale, band_col)) in rings.iter().enumerate() {
        let base = pos.len() as u32;
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * tau;
            let (s, c) = angle.sin_cos();

            // Spot coloring for Fly Agaric: scatter spots on mid/top rings
            let mut vc = band_col;
            if let Some(sc) = spot_color {
                if ri >= 1 {
                    let spot_hash = ((angle * 3.7 + seed * 5.3).sin() * 43758.5453).fract();
                    if spot_hash > 0.65 {
                        vc = sc;
                    }
                }
            }

            pos.push([
                center.x + c * rx * r_scale,
                center.y + ry * y_frac,
                center.z + s * rz * r_scale,
            ]);
            let nx = c * r_scale;
            let ny = y_frac + 0.2;
            let nz = s * r_scale;
            let nlen = (nx * nx + ny * ny + nz * nz).sqrt().max(0.001);
            nor.push([nx / nlen, ny / nlen, nz / nlen]);
            col.push(vc);
        }
        ring_bases.push(base);
    }

    // Connect rings
    for r in 0..(rings.len() - 1) {
        let b0 = ring_bases[r];
        let b1 = ring_bases[r + 1];
        for i in 0..SEGMENTS {
            let j = (i + 1) % SEGMENTS;
            idx.extend_from_slice(&[b0 + i, b1 + i, b0 + j, b0 + j, b1 + i, b1 + j]);
        }
    }

    // Cap apex
    let cap_vi = pos.len() as u32;
    pos.push([center.x, center.y + ry, center.z]);
    nor.push([0.0, 1.0, 0.0]);
    col.push(color_top);
    let top_ring = *ring_bases.last().unwrap();
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[top_ring + i, cap_vi, top_ring + j]);
    }

    // Bottom disc (seal)
    let bot_vi = pos.len() as u32;
    pos.push([center.x, center.y, center.z]);
    nor.push([0.0, -1.0, 0.0]);
    col.push(color_bottom);
    let base_ring = ring_bases[0];
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[base_ring + j, bot_vi, base_ring + i]);
    }
}

/// Push a simple cylinder stem.
fn push_stem(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    radius: f32,
    height: f32,
    color: [f32; 4],
) {
    const SEGMENTS: u32 = 6;
    let tau = std::f32::consts::TAU;

    let base_bot = pos.len() as u32;
    for i in 0..SEGMENTS {
        let angle = (i as f32 / SEGMENTS as f32) * tau;
        let (s, c) = angle.sin_cos();
        pos.push([center.x + c * radius, center.y, center.z + s * radius]);
        nor.push([c, 0.0, s]);
        col.push(color);
    }

    let base_top = pos.len() as u32;
    for i in 0..SEGMENTS {
        let angle = (i as f32 / SEGMENTS as f32) * tau;
        let (s, c) = angle.sin_cos();
        pos.push([
            center.x + c * radius,
            center.y + height,
            center.z + s * radius,
        ]);
        nor.push([c, 0.0, s]);
        col.push(color);
    }

    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[
            base_bot + i,
            base_top + i,
            base_bot + j,
            base_bot + j,
            base_top + i,
            base_top + j,
        ]);
    }
}

/// Push a funnel/trumpet shape for Chanterelle (wider at top, narrow at bottom).
fn push_funnel(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    bottom_radius: f32,
    top_radius: f32,
    height: f32,
    color_top: [f32; 4],
    color_mid: [f32; 4],
    color_bottom: [f32; 4],
) {
    const SEGMENTS: u32 = 8;
    let tau = std::f32::consts::TAU;

    // 3 rings from bottom to top
    let rings: [(f32, f32, [f32; 4]); 3] = [
        (0.0, bottom_radius, color_bottom),
        (
            0.5,
            bottom_radius + (top_radius - bottom_radius) * 0.4,
            color_mid,
        ),
        (1.0, top_radius, color_top),
    ];

    let mut ring_bases = Vec::new();
    for &(y_frac, r, band_col) in &rings {
        let base = pos.len() as u32;
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * tau;
            let (s, c) = angle.sin_cos();
            pos.push([
                center.x + c * r,
                center.y + height * y_frac,
                center.z + s * r,
            ]);
            let nx = c;
            let ny = (top_radius - bottom_radius) / height * 0.5;
            let nz = s;
            let nlen = (nx * nx + ny * ny + nz * nz).sqrt().max(0.001);
            nor.push([nx / nlen, ny / nlen, nz / nlen]);
            col.push(band_col);
        }
        ring_bases.push(base);
    }

    for r in 0..(rings.len() - 1) {
        let b0 = ring_bases[r];
        let b1 = ring_bases[r + 1];
        for i in 0..SEGMENTS {
            let j = (i + 1) % SEGMENTS;
            idx.extend_from_slice(&[b0 + i, b1 + i, b0 + j, b0 + j, b1 + i, b1 + j]);
        }
    }

    // Bottom disc
    let bot_vi = pos.len() as u32;
    pos.push([center.x, center.y, center.z]);
    nor.push([0.0, -1.0, 0.0]);
    col.push(color_bottom);
    let base_ring = ring_bases[0];
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[base_ring + j, bot_vi, base_ring + i]);
    }
}

fn build_mushroom_mesh(
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
// Public API
// ---------------------------------------------------------------------------

pub struct MushroomParams {
    pub tx: i32,
    pub tz: i32,
    pub kind: MushroomKind,
}

/// Build a mushroom mesh. Returns (mesh_handle, max_half_width, total_height).
pub fn build_mushroom(
    params: &MushroomParams,
    meshes: &mut ResMut<Assets<Mesh>>,
) -> (Handle<Mesh>, f32, f32) {
    let seed_base = params.tx * 31337 + params.tz * 21493;
    let size = 0.12 + hash2d(seed_base + 100, 9100) * 0.14; // 0.12–0.26

    let bright = 0.88 + hash2d(seed_base + 200, 9200) * 0.24;
    let hj = (hash2d(seed_base + 201, 9201) - 0.5) * 0.05;

    let jitter = |c: &(f32, f32, f32)| -> (f32, f32, f32) {
        (
            ((c.0 + hj) * bright).clamp(0.0, 1.0),
            ((c.1 + hj * 0.3) * bright).clamp(0.0, 1.0),
            ((c.2 - hj * 0.5) * bright).clamp(0.0, 1.0),
        )
    };

    let mut mp = Vec::with_capacity(128);
    let mut mn = Vec::with_capacity(128);
    let mut mc = Vec::with_capacity(128);
    let mut mi = Vec::with_capacity(256);

    let (max_hw, total_h) = match params.kind {
        MushroomKind::Porcini => {
            let pal = &PORCINI_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);
            let st = jitter(&PORCINI_STEM);

            let cap_rx = size * 1.3;
            let cap_ry = size * 0.7;
            let cap_rz = size * 1.2;
            let stem_r = size * 0.35;
            let stem_h = size * 0.8;

            // Stem
            push_stem(
                &mut mp,
                &mut mn,
                &mut mc,
                &mut mi,
                Vec3::ZERO,
                stem_r,
                stem_h,
                srgb_color(st.0, st.1, st.2),
            );
            // Cap on top of stem
            push_dome_cap(
                &mut mp,
                &mut mn,
                &mut mc,
                &mut mi,
                Vec3::new(0.0, stem_h, 0.0),
                cap_rx,
                cap_ry,
                cap_rz,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
                None,
                0.0,
            );

            (cap_rx.max(cap_rz), stem_h + cap_ry)
        }
        MushroomKind::Chanterelle => {
            let pal = &CHANTERELLE_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);

            let bot_r = size * 0.25;
            let top_r = size * 1.4;
            let height = size * 1.6;

            push_funnel(
                &mut mp,
                &mut mn,
                &mut mc,
                &mut mi,
                Vec3::ZERO,
                bot_r,
                top_r,
                height,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
            );

            (top_r, height)
        }
        MushroomKind::FlyAgaric => {
            let pal = &FLY_AGARIC_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);
            let sp = jitter(&FLY_AGARIC_SPOT);
            let st = jitter(&FLY_AGARIC_STEM);

            let cap_rx = size * 1.2;
            let cap_ry = size * 0.55;
            let cap_rz = size * 1.15;
            let stem_r = size * 0.28;
            let stem_h = size * 1.1;

            // Taller stem
            push_stem(
                &mut mp,
                &mut mn,
                &mut mc,
                &mut mi,
                Vec3::ZERO,
                stem_r,
                stem_h,
                srgb_color(st.0, st.1, st.2),
            );
            // Red spotted cap
            push_dome_cap(
                &mut mp,
                &mut mn,
                &mut mc,
                &mut mi,
                Vec3::new(0.0, stem_h, 0.0),
                cap_rx,
                cap_ry,
                cap_rz,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
                Some(srgb_color(sp.0, sp.1, sp.2)),
                seed_base as f32,
            );

            (cap_rx.max(cap_rz), stem_h + cap_ry)
        }
    };

    let mesh_handle = meshes.add(build_mushroom_mesh(mp, mn, mc, mi));
    (mesh_handle, max_hw, total_h)
}

/// Generate mushroom vertices in world space and push them into the provided
/// raw buffers. Used by `compute_chunk_geometry` to merge mushrooms into a
/// per-chunk mesh (single draw call).
///
/// Returns `(max_half_width, total_height)` for interaction bounding boxes.
pub fn push_mushroom_vertices(
    params: &MushroomParams,
    world_x: f32,
    world_z: f32,
    mush_y: f32,
    rot_y: f32,
    positions: &mut Vec<[f32; 3]>,
    normals: &mut Vec<[f32; 3]>,
    colors: &mut Vec<[f32; 4]>,
    indices: &mut Vec<u32>,
) -> (f32, f32) {
    let seed_base = params.tx * 31337 + params.tz * 21493;
    let size = 0.12 + hash2d(seed_base + 100, 9100) * 0.14;
    let bright = 0.88 + hash2d(seed_base + 200, 9200) * 0.24;
    let hj = (hash2d(seed_base + 201, 9201) - 0.5) * 0.05;
    let jitter = |c: &(f32, f32, f32)| -> (f32, f32, f32) {
        (
            ((c.0 + hj) * bright).clamp(0.0, 1.0),
            ((c.1 + hj * 0.3) * bright).clamp(0.0, 1.0),
            ((c.2 - hj * 0.5) * bright).clamp(0.0, 1.0),
        )
    };

    let mut lp = Vec::with_capacity(128);
    let mut ln = Vec::with_capacity(128);
    let mut lc = Vec::with_capacity(128);
    let mut li = Vec::with_capacity(256);

    let (max_hw, total_h) = match params.kind {
        MushroomKind::Porcini => {
            let pal = &PORCINI_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);
            let st = jitter(&PORCINI_STEM);
            let cap_rx = size * 1.3;
            let cap_ry = size * 0.7;
            let cap_rz = size * 1.2;
            let stem_r = size * 0.35;
            let stem_h = size * 0.8;
            push_stem(
                &mut lp,
                &mut ln,
                &mut lc,
                &mut li,
                Vec3::ZERO,
                stem_r,
                stem_h,
                srgb_color(st.0, st.1, st.2),
            );
            push_dome_cap(
                &mut lp,
                &mut ln,
                &mut lc,
                &mut li,
                Vec3::new(0.0, stem_h, 0.0),
                cap_rx,
                cap_ry,
                cap_rz,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
                None,
                0.0,
            );
            (cap_rx.max(cap_rz), stem_h + cap_ry)
        }
        MushroomKind::Chanterelle => {
            let pal = &CHANTERELLE_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);
            let bot_r = size * 0.25;
            let top_r = size * 1.4;
            let height = size * 1.6;
            push_funnel(
                &mut lp,
                &mut ln,
                &mut lc,
                &mut li,
                Vec3::ZERO,
                bot_r,
                top_r,
                height,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
            );
            (top_r, height)
        }
        MushroomKind::FlyAgaric => {
            let pal = &FLY_AGARIC_CAP;
            let hl = jitter(&pal[0]);
            let md = jitter(&pal[1]);
            let sh = jitter(&pal[2]);
            let sp = jitter(&FLY_AGARIC_SPOT);
            let st = jitter(&FLY_AGARIC_STEM);
            let cap_rx = size * 1.2;
            let cap_ry = size * 0.55;
            let cap_rz = size * 1.15;
            let stem_r = size * 0.28;
            let stem_h = size * 1.1;
            push_stem(
                &mut lp,
                &mut ln,
                &mut lc,
                &mut li,
                Vec3::ZERO,
                stem_r,
                stem_h,
                srgb_color(st.0, st.1, st.2),
            );
            push_dome_cap(
                &mut lp,
                &mut ln,
                &mut lc,
                &mut li,
                Vec3::new(0.0, stem_h, 0.0),
                cap_rx,
                cap_ry,
                cap_rz,
                srgb_color(hl.0, hl.1, hl.2),
                srgb_color(md.0, md.1, md.2),
                srgb_color(sh.0, sh.1, sh.2),
                Some(srgb_color(sp.0, sp.1, sp.2)),
                seed_base as f32,
            );
            (cap_rx.max(cap_rz), stem_h + cap_ry)
        }
    };

    // Transform to world space: rotate by rot_y then translate.
    let (sin_r, cos_r) = rot_y.sin_cos();
    let base_idx = positions.len() as u32;
    for p in &lp {
        let rx = p[0] * cos_r - p[2] * sin_r;
        let rz = p[0] * sin_r + p[2] * cos_r;
        positions.push([world_x + rx, mush_y + p[1], world_z + rz]);
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

/// Determine mushroom kind from tile hash.
pub fn mushroom_kind_from_hash(tx: i32, tz: i32) -> MushroomKind {
    let v = hash2d(tx + 25001, tz + 18001);
    if v < 0.45 {
        MushroomKind::Porcini
    } else if v < 0.75 {
        MushroomKind::Chanterelle
    } else {
        MushroomKind::FlyAgaric
    }
}
