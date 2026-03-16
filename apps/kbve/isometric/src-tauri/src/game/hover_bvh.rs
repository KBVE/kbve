//! Lightweight BVH (Bounding Volume Hierarchy) with AABBs for hover raycasting.
//!
//! Replaces avian3d `SpatialQuery::cast_ray` for hover detection with a
//! purpose-built structure that only indexes hoverable entities — far fewer
//! nodes than the full physics world.
//!
//! Tree construction is offloaded via [`bevy_tasker::spawn`] so the main
//! thread only collects entity positions and swaps in the finished tree.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender};

use super::scene_objects::HoverOutline;

// ---------------------------------------------------------------------------
// AABB
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Aabb {
    min: Vec3,
    max: Vec3,
}

// Safety: Vec3 is Send+Sync, Aabb is just two Vec3s.
unsafe impl Send for Aabb {}
unsafe impl Sync for Aabb {}

impl Aabb {
    #[inline]
    fn from_center_half(center: Vec3, half: Vec3) -> Self {
        Self {
            min: center - half,
            max: center + half,
        }
    }

    #[inline]
    fn merge(a: &Self, b: &Self) -> Self {
        Self {
            min: a.min.min(b.min),
            max: a.max.max(b.max),
        }
    }

    #[inline]
    fn ray_hit(&self, origin: Vec3, inv_dir: Vec3, max_t: f32) -> Option<f32> {
        let t1 = (self.min - origin) * inv_dir;
        let t2 = (self.max - origin) * inv_dir;

        let tmin = t1.min(t2);
        let tmax = t1.max(t2);

        let enter = tmin.x.max(tmin.y).max(tmin.z).max(0.0);
        let exit = tmax.x.min(tmax.y).min(tmax.z);

        if exit >= enter && enter <= max_t {
            Some(enter)
        } else {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// BVH node
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct BvhNode {
    aabb: Aabb,
    entity: Option<Entity>,
    children: [u32; 2],
}

// Safety: Entity is Send+Sync (it's an index+generation u64).
unsafe impl Send for BvhNode {}
unsafe impl Sync for BvhNode {}

// ---------------------------------------------------------------------------
// Build input leaf
// ---------------------------------------------------------------------------

struct BuildLeaf {
    aabb: Aabb,
    entity: Entity,
    center: Vec3,
}

// Safety: same as above — Entity + Vec3 are Send.
unsafe impl Send for BuildLeaf {}

// ---------------------------------------------------------------------------
// HoverBvh resource
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct HoverBvh {
    nodes: Vec<BvhNode>,
    rx: Receiver<Vec<BvhNode>>,
    tx: Sender<Vec<BvhNode>>,
    dirty: bool,
    building: bool,
}

impl Default for HoverBvh {
    fn default() -> Self {
        let (tx, rx) = crossbeam_channel::bounded(1);
        Self {
            nodes: Vec::new(),
            rx,
            tx,
            dirty: true,
            building: false,
        }
    }
}

impl HoverBvh {
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    pub fn cast_ray(&self, origin: Vec3, direction: Vec3, max_dist: f32) -> Option<Entity> {
        if self.nodes.is_empty() {
            return None;
        }

        let inv_dir = Vec3::new(
            safe_inv(direction.x),
            safe_inv(direction.y),
            safe_inv(direction.z),
        );

        let mut best_t = max_dist;
        let mut best_entity: Option<Entity> = None;

        let mut stack = [0u32; 64];
        let mut sp = 1;
        stack[0] = 0;

        while sp > 0 {
            sp -= 1;
            let ni = stack[sp] as usize;
            let node = &self.nodes[ni];

            if node.aabb.ray_hit(origin, inv_dir, best_t).is_none() {
                continue;
            }

            if let Some(entity) = node.entity {
                if let Some(t) = node.aabb.ray_hit(origin, inv_dir, best_t) {
                    if t < best_t {
                        best_t = t;
                        best_entity = Some(entity);
                    }
                }
            } else if sp + 2 <= 64 {
                stack[sp] = node.children[0];
                sp += 1;
                stack[sp] = node.children[1];
                sp += 1;
            }
        }

        best_entity
    }
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// Check for completed builds, then kick off new ones when dirty.
pub fn rebuild_hover_bvh(
    mut bvh: ResMut<HoverBvh>,
    query: Query<(Entity, &GlobalTransform, &HoverOutline)>,
) {
    // Drain completed build from worker.
    if let Ok(nodes) = bvh.rx.try_recv() {
        bvh.nodes = nodes;
        bvh.building = false;
    }

    // Don't start a new build while one is in flight.
    if bvh.building || !bvh.dirty {
        return;
    }
    bvh.dirty = false;

    // Collect leaf data on main thread (ECS queries are main-thread only).
    let items: Vec<(Entity, Vec3, Vec3)> = query
        .iter()
        .map(|(entity, gt, outline)| (entity, gt.translation(), outline.half_extents))
        .collect();

    if items.is_empty() {
        bvh.nodes.clear();
        return;
    }

    // Dispatch build to worker.
    bvh.building = true;
    let tx = bvh.tx.clone();
    bevy_tasker::spawn(async move {
        let nodes = build_bvh(items);
        let _ = tx.send(nodes);
    })
    .detach();
}

/// Mark BVH dirty when hoverable entities are added or removed.
pub fn mark_bvh_dirty_on_change(
    added: Query<(), Added<HoverOutline>>,
    removed: RemovedComponents<HoverOutline>,
    mut bvh: ResMut<HoverBvh>,
) {
    if !added.is_empty() || !removed.is_empty() {
        bvh.mark_dirty();
    }
}

// ---------------------------------------------------------------------------
// Off-thread BVH construction
// ---------------------------------------------------------------------------

fn build_bvh(items: Vec<(Entity, Vec3, Vec3)>) -> Vec<BvhNode> {
    let mut leaves: Vec<BuildLeaf> = items
        .into_iter()
        .map(|(entity, center, half)| BuildLeaf {
            aabb: Aabb::from_center_half(center, half),
            entity,
            center,
        })
        .collect();

    let mut nodes = Vec::with_capacity(leaves.len() * 2);
    build_recursive(&mut nodes, &mut leaves);
    nodes
}

fn build_recursive(nodes: &mut Vec<BvhNode>, leaves: &mut [BuildLeaf]) -> u32 {
    let idx = nodes.len() as u32;

    if leaves.len() == 1 {
        nodes.push(BvhNode {
            aabb: leaves[0].aabb,
            entity: Some(leaves[0].entity),
            children: [0, 0],
        });
        return idx;
    }

    if leaves.len() == 2 {
        let bounds = Aabb::merge(&leaves[0].aabb, &leaves[1].aabb);
        nodes.push(BvhNode {
            aabb: bounds,
            entity: None,
            children: [idx + 1, idx + 2],
        });
        nodes.push(BvhNode {
            aabb: leaves[0].aabb,
            entity: Some(leaves[0].entity),
            children: [0, 0],
        });
        nodes.push(BvhNode {
            aabb: leaves[1].aabb,
            entity: Some(leaves[1].entity),
            children: [0, 0],
        });
        return idx;
    }

    let mut bounds = leaves[0].aabb;
    for leaf in leaves.iter().skip(1) {
        bounds = Aabb::merge(&bounds, &leaf.aabb);
    }

    let extent = bounds.max - bounds.min;
    let axis = if extent.x >= extent.y && extent.x >= extent.z {
        0
    } else if extent.y >= extent.z {
        1
    } else {
        2
    };
    let mid = (bounds.min[axis] + bounds.max[axis]) * 0.5;

    let mut split = partition_by(leaves, |l| l.center[axis] < mid);
    if split == 0 || split == leaves.len() {
        split = leaves.len() / 2;
    }

    let placeholder = nodes.len();
    nodes.push(BvhNode {
        aabb: bounds,
        entity: None,
        children: [0, 0],
    });

    let left = build_recursive(nodes, &mut leaves[..split]);
    let right = build_recursive(nodes, &mut leaves[split..]);

    nodes[placeholder].children = [left, right];

    idx
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn partition_by<T>(slice: &mut [T], pred: impl Fn(&T) -> bool) -> usize {
    let mut i = 0;
    for j in 0..slice.len() {
        if pred(&slice[j]) {
            slice.swap(i, j);
            i += 1;
        }
    }
    i
}

#[inline]
fn safe_inv(x: f32) -> f32 {
    if x.abs() < 1e-10 {
        if x >= 0.0 { 1e10 } else { -1e10 }
    } else {
        1.0 / x
    }
}
