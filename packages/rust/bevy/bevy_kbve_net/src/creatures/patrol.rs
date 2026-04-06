//! Layer 4: Patrol routes — seed-deterministic waypoint sequences with
//! tile-level A* pathfinding between waypoints.
//!
//! Each creature gets a `PatrolRoute` component computed once at spawn.
//! The route is fully deterministic from `(creature_seed, anchor, profile, graph)`.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

use bevy::prelude::*;

use super::common::hash_f32;
use super::influence::{InfluenceProfile, PatrolMode, score_waypoint};
use super::nav_grid::NavGrid;
use super::waypoint_graph::WaypointGraph;

// ---------------------------------------------------------------------------
// A* budget
// ---------------------------------------------------------------------------

/// Maximum node expansions for tile-level A* (prevents runaway on WASM).
pub const MAX_ASTAR_STEPS: u32 = 200;

// ---------------------------------------------------------------------------
// Dwell action
// ---------------------------------------------------------------------------

/// What the creature does when it arrives at a patrol waypoint.
#[derive(Clone, Copy, Debug)]
pub enum DwellAction {
    Idle { duration: f32 },
    Emote { anim: &'static str, repeat: u32 },
}

// ---------------------------------------------------------------------------
// Patrol step
// ---------------------------------------------------------------------------

/// A single waypoint in a patrol route.
#[derive(Clone, Debug)]
pub struct PatrolStep {
    /// World position of the waypoint.
    pub target: Vec3,
    /// Action to perform on arrival.
    pub dwell: DwellAction,
}

// ---------------------------------------------------------------------------
// PatrolRoute component
// ---------------------------------------------------------------------------

/// ECS component: a creature's active patrol route.
#[derive(Component, Clone, Debug)]
pub struct PatrolRoute {
    pub steps: Vec<PatrolStep>,
    pub current: usize,
    pub mode: PatrolMode,
    /// True = moving forward through steps, false = reversing (PingPong).
    pub forward: bool,
}

impl PatrolRoute {
    /// Advance to the next step. Returns the new current step, or None if
    /// the route is exhausted (shouldn't happen for Loop/PingPong).
    pub fn advance(&mut self) -> Option<&PatrolStep> {
        if self.steps.is_empty() {
            return None;
        }

        match self.mode {
            PatrolMode::Loop => {
                self.current = (self.current + 1) % self.steps.len();
            }
            PatrolMode::PingPong => {
                if self.forward {
                    if self.current + 1 >= self.steps.len() {
                        self.forward = false;
                        if self.current > 0 {
                            self.current -= 1;
                        }
                    } else {
                        self.current += 1;
                    }
                } else {
                    if self.current == 0 {
                        self.forward = true;
                        if self.steps.len() > 1 {
                            self.current = 1;
                        }
                    } else {
                        self.current -= 1;
                    }
                }
            }
        }

        self.steps.get(self.current)
    }

    /// Current step reference.
    pub fn current_step(&self) -> Option<&PatrolStep> {
        self.steps.get(self.current)
    }
}

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------

/// Generate a patrol route from seed. Pure, deterministic.
///
/// Returns `None` if fewer than 2 waypoints are available (e.g., creature
/// spawned in a featureless area).
pub fn generate_route(
    seed: u32,
    anchor: Vec3,
    profile: &InfluenceProfile,
    graph: &WaypointGraph,
    _nav: &NavGrid,
    emote_anims: &[&'static str],
) -> Option<PatrolRoute> {
    // 1. Gather candidate waypoints within patrol_radius * 1.5
    let candidates = graph.waypoints_in_radius(anchor, profile.patrol_radius * 1.5);
    if candidates.len() < 2 {
        return None;
    }

    // 2. Score each candidate
    let mut scored: Vec<(u32, f32)> = candidates
        .iter()
        .filter_map(|&id| {
            let wp = graph.waypoints.get(id as usize)?;
            let s = score_waypoint(wp, profile, anchor);
            Some((id, s))
        })
        .collect();

    if scored.len() < 2 {
        return None;
    }

    // 3. Weighted selection of N waypoints
    let count = (profile.waypoint_count as usize).min(scored.len());
    let mut selected: Vec<u32> = Vec::with_capacity(count);
    let mut rng_seed = seed;

    for i in 0..count {
        let total: f32 = scored.iter().map(|(_, s)| s).sum();
        if total <= 0.0 {
            break;
        }

        let roll = hash_f32(rng_seed.wrapping_add(i as u32 * 997)) * total;
        let mut accum = 0.0f32;
        let mut pick_idx = 0;

        for (idx, &(_, score)) in scored.iter().enumerate() {
            accum += score;
            if accum >= roll {
                pick_idx = idx;
                break;
            }
        }

        let (id, _) = scored.remove(pick_idx);
        selected.push(id);

        rng_seed = rng_seed.wrapping_mul(2654435761).wrapping_add(i as u32);
    }

    if selected.len() < 2 {
        return None;
    }

    // 4. Order by nearest-neighbor heuristic
    let ordered = nearest_neighbor_order(&selected, anchor, graph);

    // 5. Build patrol steps with dwell actions
    let steps: Vec<PatrolStep> = ordered
        .iter()
        .enumerate()
        .filter_map(|(i, &wp_id)| {
            let wp = graph.waypoints.get(wp_id as usize)?;
            let dwell = generate_dwell(seed.wrapping_add(i as u32 * 331), emote_anims);
            Some(PatrolStep {
                target: wp.world_pos,
                dwell,
            })
        })
        .collect();

    if steps.len() < 2 {
        return None;
    }

    Some(PatrolRoute {
        steps,
        current: 0,
        mode: profile.patrol_mode,
        forward: true,
    })
}

/// Nearest-neighbor ordering starting from the waypoint closest to anchor.
fn nearest_neighbor_order(selected: &[u32], anchor: Vec3, graph: &WaypointGraph) -> Vec<u32> {
    let mut remaining: Vec<u32> = selected.to_vec();
    let mut ordered: Vec<u32> = Vec::with_capacity(remaining.len());

    // Start from nearest to anchor
    remaining.sort_by(|&a, &b| {
        let wa = &graph.waypoints[a as usize];
        let wb = &graph.waypoints[b as usize];
        let da = (wa.world_pos.x - anchor.x).powi(2) + (wa.world_pos.z - anchor.z).powi(2);
        let db = (wb.world_pos.x - anchor.x).powi(2) + (wb.world_pos.z - anchor.z).powi(2);
        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
    });

    ordered.push(remaining.remove(0));

    while !remaining.is_empty() {
        let last = *ordered.last().unwrap();
        let last_wp = &graph.waypoints[last as usize];

        let mut best_idx = 0;
        let mut best_dist = f32::MAX;

        for (idx, &id) in remaining.iter().enumerate() {
            let wp = &graph.waypoints[id as usize];
            let d = (wp.world_pos.x - last_wp.world_pos.x).powi(2)
                + (wp.world_pos.z - last_wp.world_pos.z).powi(2);
            if d < best_dist {
                best_dist = d;
                best_idx = idx;
            }
        }

        ordered.push(remaining.remove(best_idx));
    }

    ordered
}

/// Generate a dwell action from seed.
fn generate_dwell(seed: u32, emote_anims: &[&'static str]) -> DwellAction {
    let roll = hash_f32(seed);

    if roll < 0.6 || emote_anims.is_empty() {
        // 60% chance: idle for 2-8 seconds
        let duration = 2.0 + hash_f32(seed.wrapping_add(1)) * 6.0;
        DwellAction::Idle { duration }
    } else {
        // 40% chance: play an emote animation
        let anim_idx = (hash_f32(seed.wrapping_add(2)) * emote_anims.len() as f32) as usize
            % emote_anims.len();
        DwellAction::Emote {
            anim: emote_anims[anim_idx],
            repeat: 1,
        }
    }
}

// ---------------------------------------------------------------------------
// Tile-level A* pathfinding
// ---------------------------------------------------------------------------

/// A* pathfinding on the tile grid between two tile coordinates.
/// Returns the path as a vec of `(tx, tz)` from start to goal (inclusive),
/// or `None` if no path found within budget.
pub fn astar_tiles(
    nav: &NavGrid,
    start: (i32, i32),
    goal: (i32, i32),
    max_steps: u32,
) -> Option<Vec<(i32, i32)>> {
    if start == goal {
        return Some(vec![start]);
    }
    if !nav.is_walkable(goal.0, goal.1) {
        return None;
    }

    // Open set: (f_cost as OrderedFloat bits, tile)
    let mut open: BinaryHeap<Reverse<(u32, (i32, i32))>> = BinaryHeap::new();
    let mut g_score: HashMap<(i32, i32), f32> = HashMap::new();
    let mut came_from: HashMap<(i32, i32), (i32, i32)> = HashMap::new();

    g_score.insert(start, 0.0);
    let h = octile_dist(start, goal);
    open.push(Reverse((f32_to_u32(h), start)));

    let mut steps = 0u32;

    while let Some(Reverse((_, current))) = open.pop() {
        if current == goal {
            return Some(reconstruct_path(&came_from, current));
        }

        steps += 1;
        if steps > max_steps {
            return None;
        }

        let current_g = g_score.get(&current).copied().unwrap_or(f32::MAX);
        let neighbors = nav.walkable_neighbors(current.0, current.1);

        for (nx, nz) in neighbors {
            let neighbor = (nx, nz);
            let move_cost = nav.cost(nx, nz);
            // Diagonal moves cost sqrt(2) × tile cost
            let is_diagonal = (nx - current.0).abs() == 1 && (nz - current.1).abs() == 1;
            let step_cost = if is_diagonal {
                move_cost * 1.414
            } else {
                move_cost
            };
            let tentative_g = current_g + step_cost;

            if tentative_g < g_score.get(&neighbor).copied().unwrap_or(f32::MAX) {
                came_from.insert(neighbor, current);
                g_score.insert(neighbor, tentative_g);
                let f = tentative_g + octile_dist(neighbor, goal);
                open.push(Reverse((f32_to_u32(f), neighbor)));
            }
        }
    }

    None
}

/// Octile distance heuristic (admissible for 8-connected grid with min cost 1.0).
fn octile_dist(a: (i32, i32), b: (i32, i32)) -> f32 {
    let dx = (a.0 - b.0).abs() as f32;
    let dz = (a.1 - b.1).abs() as f32;
    let (big, small) = if dx > dz { (dx, dz) } else { (dz, dx) };
    big + (std::f32::consts::SQRT_2 - 1.0) * small
}

/// Convert f32 to u32 for BinaryHeap ordering (preserves ordering for non-negative f32).
fn f32_to_u32(f: f32) -> u32 {
    f.to_bits() ^ (((f.to_bits() as i32 >> 31) as u32) | 0x8000_0000)
}

/// Reconstruct path from came_from map.
fn reconstruct_path(
    came_from: &HashMap<(i32, i32), (i32, i32)>,
    mut current: (i32, i32),
) -> Vec<(i32, i32)> {
    let mut path = vec![current];
    while let Some(&prev) = came_from.get(&current) {
        path.push(prev);
        current = prev;
    }
    path.reverse();
    path
}
