//! Tile-based hover map for O(1) cursor-to-entity lookup.
//!
//! Every hoverable entity (tree, rock, flower, mushroom) has a [`TileCoord`].
//! This module maintains a `DashMap<(i32, i32), HoverEntry>` that maps tile
//! coordinates to their hoverable entity plus its vertical bounds.
//!
//! Hover detection casts the cursor ray against multiple Y-planes (ground
//! through max object height) so tall objects like trees are picked when the
//! cursor is over their canopy, not just their base tile.
//!
//! O(1) insert, O(1) remove, O(1) lookup. No tree rebuild, no worker dispatch.
//! Thread-safe via DashMap for networked object placements.

use bevy::prelude::*;
use dashmap::DashMap;

use super::scene_objects::HoverOutline;
use super::tilemap::TileCoord;

// ---------------------------------------------------------------------------
// HoverMap resource
// ---------------------------------------------------------------------------

/// Maximum Y-plane to test when casting the cursor ray. Objects taller than
/// this won't be pickable above this height (trees top out around 4-5 units).
const MAX_HOVER_Y: f32 = 6.0;

/// Step size between Y-plane tests. 1.0 gives 7 planes (0..=6) which is
/// plenty for tile-sized objects while keeping the lookup count bounded.
const Y_PLANE_STEP: f32 = 1.0;

/// Entry stored per tile: the entity plus its vertical span.
#[derive(Clone, Copy)]
pub struct HoverEntry {
    pub entity: Entity,
    /// Bottom of the object (world Y of base).
    pub y_min: f32,
    /// Top of the object (world Y of base + full height).
    pub y_max: f32,
}

/// DashMap from tile (tx, tz) → hoverable entity + height. Thread-safe for network inserts.
#[derive(Resource)]
pub struct HoverMap {
    pub map: DashMap<(i32, i32), HoverEntry>,
}

impl Default for HoverMap {
    fn default() -> Self {
        Self {
            map: DashMap::with_capacity(256),
        }
    }
}

impl HoverMap {
    /// Look up which entity (if any) occupies a world XZ position at a given
    /// Y height. Checks the target tile and its 8 neighbors, returning the
    /// **closest** entity whose vertical range contains `y`.
    fn lookup_at_y(&self, world_x: f32, world_z: f32, y: f32) -> Option<Entity> {
        let tx = world_x.floor() as i32;
        let tz = world_z.floor() as i32;

        let mut best: Option<(Entity, f32)> = None;

        let mut check = |cx: i32, cz: i32| {
            if let Some(entry) = self.map.get(&(cx, cz)) {
                if y >= entry.y_min && y <= entry.y_max {
                    // Distance from cursor world pos to tile center
                    let tile_center_x = cx as f32 + 0.5;
                    let tile_center_z = cz as f32 + 0.5;
                    let dx = world_x - tile_center_x;
                    let dz = world_z - tile_center_z;
                    let dist_sq = dx * dx + dz * dz;
                    if best.map_or(true, |(_, d)| dist_sq < d) {
                        best = Some((entry.entity, dist_sq));
                    }
                }
            }
        };

        // Check center tile + 8 neighbors
        check(tx, tz);
        for &(dx, dz) in &[
            (-1, -1),
            (-1, 0),
            (-1, 1),
            (0, -1),
            (0, 1),
            (1, -1),
            (1, 0),
            (1, 1),
        ] {
            check(tx + dx, tz + dz);
        }

        best.map(|(entity, _)| entity)
    }

    /// Legacy lookup without height check — kept for callers that don't need
    /// multi-plane picking (e.g. click handlers that already have a Hovered entity).
    pub fn lookup(&self, world_x: f32, world_z: f32) -> Option<Entity> {
        let tx = world_x.floor() as i32;
        let tz = world_z.floor() as i32;

        if let Some(entry) = self.map.get(&(tx, tz)) {
            return Some(entry.entity);
        }

        for &(dx, dz) in &[
            (-1, -1),
            (-1, 0),
            (-1, 1),
            (0, -1),
            (0, 1),
            (1, -1),
            (1, 0),
            (1, 1),
        ] {
            if let Some(entry) = self.map.get(&(tx + dx, tz + dz)) {
                return Some(entry.entity);
            }
        }

        None
    }
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// Insert newly spawned hoverable entities into the map, recording their
/// vertical bounds from Transform.y and HoverOutline.half_extents.y.
pub fn insert_hoverables(
    query: Query<(Entity, &TileCoord, &Transform, &HoverOutline), Added<HoverOutline>>,
    hover_map: Res<HoverMap>,
) {
    for (entity, tile, transform, outline) in &query {
        let base_y = transform.translation.y;
        let entry = HoverEntry {
            entity,
            y_min: base_y - outline.half_extents.y,
            y_max: base_y + outline.half_extents.y,
        };
        hover_map.map.insert((tile.tx, tile.tz), entry);
    }
}

/// Remove despawned hoverable entities from the map.
pub fn remove_hoverables(mut removed: RemovedComponents<HoverOutline>, hover_map: Res<HoverMap>) {
    for entity in removed.read() {
        // DashMap doesn't have remove-by-value, so scan for the entity.
        // This only runs when entities are despawned (rare), not per-frame.
        hover_map.map.retain(|_, entry| entry.entity != entity);
    }
}

// ---------------------------------------------------------------------------
// Ray construction
// ---------------------------------------------------------------------------

/// Build a ray (origin, direction) from the orthographic camera through the
/// cursor's screen position. Returns None if the camera isn't orthographic
/// or uses an unsupported scaling mode.
fn cursor_ray(
    cam_gt: &GlobalTransform,
    projection: &Projection,
    window: &Window,
    cursor_pos: Vec2,
) -> Option<(Vec3, Vec3)> {
    let Projection::Orthographic(ortho) = projection else {
        return None;
    };
    let viewport_height = match ortho.scaling_mode {
        bevy::camera::ScalingMode::FixedVertical { viewport_height } => viewport_height,
        _ => return None,
    };
    let half_h = (viewport_height / 2.0) * ortho.scale;
    let aspect = window.width() / window.height();
    let half_w = half_h * aspect;

    let ndc_x = (cursor_pos.x / window.width()) * 2.0 - 1.0;
    let ndc_y = 1.0 - (cursor_pos.y / window.height()) * 2.0;

    let cam_tf = cam_gt.compute_transform();
    let right = cam_tf.right().as_vec3();
    let up = cam_tf.up().as_vec3();
    let forward = cam_tf.forward().as_vec3();

    let ray_origin = cam_tf.translation + right * (ndc_x * half_w) + up * (ndc_y * half_h);

    Some((ray_origin, forward))
}

/// Intersect a ray with a horizontal plane at the given Y value.
/// Returns the XZ world coordinates of the hit, or None if the ray is
/// parallel to the plane or the plane is behind the camera.
fn ray_hit_y_plane(ray_origin: Vec3, ray_dir: Vec3, y: f32) -> Option<Vec2> {
    if ray_dir.y.abs() < 1e-6 {
        return None;
    }
    let t = (y - ray_origin.y) / ray_dir.y;
    if t < 0.0 {
        return None;
    }
    let hit = ray_origin + ray_dir * t;
    Some(Vec2::new(hit.x, hit.z))
}

// ---------------------------------------------------------------------------
// Public picking entry point
// ---------------------------------------------------------------------------

/// Multi-plane cursor picking. Casts the cursor ray against Y-planes from
/// MAX_HOVER_Y down to 0, collecting all candidate entities, then returns
/// the one whose tile center is closest to the ground-level (Y=0) ray hit.
///
/// This avoids the isometric parallax problem where the angled ray hits
/// different XZ positions at different Y levels — a tree canopy at Y=5
/// projects to a different tile than the trunk at Y=0. By scoring all
/// candidates against the ground hit point we pick what's visually under
/// the cursor, not what the ray happens to intersect first.
pub fn cursor_pick(
    cam_gt: &GlobalTransform,
    projection: &Projection,
    window: &Window,
    cursor_pos: Vec2,
    hover_map: &HoverMap,
) -> Option<Entity> {
    let (ray_origin, ray_dir) = cursor_ray(cam_gt, projection, window, cursor_pos)?;

    // Ground-level hit — this is what the player perceives as "under the cursor"
    let ground_xz = ray_hit_y_plane(ray_origin, ray_dir, 0.0)?;

    let mut best: Option<(Entity, f32)> = None;

    // Sweep Y-planes and collect all candidates
    let mut y = MAX_HOVER_Y;
    while y >= 0.0 {
        if let Some(xz) = ray_hit_y_plane(ray_origin, ray_dir, y) {
            let tx = xz.x.floor() as i32;
            let tz = xz.y.floor() as i32;

            // Check center tile + 8 neighbors at this Y level
            for &(dx, dz) in &[
                (0, 0),
                (-1, -1),
                (-1, 0),
                (-1, 1),
                (0, -1),
                (0, 1),
                (1, -1),
                (1, 0),
                (1, 1),
            ] {
                let cx = tx + dx;
                let cz = tz + dz;
                if let Some(entry) = hover_map.map.get(&(cx, cz)) {
                    if y >= entry.y_min && y <= entry.y_max {
                        // Score by distance from tile center to ground hit point
                        let tile_cx = cx as f32 + 0.5;
                        let tile_cz = cz as f32 + 0.5;
                        let dist_sq =
                            (ground_xz.x - tile_cx).powi(2) + (ground_xz.y - tile_cz).powi(2);
                        if best.map_or(true, |(_, d)| dist_sq < d) {
                            best = Some((entry.entity, dist_sq));
                        }
                    }
                }
            }
        }
        y -= Y_PLANE_STEP;
    }

    best.map(|(entity, _)| entity)
}

/// Legacy single-plane unproject (Y=0 only). Kept for backward compatibility.
pub fn cursor_to_world_xz(
    cam_gt: &GlobalTransform,
    projection: &Projection,
    window: &Window,
    cursor_pos: Vec2,
) -> Option<Vec2> {
    let (ray_origin, ray_dir) = cursor_ray(cam_gt, projection, window, cursor_pos)?;
    ray_hit_y_plane(ray_origin, ray_dir, 0.0)
}
