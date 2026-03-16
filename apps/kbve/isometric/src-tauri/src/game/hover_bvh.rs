//! Lightweight BVH (Bounding Volume Hierarchy) with AABBs for hover raycasting.
//!
//! Replaces avian3d `SpatialQuery::cast_ray` for hover detection with a
//! purpose-built structure that only indexes hoverable entities — far fewer
//! nodes than the full physics world.

use bevy::prelude::*;

use super::scene_objects::HoverOutline;

// ---------------------------------------------------------------------------
// AABB
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Aabb {
    min: Vec3,
    max: Vec3,
}

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

    /// Slab-method ray-AABB intersection. Returns `Some(t)` for nearest hit.
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
// BVH node (flat array)
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct BvhNode {
    aabb: Aabb,
    /// Leaf: `Some(entity)`. Internal: `None`.
    entity: Option<Entity>,
    /// Internal nodes: indices of left and right children.
    children: [u32; 2],
}

// ---------------------------------------------------------------------------
// HoverBvh resource
// ---------------------------------------------------------------------------

/// A BVH built from hoverable entities for fast ray queries.
#[derive(Resource)]
pub struct HoverBvh {
    nodes: Vec<BvhNode>,
    dirty: bool,
}

impl Default for HoverBvh {
    fn default() -> Self {
        Self {
            nodes: Vec::new(),
            dirty: true,
        }
    }
}

struct Leaf {
    aabb: Aabb,
    entity: Entity,
    center: Vec3,
}

impl HoverBvh {
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    /// Cast a ray and return the closest hit entity.
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

        // Iterative traversal with explicit stack.
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
                // Leaf — we already know it hits (ray_hit passed).
                // Re-check to get exact t.
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

/// Rebuild the BVH when it's marked dirty (entities added/removed).
pub fn rebuild_hover_bvh(
    mut bvh: ResMut<HoverBvh>,
    query: Query<(Entity, &GlobalTransform, &HoverOutline)>,
) {
    if !bvh.dirty {
        return;
    }
    bvh.dirty = false;

    bvh.nodes.clear();

    let mut leaves: Vec<Leaf> = query
        .iter()
        .map(|(entity, gt, outline)| {
            let center = gt.translation();
            Leaf {
                aabb: Aabb::from_center_half(center, outline.half_extents),
                entity,
                center,
            }
        })
        .collect();

    if leaves.is_empty() {
        return;
    }

    // Reserve ~2n nodes.
    bvh.nodes.reserve(leaves.len() * 2);
    build_recursive(&mut bvh.nodes, &mut leaves);
}

fn build_recursive(nodes: &mut Vec<BvhNode>, leaves: &mut [Leaf]) -> u32 {
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
        // Two leaves — create parent + two leaf children directly.
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

    // Bounding AABB.
    let mut bounds = leaves[0].aabb;
    for leaf in leaves.iter().skip(1) {
        bounds = Aabb::merge(&bounds, &leaf.aabb);
    }

    // Split along longest axis at midpoint.
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

    // Push placeholder for this internal node.
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
