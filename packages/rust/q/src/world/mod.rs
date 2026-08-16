pub mod fish_field;
pub mod flora_compute;
pub mod flora_field;
pub mod grass_compute;
pub mod grass_field;
pub mod harvest;
pub mod stone_field;
pub mod stone_mesh;
pub mod terrain;
pub mod tree_field;

use godot::classes::{Camera3D, Node, Node3D};
use godot::prelude::*;

use crate::world::terrain::QTerrain;
use crate::worldgen::{HeightGen, HeightParams, RoadPlan};

pub(crate) fn hash32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

pub(crate) fn randf(state: &mut u32) -> f32 {
    *state = hash32(*state);
    (*state >> 8) as f32 / 16_777_216.0
}

pub(crate) fn randf_range(state: &mut u32, lo: f32, hi: f32) -> f32 {
    lo + randf(state) * (hi - lo)
}

/// A scatter cell addressed by where it sits in the world rather than by its
/// place in the current window.
///
/// This is the difference between a world and a kaleidoscope. Seeding from the
/// loop counter gives the same ground a different tree every time it is
/// generated from a different origin, so walking away and back rearranges the
/// forest. Seeding from a global cell index does not.
#[derive(Clone, Copy, Debug)]
pub(crate) struct ScatterGrid {
    pub size: f32,
    pub origin: Vector2,
    pub extent: f32,
}

impl ScatterGrid {
    pub(crate) fn new(size: f32, origin: Vector2, extent: f32) -> Self {
        Self {
            size: size.max(0.01),
            origin,
            extent,
        }
    }

    /// Cells across the window. One extra, because the window edge almost never
    /// lands on a cell boundary and the part cell at each end is still ground.
    pub(crate) fn cells(&self) -> i32 {
        ((self.extent * 2.0) / self.size).ceil() as i32 + 1
    }

    /// Where the window's first cell sits on the global grid.
    fn base(&self) -> (i32, i32) {
        (
            ((self.origin.x - self.extent) / self.size).floor() as i32,
            ((self.origin.y - self.extent) / self.size).floor() as i32,
        )
    }

    /// Global index of the window's `ix, iz` cell.
    pub(crate) fn global(&self, ix: i32, iz: i32) -> (i32, i32) {
        let (bx, bz) = self.base();
        (bx + ix, bz + iz)
    }

    /// Seed for a cell, the same wherever the window happens to be.
    pub(crate) fn seed(&self, base: u32, ix: i32, iz: i32) -> u32 {
        let (gx, gz) = self.global(ix, iz);
        hash32(
            base.wrapping_add(hash32(gx as u32).wrapping_mul(31))
                .wrapping_add(hash32(gz as u32).wrapping_mul(2_654_435_761)),
        )
    }

    /// World centre of a cell.
    pub(crate) fn centre(&self, ix: i32, iz: i32) -> (f32, f32) {
        let (gx, gz) = self.global(ix, iz);
        ((gx as f32 + 0.5) * self.size, (gz as f32 + 0.5) * self.size)
    }

    /// True while the point is inside the window, with room for whatever is
    /// being placed there.
    pub(crate) fn inside(&self, x: f32, z: f32, margin: f32) -> bool {
        (x - self.origin.x).abs() <= self.extent - margin
            && (z - self.origin.y).abs() <= self.extent - margin
    }
}

/// Scatter fields all cover the whole world and are never culled as a unit, so they
/// share one generous box rather than paying to track their own bounds.
pub(crate) fn world_aabb(extent: f32) -> Aabb {
    world_aabb_at(extent, Vector2::ZERO)
}

/// The same box around a window that is not at the origin.
pub(crate) fn world_aabb_at(extent: f32, origin: Vector2) -> Aabb {
    let e = extent + 10.0;
    Aabb::new(
        Vector3::new(origin.x - e, -40.0, origin.y - e),
        Vector3::new(e * 2.0, 120.0, e * 2.0),
    )
}

/// `../Terrain` is the conventional sibling; an explicit path wins when set.
pub(crate) fn resolve_terrain(node: &Gd<Node>, path: &NodePath) -> Option<Gd<QTerrain>> {
    if path.is_empty() {
        node.get_node_or_null("../Terrain")
    } else {
        node.get_node_or_null(path)
    }
    .and_then(|n| n.try_cast::<QTerrain>().ok())
}

/// Where the world should be detailed around: the active camera, falling back to the
/// player node, so headless and editor paths still get a sane origin.
pub(crate) fn view_origin(node: &Gd<Node3D>, player: Option<&Gd<Node3D>>) -> Option<Vector3> {
    if let Some(cam) = node
        .get_viewport()
        .and_then(|v| v.get_camera_3d())
        .map(|c: Gd<Camera3D>| c.get_global_position())
    {
        return Some(cam);
    }
    player.map(|p| p.get_global_position())
}

/// Vertex spacing of the ground plane, in metres. Placement matches the mesh through
/// this, so it has to track the `PlaneMesh` in the scenes: size / (subdivide + 1).
pub(crate) const GROUND_QUAD: f32 = 2.0;

/// The CPU-side terrain data scatter placement needs, lifted out of QTerrain once so
/// placement loops never bind it per candidate.
pub(crate) struct TerrainSnapshot {
    heights: Vec<f32>,
    res: i32,
    road_mask: Vec<u8>,
    road_res: i32,
    pub extent: f32,
    pub water: f32,
    /// Centre of the baked window. World coordinates map into the height and
    /// road grids relative to this, not to nothing.
    pub origin: Vector2,
    /// The generator behind the baked grid, and the road width measured from it.
    ///
    /// Scatter is placed from these rather than from the grid: the server has no
    /// grid, so a field that decides where a rock stands by sampling one has
    /// already agreed to differ from it.
    params: HeightParams,
    road_width: f32,
}

impl TerrainSnapshot {
    /// Returns None while the terrain is still generating; callers stay in their
    /// late_init poll until it lands.
    pub(crate) fn take(terrain: &Gd<QTerrain>) -> Option<Self> {
        let t = terrain.bind();
        let (h, r) = t.cpu_heights()?;
        let (road_mask, road_res) = t
            .road_mask()
            .map(|(m, r)| (m.to_vec(), r))
            .unwrap_or((Vec::new(), 0));
        Some(Self {
            heights: h.to_vec(),
            res: r,
            road_mask,
            road_res,
            extent: t.world_extent(),
            water: t.water(),
            origin: t.window_origin(),
            params: t.generator_params(),
            road_width: t.road_span(),
        })
    }

    /// The generator and the carriageway this window was grown from, which is what
    /// scatter is placed against so both ends of a session agree on it.
    pub(crate) fn scatter_world(&self) -> (HeightGen, RoadPlan) {
        let hgen = HeightGen::new(&self.params);
        let road = RoadPlan::new(
            &hgen,
            [self.origin.x, self.origin.y],
            self.extent,
            self.water,
            self.road_width,
        );
        (hgen, road)
    }

    /// For fields that keep their own copy alive past init — stone marches it for
    /// occlusion long after the snapshot is dropped.
    pub(crate) fn raw_heights(&self) -> (&[f32], i32) {
        (&self.heights, self.res)
    }

    /// The drawn ground, not the height data.
    ///
    /// The ground plane carries a vertex every [`GROUND_QUAD`] metres and draws flat
    /// between them, while the height grid holds a sample every metre. Placing on the
    /// grid puts anything standing in a dip below the surface that is actually drawn,
    /// so placement reads the chord the mesh interpolates instead.
    pub(crate) fn height(&self, x: f32, z: f32) -> f32 {
        let gx = (x / GROUND_QUAD).floor() * GROUND_QUAD;
        let gz = (z / GROUND_QUAD).floor() * GROUND_QUAD;
        let tx = (x - gx) / GROUND_QUAD;
        let tz = (z - gz) / GROUND_QUAD;
        let h00 = self.grid_height(gx, gz);
        let h10 = self.grid_height(gx + GROUND_QUAD, gz);
        let h01 = self.grid_height(gx, gz + GROUND_QUAD);
        let h11 = self.grid_height(gx + GROUND_QUAD, gz + GROUND_QUAD);
        let a = h00 + (h10 - h00) * tx;
        let b = h01 + (h11 - h01) * tx;
        a + (b - a) * tz
    }

    pub(crate) fn grid_height(&self, x: f32, z: f32) -> f32 {
        let res = self.res;
        let (x, z) = (x - self.origin.x, z - self.origin.y);
        let fx = (((x + self.extent) / (self.extent * 2.0)).clamp(0.001, 0.999) * res as f32 - 0.5)
            .max(0.0);
        let fz = (((z + self.extent) / (self.extent * 2.0)).clamp(0.001, 0.999) * res as f32 - 0.5)
            .max(0.0);
        let x0 = (fx as i32).clamp(0, res - 2);
        let z0 = (fz as i32).clamp(0, res - 2);
        let tx = (fx - x0 as f32).clamp(0.0, 1.0);
        let tz = (fz - z0 as f32).clamp(0.0, 1.0);
        let h00 = self.heights[(z0 * res + x0) as usize];
        let h10 = self.heights[(z0 * res + x0 + 1) as usize];
        let h01 = self.heights[((z0 + 1) * res + x0) as usize];
        let h11 = self.heights[((z0 + 1) * res + x0 + 1) as usize];
        let a = h00 + (h10 - h00) * tx;
        let b = h01 + (h11 - h01) * tx;
        a + (b - a) * tz
    }

    /// Keep the carriageway clear; grass honours this through the clearance map, but
    /// scatter placement has to consult the mask itself.
    pub(crate) fn on_road(&self, x: f32, z: f32) -> f32 {
        if self.road_res < 2 {
            return 0.0;
        }
        let u = ((x - self.origin.x + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
        let v = ((z - self.origin.y + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
        let px = ((u * (self.road_res - 1) as f32) as i32).clamp(0, self.road_res - 1);
        let pz = ((v * (self.road_res - 1) as f32) as i32).clamp(0, self.road_res - 1);
        self.road_mask[(pz * self.road_res + px) as usize] as f32 / 255.0
    }
}

pub(crate) fn q_hidden(name: &str) -> bool {
    static HIDDEN: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    HIDDEN
        .get_or_init(|| {
            std::env::var("Q_HIDE")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default()
        })
        .iter()
        .any(|s| s == name)
}

/// Times a block that runs on the main thread only occasionally — streaming rebuilds
/// and the like — and reports it when it is slow enough to be seen as a hitch.
pub(crate) struct StallTimer(&'static str, std::time::Instant);

fn profiling() -> bool {
    static V: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *V.get_or_init(|| std::env::var("Q_PROFILE").is_ok())
}

impl StallTimer {
    pub(crate) fn start(name: &'static str) -> Option<Self> {
        if profiling() {
            Some(Self(name, std::time::Instant::now()))
        } else {
            None
        }
    }
}

impl Drop for StallTimer {
    fn drop(&mut self) {
        let ms = self.1.elapsed().as_micros() as f64 / 1000.0;
        if ms >= 2.0 {
            godot::global::godot_print!("[q] stall {} {:.1}ms", self.0, ms);
        }
    }
}

pub(crate) struct ReadyTimer(&'static str, std::time::Instant);

impl ReadyTimer {
    pub(crate) fn start(name: &'static str) -> Self {
        Self(name, std::time::Instant::now())
    }
}

impl Drop for ReadyTimer {
    fn drop(&mut self) {
        godot::global::godot_print!("[q] {} ready {}ms", self.0, self.1.elapsed().as_millis());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The property a walkable world rests on: ground generated from two
    /// different windows has to come out the same, or leaving and returning
    /// rearranges the forest.
    #[test]
    fn a_cell_is_the_same_from_either_window() {
        let extent = 256.0;
        let a = ScatterGrid::new(14.0, Vector2::ZERO, extent);
        let b = ScatterGrid::new(14.0, Vector2::new(128.0, 0.0), extent);
        let mut compared = 0;
        for iz in 0..a.cells() {
            for ix in 0..a.cells() {
                let (gx, gz) = a.global(ix, iz);
                // Same global cell, addressed through the other window.
                let (bbx, bbz) = b.global(0, 0);
                let (bx, bz) = (gx - bbx, gz - bbz);
                if bx < 0 || bz < 0 || bx >= b.cells() || bz >= b.cells() {
                    continue;
                }
                assert_eq!(
                    a.seed(7, ix, iz),
                    b.seed(7, bx, bz),
                    "cell {gx},{gz} reseeded"
                );
                assert_eq!(a.centre(ix, iz), b.centre(bx, bz), "cell {gx},{gz} moved");
                compared += 1;
            }
        }
        assert!(compared > 400, "compared almost nothing: {compared}");
    }

    #[test]
    fn neighbouring_cells_do_not_share_a_seed() {
        let g = ScatterGrid::new(14.0, Vector2::ZERO, 256.0);
        let mut seen = std::collections::HashSet::new();
        for iz in 0..12 {
            for ix in 0..12 {
                assert!(seen.insert(g.seed(3, ix, iz)), "seed repeated at {ix},{iz}");
            }
        }
    }

    /// Transposed cells must differ, or the world is mirrored about its diagonal.
    #[test]
    fn a_cell_and_its_transpose_differ() {
        let g = ScatterGrid::new(14.0, Vector2::ZERO, 256.0);
        assert_ne!(g.seed(3, 4, 9), g.seed(3, 9, 4));
    }

    /// Cells have to cover the window, including the part cell at each edge.
    #[test]
    fn cells_cover_the_whole_window() {
        for origin in [Vector2::ZERO, Vector2::new(37.5, -211.25)] {
            let g = ScatterGrid::new(14.0, origin, 256.0);
            let last = g.cells() - 1;
            let (lx, lz) = g.centre(last, last);
            assert!(
                lx >= origin.x + 256.0 - 14.0 && lz >= origin.y + 256.0 - 14.0,
                "last cell at {lx},{lz} falls short of the window at {origin:?}"
            );
            let (fx, fz) = g.centre(0, 0);
            assert!(
                fx <= origin.x - 256.0 + 14.0 && fz <= origin.y - 256.0 + 14.0,
                "first cell at {fx},{fz} starts inside the window at {origin:?}"
            );
        }
    }

    #[test]
    fn the_box_follows_the_window() {
        let at = world_aabb_at(256.0, Vector2::new(1000.0, -500.0));
        assert!(at.contains_point(Vector3::new(1000.0, 0.0, -500.0)));
        assert!(!at.contains_point(Vector3::new(0.0, 0.0, 0.0)));
        assert_eq!(world_aabb(256.0).size, at.size);
    }
}
