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

/// Scatter fields all cover the whole world and are never culled as a unit, so they
/// share one generous box rather than paying to track their own bounds.
pub(crate) fn world_aabb(extent: f32) -> Aabb {
    let e = extent + 10.0;
    Aabb::new(
        Vector3::new(-e, -40.0, -e),
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

/// The CPU-side terrain data scatter placement needs, lifted out of QTerrain once so
/// placement loops never bind it per candidate.
pub(crate) struct TerrainSnapshot {
    heights: Vec<f32>,
    res: i32,
    road_mask: Vec<u8>,
    road_res: i32,
    pub extent: f32,
    pub water: f32,
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
        })
    }

    /// For fields that keep their own copy alive past init — stone marches it for
    /// occlusion long after the snapshot is dropped.
    pub(crate) fn raw_heights(&self) -> (&[f32], i32) {
        (&self.heights, self.res)
    }

    pub(crate) fn height(&self, x: f32, z: f32) -> f32 {
        let res = self.res;
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
        let u = ((x + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
        let v = ((z + self.extent) / (self.extent * 2.0)).clamp(0.0, 1.0);
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
