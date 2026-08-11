use godot::classes::image::Format as ImageFormat;
use godot::classes::{
    ArrayMesh, BoxShape3D, CollisionShape3D, Image, ImageTexture, MeshInstance3D, StaticBody3D,
};
use godot::prelude::*;

use super::{HeightGen, QTerrain};

const ROAD_RES: i32 = 512;
const SEGMENT_STEP: f32 = 4.0;

fn seg_distance(p: Vector2, a: Vector2, b: Vector2) -> f32 {
    let ab = b - a;
    let denom = ab.length_squared().max(1e-6);
    let t = ((p - a).dot(ab) / denom).clamp(0.0, 1.0);
    (p - (a + ab * t)).length()
}

pub(super) struct RoadNetwork {
    segments: Vec<(Vector2, Vector2)>,
    pub width: f32,
    pub crossing: Vector2,
    pub direction: Vector2,
    pub half_span: f32,
}

impl RoadNetwork {
    /// The trunk road runs across the valley and meets the river head-on, so the
    /// deck can be a straight span. Wander is damped to zero near the crossing
    /// for the same reason.
    pub(super) fn build(hgen: &HeightGen, extent: f32, water_level: f32, width: f32) -> Self {
        let crossing_z = 0.0;
        let river_x = hgen.river_x(crossing_z);
        let crossing = Vector2::new(river_x, crossing_z);

        let mut half_span = 4.0;
        while half_span < extent * 0.25 {
            let left = hgen.height(river_x - half_span, crossing_z);
            let right = hgen.height(river_x + half_span, crossing_z);
            if left > water_level + 0.75 && right > water_level + 0.75 {
                break;
            }
            half_span += 0.5;
        }
        half_span += 2.5;

        let limit = extent - 6.0;
        let mut points: Vec<Vector2> = Vec::new();
        let mut x = -limit;
        while x <= limit {
            // Hold the line straight through the crossing, then let it drift.
            let away = ((x - river_x).abs() / (half_span * 3.0)).clamp(0.0, 1.0);
            let bend = away * away * (3.0 - 2.0 * away);
            let z = crossing_z + hgen.wander(x) * 26.0 * bend;
            points.push(Vector2::new(x, z));
            x += SEGMENT_STEP;
        }

        let mut segments: Vec<(Vector2, Vector2)> = Vec::with_capacity(points.len());
        for w in points.windows(2) {
            segments.push((w[0], w[1]));
        }

        Self {
            segments,
            width,
            crossing,
            direction: Vector2::new(1.0, 0.0),
            half_span,
        }
    }

    pub(super) fn distance(&self, p: Vector2) -> f32 {
        let mut best = f32::MAX;
        for (a, b) in &self.segments {
            let d = seg_distance(p, *a, *b);
            if d < best {
                best = d;
            }
        }
        best
    }

    pub(super) fn points(&self) -> impl Iterator<Item = Vector2> + '_ {
        self.segments.iter().map(|(a, _)| *a)
    }

    /// The carriageway drifts in z, so callers wanting a spot "on the road" must
    /// take a real polyline point rather than assume a fixed z.
    pub(super) fn point_near_x(&self, x: f32) -> Vector2 {
        self.points()
            .min_by(|a, b| {
                (a.x - x)
                    .abs()
                    .partial_cmp(&(b.x - x).abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or(self.crossing)
    }

    /// Skips the span the bridge covers, so road paint never lands on water.
    pub(super) fn on_bridge(&self, p: Vector2) -> bool {
        (p.x - self.crossing.x).abs() < self.half_span + 1.0
            && (p.y - self.crossing.y).abs() < self.width * 1.5
    }
}

impl QTerrain {
    pub(super) fn build_road(&mut self) {
        let Some(hgen) = self.hgen.take() else {
            return;
        };
        let road = RoadNetwork::build(&hgen, self.extent, self.water_level, self.road_width);

        let res = ROAD_RES;
        let step = self.extent * 2.0 / (res - 1) as f32;
        let mut mask = vec![0u8; (res * res) as usize];
        let reach = road.width * 1.9;

        for iy in 0..res {
            let z = -self.extent + iy as f32 * step;
            for ix in 0..res {
                let x = -self.extent + ix as f32 * step;
                let p = Vector2::new(x, z);
                if road.on_bridge(p) {
                    continue;
                }
                let d = road.distance(p);
                if d > reach {
                    continue;
                }
                // Dry land only; the riverbed keeps its own material.
                if hgen.height(x, z) < self.water_level + 0.35 {
                    continue;
                }
                let t = 1.0 - (d / reach).clamp(0.0, 1.0);
                let v = t * t * (3.0 - 2.0 * t);
                mask[(iy * res + ix) as usize] = (v * 255.0) as u8;
            }
        }

        let data = PackedByteArray::from(mask.as_slice());
        let tex = Image::create_from_data(res, res, false, ImageFormat::R8, &data)
            .and_then(|img| ImageTexture::create_from_image(&img));
        if let (Some(t), Some(m)) = (tex.as_ref(), self.ground_material.as_mut()) {
            m.set_shader_parameter("road_tex", &t.to_variant());
            m.set_shader_parameter("road_tile_scale", &self.road_tile_scale.to_variant());
        }
        self.road_tex = tex;
        self.road_res = res;
        self.road_mask = mask;

        // Grass reads clearance, so stamping the verge clears the carriageway.
        let stamps: Vec<Vector2> = road
            .points()
            .filter(|p| !road.on_bridge(*p))
            .filter(|p| hgen.height(p.x, p.y) >= self.water_level + 0.35)
            .collect();
        for p in stamps {
            self.stamp_clearance(p.x, p.y, road.width * 1.15);
        }
        self.flush_clearance();

        self.build_bridge(&hgen, &road);
        self.hgen = Some(hgen);
        self.road = Some(road);
    }
}

struct PlankMesh {
    verts: Vec<Vector3>,
    normals: Vec<Vector3>,
    uvs: Vec<Vector2>,
    indices: Vec<i32>,
}

impl PlankMesh {
    fn new() -> Self {
        Self {
            verts: Vec::new(),
            normals: Vec::new(),
            uvs: Vec::new(),
            indices: Vec::new(),
        }
    }

    fn quad(&mut self, c: [Vector3; 4], n: Vector3, uv: [Vector2; 4]) {
        let base = self.verts.len() as i32;
        for i in 0..4 {
            self.verts.push(c[i]);
            self.normals.push(n);
            self.uvs.push(uv[i]);
        }
        self.indices
            .extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    /// Axis-aligned box in the road frame. UVs are world-scaled so the plank
    /// texture keeps a constant real-world size on every face.
    fn box_at(&mut self, center: Vector3, half: Vector3, right: Vector3, fwd: Vector3, uvs: f32) {
        let up = Vector3::UP;
        // normal, tangent, bitangent, offset along normal, tangent extent, bitangent extent
        let faces: [(Vector3, Vector3, Vector3, f32, f32, f32); 6] = [
            (up, right, fwd, half.y, half.x, half.z),
            (-up, right, -fwd, half.y, half.x, half.z),
            (right, fwd, up, half.x, half.z, half.y),
            (-right, -fwd, up, half.x, half.z, half.y),
            (fwd, -right, up, half.z, half.x, half.y),
            (-fwd, right, up, half.z, half.x, half.y),
        ];
        for (normal, ax, ay, offset, ex, ey) in faces {
            let face = center + normal * offset;
            let corners = [
                face - ax * ex - ay * ey,
                face + ax * ex - ay * ey,
                face + ax * ex + ay * ey,
                face - ax * ex + ay * ey,
            ];
            let uv = [
                Vector2::new(0.0, 0.0),
                Vector2::new(ex * 2.0 * uvs, 0.0),
                Vector2::new(ex * 2.0 * uvs, ey * 2.0 * uvs),
                Vector2::new(0.0, ey * 2.0 * uvs),
            ];
            self.quad(corners, normal, uv);
        }
    }

    /// Slab between two points at different heights, used for the approach
    /// ramps. box_at cannot pitch, so sloped pieces need their own primitive.
    fn slab(&mut self, a: Vector3, b: Vector3, right: Vector3, half_w: f32, thick: f32, uvs: f32) {
        let along = b - a;
        let len = along.length();
        if len < 0.001 {
            return;
        }
        let mut n = right.cross(along).normalized();
        if n.y < 0.0 {
            n = -n;
        }
        let down = Vector3::UP * thick;
        let a0 = a - right * half_w;
        let a1 = a + right * half_w;
        let b0 = b - right * half_w;
        let b1 = b + right * half_w;
        let w = half_w * 2.0 * uvs;
        let l = len * uvs;
        let uv = [
            Vector2::new(0.0, 0.0),
            Vector2::new(w, 0.0),
            Vector2::new(w, l),
            Vector2::new(0.0, l),
        ];
        self.quad([a0, a1, b1, b0], n, uv);
        self.quad([b0 - down, b1 - down, a1 - down, a0 - down], -n, uv);
        self.quad([a1, b1, b1 - down, a1 - down], right, uv);
        self.quad([b0, a0, a0 - down, b0 - down], -right, uv);
    }

    fn build(&self) -> Option<Gd<ArrayMesh>> {
        if self.verts.is_empty() {
            return None;
        }
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
            godot::classes::mesh::ArrayType::TEX_UV.ord() as usize,
            &PackedVector2Array::from(self.uvs.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::INDEX.ord() as usize,
            &PackedInt32Array::from(self.indices.as_slice()).to_variant(),
        );
        let mut mesh = ArrayMesh::new_gd();
        mesh.add_surface_from_arrays(godot::classes::mesh::PrimitiveType::TRIANGLES, &arrays);
        Some(mesh)
    }
}

impl QTerrain {
    fn build_bridge(&mut self, hgen: &HeightGen, road: &RoadNetwork) {
        let right = Vector3::new(road.direction.x, 0.0, road.direction.y).normalized();
        let fwd = Vector3::new(-right.z, 0.0, right.x);
        let cx = road.crossing.x;
        let cz = road.crossing.y;

        let bank_l = hgen.height(cx - road.half_span, cz);
        let bank_r = hgen.height(cx + road.half_span, cz);
        let deck_y = bank_l.max(bank_r).max(self.water_level + 1.4) + 0.12;
        let center = Vector3::new(cx, deck_y, cz);

        let half_w = road.width * 0.55;
        let uvs = 0.5;
        let mut mb = PlankMesh::new();

        // Deck. Runs past the abutments so the ends bury themselves in the banks
        // instead of leaving the span visibly floating over a sloped shore.
        let deck_half = road.half_span + 1.8;
        mb.box_at(
            center,
            Vector3::new(deck_half, 0.11, half_w),
            right,
            fwd,
            uvs,
        );
        // Kerb rails along both sides
        for side in [-1.0f32, 1.0] {
            mb.box_at(
                center + fwd * (half_w - 0.08) * side + Vector3::UP * 0.62,
                Vector3::new(road.half_span, 0.07, 0.07),
                right,
                fwd,
                uvs,
            );
        }
        // Balusters
        let posts = ((road.half_span * 2.0) / 1.6).round().max(2.0) as i32;
        for i in 0..=posts {
            let t = i as f32 / posts as f32;
            let x = -road.half_span + t * road.half_span * 2.0;
            for side in [-1.0f32, 1.0] {
                mb.box_at(
                    center + right * x + fwd * (half_w - 0.08) * side + Vector3::UP * 0.33,
                    Vector3::new(0.07, 0.33, 0.07),
                    right,
                    fwd,
                    uvs,
                );
            }
        }
        // Piers down to the bed
        let bed = self.water_level - self.riverbed_depth;
        for side in [-1.0f32, 1.0] {
            for k in [-0.45f32, 0.45] {
                let x = road.half_span * k * 2.0 * 0.5;
                let top = deck_y - 0.11;
                let h = (top - bed).max(0.4);
                mb.box_at(
                    center + right * x + fwd * (half_w - 0.25) * side
                        - Vector3::UP * (h * 0.5 + 0.11),
                    Vector3::new(0.14, h * 0.5, 0.14),
                    right,
                    fwd,
                    uvs,
                );
            }
        }

        // Approach ramps: follow the bank down from each deck end so the road
        // meets the deck on a walkable slope instead of a step.
        let ramp_steps = 6;
        for side in [-1.0f32, 1.0] {
            let start = deck_half * side;
            let mut prev = center + right * start;
            for i in 1..=ramp_steps {
                let t = i as f32 / ramp_steps as f32;
                let x = start + right.x.signum() * 0.0 + side * (t * 5.5);
                let p = center + right * x;
                let ground = hgen.height(p.x, p.z) + 0.06;
                // Ease onto the terrain rather than meeting it at a hard angle.
                let y = deck_y - 0.11 + (ground - (deck_y - 0.11)) * (t * t * (3.0 - 2.0 * t));
                let next = Vector3::new(p.x, y.min(deck_y - 0.02), p.z);
                mb.slab(prev, next, fwd, half_w, 0.1, uvs);
                prev = next;
            }
        }

        let Some(mesh) = mb.build() else {
            return;
        };
        let mut inst = MeshInstance3D::new_alloc();
        inst.set_name("Bridge");
        inst.set_mesh(&mesh);
        if let Some(m) = self.bridge_material.as_ref() {
            inst.set_material_override(m);
        }
        self.base_mut().add_child(&inst);

        let mut shape = BoxShape3D::new_gd();
        shape.set_size(Vector3::new(deck_half * 2.0, 0.22, half_w * 2.0));
        let mut col = CollisionShape3D::new_alloc();
        col.set_shape(&shape);
        let mut body = StaticBody3D::new_alloc();
        body.set_name("BridgeBody");
        body.add_child(&col);
        body.set_position(center);
        let basis = Basis::from_cols(right, Vector3::UP, fwd);
        body.set_basis(basis);
        self.base_mut().add_child(&body);
    }
}
