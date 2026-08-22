use godot::classes::image::Format as ImageFormat;
use godot::classes::{
    ArrayMesh, BoxShape3D, CollisionShape3D, Image, ImageTexture, MeshInstance3D, StaticBody3D,
};
use godot::prelude::*;

use super::{HeightGen, QTerrain};

const ROAD_RES: i32 = 512;

pub(super) struct RoadNetwork {
    plan: crate::worldgen::RoadPlan,
    pub width: f32,
    pub crossing: Vector2,
    pub direction: Vector2,
    pub half_span: f32,
}

fn flat(v: Vector2) -> [f32; 2] {
    [v.x, v.y]
}

fn wide(v: [f32; 2]) -> Vector2 {
    Vector2::new(v[0], v[1])
}

impl RoadNetwork {
    pub(super) fn build(
        hgen: &HeightGen,
        origin: Vector2,
        extent: f32,
        water_level: f32,
        width: f32,
    ) -> Self {
        let t = std::time::Instant::now();
        let plan = crate::worldgen::RoadPlan::new(hgen, flat(origin), extent, water_level, width);
        if std::env::var("Q_SHIFT_PROFILE").is_ok() {
            godot_print!(
                "[q]   road plan {:.1}ms, {} segments",
                (std::time::Instant::now() - t).as_secs_f32() * 1000.0,
                plan.segments().len()
            );
        }
        Self {
            width: plan.width,
            crossing: wide(plan.crossing),
            direction: Vector2::new(1.0, 0.0),
            half_span: plan.half_span,
            plan,
        }
    }

    pub(super) fn plan(&self) -> &crate::worldgen::RoadPlan {
        &self.plan
    }

    pub(super) fn set_bridge_reach(&mut self, reach: f32) {
        self.plan.set_bridge_reach(reach);
    }

    pub(super) fn crossing_in(&self, origin: Vector2, extent: f32) -> bool {
        let reach = self.half_span + 40.0;
        (self.crossing.x - origin.x).abs() <= extent + reach
            && (self.crossing.y - origin.y).abs() <= extent + reach
    }

    pub(super) fn distance(&self, p: Vector2) -> f32 {
        self.plan.distance(flat(p))
    }

    pub(super) fn points(&self) -> impl Iterator<Item = Vector2> + '_ {
        self.plan.segments().iter().map(|(a, _)| wide(*a))
    }

    pub(super) fn segments(&self) -> impl Iterator<Item = (Vector2, Vector2)> + '_ {
        self.plan
            .segments()
            .iter()
            .map(|(a, b)| (wide(*a), wide(*b)))
    }

    /// The carriageway drifts in z, so callers wanting a spot "on the road" must take a
    /// real polyline point rather than assume a fixed z.
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
        self.plan.on_bridge(flat(p))
    }
}

impl QTerrain {
    pub(super) fn build_road(&mut self) {
        let Some(hgen) = self.hgen.take() else {
            return;
        };
        let origin = self.window_origin();
        let mut road = RoadNetwork::build(
            &hgen,
            origin,
            self.extent,
            self.water_level,
            self.road_width,
        );
        // Only where it actually is. A window that does not reach the crossing
        // gets no bridge, rather than one built under the player.
        let reach = if road.crossing_in(origin, self.extent) {
            self.build_bridge(&hgen, &road)
        } else {
            road.half_span + 1.0
        };
        road.set_bridge_reach(reach);

        let res = ROAD_RES;
        let step = self.extent * 2.0 / (res - 1) as f32;
        let mut mask = vec![0u8; (res * res) as usize];
        let paint_reach = road.width * 1.9;

        // Painted by walking the carriageway rather than by asking every texel how
        // far the carriageway is. The road covers a thin band of a wide window, so
        // the second way spends nearly all of its time proving that ground nowhere
        // near a road is nowhere near a road -- and it costs the whole window times
        // every segment, which is what made a window shift a visible hitch.
        //
        // Coverage falls off with distance, so the most any segment gives a texel is
        // what the nearest segment gives it. Taking the greatest is the same answer
        // the minimum distance gave.
        let t_mask = std::time::Instant::now();
        let lo = Vector2::new(origin.x - self.extent, origin.y - self.extent);
        for (a, b) in road.segments() {
            let min_x = a.x.min(b.x) - paint_reach;
            let max_x = a.x.max(b.x) + paint_reach;
            let min_z = a.y.min(b.y) - paint_reach;
            let max_z = a.y.max(b.y) + paint_reach;
            let ix0 = (((min_x - lo.x) / step).floor() as i32).clamp(0, res - 1);
            let ix1 = (((max_x - lo.x) / step).ceil() as i32).clamp(0, res - 1);
            let iz0 = (((min_z - lo.y) / step).floor() as i32).clamp(0, res - 1);
            let iz1 = (((max_z - lo.y) / step).ceil() as i32).clamp(0, res - 1);

            for iy in iz0..=iz1 {
                let z = lo.y + iy as f32 * step;
                for ix in ix0..=ix1 {
                    let x = lo.x + ix as f32 * step;
                    let p = Vector2::new(x, z);
                    let d = crate::worldgen::seg_distance(flat(p), flat(a), flat(b));
                    if d > paint_reach {
                        continue;
                    }
                    let slot = (iy * res + ix) as usize;
                    let t = 1.0 - (d / paint_reach).clamp(0.0, 1.0);
                    let v = ((t * t * (3.0 - 2.0 * t)) * 255.0) as u8;
                    if v <= mask[slot] {
                        continue;
                    }
                    if road.on_bridge(p) || hgen.height(x, z) < self.water_level + 0.35 {
                        continue;
                    }
                    mask[slot] = v;
                }
            }
        }

        if std::env::var("Q_SHIFT_PROFILE").is_ok() {
            godot_print!(
                "[q]   road mask {:.1}ms",
                (std::time::Instant::now() - t_mask).as_secs_f32() * 1000.0
            );
        }
        let t_stamp = std::time::Instant::now();
        let data = PackedByteArray::from(mask.as_slice());
        let img =
            Image::create_from_data(res, res, false, ImageFormat::R8, &data).map(|mut img| {
                img.generate_mipmaps();
                img
            });
        match (img, self.road_res == res, self.road_tex.as_mut()) {
            (Some(img), true, Some(tex)) => tex.update(&img),
            (Some(img), _, _) => {
                self.road_tex = ImageTexture::create_from_image(&img);
                if let (Some(t), Some(m)) = (self.road_tex.as_ref(), self.ground_material.as_mut())
                {
                    m.set_shader_parameter("road_tex", &t.to_variant());
                    m.set_shader_parameter("road_tile_scale", &self.road_tile_scale.to_variant());
                }
            }
            (None, _, _) => {}
        }
        self.road_res = res;
        self.road_mask = mask;

        let stamps: Vec<Vector2> = road
            .segments()
            .flat_map(|(a, b)| {
                let n = ((b - a).length() / 1.5).ceil().max(1.0) as i32;
                (0..n).map(move |i| a + (b - a) * (i as f32 / n as f32))
            })
            .filter(|p| hgen.height(p.x, p.y) >= self.water_level + 0.35)
            .collect();
        let hard = road.width * 0.5 + 1.3;
        for p in stamps {
            self.stamp_clearance_band(p.x, p.y, hard, hard + 1.8);
        }
        self.flush_clearance();
        if std::env::var("Q_SHIFT_PROFILE").is_ok() {
            godot_print!(
                "[q]   road clearance {:.1}ms",
                (std::time::Instant::now() - t_stamp).as_secs_f32() * 1000.0
            );
        }

        self.hgen = Some(hgen);
        self.road = Some(road);
    }
}

pub(super) struct PlankMesh {
    verts: Vec<Vector3>,
    normals: Vec<Vector3>,
    uvs: Vec<Vector2>,
    indices: Vec<i32>,
}

impl PlankMesh {
    pub(super) fn new() -> Self {
        Self {
            verts: Vec::new(),
            normals: Vec::new(),
            uvs: Vec::new(),
            indices: Vec::new(),
        }
    }

    /// Godot treats clockwise as front-facing, so a quad's corner order has to agree
    /// with the normal it declares.
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

    /// Axis-aligned box in the road frame.
    pub(super) fn box_at(
        &mut self,
        center: Vector3,
        half: Vector3,
        right: Vector3,
        fwd: Vector3,
        uvs: f32,
    ) {
        let up = Vector3::UP;
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

    /// Pitched slab between two points at different heights, used for the approach
    /// ramps.
    #[allow(clippy::too_many_arguments)]
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

    pub(super) fn build(&self) -> Option<Gd<ArrayMesh>> {
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
    /// Returns how far along the road the timber structure extends, so the caller can
    /// stop painting carriageway underneath it.
    fn build_bridge(&mut self, hgen: &HeightGen, road: &RoadNetwork) -> f32 {
        let right = Vector3::new(road.direction.x, 0.0, road.direction.y).normalized();
        let fwd = Vector3::new(-right.z, 0.0, right.x);
        let cx = road.crossing.x;
        let cz = road.crossing.y;

        // Taken from the shared plan rather than worked out again here: the
        // server builds its collision from the same numbers, and a deck in two
        // slightly different places is a player walking on planks their own
        // server thinks are river.
        let plan =
            crate::worldgen::BridgePlan::new(hgen, self.extent, self.water_level, self.road_width);
        let deck_y = plan.deck_y;
        let center = Vector3::new(cx, deck_y, cz);

        let half_w = plan.half_width;
        let uvs = 0.5;
        let mut mb = PlankMesh::new();

        let deck_half = plan.deck_half;
        mb.box_at(
            center,
            Vector3::new(deck_half, 0.11, half_w),
            right,
            fwd,
            uvs,
        );
        for side in [-1.0f32, 1.0] {
            mb.box_at(
                center + fwd * (half_w - 0.08) * side + Vector3::UP * 0.62,
                Vector3::new(deck_half, 0.07, 0.07),
                right,
                fwd,
                uvs,
            );
        }
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

        const PLANK_T: f32 = 0.18;
        let rail_lat = half_w - 0.08;
        let reach = deck_half + 0.6;
        let ground_lo = |p: Vector3| -> f32 {
            let mut lo = f32::MAX;
            for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                let q = p + fwd * (half_w + 0.2) * k;
                lo = lo.min(hgen.height(q.x, q.z));
            }
            lo
        };
        for side in [-1.0f32, 1.0] {
            // From the plan, not worked out again here: the server puts its ramp
            // collision under these same points, and a walkable surface in one sim only
            // is the deck desync moved onto the approach.
            let path = plan.ramp_path(hgen, side);
            let ramp_steps = (path.len() - 1) as i32;
            let first = path[0];
            let mut prev = Vector3::new(first[0], first[1], first[2]);
            let mut rail_end = prev;
            let mut prev_ground = ground_lo(prev);
            let mut prev_y = prev.y;
            for i in 1..=ramp_steps {
                let last = i == ramp_steps;
                let point = path[i as usize];
                let next = Vector3::new(point[0], point[1], point[2]);
                let ground_min = ground_lo(next);
                let y = next.y;
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

        let mut slabs = plan.slabs().to_vec();
        slabs.extend(plan.ramp_slabs(hgen));
        slabs.extend(plan.ramp_skirt_slabs(hgen));
        slabs.extend(plan.ramp_rail_slabs(hgen));
        slabs.extend(plan.abutment_slabs(hgen));
        slabs.extend(plan.ramp_post_slabs(hgen));
        let shapes = Self::fit_slab_shapes(&mut body, &slabs);

        self.base_mut().add_child(&body);
        self.publish_sim_slabs(&shapes, &slabs);
        reach
    }

    /// Hangs one box collider under `body` per slab, returning them in the same order.
    ///
    /// The whole structure was previously a trimesh of its own visual mesh, which gave
    /// every baluster and pier a few hundred triangles of collision the host had never
    /// heard of. These are the boxes the server already builds from the same plan, so
    /// the two now stop bodies in the same places.
    pub(super) fn fit_slab_shapes(
        body: &mut Gd<StaticBody3D>,
        slabs: &[crate::worldgen::Slab],
    ) -> Vec<Gd<CollisionShape3D>> {
        slabs
            .iter()
            .map(|slab| {
                let mut shape = BoxShape3D::new_gd();
                shape.set_size(Vector3::new(
                    slab.half_extents[0] * 2.0,
                    slab.half_extents[1] * 2.0,
                    slab.half_extents[2] * 2.0,
                ));
                let mut col = CollisionShape3D::new_alloc();
                col.set_shape(&shape);
                col.set_transform(Transform3D::new(
                    Basis::from_quaternion(Quaternion::new(
                        slab.rot[0],
                        slab.rot[1],
                        slab.rot[2],
                        slab.rot[3],
                    )),
                    Vector3::new(slab.centre[0], slab.centre[1], slab.centre[2]),
                ));
                body.add_child(&col);
                col
            })
            .collect()
    }
}

impl QTerrain {
    /// Mirrors one bridge surface into the sim as static concave geometry.
    ///
    /// The vertices are already world-space -- the bridge is authored where it stands
    /// rather than placed by a transform -- so this hands them over unmoved.
    #[cfg(not(feature = "rapier3d-sim"))]
    pub(super) fn publish_sim_slabs(
        &mut self,
        _shapes: &[Gd<CollisionShape3D>],
        _slabs: &[crate::worldgen::Slab],
    ) {
    }

    /// Mirrors the bridge's boxes into the sim, which has no Godot collision of its own.
    #[cfg(feature = "rapier3d-sim")]
    pub(super) fn publish_sim_slabs(
        &mut self,
        shapes: &[Gd<CollisionShape3D>],
        slabs: &[crate::worldgen::Slab],
    ) {
        let Some(mut phys) = self
            .base()
            .get_node_or_null(&self.physics_path)
            .and_then(|n| n.try_cast::<crate::rapier::bridge3d::QPhysics3D>().ok())
        else {
            return;
        };
        for (shape, slab) in shapes.iter().zip(slabs) {
            let half = Vector3::new(
                slab.half_extents[0],
                slab.half_extents[1],
                slab.half_extents[2],
            );
            let id = phys
                .bind_mut()
                .spawn_static_box(shape.clone().upcast(), half);
            if id != 0 {
                self.sim_bridge.push(id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worldgen::HeightParams;

    fn hgen() -> HeightGen {
        HeightGen::new(&HeightParams::default())
    }

    fn road_at(origin: Vector2) -> RoadNetwork {
        RoadNetwork::build(&hgen(), origin, 256.0, -1.4, 3.2)
    }

    /// The crossing is a property of the world. Recomputed per window it would
    /// follow the player, and a bridge would appear wherever they stood.
    #[test]
    fn the_crossing_does_not_move_with_the_window() {
        let home = road_at(Vector2::ZERO);
        for origin in [
            Vector2::new(512.0, 0.0),
            Vector2::new(-1280.0, 640.0),
            Vector2::new(4096.0, -2048.0),
        ] {
            let away = road_at(origin);
            assert_eq!(
                away.crossing, home.crossing,
                "crossing moved for {origin:?}"
            );
            assert_eq!(away.half_span, home.half_span);
        }
    }

    /// Two windows overlapping the same ground must lay the carriageway in the
    /// same place, or the road kinks at every seam.
    #[test]
    fn overlapping_windows_agree_on_where_the_road_is() {
        let a = road_at(Vector2::ZERO);
        let b = road_at(Vector2::new(128.0, 0.0));
        let mut compared = 0;
        for i in 0..200 {
            // Ground both windows cover.
            let x = -100.0 + i as f32 * 1.4;
            for z in [-20.0f32, 0.0, 15.0] {
                let p = Vector2::new(x, z);
                let (da, db) = (a.distance(p), b.distance(p));
                assert!(
                    (da - db).abs() < 0.01,
                    "road disagrees at {p:?}: {da} vs {db}"
                );
                compared += 1;
            }
        }
        assert!(compared > 500, "compared almost nothing: {compared}");
    }

    /// A window has to have road under the whole of it, or the carriageway stops
    /// in mid air partway across.
    /// The carriageway is painted by walking each segment and keeping the greatest
    /// coverage, where it used to be painted by asking every texel for its distance
    /// to the whole road. That is only the same picture because coverage falls off
    /// with distance -- so the most any segment gives a point is what the nearest one
    /// gives it. If that ever stops holding, the road grows seams at segment joins.
    #[test]
    fn walking_the_road_paints_what_measuring_every_texel_did() {
        let g = hgen();
        let road = road_at(Vector2::ZERO);
        let reach = road.width * 1.9;
        let coverage = |d: f32| {
            let t = 1.0 - (d / reach).clamp(0.0, 1.0);
            t * t * (3.0 - 2.0 * t)
        };

        let mut painted = 0;
        for iz in -60..=60 {
            for ix in -60..=60 {
                let p = Vector2::new(ix as f32 * 4.0, iz as f32 * 4.0);
                let nearest = coverage(road.distance(p));
                let greatest = road
                    .segments()
                    .map(|(a, b)| {
                        coverage(crate::worldgen::seg_distance(
                            [p.x, p.y],
                            [a.x, a.y],
                            [b.x, b.y],
                        ))
                    })
                    .fold(0.0f32, f32::max);
                assert_eq!(
                    nearest.to_bits(),
                    greatest.to_bits(),
                    "the two ways disagree at {p:?}"
                );
                if nearest > 0.0 {
                    painted += 1;
                }
            }
        }
        assert!(painted > 100, "sampled nowhere near the road: {painted}");
        let _ = g;
    }

    /// The trunk goes nowhere the moment you leave `z = 0`, so the roads that matter
    /// out in the world are the ones joining a capital to its harbour. If they are not
    /// laid, every landmark is a place with no way to it.
    #[test]
    fn a_capital_has_a_road_to_its_harbour() {
        let g = hgen();
        let mark = crate::landmark::nearest(g.seed(), &g, [0.0, 0.0])
            .into_iter()
            .find(|m| m.kind == crate::landmark::LandmarkKind::Capital)
            .expect("no capital near the origin");

        let road = road_at(Vector2::new(mark.centre[0], mark.centre[1]));
        let mouth = mark.gate_mouth();
        assert!(
            road.distance(Vector2::new(mouth[0], mouth[1])) < road.width * 1.9,
            "no carriageway outside the gateway at {mouth:?}"
        );
    }

    /// The road out of a capital is longer than any one window, so which capitals a
    /// window considers cannot be "the ones inside it" -- a window in the middle of a
    /// long road contains none of its endpoints. Two windows overlapping the same
    /// stretch have to paint it in the same place or there is a seam in the road at
    /// every boundary.
    #[test]
    fn two_windows_lay_a_landmark_road_in_the_same_place() {
        let g = hgen();
        let mark = crate::landmark::nearest(g.seed(), &g, [0.0, 0.0])
            .into_iter()
            .find(|m| m.kind == crate::landmark::LandmarkKind::Capital)
            .expect("no capital near the origin");

        // Straddling the halfway point of the road, from either side of it.
        let side = if mark.centre[0] < 0.0 { -1.0 } else { 1.0 };
        let quay = crate::landmark::nearest_harbour_on_side(g.seed(), &g, mark.centre, side).centre;
        let mid = Vector2::new(
            (mark.centre[0] + quay[0]) * 0.5,
            (mark.centre[1] + quay[1]) * 0.5,
        );

        let a = road_at(mid - Vector2::new(96.0, 0.0));
        let b = road_at(mid + Vector2::new(96.0, 0.0));
        let mut on_road = 0;
        for k in -6..=6 {
            for j in -6..=6 {
                let p = mid + Vector2::new(k as f32 * 8.0, j as f32 * 8.0);
                let (da, db) = (a.distance(p), b.distance(p));
                if da.min(db) < a.width * 1.9 {
                    on_road += 1;
                    assert!(
                        (da - db).abs() < 0.01,
                        "the two windows disagree about the road at {p:?}: {da} against {db}"
                    );
                }
            }
        }
        assert!(on_road > 0, "the sampled patch was nowhere near the road");
    }

    #[test]
    fn the_road_spans_the_window_it_was_built_for() {
        for origin in [Vector2::ZERO, Vector2::new(3000.0, 0.0)] {
            let road = road_at(origin);
            let xs: Vec<f32> = road.points().map(|p| p.x).collect();
            let lo = xs.iter().copied().fold(f32::MAX, f32::min);
            // `points` yields segment starts, so the carriageway reaches one
            // segment further than the last of them.
            let hi =
                xs.iter().copied().fold(f32::MIN, f32::max) + crate::worldgen::ROAD_SEGMENT_STEP;
            let edge = 250.0;
            assert!(
                lo <= origin.x - edge,
                "road starts late at {origin:?}: {lo}"
            );
            assert!(hi >= origin.x + edge, "road ends early at {origin:?}: {hi}");
        }
    }

    /// The bridge belongs to the window holding the crossing, and to no other.
    #[test]
    fn only_the_window_with_the_crossing_gets_a_bridge() {
        let road = road_at(Vector2::ZERO);
        assert!(road.crossing_in(Vector2::ZERO, 256.0), "no bridge at home");
        assert!(
            !road.crossing_in(Vector2::new(4000.0, 0.0), 256.0),
            "built a second bridge far from the river crossing"
        );
        assert!(
            !road.crossing_in(Vector2::new(0.0, 3000.0), 256.0),
            "built a bridge far up the river"
        );
    }

    /// A window whose edge clips the crossing still needs the bridge, or the
    /// road runs into the water while the deck is one window behind.
    #[test]
    fn a_window_reaching_the_crossing_still_gets_the_bridge() {
        let road = road_at(Vector2::ZERO);
        let near = Vector2::new(road.crossing.x + 250.0, road.crossing.y);
        assert!(road.crossing_in(near, 256.0));
    }
}

#[cfg(test)]
mod plan_tests {
    use super::*;
    use crate::worldgen::{BridgePlan, HeightParams};

    /// The road's own span search and the shared plan's must not drift, or the
    /// carriageway runs onto a deck that starts somewhere else.
    #[test]
    fn the_plan_agrees_with_the_road_on_the_crossing() {
        let hgen = HeightGen::new(&HeightParams::default());
        for extent in [128.0f32, 256.0, 384.0] {
            let road = RoadNetwork::build(&hgen, Vector2::ZERO, extent, -1.4, 3.2);
            let plan = BridgePlan::new(&hgen, extent, -1.4, 3.2);
            assert_eq!(
                road.half_span.to_bits(),
                plan.half_span.to_bits(),
                "span differs at extent {extent}"
            );
            assert_eq!(road.crossing.x.to_bits(), plan.crossing[0].to_bits());
            assert_eq!(road.crossing.y.to_bits(), plan.crossing[1].to_bits());
        }
    }

    /// Both sides bound the span search by their own extent, so a mismatch there
    /// moves the deck. This is what the terrain shape in the handshake prevents.
    #[test]
    fn a_different_extent_can_move_the_deck() {
        let hgen = HeightGen::new(&HeightParams::default());
        let a = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let b = BridgePlan::new(&hgen, 8.0, -1.4, 3.2);
        assert_ne!(
            a.half_span, b.half_span,
            "if this ever passes, agreeing on extent stopped mattering"
        );
    }

    #[test]
    fn the_deck_sits_clear_of_the_water() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        assert!(
            plan.deck_y > -1.4 + 1.9,
            "deck at {} is in the river",
            plan.deck_y
        );
        let [cx, cz] = plan.crossing;
        assert!(
            hgen.height(cx, cz) < plan.deck_y,
            "deck is below the riverbed it spans"
        );
    }

    /// The deck has to reach dry ground at both ends, or it is a jetty.
    #[test]
    fn the_deck_reaches_both_banks() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let [cx, cz] = plan.crossing;
        for side in [-1.0f32, 1.0] {
            let end = cx + side * plan.deck_half;
            assert!(
                hgen.height(end, cz) > -1.4,
                "deck end at {end} is still over water"
            );
        }
    }

    #[test]
    fn the_solid_parts_are_the_deck_and_a_kerb_each_side() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let slabs = plan.slabs();
        assert_eq!(slabs[0].centre[1].to_bits(), plan.deck_y.to_bits());
        assert!(slabs[1].centre[2] < slabs[0].centre[2], "kerbs on one side");
        assert!(slabs[2].centre[2] > slabs[0].centre[2]);
        for s in slabs {
            assert!(
                s.half_extents.iter().all(|h| *h > 0.0),
                "a collider with no thickness stops nothing: {s:?}"
            );
        }
    }

    /// The failure this closes: the deck was railed and the causeway leading onto it
    /// was not, so a body could walk off the side of an approach the client had drawn
    /// a railing along.
    #[test]
    fn every_approach_segment_is_railed_on_both_sides() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let deck = plan.ramp_slabs(&hgen);
        let rails = plan.ramp_rail_slabs(&hgen);
        assert_eq!(
            rails.len(),
            deck.len() * 2,
            "two rails per approach segment"
        );

        for (i, seg) in deck.iter().enumerate() {
            let left = &rails[i * 2];
            let right = &rails[i * 2 + 1];
            assert!(
                left.centre[2] < seg.centre[2],
                "rails straddle the causeway"
            );
            assert!(right.centre[2] > seg.centre[2]);
            for rail in [left, right] {
                assert!(
                    rail.centre[1] > seg.centre[1],
                    "a rail level with the timber is a kerb nobody can be stopped by"
                );
                assert_eq!(rail.rot, seg.rot, "rails follow the grade they guard");
                assert!(rail.half_extents.iter().all(|h| *h > 0.0));
            }
        }
    }

    /// The failure this closes: the approach was collidable only as the plank you walk
    /// on, so a body could step in from the side and stand inside the embankment the
    /// client had drawn as solid.
    #[test]
    fn the_approach_is_filled_in_beneath_its_surface() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let skirt = plan.ramp_skirt_slabs(&hgen);
        assert!(!skirt.is_empty(), "the approaches have no fill at all");

        for slab in &skirt {
            let top = slab.centre[1] + slab.half_extents[1];
            let ground = hgen.height(slab.centre[0], slab.centre[2]);
            assert!(
                slab.centre[1] - slab.half_extents[1] < ground,
                "fill stopping above the bank leaves the gap it exists to close"
            );
            assert!(
                top <= plan.deck_y,
                "fill standing proud of the deck is a step"
            );
            assert!(slab.half_extents.iter().all(|h| *h > 0.0));
        }

        for surface in plan.ramp_slabs(&hgen) {
            assert!(
                skirt.iter().any(|s| {
                    (s.centre[0] - surface.centre[0]).abs() <= s.half_extents[0] + 0.01
                }),
                "a stretch of approach with nothing under it: {surface:?}"
            );
        }
    }

    /// The abutments carry the approach where it meets the bank, and the client drew
    /// them long before anything collided with them.

    /// The client caps each approach rail with a post thicker and taller than the
    /// rail itself. Nothing put collision under it, so it was scenery a body walked
    /// through wherever it looked most solid.
    #[test]
    fn a_post_stands_where_each_rail_ends() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, HeightParams::default().water_level, 3.2);
        let posts = plan.ramp_post_slabs(&hgen);
        assert_eq!(posts.len(), 4, "two banks, two rails each");

        let rail = plan.half_width - 0.08;
        for side in [-1.0f32, 1.0] {
            let end = *plan.ramp_path(&hgen, side).last().expect("ramp has a path");
            for lat in [-1.0f32, 1.0] {
                let want = [end[0], end[1] + 0.3, end[2] + rail * lat];
                let found = posts.iter().any(|p| {
                    (p.centre[0] - want[0]).abs() < 1e-3
                        && (p.centre[1] - want[1]).abs() < 1e-3
                        && (p.centre[2] - want[2]).abs() < 1e-3
                });
                assert!(found, "no post at {want:?} in {posts:?}");
            }
        }
        for post in &posts {
            assert!(
                post.half_extents[1] > 0.4,
                "a post shorter than the rail it caps: {post:?}"
            );
        }
    }

    #[test]
    fn an_abutment_stands_under_each_bank() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let [cx, cz] = plan.crossing;
        let piers = plan.abutment_slabs(&hgen);

        assert!(piers[0].centre[0] < cx, "one abutment per bank");
        assert!(piers[1].centre[0] > cx);
        for pier in piers {
            assert_eq!(pier.centre[2].to_bits(), cz.to_bits());
            assert!(
                pier.centre[1] + pier.half_extents[1] <= plan.deck_y,
                "an abutment through the deck is a step in the road"
            );
            assert!(pier.half_extents.iter().all(|h| *h > 0.0));
        }
    }

    #[test]
    fn the_approach_is_solid_from_the_deck_edge_to_the_ground() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);

        for side in [-1.0f32, 1.0] {
            let path = plan.ramp_path(&hgen, side);
            let first = path[0];
            assert_eq!(
                first[0].to_bits(),
                (plan.crossing[0] + plan.deck_half * side).to_bits(),
                "the approach must start where the deck ends"
            );
            assert!(
                (first[1] - (plan.deck_y + 0.11)).abs() < 1e-5,
                "the approach must start level with the deck surface"
            );

            let last = path[path.len() - 1];
            assert!(
                last[1] <= hgen.height(last[0], last[2]),
                "the approach must end in the ground, not above it"
            );
            for w in path.windows(2) {
                let gap = (w[1][0] - w[0][0]).abs();
                assert!(gap > 0.0 && gap < 2.0, "a step long enough to fall through");
            }
        }
    }

    /// The failure this closes: collision stopped at the deck edge while the client drew
    /// timber for another 3-27 m, so walking off the bridge dropped you to the
    /// heightfield half a metre below the planks you could see.
    #[test]
    fn the_ramp_collision_lies_under_the_ramp_the_client_draws() {
        let hgen = HeightGen::new(&HeightParams::default());
        let plan = BridgePlan::new(&hgen, 256.0, -1.4, 3.2);
        let slabs = plan.ramp_slabs(&hgen);

        let steps: usize = [-1.0f32, 1.0]
            .iter()
            .map(|s| plan.ramp_path(&hgen, *s).len() - 1)
            .sum();
        assert_eq!(slabs.len(), steps, "one box per segment, both approaches");

        for s in &slabs {
            assert!(
                s.half_extents.iter().all(|h| *h > 0.0),
                "a collider with no thickness stops nothing: {s:?}"
            );
            let q = s.rot;
            let norm = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
            assert!(
                (norm - 1.0).abs() < 1e-4,
                "rotation is not a unit quaternion"
            );
        }

        // The tilt puts each box's top face on the segment, so the surface height at a
        // box's centre is its centre plus one half-thickness measured back up.
        for side in [-1.0f32, 1.0] {
            let path = plan.ramp_path(&hgen, side);
            for w in path.windows(2) {
                let mid_x = (w[0][0] + w[1][0]) * 0.5;
                let mid_y = (w[0][1] + w[1][1]) * 0.5;
                let near = slabs
                    .iter()
                    .find(|s| (s.centre[0] - mid_x).abs() < 0.2)
                    .expect("every drawn segment has a box under it");
                assert!(
                    near.centre[1] < mid_y && mid_y - near.centre[1] <= 0.12,
                    "the box sits just under the surface, not beside it"
                );
            }
        }
    }
}
