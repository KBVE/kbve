//! Layer 2: WaypointGraph — downsampled navigation graph with zone tags
//! and betweenness centrality scoring.
//!
//! Extracts ~4 interesting waypoints per 16×16 chunk from the NavGrid,
//! connects them with cost-weighted edges, and computes centrality scores
//! to identify chokepoints and hubs.

use std::collections::{HashMap, HashSet, VecDeque};

use bevy::prelude::*;

use super::nav_grid::{NAV_CHUNK, NavGrid, TerrainBand};
use crate::terrain::hash2d;

// ---------------------------------------------------------------------------
// Zone classification
// ---------------------------------------------------------------------------

/// Terrain zone tag derived from local features around a waypoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ZoneTag {
    Meadow,
    Forest,
    ForestEdge,
    Highland,
    Peak,
    Waterfront,
    Scrubland,
}

// ---------------------------------------------------------------------------
// Waypoint
// ---------------------------------------------------------------------------

/// A navigation waypoint in the graph.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Waypoint {
    pub id: u32,
    pub pos: IVec2,
    pub world_pos: Vec3,
    pub zone: ZoneTag,
    /// Betweenness centrality, normalized to [0, 1].
    pub centrality: f32,
    /// Vegetation density in 3×3 neighborhood [0, 1].
    pub veg_density: f32,
}

// ---------------------------------------------------------------------------
// WaypointGraph resource
// ---------------------------------------------------------------------------

/// Regional waypoint graph built from NavGrid data.
#[derive(Resource, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct WaypointGraph {
    pub waypoints: Vec<Waypoint>,
    /// Adjacency list indexed by waypoint id: `(neighbor_id, edge_cost)`.
    pub adjacency: Vec<Vec<(u32, f32)>>,
    /// Spatial index: chunk coord → waypoint ids in that chunk.
    pub chunk_index: HashMap<(i32, i32), Vec<u32>>,
    /// Chunks already processed.
    built_chunks: HashSet<(i32, i32)>,
}

impl WaypointGraph {
    /// Set of chunks that already have waypoints built.
    pub fn built_chunk_set(&self) -> HashSet<(i32, i32)> {
        self.built_chunks.clone()
    }

    /// Build waypoints for all chunks in the given region.
    /// Skips already-built chunks. Call after NavGrid chunks are loaded.
    pub fn build_for_region(
        &mut self,
        nav: &NavGrid,
        cx_min: i32,
        cx_max: i32,
        cz_min: i32,
        cz_max: i32,
    ) {
        let mut new_chunks = Vec::new();

        for cx in cx_min..=cx_max {
            for cz in cz_min..=cz_max {
                if self.built_chunks.contains(&(cx, cz)) {
                    continue;
                }
                nav.ensure_chunk(cx, cz);
                let wps = extract_chunk_waypoints(nav, cx, cz, self.waypoints.len() as u32);
                let ids: Vec<u32> = wps.iter().map(|w| w.id).collect();
                for wp in wps {
                    let id = wp.id as usize;
                    self.waypoints.push(wp);
                    // Ensure adjacency list is large enough
                    while self.adjacency.len() <= id {
                        self.adjacency.push(Vec::new());
                    }
                }
                self.chunk_index.insert((cx, cz), ids);
                self.built_chunks.insert((cx, cz));
                new_chunks.push((cx, cz));
            }
        }

        // Connect new waypoints to all existing waypoints within range
        if !new_chunks.is_empty() {
            self.connect_edges(nav);
            self.compute_centrality();
        }
    }

    /// Connect waypoints within 12 tiles (Chebyshev) of each other.
    fn connect_edges(&mut self, nav: &NavGrid) {
        let max_dist = 12;
        let n = self.waypoints.len();

        // Rebuild all edges (simple for small graphs — <200 waypoints)
        for adj in &mut self.adjacency {
            adj.clear();
        }

        for i in 0..n {
            for j in (i + 1)..n {
                let a = &self.waypoints[i];
                let b = &self.waypoints[j];
                let dx = (a.pos.x - b.pos.x).abs();
                let dz = (a.pos.y - b.pos.y).abs();
                if dx <= max_dist && dz <= max_dist {
                    // Edge cost = Chebyshev distance × average tile cost
                    let dist = dx.max(dz) as f32;
                    let avg_cost = (nav.cost(a.pos.x, a.pos.y) + nav.cost(b.pos.x, b.pos.y)) / 2.0;
                    let edge_cost = dist * avg_cost;
                    self.adjacency[i].push((j as u32, edge_cost));
                    self.adjacency[j].push((i as u32, edge_cost));
                }
            }
        }
    }

    /// Brandes' algorithm for betweenness centrality.
    fn compute_centrality(&mut self) {
        let n = self.waypoints.len();
        if n < 3 {
            return;
        }

        let mut cb = vec![0.0f32; n];

        for s in 0..n {
            let mut stack: Vec<usize> = Vec::new();
            let mut pred: Vec<Vec<usize>> = vec![Vec::new(); n];
            let mut sigma = vec![0.0f32; n];
            sigma[s] = 1.0;
            let mut dist = vec![-1i32; n];
            dist[s] = 0;

            let mut queue = VecDeque::new();
            queue.push_back(s);

            // BFS (unweighted for simplicity — works well for sparse graphs)
            while let Some(v) = queue.pop_front() {
                stack.push(v);
                for &(w_id, _) in &self.adjacency[v] {
                    let w = w_id as usize;
                    if dist[w] < 0 {
                        dist[w] = dist[v] + 1;
                        queue.push_back(w);
                    }
                    if dist[w] == dist[v] + 1 {
                        sigma[w] += sigma[v];
                        pred[w].push(v);
                    }
                }
            }

            let mut delta = vec![0.0f32; n];
            while let Some(w) = stack.pop() {
                for &v in &pred[w] {
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
                }
                if w != s {
                    cb[w] += delta[w];
                }
            }
        }

        // Normalize to [0, 1]
        let max_cb = cb.iter().copied().fold(0.0f32, f32::max);
        if max_cb > 0.0 {
            for (i, wp) in self.waypoints.iter_mut().enumerate() {
                wp.centrality = cb[i] / max_cb;
            }
        }
    }

    /// Find nearest waypoint to a world position.
    pub fn nearest_waypoint(&self, pos: Vec3) -> Option<u32> {
        self.waypoints
            .iter()
            .map(|wp| {
                let dx = wp.world_pos.x - pos.x;
                let dz = wp.world_pos.z - pos.z;
                (wp.id, dx * dx + dz * dz)
            })
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(id, _)| id)
    }

    /// Find all waypoints within a radius of a world position.
    pub fn waypoints_in_radius(&self, pos: Vec3, radius: f32) -> Vec<u32> {
        let r2 = radius * radius;
        self.waypoints
            .iter()
            .filter(|wp| {
                let dx = wp.world_pos.x - pos.x;
                let dz = wp.world_pos.z - pos.z;
                dx * dx + dz * dz <= r2
            })
            .map(|wp| wp.id)
            .collect()
    }

    /// Evict waypoints for chunks outside the keep region.
    pub fn evict_far(&mut self, center_cx: i32, center_cz: i32, keep_radius: i32) {
        let remove_chunks: Vec<(i32, i32)> = self
            .built_chunks
            .iter()
            .copied()
            .filter(|&(cx, cz)| {
                (cx - center_cx).abs() > keep_radius || (cz - center_cz).abs() > keep_radius
            })
            .collect();

        if remove_chunks.is_empty() {
            return;
        }

        let mut remove_ids: HashSet<u32> = HashSet::new();
        for &chunk in &remove_chunks {
            if let Some(ids) = self.chunk_index.remove(&chunk) {
                for id in ids {
                    remove_ids.insert(id);
                }
            }
            self.built_chunks.remove(&chunk);
        }

        if remove_ids.is_empty() {
            return;
        }

        // Rebuild waypoints and adjacency without removed ids
        let mut id_map: HashMap<u32, u32> = HashMap::new();
        let mut new_waypoints = Vec::new();
        for wp in &self.waypoints {
            if !remove_ids.contains(&wp.id) {
                let new_id = new_waypoints.len() as u32;
                id_map.insert(wp.id, new_id);
                let mut new_wp = wp.clone();
                new_wp.id = new_id;
                new_waypoints.push(new_wp);
            }
        }

        let mut new_adj: Vec<Vec<(u32, f32)>> = vec![Vec::new(); new_waypoints.len()];
        for (old_id, adj) in self.adjacency.iter().enumerate() {
            if let Some(&new_id) = id_map.get(&(old_id as u32)) {
                for &(neighbor, cost) in adj {
                    if let Some(&new_neighbor) = id_map.get(&neighbor) {
                        new_adj[new_id as usize].push((new_neighbor, cost));
                    }
                }
            }
        }

        // Update chunk_index
        for ids in self.chunk_index.values_mut() {
            *ids = ids
                .iter()
                .filter_map(|old| id_map.get(old).copied())
                .collect();
        }

        self.waypoints = new_waypoints;
        self.adjacency = new_adj;
    }
}

// ---------------------------------------------------------------------------
// Waypoint extraction helpers
// ---------------------------------------------------------------------------

/// Extract ~4 waypoints from a chunk by dividing into 4 quadrants (8×8 each)
/// and picking the most "interesting" walkable tile per quadrant.
fn extract_chunk_waypoints(nav: &NavGrid, cx: i32, cz: i32, id_start: u32) -> Vec<Waypoint> {
    let base_tx = cx * NAV_CHUNK;
    let base_tz = cz * NAV_CHUNK;
    let mut waypoints = Vec::new();

    // 4 quadrants: (0..8, 0..8), (8..16, 0..8), (0..8, 8..16), (8..16, 8..16)
    for qz in 0..2 {
        for qx in 0..2 {
            let mut best_score = -1.0f32;
            let mut best_tile: Option<(i32, i32)> = None;

            for lz in 0..8 {
                for lx in 0..8 {
                    let tx = base_tx + qx * 8 + lx;
                    let tz = base_tz + qz * 8 + lz;
                    let tile = nav.tile_nav(tx, tz);
                    if !tile.walkable {
                        continue;
                    }

                    let score = interest_score(nav, tx, tz);
                    // Deterministic tie-break
                    let tiebreak = hash2d(tx + 99999, tz + 88888) * 0.01;
                    let total = score + tiebreak;

                    if total > best_score {
                        best_score = total;
                        best_tile = Some((tx, tz));
                    }
                }
            }

            if let Some((tx, tz)) = best_tile {
                let tile = nav.tile_nav(tx, tz);
                let zone = classify_zone(nav, tx, tz);
                let veg = vegetation_density(nav, tx, tz);
                let id = id_start + waypoints.len() as u32;

                waypoints.push(Waypoint {
                    id,
                    pos: IVec2::new(tx, tz),
                    world_pos: Vec3::new(tx as f32, tile.height, tz as f32),
                    zone,
                    centrality: 0.0,
                    veg_density: veg,
                });
            }
        }
    }

    waypoints
}

/// Compute an "interest score" for a tile based on local features.
fn interest_score(nav: &NavGrid, tx: i32, tz: i32) -> f32 {
    let center = nav.tile_nav(tx, tz);
    let mut score = 0.0f32;

    for dz in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dz == 0 {
                continue;
            }
            let n = nav.tile_nav(tx + dx, tz + dz);

            // Band transition
            if n.band != center.band && n.walkable {
                score += 2.0;
            }
            // Water adjacency
            if n.band == TerrainBand::Water {
                score += 2.0;
            }
            // Vegetation
            if n.has_tree {
                score += 1.0;
            }
            // Elevation change
            if (n.height - center.height).abs() >= 1.0 {
                score += 1.0;
            }
        }
    }

    score
}

/// Classify zone tag from local 3×3 neighborhood.
fn classify_zone(nav: &NavGrid, tx: i32, tz: i32) -> ZoneTag {
    let center = nav.tile_nav(tx, tz);

    let mut tree_count = 0u32;
    let mut has_water = false;
    let mut has_dirt = false;

    for dz in -1..=1 {
        for dx in -1..=1 {
            let n = nav.tile_nav(tx + dx, tz + dz);
            if n.has_tree {
                tree_count += 1;
            }
            if n.band == TerrainBand::Water {
                has_water = true;
            }
            if n.band == TerrainBand::Dirt {
                has_dirt = true;
            }
        }
    }

    match center.band {
        TerrainBand::Snow => ZoneTag::Peak,
        TerrainBand::Stone => ZoneTag::Highland,
        TerrainBand::Dirt => ZoneTag::Scrubland,
        TerrainBand::Grass => {
            if tree_count >= 2 {
                if has_dirt {
                    ZoneTag::ForestEdge
                } else {
                    ZoneTag::Forest
                }
            } else if has_water {
                ZoneTag::Waterfront
            } else {
                ZoneTag::Meadow
            }
        }
        TerrainBand::Water => ZoneTag::Waterfront, // shouldn't happen for walkable tiles
    }
}

/// Vegetation density in 3×3 neighborhood (trees, rocks, flowers, mushrooms).
fn vegetation_density(nav: &NavGrid, tx: i32, tz: i32) -> f32 {
    let mut count = 0u32;
    for dz in -1..=1 {
        for dx in -1..=1 {
            let ntx = tx + dx;
            let ntz = tz + dz;
            let n = nav.tile_nav(ntx, ntz);
            if n.band != TerrainBand::Grass {
                continue;
            }
            // Check all vegetation types (deterministic hash checks matching tilemap.rs)
            if n.has_tree {
                count += 1;
            } else if hash2d(ntx + 19457, ntz + 12391) < 0.025 {
                count += 1; // rock
            } else if hash2d(ntx + 13721, ntz + 8293) < 0.12 {
                count += 1; // flower
            } else if hash2d(ntx + 23017, ntz + 17293) < 0.04 {
                count += 1; // mushroom
            }
        }
    }
    (count as f32 / 9.0).min(1.0)
}
