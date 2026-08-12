use godot::classes::image::Format as ImageFormat;
use godot::classes::{
    ArrayMesh, CollisionShape3D, Image, ImageTexture, MeshInstance3D, StaticBody3D,
};
use godot::prelude::*;

use super::{HeightGen, QTerrain};

const ROAD_RES: i32 = 512;
const SEGMENT_STEP: f32 = 4.0;
/// Longest run a ramp may take, so the road can be kept straight over it.
const STRAIGHT_APPROACH: f32 = 30.0;

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
    bridge_reach: f32,
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
            // Hold the line straight across the whole bridge corridor — deck
            // plus the longest approach a ramp can take — then let it drift.
            // The bridge is built on one fixed axis, so any bend inside that
            // span leaves the deck and the painted carriageway disagreeing.
            let hold = half_span + STRAIGHT_APPROACH;
            let away = (((x - river_x).abs() - hold) / 18.0).clamp(0.0, 1.0);
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
            bridge_reach: half_span + 1.0,
        }
    }

    /// Widened once the ramps are laid out, so road paint stops where the
    /// timber approach starts instead of running on underneath it.
    pub(super) fn set_bridge_reach(&mut self, reach: f32) {
        self.bridge_reach = reach;
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

    pub(super) fn segments(&self) -> impl Iterator<Item = (Vector2, Vector2)> + '_ {
        self.segments.iter().copied()
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
        (p.x - self.crossing.x).abs() < self.bridge_reach
            && (p.y - self.crossing.y).abs() < self.width * 2.2
    }
}

impl QTerrain {
    pub(super) fn build_road(&mut self) {
        let Some(hgen) = self.hgen.take() else {
            return;
        };
        let mut road = RoadNetwork::build(&hgen, self.extent, self.water_level, self.road_width);
        // Ramp length is solved against the terrain, so the bridge has to be
        // laid out before the mask knows where the paint should stop.
        let reach = self.build_bridge(&hgen, &road);
        road.set_bridge_reach(reach);

        let res = ROAD_RES;
        let step = self.extent * 2.0 / (res - 1) as f32;
        let mut mask = vec![0u8; (res * res) as usize];
        let paint_reach = road.width * 1.9;

        for iy in 0..res {
            let z = -self.extent + iy as f32 * step;
            for ix in 0..res {
                let x = -self.extent + ix as f32 * step;
                let p = Vector2::new(x, z);
                if road.on_bridge(p) {
                    continue;
                }
                let d = road.distance(p);
                if d > paint_reach {
                    continue;
                }
                // Dry land only; the riverbed keeps its own material.
                if hgen.height(x, z) < self.water_level + 0.35 {
                    continue;
                }
                let t = 1.0 - (d / paint_reach).clamp(0.0, 1.0);
                let v = t * t * (3.0 - 2.0 * t);
                mask[(iy * res + ix) as usize] = (v * 255.0) as u8;
            }
        }

        let data = PackedByteArray::from(mask.as_slice());
        // One texel per metre, so a carriageway is only a few pixels wide at
        // range. Without a mip chain the ground shader point-samples the mask
        // there and whole stretches of road fall under the paint threshold;
        // averaging down keeps them present as a weaker mask instead.
        let tex =
            Image::create_from_data(res, res, false, ImageFormat::R8, &data).and_then(|mut img| {
                img.generate_mipmaps();
                ImageTexture::create_from_image(&img)
            });
        if let (Some(t), Some(m)) = (tex.as_ref(), self.ground_material.as_mut()) {
            m.set_shader_parameter("road_tex", &t.to_variant());
            m.set_shader_parameter("road_tile_scale", &self.road_tile_scale.to_variant());
        }
        self.road_tex = tex;
        self.road_res = res;
        self.road_mask = mask;

        // Grass reads clearance, so stamping the verge clears the carriageway.
        // Segment endpoints alone sit SEGMENT_STEP apart, which lets the swept
        // core pinch inward between stamps; subdivide so the circles overlap.
        let stamps: Vec<Vector2> = road
            .segments()
            .flat_map(|(a, b)| {
                let n = ((b - a).length() / 1.5).ceil().max(1.0) as i32;
                (0..n).map(move |i| a + (b - a) * (i as f32 / n as f32))
            })
            .filter(|p| hgen.height(p.x, p.y) >= self.water_level + 0.35)
            .collect();
        // The core has to reach past the painted edge (half the width, plus the
        // noise fray) or blades stand right against the kerb; the outer radius
        // then thins the verge back into open grass.
        let hard = road.width * 0.5 + 1.3;
        for p in stamps {
            self.stamp_clearance_band(p.x, p.y, hard, hard + 1.8);
        }
        self.flush_clearance();

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

    /// Godot treats clockwise as front-facing, so a quad's corner order has to
    /// agree with the normal it declares. Callers that walk their corners from
    /// a start/end pair flip traversal whenever the pair reverses, so the order
    /// is checked against the normal here rather than trusted.
    fn quad(&mut self, c: [Vector3; 4], n: Vector3, uv: [Vector2; 4]) {
        if (c[1] - c[0]).cross(c[2] - c[0]).dot(n) > 0.0 {
            self.push_quad([c[0], c[3], c[2], c[1]], n, [uv[0], uv[3], uv[2], uv[1]]);
        } else {
            self.push_quad(c, n, uv);
        }
    }

    fn push_quad(&mut self, c: [Vector3; 4], n: Vector3, uv: [Vector2; 4]) {
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

    /// Pitched slab between two points at different heights, used for the
    /// approach ramps. box_at cannot pitch, so sloped pieces need their own
    /// primitive. The underside is given per-end absolute heights rather than a
    /// thickness so the ramp can skirt down into whatever the terrain does
    /// underneath it instead of hovering as a constant-thickness ribbon.
    fn skirt(
        &mut self,
        a: Vector3,
        b: Vector3,
        lat: Vector3,
        half_w: f32,
        bot_a: f32,
        bot_b: f32,
        uvs: f32,
        cap_start: bool,
    ) {
        let along = b - a;
        let len = along.length();
        if len < 0.001 {
            return;
        }
        let mut n = lat.cross(along).normalized();
        if n.y < 0.0 {
            n = -n;
        }
        let a0 = a - lat * half_w;
        let a1 = a + lat * half_w;
        let b0 = b - lat * half_w;
        let b1 = b + lat * half_w;
        let d = |p: Vector3, y: f32| Vector3::new(p.x, y, p.z);
        // Every face gets UVs from its own real extents. Reusing one rect built
        // from width and length smears the plank grain across the tall side
        // panels, whose second axis is height and not length at all.
        let w = half_w * 2.0 * uvs;
        let l = len * uvs;
        let ha = (a.y - bot_a) * uvs;
        let hb = (b.y - bot_b) * uvs;
        let flat = [
            Vector2::new(0.0, 0.0),
            Vector2::new(w, 0.0),
            Vector2::new(w, l),
            Vector2::new(0.0, l),
        ];
        // start-top, end-top, end-bottom, start-bottom
        let side = [
            Vector2::new(0.0, 0.0),
            Vector2::new(l, 0.0),
            Vector2::new(l, hb),
            Vector2::new(0.0, ha),
        ];
        self.quad([a0, a1, b1, b0], n, flat);
        self.quad(
            [d(b0, bot_b), d(b1, bot_b), d(a1, bot_a), d(a0, bot_a)],
            -n,
            flat,
        );
        self.quad([a1, b1, d(b1, bot_b), d(a1, bot_a)], lat, side);
        self.quad([b0, a0, d(a0, bot_a), d(b0, bot_b)], -lat, side);
        // The ramp is thicker than the deck, so its first slice hangs below the
        // deck's underside and needs closing or you see straight into it.
        if cap_start {
            let cap = [
                Vector2::new(0.0, 0.0),
                Vector2::new(w, 0.0),
                Vector2::new(w, ha),
                Vector2::new(0.0, ha),
            ];
            self.quad(
                [d(a1, bot_a), d(a0, bot_a), a0, a1],
                -along.normalized(),
                cap,
            );
        }
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
    /// Returns how far along the road the timber structure extends, so the
    /// caller can stop painting carriageway underneath it.
    fn build_bridge(&mut self, hgen: &HeightGen, road: &RoadNetwork) -> f32 {
        let right = Vector3::new(road.direction.x, 0.0, road.direction.y).normalized();
        let fwd = Vector3::new(-right.z, 0.0, right.x);
        let cx = road.crossing.x;
        let cz = road.crossing.y;

        let bank_l = hgen.height(cx - road.half_span, cz);
        let bank_r = hgen.height(cx + road.half_span, cz);
        // The deck has to clear the highest ground the ramps will cross, not
        // just the two abutments — on a rising bank a deck set from the
        // abutments alone leaves the approach buried under the hillside.
        let corridor = road.half_span + 7.0;
        let mut crest = bank_l.max(bank_r);
        let mut s = -corridor;
        while s <= corridor {
            let p = road.point_near_x(cx + s);
            crest = crest.max(hgen.height(p.x, p.y));
            s += 1.5;
        }
        let deck_y = crest.max(self.water_level + 1.9) + 0.35;
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
                Vector3::new(deck_half, 0.07, 0.07),
                right,
                fwd,
                uvs,
            );
        }
        // Balusters
        let posts = ((deck_half * 2.0) / 1.6).round().max(2.0) as i32;
        for i in 0..=posts {
            let t = i as f32 / posts as f32;
            let x = -deck_half + t * deck_half * 2.0;
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

        // Masonry abutments: the substructure at each end of the span, taking
        // the deck load and retaining the bank behind it. They sit under the
        // stretch of deck that buries itself in the shore, so the timber lands
        // on stone rather than on soil.
        let mut sb = PlankMesh::new();
        for side in [-1.0f32, 1.0] {
            let x = (road.half_span + (deck_half - road.half_span) * 0.5) * side;
            let p = center + right * x;
            let foot = hgen.height(p.x, p.z) - 1.4;
            let top = deck_y - 0.1;
            let h = ((top - foot) * 0.5).max(0.3);
            let hx = (deck_half - road.half_span) * 0.5;
            sb.box_at(
                Vector3::new(p.x, top - h, p.z),
                Vector3::new(hx, h, half_w + 0.22),
                right,
                fwd,
                0.35,
            );
        }

        // Approach ramps: follow the bank down from each deck end so the road
        // meets the deck on a walkable slope instead of a step. The run is not
        // fixed — terrain is generated, so each side searches for the shortest
        // run that keeps the grade walkable against its own bank.
        const PLANK_T: f32 = 0.18;
        const RAMP_GRADE: f32 = 0.15;
        let rail_lat = half_w - 0.08;
        // Only the deck masks the carriageway off. The ramps are an open timber
        // trestle, so the stone path is meant to run in underneath them and stop
        // at the span itself.
        let reach = deck_half + 0.6;
        // The side panels are cut level across the ramp's width, so where the
        // bank cross-slopes the low edge lifts off the ground. Skirt down to the
        // lowest ground the slice spans, not just the ground on its centreline.
        let ground_lo = |p: Vector3| -> f32 {
            let mut lo = f32::MAX;
            for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                let q = p + fwd * (half_w + 0.2) * k;
                lo = lo.min(hgen.height(q.x, q.z));
            }
            lo
        };
        // And the deck has to clear the highest ground it spans, or the terrain
        // mesh pokes up through the planks and shows carriageway on the timber.
        let ground_hi = |p: Vector3| -> f32 {
            let mut hi = f32::MIN;
            for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                let q = p + fwd * half_w * k;
                hi = hi.max(hgen.height(q.x, q.z));
            }
            hi
        };
        for side in [-1.0f32, 1.0] {
            let x_start = deck_half * side;
            // Flush with the deck's walking surface, not its underside, or the
            // ramp starts a full deck-thickness below where you step off.
            let y_start = deck_y + 0.11;
            let mut ramp_run = 3.0f32;
            for k in 0..16 {
                let r = 3.0 + k as f32 * 1.6;
                let p = center + right * (x_start + side * r);
                ramp_run = r;
                if (y_start - hgen.height(p.x, p.z)).max(0.0) / r <= RAMP_GRADE {
                    break;
                }
            }
            let ramp_steps = ((ramp_run / 1.1).ceil() as i32).clamp(4, 26);
            let start = center + right * x_start;
            let mut prev = Vector3::new(start.x, y_start, start.z);
            let mut rail_end = prev;
            let mut prev_ground = ground_lo(start);
            let mut prev_y = y_start;
            for i in 1..=ramp_steps {
                let t = i as f32 / ramp_steps as f32;
                let last = i == ramp_steps;
                // Run the final slice on past the landing point so the buried
                // tail has somewhere to go.
                let x = x_start + side * (t * ramp_run + if last { 0.7 } else { 0.0 });
                let p = center + right * x;
                let ground = hgen.height(p.x, p.z);
                let ground_min = ground_lo(p);
                // Ease onto the terrain rather than meeting it at a hard angle.
                // Retire the lip as the ramp lands so it finishes level with the
                // ground rather than stepping off a raised edge. The floor stops
                // the deck dropping under the hillside it crosses; a buried ramp
                // both vanishes and traps the player's collider.
                // Everywhere but the tip the deck must stay clear of the ground
                // or the terrain mesh pokes carriageway up through the planks.
                // The tip does the opposite: it sinks under, so the approach
                // dies into the path instead of ending on a visible step.
                let lip = 0.06 * (1.0 - t);
                let y = if last {
                    ground - 0.08
                } else {
                    (y_start + (ground + lip - y_start) * (t * t * (3.0 - 2.0 * t)))
                        .min(y_start - 0.01)
                        .max(ground_hi(p) + 0.09)
                };
                let next = Vector3::new(p.x, y, p.z);
                // Solid timber side panels carried down to the bank, so the
                // approach reads as one built piece in a single material.
                mb.skirt(
                    prev,
                    next,
                    fwd,
                    half_w,
                    (prev_y - PLANK_T).min(prev_ground - 0.2),
                    (y - PLANK_T).min(ground_min - 0.2),
                    uvs,
                    i == 1,
                );
                // Railings stop before the buried tip; they have nothing to
                // stand on once the deck goes under.
                if !last {
                    for rs in [-1.0f32, 1.0] {
                        let ra = prev + fwd * rail_lat * rs + Vector3::UP * 0.58;
                        let rb = next + fwd * rail_lat * rs + Vector3::UP * 0.58;
                        mb.skirt(ra, rb, fwd, 0.07, ra.y - 0.14, rb.y - 0.14, uvs, false);
                        if i % 2 == 0 {
                            mb.box_at(
                                next + fwd * rail_lat * rs + Vector3::UP * 0.275,
                                Vector3::new(0.07, 0.275, 0.07),
                                right,
                                fwd,
                                uvs,
                            );
                        }
                    }
                    rail_end = next;
                }
                prev = next;
                prev_ground = ground_min;
                prev_y = y;
            }
            // Newel post where the handrail runs out, so the railing terminates
            // on something instead of stopping in mid-air.
            for rs in [-1.0f32, 1.0] {
                mb.box_at(
                    rail_end + fwd * rail_lat * rs + Vector3::UP * 0.3,
                    Vector3::new(0.12, 0.44, 0.12),
                    right,
                    fwd,
                    uvs,
                );
            }
        }

        // Collision comes straight off the generated geometry. Approximating a
        // pitched, terrain-following structure with a pile of boxes leaves a
        // notch at every joint for the capsule to jam in, and stacks dozens of
        // overlapping shapes under the player at once.
        let mut body = StaticBody3D::new_alloc();
        body.set_name("BridgeBody");

        if let Some(stone) = sb.build() {
            let mut si = MeshInstance3D::new_alloc();
            si.set_name("BridgeAbutment");
            si.set_mesh(&stone);
            if let Some(m) = self.abutment_material.as_ref() {
                si.set_material_override(m);
            }
            self.base_mut().add_child(&si);
            if let Some(shape) = stone.create_trimesh_shape() {
                let mut col = CollisionShape3D::new_alloc();
                col.set_shape(&shape);
                body.add_child(&col);
            }
        }

        let Some(mesh) = mb.build() else {
            self.base_mut().add_child(&body);
            return reach;
        };
        let mut inst = MeshInstance3D::new_alloc();
        inst.set_name("Bridge");
        inst.set_mesh(&mesh);
        if let Some(m) = self.bridge_material.as_ref() {
            inst.set_material_override(m);
        }
        self.base_mut().add_child(&inst);

        if let Some(shape) = mesh.create_trimesh_shape() {
            let mut col = CollisionShape3D::new_alloc();
            col.set_shape(&shape);
            body.add_child(&col);
        }

        self.base_mut().add_child(&body);
        reach
    }
}
