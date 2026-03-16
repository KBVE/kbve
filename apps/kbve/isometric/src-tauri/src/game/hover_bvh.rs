//! Tile-based hover map for O(1) cursor-to-entity lookup.
//!
//! Every hoverable entity (tree, rock, flower, mushroom) has a [`TileCoord`].
//! This module maintains a `DashMap<(i32, i32), Entity>` that maps tile
//! coordinates to their hoverable entity. Hover detection becomes:
//!
//! 1. Unproject cursor screen position to world XZ via the orthographic camera.
//! 2. Convert world XZ to tile coordinates.
//! 3. Look up the tile (+ neighbors for large objects) in the DashMap.
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

/// DashMap from tile (tx, tz) → hoverable entity. Thread-safe for network inserts.
#[derive(Resource)]
pub struct HoverMap {
    pub map: DashMap<(i32, i32), Entity>,
}

impl Default for HoverMap {
    fn default() -> Self {
        Self {
            map: DashMap::with_capacity(256),
        }
    }
}

impl HoverMap {
    /// Look up which entity (if any) occupies a world XZ position.
    /// Checks the target tile and its 8 neighbors to handle objects that
    /// visually overlap adjacent tiles.
    pub fn lookup(&self, world_x: f32, world_z: f32) -> Option<Entity> {
        let tx = world_x.floor() as i32;
        let tz = world_z.floor() as i32;

        // Check center tile first (most likely hit).
        if let Some(entry) = self.map.get(&(tx, tz)) {
            return Some(*entry);
        }

        // Check 8 neighbors for objects that visually span tiles.
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
                return Some(*entry);
            }
        }

        None
    }
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// Insert newly spawned hoverable entities into the map.
pub fn insert_hoverables(
    query: Query<(Entity, &TileCoord), Added<HoverOutline>>,
    hover_map: Res<HoverMap>,
) {
    for (entity, tile) in &query {
        hover_map.map.insert((tile.tx, tile.tz), entity);
    }
}

/// Remove despawned hoverable entities from the map.
pub fn remove_hoverables(mut removed: RemovedComponents<HoverOutline>, hover_map: Res<HoverMap>) {
    for entity in removed.read() {
        // DashMap doesn't have remove-by-value, so scan for the entity.
        // This only runs when entities are despawned (rare), not per-frame.
        hover_map.map.retain(|_, &mut e| e != entity);
    }
}

/// Unproject cursor screen position to world XZ on the ground plane (Y ≈ 0).
pub fn cursor_to_world_xz(
    cam_gt: &GlobalTransform,
    projection: &Projection,
    window: &Window,
    cursor_pos: Vec2,
) -> Option<Vec2> {
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

    // Intersect ray with Y=0 ground plane.
    // ray_origin.y + t * forward.y = 0  →  t = -ray_origin.y / forward.y
    if forward.y.abs() < 1e-6 {
        return None; // Ray is parallel to ground
    }
    let t = -ray_origin.y / forward.y;
    if t < 0.0 {
        return None; // Ground is behind camera
    }

    let hit = ray_origin + forward * t;
    Some(Vec2::new(hit.x, hit.z))
}
