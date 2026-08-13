use crate::world::{hash32, randf};
use std::collections::HashMap;

use godot::classes::ArrayMesh;
use godot::classes::mesh::PrimitiveType;
use godot::prelude::*;

fn hash3(x: i32, y: i32, z: i32, seed: u32) -> f32 {
    let h = hash32(
        seed ^ (x as u32).wrapping_mul(0x27d4eb2d)
            ^ (y as u32).wrapping_mul(0x165667b1)
            ^ (z as u32).wrapping_mul(0x9e3779b1),
    );
    (h >> 8) as f32 / 16_777_216.0
}

fn value_noise(p: Vector3, seed: u32) -> f32 {
    let (xi, yi, zi) = (p.x.floor(), p.y.floor(), p.z.floor());
    let (fx, fy, fz) = (p.x - xi, p.y - yi, p.z - zi);
    let sx = fx * fx * (3.0 - 2.0 * fx);
    let sy = fy * fy * (3.0 - 2.0 * fy);
    let sz = fz * fz * (3.0 - 2.0 * fz);
    let (x0, y0, z0) = (xi as i32, yi as i32, zi as i32);
    let mut acc = 0.0;
    for dz in 0..2 {
        for dy in 0..2 {
            for dx in 0..2 {
                let w = (if dx == 1 { sx } else { 1.0 - sx })
                    * (if dy == 1 { sy } else { 1.0 - sy })
                    * (if dz == 1 { sz } else { 1.0 - sz });
                acc += w * hash3(x0 + dx, y0 + dy, z0 + dz, seed);
            }
        }
    }
    acc * 2.0 - 1.0
}

pub struct RockGrowth {
    pub aspect: Vector3,
    pub roundness: Vector2,
    pub macro_noise: f32,
    pub detail_noise: f32,
    pub fracture_count: u32,
    pub fracture_strength: f32,
    pub edge_weathering: f32,
    pub burial: f32,
    pub strata_bias: f32,
    pub subdiv: u32,
}

pub const SPECIES: &[RockGrowth] = &[
    // granite boulder: isotropic, rounded, few broad fractures, heavily weathered
    RockGrowth {
        aspect: Vector3::new(1.0, 0.86, 0.95),
        roundness: Vector2::new(0.85, 0.9),
        macro_noise: 0.17,
        detail_noise: 0.035,
        fracture_count: 3,
        fracture_strength: 0.35,
        edge_weathering: 0.7,
        burial: 0.22,
        strata_bias: 0.0,
        subdiv: 2,
    },
    // sandstone slab: flattened, boxy, bedding-plane fractures, strong strata
    RockGrowth {
        aspect: Vector3::new(1.35, 0.5, 1.1),
        roundness: Vector2::new(0.5, 0.62),
        macro_noise: 0.13,
        detail_noise: 0.03,
        fracture_count: 4,
        fracture_strength: 0.5,
        edge_weathering: 0.4,
        burial: 0.3,
        strata_bias: 0.85,
        subdiv: 2,
    },
    // river stone: flattened, very round, almost no visible fracture
    RockGrowth {
        aspect: Vector3::new(1.15, 0.62, 1.0),
        roundness: Vector2::new(1.0, 1.0),
        macro_noise: 0.1,
        detail_noise: 0.02,
        fracture_count: 0,
        fracture_strength: 0.0,
        edge_weathering: 0.95,
        burial: 0.26,
        strata_bias: 0.0,
        subdiv: 2,
    },
    // talus rock: asymmetric, angular, many sharp planes, barely weathered
    RockGrowth {
        aspect: Vector3::new(0.95, 1.05, 0.85),
        roundness: Vector2::new(0.42, 0.5),
        macro_noise: 0.2,
        detail_noise: 0.05,
        fracture_count: 6,
        fracture_strength: 0.6,
        edge_weathering: 0.18,
        burial: 0.2,
        strata_bias: 0.0,
        subdiv: 2,
    },
];

struct Facets {
    verts: Vec<Vector3>,
    normals: Vec<Vector3>,
    colors: Vec<Color>,
    indices: Vec<i32>,
}

impl Facets {
    fn new() -> Self {
        Self {
            verts: Vec::new(),
            normals: Vec::new(),
            colors: Vec::new(),
            indices: Vec::new(),
        }
    }

    fn tri(&mut self, a: Vector3, b: Vector3, c: Vector3, col: Color, n: Vector3) {
        let base = self.verts.len() as i32;
        self.verts.extend_from_slice(&[a, b, c]);
        self.normals.extend_from_slice(&[n, n, n]);
        self.colors.extend_from_slice(&[col, col, col]);
        self.indices.extend_from_slice(&[base, base + 1, base + 2]);
    }

    fn arrays(&self) -> VarArray {
        let mut arrays = VarArray::new();
        arrays.resize(
            godot::classes::mesh::ArrayType::MAX.ord() as usize,
            &Variant::nil(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::VERTEX.ord() as usize,
            &PackedVector3Array::from(self.verts.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::NORMAL.ord() as usize,
            &PackedVector3Array::from(self.normals.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::COLOR.ord() as usize,
            &PackedColorArray::from(self.colors.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::INDEX.ord() as usize,
            &PackedInt32Array::from(self.indices.as_slice()).to_variant(),
        );
        arrays
    }
}

fn icosahedron() -> (Vec<Vector3>, Vec<[u32; 3]>) {
    let t = 1.618_034_f32;
    let verts = vec![
        Vector3::new(-1.0, t, 0.0),
        Vector3::new(1.0, t, 0.0),
        Vector3::new(-1.0, -t, 0.0),
        Vector3::new(1.0, -t, 0.0),
        Vector3::new(0.0, -1.0, t),
        Vector3::new(0.0, 1.0, t),
        Vector3::new(0.0, -1.0, -t),
        Vector3::new(0.0, 1.0, -t),
        Vector3::new(t, 0.0, -1.0),
        Vector3::new(t, 0.0, 1.0),
        Vector3::new(-t, 0.0, -1.0),
        Vector3::new(-t, 0.0, 1.0),
    ];
    let faces = vec![
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];
    (verts, faces)
}

fn subdivide(verts: &mut Vec<Vector3>, faces: Vec<[u32; 3]>) -> Vec<[u32; 3]> {
    let mut cache: HashMap<(u32, u32), u32> = HashMap::new();
    let mut out = Vec::with_capacity(faces.len() * 4);
    for f in faces {
        let mut mid = [0u32; 3];
        for i in 0..3 {
            let (a, b) = (f[i], f[(i + 1) % 3]);
            let key = (a.min(b), a.max(b));
            mid[i] = *cache.entry(key).or_insert_with(|| {
                let m = (verts[a as usize] + verts[b as usize]) * 0.5;
                verts.push(m);
                verts.len() as u32 - 1
            });
        }
        out.push([f[0], mid[0], mid[2]]);
        out.push([f[1], mid[1], mid[0]]);
        out.push([f[2], mid[2], mid[1]]);
        out.push([mid[0], mid[1], mid[2]]);
    }
    out
}

fn spow(v: f32, e: f32) -> f32 {
    v.signum() * v.abs().max(1e-5).powf(e)
}

fn superellipsoid(n: Vector3, g: &RockGrowth) -> Vector3 {
    let eta = n.y.clamp(-1.0, 1.0).asin();
    let omega = n.z.atan2(n.x);
    let (e1, e2) = (g.roundness.x, g.roundness.y);
    let ce = spow(eta.cos(), e1);
    Vector3::new(
        g.aspect.x * ce * spow(omega.cos(), e2),
        g.aspect.y * spow(eta.sin(), e1),
        g.aspect.z * ce * spow(omega.sin(), e2),
    )
}

fn adjacency(vert_count: usize, faces: &[[u32; 3]]) -> Vec<Vec<u32>> {
    let mut adj: Vec<Vec<u32>> = vec![Vec::new(); vert_count];
    for f in faces {
        for i in 0..3 {
            let (a, b) = (f[i] as usize, f[(i + 1) % 3]);
            if !adj[a].contains(&b) {
                adj[a].push(b);
            }
            let (a2, b2) = (f[(i + 1) % 3] as usize, f[i]);
            if !adj[a2].contains(&b2) {
                adj[a2].push(b2);
            }
        }
    }
    adj
}

struct Grown {
    verts: Vec<Vector3>,
    faces: Vec<[u32; 3]>,
    fresh: Vec<f32>,
    height: f32,
}

fn grow(g: &RockGrowth, seed: u32) -> Grown {
    let mut state = hash32(seed | 1);
    let (mut dirs, mut faces) = icosahedron();
    for v in dirs.iter_mut() {
        *v = v.normalized();
    }
    for _ in 0..g.subdiv {
        faces = subdivide(&mut dirs, faces);
        for v in dirs.iter_mut() {
            *v = v.normalized();
        }
    }

    let nseed = hash32(seed ^ 0x9e37_79b1);
    let dseed = hash32(seed ^ 0x85eb_ca6b);
    let mut verts: Vec<Vector3> = dirs
        .iter()
        .map(|n| {
            let base = superellipsoid(*n, g);
            let macro_p = Vector3::new(n.x * 1.7, n.y * (1.7 + g.strata_bias * 4.0), n.z * 1.7);
            let warp = 1.0
                + value_noise(macro_p, nseed) * g.macro_noise
                + value_noise(*n * 5.3, dseed) * g.detail_noise;
            base * warp
        })
        .collect();

    let mut fresh: Vec<f32> = vec![0.0; verts.len()];
    for _ in 0..g.fracture_count {
        let az = randf(&mut state) * std::f32::consts::TAU;
        let el = if g.strata_bias > 0.5 {
            (randf(&mut state) - 0.5) * 0.5
                + std::f32::consts::FRAC_PI_2 * randf(&mut state).round()
        } else {
            (randf(&mut state) - 0.35) * 2.2
        };
        let normal = Vector3::new(az.cos() * el.cos(), el.sin(), az.sin() * el.cos()).normalized();
        let reach = verts.iter().fold(0.0f32, |m: f32, v| m.max(v.dot(normal)));
        let offset = reach * (0.74 + randf(&mut state) * 0.2);
        let strength = g.fracture_strength * (0.7 + randf(&mut state) * 0.4);
        for (i, v) in verts.iter_mut().enumerate() {
            let d = v.dot(normal) - offset;
            if d > 0.0 {
                let push = (d * strength).min(reach * 0.1);
                *v -= normal * push;
                fresh[i] = fresh[i].max((d / reach.max(1e-4)) * 4.0).min(1.0);
            }
        }
    }

    if g.edge_weathering > 0.0 {
        let adj = adjacency(verts.len(), &faces);
        for _ in 0..2 {
            let snapshot = verts.clone();
            for (i, v) in verts.iter_mut().enumerate() {
                if adj[i].is_empty() {
                    continue;
                }
                let mut avg = Vector3::ZERO;
                for j in &adj[i] {
                    avg += snapshot[*j as usize];
                }
                avg /= adj[i].len() as f32;
                let convex = (snapshot[i].length() - avg.length()).max(0.0);
                let w = (convex * 6.0).min(1.0) * g.edge_weathering * 0.55;
                *v = snapshot[i].lerp(avg, w);
            }
        }
    }

    let low = verts.iter().fold(f32::MAX, |m: f32, v| m.min(v.y));
    let floor = low + g.aspect.y * g.burial;
    for v in verts.iter_mut() {
        if v.y < floor {
            v.y = floor - (floor - v.y) * 0.06;
        }
        v.y -= floor;
    }
    let height = verts.iter().fold(0.0f32, |m: f32, v| m.max(v.y));
    Grown {
        verts,
        faces,
        fresh,
        height,
    }
}

#[allow(clippy::too_many_arguments)]
fn emit(
    fac: &mut Facets,
    grown: &Grown,
    faces: &[[u32; 3]],
    offset: Vector3,
    scale: f32,
    yaw: f32,
    strata: f32,
    state: &mut u32,
) {
    let dark = Color::from_rgba(0.33, 0.325, 0.315, 1.0);
    let light = Color::from_rgba(0.66, 0.64, 0.59, 1.0);
    let (cs, sn) = (yaw.cos(), yaw.sin());
    let xf = |p: Vector3| -> Vector3 {
        let p = p * scale;
        Vector3::new(p.x * cs - p.z * sn, p.y, p.x * sn + p.z * cs) + offset
    };
    let h = (grown.height * scale).max(1e-3);
    let center = if grown.verts.is_empty() {
        Vector3::ZERO
    } else {
        grown.verts.iter().fold(Vector3::ZERO, |acc, v| acc + *v) / grown.verts.len() as f32
    };
    // Winding is a property of the whole shell, not of one facet: after
    // fracture and weathering a recessed facet can face away from the
    // centroid, so a per-face centroid test would flip it and punch a hole.
    // Signed volume stays correct through any amount of concavity.
    let mut volume = 0.0f64;
    for f in faces {
        let (l0, l1, l2) = (
            grown.verts[f[0] as usize] - center,
            grown.verts[f[1] as usize] - center,
            grown.verts[f[2] as usize] - center,
        );
        volume += l0.dot(l1.cross(l2)) as f64;
    }
    let flip = volume > 0.0;

    for f in faces {
        let (i0, i1, i2) = (f[0] as usize, f[1] as usize, f[2] as usize);
        let (l0, l1, l2) = (grown.verts[i0], grown.verts[i1], grown.verts[i2]);
        if (l1 - l0).cross(l2 - l0).length_squared() < 1e-12 {
            continue;
        }
        let a = xf(l0);
        let b = xf(if flip { l2 } else { l1 });
        let c = xf(if flip { l1 } else { l2 });
        let mid = (a + b + c) / 3.0;
        let rh = (b - a).cross(c - a);
        if rh.length_squared() < 1e-12 {
            continue;
        }
        let n = -rh.normalized();
        let up = n.y.clamp(-1.0, 1.0) * 0.5 + 0.5;
        let y01 = ((mid.y - offset.y) / h).clamp(0.0, 1.0);
        let band = if strata > 0.0 {
            ((y01 * 9.0).sin() * 0.5 + 0.5) * strata
        } else {
            0.0
        };
        let broken = (grown.fresh[i0] + grown.fresh[i1] + grown.fresh[i2]) / 3.0;
        let jitter = randf(state);
        // Creases between facets read as crevices: the more a face turns away
        // from the outward direction, the deeper it sits.
        let local_mid = (grown.verts[i0] + grown.verts[i1] + grown.verts[i2]) / 3.0;
        let radial = (local_mid - center).normalized();
        let crevice = (1.0 - n.dot(radial).clamp(0.0, 1.0)).powf(1.6);
        let speckle = value_noise(local_mid * 14.0, 0x5eed_1234) * 0.5 + 0.5;
        let t =
            (up * 0.36 + y01 * 0.16 + band * 0.25 + jitter * 0.1 + broken * 0.22 + speckle * 0.14
                - crevice * 0.3)
                .clamp(0.0, 1.0);
        // Mineral tint: warm on exposed faces, cool in shade, subtle either way.
        let warm = (speckle - 0.5) * 0.05;
        let col = Color::from_rgba(
            (dark.r + (light.r - dark.r) * t + warm).clamp(0.0, 1.0),
            (dark.g + (light.g - dark.g) * t).clamp(0.0, 1.0),
            (dark.b + (light.b - dark.b) * t - warm * 0.6).clamp(0.0, 1.0),
            y01,
        );
        fac.tri(a, b, c, col, n);
    }
}

pub const LOD_LEVELS: usize = 3;

fn lod_species(variant: usize, lod: usize) -> RockGrowth {
    let g = &SPECIES[variant % SPECIES.len()];
    RockGrowth {
        aspect: g.aspect,
        roundness: g.roundness,
        macro_noise: g.macro_noise,
        // Detail below a couple of pixels is wasted; drop it with distance.
        detail_noise: match lod {
            0 => g.detail_noise,
            1 => g.detail_noise * 0.5,
            _ => 0.0,
        },
        fracture_count: match lod {
            0 => g.fracture_count,
            1 => g.fracture_count.min(3),
            _ => g.fracture_count.min(2),
        },
        fracture_strength: g.fracture_strength,
        edge_weathering: g.edge_weathering,
        burial: g.burial,
        strata_bias: g.strata_bias,
        subdiv: match lod {
            0 => g.subdiv,
            1 => g.subdiv.saturating_sub(1),
            _ => 0,
        },
    }
}

pub fn build_stone_mesh(seed: u32, variant: usize) -> Gd<ArrayMesh> {
    build_stone_lod(seed, variant, 0)
}

/// lod 0 = full (~320 tris), 1 = mid (~80), 2 = distant (~20).
/// Every level grows from the same seed and parameters, so the silhouette
/// stays put across a swap; only surface detail drops out.
pub fn build_stone_lod(seed: u32, variant: usize, lod: usize) -> Gd<ArrayMesh> {
    let g = lod_species(variant, lod);
    let grown = grow(&g, seed);
    let mut state = hash32(seed ^ 0xabcd_1234);
    let mut fac = Facets::new();
    emit(
        &mut fac,
        &grown,
        &grown.faces,
        Vector3::ZERO,
        1.0,
        0.0,
        g.strata_bias,
        &mut state,
    );
    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &fac.arrays());
    am
}

/// Point cloud for a convex collision hull, in the same local space as lod 0.
pub fn build_stone_hull(seed: u32, variant: usize) -> PackedVector3Array {
    let g = lod_species(variant, 1);
    let grown = grow(&g, seed);
    PackedVector3Array::from(grown.verts.as_slice())
}

fn small_species(variant: usize) -> RockGrowth {
    let g = &SPECIES[variant % SPECIES.len()];
    RockGrowth {
        aspect: Vector3::new(1.0, 0.78, 0.92),
        roundness: g.roundness,
        macro_noise: 0.22,
        detail_noise: 0.05,
        fracture_count: 3,
        fracture_strength: 0.55,
        edge_weathering: g.edge_weathering * 0.5,
        burial: 0.25,
        strata_bias: g.strata_bias,
        subdiv: 1,
    }
}

pub fn build_rubble_mesh(seed: u32, variant: usize, pieces: u32, spread: f32) -> Gd<ArrayMesh> {
    let small = small_species(variant);
    let mut state = hash32(seed ^ 0x5bd1_e995);
    let mut fac = Facets::new();
    for i in 0..pieces {
        let grown = grow(&small, hash32(seed.wrapping_add(i * 131)));
        let az = (i as f32 / pieces as f32) * std::f32::consts::TAU + randf(&mut state) * 0.9;
        let dist = spread * (0.2 + randf(&mut state) * 0.8);
        let s = 0.17 + randf(&mut state) * 0.15;
        emit(
            &mut fac,
            &grown,
            &grown.faces,
            Vector3::new(az.cos() * dist, 0.0, az.sin() * dist),
            s,
            randf(&mut state) * std::f32::consts::TAU,
            small.strata_bias,
            &mut state,
        );
    }
    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &fac.arrays());
    am
}

pub fn build_cracked_mesh(seed: u32, variant: usize) -> Gd<ArrayMesh> {
    let g = &SPECIES[variant % SPECIES.len()];
    let bitten = RockGrowth {
        aspect: Vector3::new(g.aspect.x * 0.94, g.aspect.y * 0.78, g.aspect.z * 0.94),
        roundness: g.roundness,
        macro_noise: g.macro_noise * 1.2,
        detail_noise: g.detail_noise,
        fracture_count: g.fracture_count + 4,
        fracture_strength: (g.fracture_strength + 0.35).min(0.9),
        edge_weathering: g.edge_weathering * 0.35,
        burial: g.burial,
        strata_bias: g.strata_bias,
        subdiv: g.subdiv,
    };
    let grown = grow(&bitten, seed);
    let mut state = hash32(seed ^ 0x27d4_eb2d);
    let mut fac = Facets::new();
    emit(
        &mut fac,
        &grown,
        &grown.faces,
        Vector3::ZERO,
        1.0,
        0.0,
        g.strata_bias,
        &mut state,
    );
    let small = small_species(variant);
    for i in 0..3 {
        let piece = grow(&small, hash32(seed ^ (0x1234 + i * 977)));
        let az = i as f32 * 2.1 + randf(&mut state);
        let dist = 0.5 + randf(&mut state) * 0.4;
        emit(
            &mut fac,
            &piece,
            &piece.faces,
            Vector3::new(az.cos() * dist, 0.0, az.sin() * dist),
            0.2 + randf(&mut state) * 0.13,
            randf(&mut state) * std::f32::consts::TAU,
            small.strata_bias,
            &mut state,
        );
    }
    let mut am = ArrayMesh::new_gd();
    am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &fac.arrays());
    am
}
