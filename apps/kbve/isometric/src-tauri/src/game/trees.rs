use bevy::prelude::*;

use avian3d::prelude::*;

use super::player::Player;
use super::scene_objects::{
    HoverOutline, Interactable, InteractableKind, on_pointer_out, on_pointer_over,
};
use super::terrain::hash2d;
use super::tilemap::{TILE_SIZE, build_chunk_mesh, lerp3, srgb_color};
use super::weather::BlobShadow;

// ---------------------------------------------------------------------------
// Bark palettes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Canopy colors and tree presets
// ---------------------------------------------------------------------------

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
#[allow(dead_code)]
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
            ry: 0.65,
            rz: 1.10,
            center_y_offset: 0.30,
        },
    },
];

// ---------------------------------------------------------------------------
// Bark face colors
// ---------------------------------------------------------------------------

/// Per-face bark colors based on vertical position along trunk.
/// `y_frac`: 0.0 = base, 1.0 = top.
/// Returns `[top_cap, bottom, lit, shadow, semi_shadow, semi_lit]`.
fn bark_face_colors_with(y_frac: f32, bp: &BarkPalette) -> [[f32; 4]; 6] {
    let root = if y_frac < 0.15 { 0.82 } else { 1.0 };
    let apply = |c: (f32, f32, f32)| srgb_color(c.0 * root, c.1 * root, c.2 * root);

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
// Trunk geometry
// ---------------------------------------------------------------------------

/// Two-section 6-sided trunk: flared trapezoid base + straight upper section.
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

    let flare_frac = 0.30;
    let flare_h = height * flare_frac;
    let mid_r = top_r * 1.15;

    let wobble = |i: usize, section: u8| -> f32 {
        let s = seed * 11.3 + i as f32 * 2.7 + section as f32 * 5.0;
        1.0 + s.sin() * 0.15
    };

    let brighten = |c: [f32; 4], factor: f32| -> [f32; 4] {
        [
            (c[0] * factor).min(1.0),
            (c[1] * factor).min(1.0),
            (c[2] * factor).min(1.0),
            1.0,
        ]
    };

    let face_brightness = |i: usize| -> f32 {
        let shifted = (i + ((seed * 4.0) as usize)) % SIDES;
        match shifted % 3 {
            0 => 1.25,
            1 => 1.0,
            _ => 0.75,
        }
    };

    let mut emit_section = |y_bot: f32,
                            y_top: f32,
                            r_bot: f32,
                            r_top: f32,
                            bark_frac: f32,
                            wobble_bot: u8,
                            wobble_top: u8| {
        let base_col = bark_face_colors_with(bark_frac, bp)[4];

        for i in 0..SIDES {
            let a0 = (i as f32) / (SIDES as f32) * tau;
            let a1 = ((i + 1) as f32) / (SIDES as f32) * tau;
            let (c0, s0) = (a0.cos(), a0.sin());
            let (c1, s1) = (a1.cos(), a1.sin());

            let wb0 = wobble(i, wobble_bot);
            let wb1 = wobble(i + 1, wobble_bot);
            let wt0 = wobble(i, wobble_top);
            let wt1 = wobble(i + 1, wobble_top);

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

    // Buttress roots
    let root_phase = seed * 3.7;
    for ri in 0..root_count {
        let angle = root_phase
            + (ri as f32 / root_count as f32) * tau
            + ((seed * 7.3 + ri as f32 * 2.1).sin()) * 0.50;
        let (rc, rs) = (angle.cos(), angle.sin());
        let fin_len = base_r * (1.5 + ((seed * 5.1 + ri as f32 * 3.3).sin()) * 0.5);
        let fin_h = flare_h * (0.7 + ((seed * 4.7 + ri as f32 * 1.9).cos()) * 0.2);
        let fin_thick_base = base_r * 0.30;
        let fin_thick_tip = base_r * 0.06;

        let root_dark = bark_face_colors_with(0.02, bp)[2];
        let root_light = bark_face_colors_with(0.10, bp)[2];
        let perp_x = -rs;
        let perp_z = rc;
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

// ---------------------------------------------------------------------------
// Branch stub geometry
// ---------------------------------------------------------------------------

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

    // +X
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

// ---------------------------------------------------------------------------
// Canopy dome geometry
// ---------------------------------------------------------------------------

/// Push a 3-zone canopy dome with clean flat band colors and per-dome tilt.
/// Zones: sun plate (~8%), foliage body (~65%), underside (~27%).
fn push_dome(
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
    const SEGMENTS: u32 = 12;
    let tau = std::f32::consts::TAU;

    let wobble = |angle: f32, ring: u32| -> f32 {
        let seed = center.x * 5.0 + center.z * 7.0 + ring as f32 * 3.0;
        let strength = 1.0 + ring as f32 * 0.5;
        1.0 + ((angle * 1.5 + seed).sin() * 0.18 + (angle * 2.3 - seed * 0.6).cos() * 0.12)
            * strength
    };

    let tilt_seed = center.x * 4.1 + center.z * 6.7;
    let tilt_x = ((tilt_seed * 2.9).sin()) * 0.12;
    let tilt_z = ((tilt_seed * 3.7).cos()) * 0.12;

    let hl_seed = center.x * 3.7 + center.z * 5.3;
    let hl_angle = ((hl_seed * 2.1).sin() * 0.5 + 0.5) * tau;
    let hl_dist = 0.20 + ((hl_seed * 4.3).cos() * 0.5 + 0.5) * 0.25;
    let cap_ox = hl_angle.cos() * rx * hl_dist;
    let cap_oz = hl_angle.sin() * rz * hl_dist;

    let ring_geo: [(f32, f32); 3] = [(0.0, 1.0), (0.18, 0.95), (0.73, 0.68)];

    let mut emit_ring = |ring_idx: u32, y_frac: f32, r_scale: f32, band_color: [f32; 4]| -> u32 {
        let base = pos.len() as u32;
        for i in 0..SEGMENTS {
            let angle = (i as f32 / SEGMENTS as f32) * tau;
            let (s, c) = angle.sin_cos();
            let w = wobble(angle, ring_idx);
            let lx = c * rx * r_scale * w;
            let ly = ry * y_frac;
            let lz = s * rz * r_scale * w;
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

    // Band 0: equator→ring1 — underside
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

    // Band 1: ring1→ring2 — foliage body
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

    // Band 2: ring2→cap — sun cap
    let b2_bot = emit_ring(2, ring_geo[2].0, ring_geo[2].1, color_top);
    let cap_vi = pos.len() as u32;
    pos.push([center.x + cap_ox, center.y + ry, center.z + cap_oz]);
    nor.push([0.0, 1.0, 0.0]);
    col.push(color_top);
    for i in 0..SEGMENTS {
        let j = (i + 1) % SEGMENTS;
        idx.extend_from_slice(&[b2_bot + i, cap_vi, b2_bot + j]);
    }

    // Bottom disc
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
// Tree geometry builder — returns mesh + metadata for entity spawning
// ---------------------------------------------------------------------------

/// Result of building a complete tree's geometry.
pub struct TreeGeometry {
    pub mesh: Mesh,
    pub max_hw: f32,
    pub total_h: f32,
    pub trunk_r: f32,
    pub trunk_h: f32,
    pub base_rot: Quat,
    pub wind_phase: f32,
    pub wind_stiffness: f32,
}

/// Build the complete geometry for a single tree (trunk + branches + canopy).
/// Returns all data needed to spawn the entity in the chunk system.
pub fn build_tree_geometry(tx: i32, tz: i32, size_scale: f32) -> TreeGeometry {
    let preset_idx = (hash2d(tx + 11617, tz + 5771) * 6.0) as usize % 6;
    let bark_palette = &BARK_PALETTES[preset_idx];
    let preset = TREE_PRESETS[preset_idx];

    let bump_count = 3 + (hash2d(tx * 31337 + tz * 17389 + 80, 6080) * 3.99) as i32;
    let mass_scale = 1.0 + (bump_count - 3) as f32 * 0.12;
    let trunk_h = preset.trunk_h * size_scale * mass_scale;
    let trunk_r = preset.trunk_r * size_scale * (1.0 + (bump_count - 3) as f32 * 0.08);

    let max_cuboids = 2 + 4;
    let mut tp = Vec::with_capacity(max_cuboids * 24);
    let mut tn = Vec::with_capacity(max_cuboids * 24);
    let mut tc = Vec::with_capacity(max_cuboids * 24);
    let mut ti = Vec::with_capacity(max_cuboids * 36);

    // --- Tapered trunk with buttress roots ---
    let root_count = 3 + (hash2d(tx + 12017, tz + 6171) * 2.0) as i32;
    let trunk_seed = tx as f32 * 0.137 + tz as f32 * 0.293;
    push_tapered_trunk(
        &mut tp,
        &mut tn,
        &mut tc,
        &mut ti,
        0.0,
        trunk_h,
        trunk_r * 2.2,
        trunk_r * 0.70,
        root_count,
        trunk_seed,
        bark_palette,
    );

    // --- Branches ---
    let branch_count = if size_scale > 1.6 {
        3 + (hash2d(tx + 11817, tz + 5971) * 2.99) as i32
    } else {
        2 + (hash2d(tx + 11817, tz + 5971) * 2.0) as i32
    };
    let branch_zone_base = trunk_h * 0.50;
    let branch_zone_h = trunk_h * 0.40;
    for bi in 0..branch_count {
        let angle = hash2d(tx + 13000 + bi * 173, tz + 7000) * std::f32::consts::TAU;
        let y_pos = branch_zone_base + hash2d(tx + 13100 + bi * 173, tz + 7100) * branch_zone_h;
        let len_base = if size_scale > 1.6 { 0.14 } else { 0.10 };
        let len_range = if size_scale > 1.6 { 0.16 } else { 0.12 };
        let branch_len =
            (len_base + hash2d(tx + 13200 + bi * 173, tz + 7200) * len_range) * size_scale;
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

    // --- Canopy ---
    let canopy_base = PRESET_CANOPY_COLORS[preset_idx];
    let seed_base = tx * 31337 + tz * 17389;
    let mut max_hw: f32 = trunk_r;
    let mut total_h: f32 = trunk_h;

    let canopy_spread = 1.0 + (size_scale - 1.1).max(0.0) * 0.16;
    let (canopy_rx, canopy_ry) = match preset.canopy {
        CanopyShape::Cone { radius, height, .. } => (
            radius * size_scale * canopy_spread,
            height * size_scale * 0.5,
        ),
        CanopyShape::Ellipsoid { rx, ry, .. } => (rx * size_scale * canopy_spread, ry * size_scale),
    };

    let base_frac = match preset_idx {
        0 => 0.94,
        1 => 0.90,
        2 => 0.85,
        3 => 0.87,
        4 => 0.87,
        5 => 0.82,
        _ => 0.88,
    };
    let canopy_center_y = trunk_h * base_frac;

    let tree_bright = 0.82 + hash2d(seed_base + 500, 7700) * 0.28;
    let tree_hj = (hash2d(seed_base + 501, 7701) - 0.5) * 0.20;
    let tb = (
        (canopy_base.0 + tree_hj) * tree_bright,
        (canopy_base.1 + tree_hj * 0.3) * tree_bright,
        (canopy_base.2 - tree_hj * 0.5) * tree_bright,
    );

    let c_highlight = srgb_color(
        (tb.0 * 1.15 + 0.03).min(1.0),
        (tb.1 * 1.10 + 0.02).min(1.0),
        (tb.2 * 0.88).min(1.0),
    );
    let c_mid = srgb_color(tb.0, tb.1, tb.2);
    let c_shadow = srgb_color(tb.0 * 0.45, tb.1 * 0.58, tb.2 * 0.65);
    let c_body = srgb_color(tb.0 * 0.72, tb.1 * 0.78, tb.2 * 0.82);

    let tree_rot_angle = hash2d(seed_base + 72, 6072) * std::f32::consts::TAU;
    let (rot_sin, rot_cos) = tree_rot_angle.sin_cos();
    let rot = |ox: f32, oz: f32| -> (f32, f32) {
        (ox * rot_cos - oz * rot_sin, ox * rot_sin + oz * rot_cos)
    };
    let jit_sx = 0.84 + hash2d(seed_base + 70, 6070) * 0.32;
    let jit_sz = 0.84 + hash2d(seed_base + 71, 6071) * 0.32;

    let canopy_center_y = canopy_center_y + (hash2d(seed_base + 81, 6081) - 0.5) * trunk_h * 0.10;
    let has_top = hash2d(seed_base + 17, 6017) < 0.60;

    // Main dome
    let main_rx = canopy_rx * (0.88 + hash2d(seed_base + 20, 6020) * 0.12) * jit_sx;
    let main_ry = canopy_ry * (0.60 + hash2d(seed_base + 22, 6022) * 0.15);
    let main_rz = canopy_rx * (0.85 + hash2d(seed_base + 21, 6021) * 0.14) * jit_sz;
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

    // Edge bumps
    for li in 0..bump_count {
        let li_seed = seed_base + 200 + li * 137;
        let angle = hash2d(li_seed + 50, 6150) * std::f32::consts::TAU;
        let dist = canopy_rx * (0.35 + hash2d(li_seed + 1, 6101) * 0.25);
        let lx = angle.cos() * dist;
        let lz = angle.sin() * dist;
        let ly_frac = -0.20 + hash2d(li_seed + 2, 6102) * 0.40;
        let ly_raw = canopy_center_y + canopy_ry * ly_frac;
        let size_t = hash2d(li_seed + 8, 6108);
        let l_rx = canopy_rx * (0.50 + size_t * 0.30) * jit_sx;
        let l_rz = canopy_rx * (0.48 + size_t * 0.28) * jit_sz;
        let squash = 0.60 + hash2d(li_seed + 3, 6103) * 0.25;
        let l_ry = canopy_ry * (0.30 + hash2d(li_seed + 5, 6105) * 0.20) * squash;
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

    // Top shelf
    if has_top {
        let (ts_ox, ts_oz) = rot(
            (hash2d(seed_base + 10, 6010) - 0.5) * canopy_rx * 0.30,
            (hash2d(seed_base + 11, 6011) - 0.5) * canopy_rx * 0.30,
        );
        let stretch = 0.65 + hash2d(seed_base + 15, 6015) * 0.55;
        let inv_stretch = 1.30 - stretch;
        let ts_rx = canopy_rx * (0.40 + hash2d(seed_base + 12, 6012) * 0.25) * stretch;
        let ts_ry = canopy_ry * (0.15 + hash2d(seed_base + 18, 6018) * 0.12);
        let ts_rz = canopy_rx * (0.35 + hash2d(seed_base + 13, 6013) * 0.25) * inv_stretch;
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

    // Branch sub-canopies
    if size_scale > 1.30 {
        let pb_count = if size_scale > 1.70 {
            2 + (hash2d(seed_base + 300, 7300) * 1.99) as i32
        } else {
            1 + (hash2d(seed_base + 300, 7300) * 1.99) as i32
        };
        for pi in 0..pb_count {
            let pi_seed = seed_base + 400 + pi * 191;
            let pb_angle = hash2d(pi_seed + 1, 7401) * std::f32::consts::TAU;
            let pb_y_frac = 0.55 + hash2d(pi_seed + 2, 7402) * 0.25;
            let pb_y = trunk_h * pb_y_frac;
            let pb_reach = canopy_rx * (0.55 + hash2d(pi_seed + 3, 7403) * 0.35);
            let pb_cx = pb_angle.cos() * pb_reach;
            let pb_cz = pb_angle.sin() * pb_reach;
            let pb_size = 0.40 + hash2d(pi_seed + 4, 7404) * 0.25;
            let pb_rx = canopy_rx * pb_size * jit_sx;
            let pb_rz = canopy_rx * pb_size * jit_sz;
            let pb_ry = canopy_ry * pb_size * 0.65;
            let pb_dome_y = pb_y + pb_ry * 0.3;

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

    // Compute entity metadata
    let tilt_x = (hash2d(tx * 4591 + 1277, tz * 3307) - 0.5) * 0.26;
    let tilt_z = (hash2d(tx * 5303, tz * 4219 + 1901) - 0.5) * 0.26;
    let rot_y = hash2d(tx * 6737 + 3119, tz * 5417 + 2309) * std::f32::consts::TAU;
    let base_rot = Quat::from_euler(EulerRot::XYZ, tilt_x, rot_y, tilt_z);
    let wind_phase = hash2d(tx * 7919 + 4391, tz * 6133 + 2707) * std::f32::consts::TAU;
    let wind_stiffness = (trunk_r / 0.10).max(0.5);

    TreeGeometry {
        mesh: build_chunk_mesh(tp, tn, tc, ti),
        max_hw,
        total_h,
        trunk_r,
        trunk_h,
        base_rot,
        wind_phase,
        wind_stiffness,
    }
}

// ---------------------------------------------------------------------------
// Wind and occlusion components
// ---------------------------------------------------------------------------

/// Attached to tree entities. Rotation pivot at ground → canopy moves, trunk base stays.
#[derive(Component)]
pub struct TreeWindSway {
    pub base_rotation: Quat,
    pub phase: f32,
    pub stiffness: f32,
}

/// Marker on trees for occlusion detection against the player.
#[derive(Component)]
pub struct TreeOccluder;

/// The player silhouette indicator (dots/ring visible through trees).
#[derive(Component)]
struct PlayerOcclusionIndicator;

// ---------------------------------------------------------------------------
// Occlusion system
// ---------------------------------------------------------------------------

const CAM_DIR_XZ: (f32, f32) = (0.707, 0.707);

fn build_indicator_mesh() -> Mesh {
    use bevy::asset::RenderAssetUsages;
    use bevy::mesh::{Indices, PrimitiveTopology};

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

        positions.extend_from_slice(&[
            [cx - dot_r, 0.0, cz],
            [cx + dot_r, 0.0, cz],
            [cx, 0.0, cz + dot_r],
            [cx, 0.0, cz - dot_r],
        ]);
        normals.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
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
        depth_bias: f32::MAX,
        ..default()
    });

    commands.spawn((
        Mesh3d(mesh),
        MeshMaterial3d(mat),
        Transform::from_xyz(0.0, -100.0, 0.0),
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
        ind_tf.translation = Vec3::new(pp.x, pp.y + 1.2, pp.z);
    } else {
        *ind_vis = Visibility::Hidden;
    }
}

// ---------------------------------------------------------------------------
// Spawn helper — called from tilemap chunk system
// ---------------------------------------------------------------------------

/// Spawn a tree entity with all required components. Returns the entity ID.
pub fn spawn_tree_entity(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    tree_body_mat: Handle<StandardMaterial>,
    blob_shadow_mesh: Handle<Mesh>,
    blob_shadow_mat: Handle<StandardMaterial>,
    tx: i32,
    tz: i32,
    column_h: f32,
) -> (Entity, Entity) {
    let size_scale = 1.10 + hash2d(tx + 11717, tz + 5871) * 1.10;
    let geo = build_tree_geometry(tx, tz, size_scale);

    let jx = (hash2d(tx + 11417, tz + 5471) - 0.5) * 0.3;
    let jz = (hash2d(tx + 11317, tz + 5571) - 0.5) * 0.3;
    let world_x = tx as f32 * TILE_SIZE + jx;
    let world_z = tz as f32 * TILE_SIZE + jz;
    let tree_base_y = column_h + 0.002;

    let canopy_h = geo.total_h - geo.trunk_h;
    let collider_shapes = vec![
        (
            Vec3::new(0.0, geo.trunk_h / 2.0, 0.0),
            Quat::IDENTITY,
            Collider::cuboid(geo.trunk_r * 2.0, geo.trunk_h, geo.trunk_r * 2.0),
        ),
        (
            Vec3::new(0.0, geo.trunk_h + canopy_h / 2.0, 0.0),
            Quat::IDENTITY,
            Collider::cuboid(geo.max_hw * 1.4, canopy_h, geo.max_hw * 1.4),
        ),
    ];

    let tree_mesh = meshes.add(geo.mesh);
    let tree_entity = commands
        .spawn((
            Mesh3d(tree_mesh),
            MeshMaterial3d(tree_body_mat),
            Transform::from_xyz(world_x, tree_base_y, world_z).with_rotation(geo.base_rot),
            RigidBody::Static,
            Collider::compound(collider_shapes),
            HoverOutline {
                half_extents: Vec3::new(geo.max_hw, geo.total_h / 2.0, geo.max_hw),
            },
            Interactable {
                kind: InteractableKind::Tree,
            },
            TreeWindSway {
                base_rotation: geo.base_rot,
                phase: geo.wind_phase,
                stiffness: geo.wind_stiffness,
            },
            TreeOccluder,
        ))
        .observe(on_pointer_over)
        .observe(on_pointer_out)
        .id();

    // Dynamic blob shadow for the tree canopy
    let shadow_entity = commands
        .spawn((
            Mesh3d(blob_shadow_mesh),
            MeshMaterial3d(blob_shadow_mat),
            Transform::from_xyz(world_x, tree_base_y + 0.001, world_z),
            BlobShadow {
                anchor: Vec3::new(world_x, tree_base_y + 0.001, world_z),
                radius: geo.max_hw * 1.2,
                object_height: geo.total_h,
            },
            Pickable::IGNORE,
        ))
        .id();

    (tree_entity, shadow_entity)
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct TreesPlugin;

impl Plugin for TreesPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_occlusion_indicator);
        app.add_systems(Update, update_player_occlusion);
    }
}
