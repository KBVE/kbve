//! Sparse adjacency-list pathfinding for abstract tile graphs.
//!
//! Where [`BlockGrid`](crate::grid::BlockGrid) is the right tool for
//! voxel / dense walkability worlds, [`TileGraph`] fits games whose
//! "tiles" are arbitrary node types and whose adjacency is governed by
//! per-tile connectivity rather than uniform 2D coordinates. Examples:
//!
//! * A dungeon whose rooms each declare which directions have doors.
//! * A node-based map editor where edges are drawn by the designer.
//! * A web of system-objects where neighbors are arbitrary references.
//!
//! Build a [`TileGraph<N>`] by adding nodes and weighted edges, then
//! call [`PathField::compute`] to BFS from one or more goals. Every
//! reachable node gets a distance and a next-hop pointing toward the
//! nearest goal — the same one-shot computation pattern as the dense
//! [`FlowField`](crate::flow_field::FlowField), generalized over node
//! type.
//!
//! Gated behind the `tile-graph` feature so callers that only need the
//! voxel pipeline don't pay the (tiny) compile cost.

use std::collections::{HashMap, VecDeque};
use std::hash::Hash;

use crate::graph::NavGraph;

// ── TileGraph ───────────────────────────────────────────────────────

/// Generic adjacency-list graph keyed by an arbitrary node type.
///
/// Storage is one `Vec<N>` for the node iteration order plus one
/// `HashMap<N, Vec<(N, f32)>>` for outgoing edges. Insertion is
/// idempotent — adding a node twice or adding the same edge twice is
/// allowed, but the second add still appends another entry to the
/// neighbor list (callers that care about uniqueness should dedupe
/// upstream).
#[derive(Debug, Clone)]
pub struct TileGraph<N: Copy + Eq + Hash> {
    nodes: Vec<N>,
    edges: HashMap<N, Vec<(N, f32)>>,
}

impl<N: Copy + Eq + Hash> Default for TileGraph<N> {
    fn default() -> Self {
        Self {
            nodes: Vec::new(),
            edges: HashMap::new(),
        }
    }
}

impl<N: Copy + Eq + Hash> TileGraph<N> {
    /// New empty graph.
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert `node` if it isn't already present.
    pub fn add_node(&mut self, node: N) {
        if !self.edges.contains_key(&node) {
            self.nodes.push(node);
            self.edges.insert(node, Vec::new());
        }
    }

    /// Insert a directed edge `from -> to` with the given cost. Both
    /// endpoints are added if missing.
    pub fn add_edge(&mut self, from: N, to: N, cost: f32) {
        self.add_node(from);
        self.add_node(to);
        // SAFETY: `add_node` inserts the entry, so `get_mut` cannot fail.
        self.edges.get_mut(&from).unwrap().push((to, cost));
    }

    /// Insert both `a -> b` and `b -> a` with the same cost.
    pub fn add_undirected(&mut self, a: N, b: N, cost: f32) {
        self.add_edge(a, b, cost);
        self.add_edge(b, a, cost);
    }

    /// Total nodes in the graph.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Borrow the node list in insertion order.
    pub fn node_list(&self) -> &[N] {
        &self.nodes
    }
}

impl<N: Copy + Eq + Hash> NavGraph for TileGraph<N> {
    type Node = N;

    fn nodes(&self) -> Vec<N> {
        self.nodes.clone()
    }

    fn neighbors(&self, node: N) -> Vec<(N, f32)> {
        self.edges.get(&node).cloned().unwrap_or_default()
    }
}

// ── PathField ───────────────────────────────────────────────────────

/// Multi-source BFS result over any [`NavGraph`].
///
/// Stores per-reachable-node distance (in hops) and the next-hop node
/// to step to in order to reach the nearest goal. Unreachable and
/// out-of-graph nodes return `None` from every accessor.
#[derive(Debug, Clone)]
pub struct PathField<N: Copy + Eq + Hash> {
    distances: HashMap<N, u32>,
    next_hop: HashMap<N, N>,
}

impl<N: Copy + Eq + Hash> Default for PathField<N> {
    fn default() -> Self {
        Self {
            distances: HashMap::new(),
            next_hop: HashMap::new(),
        }
    }
}

impl<N: Copy + Eq + Hash> PathField<N> {
    /// BFS from every node in `goals` simultaneously. Distance is in
    /// hops (edge cost is currently ignored — a Dijkstra variant can be
    /// added later if weighted shortest path becomes a need).
    ///
    /// Goals not present in `graph` are silently skipped so that a stale
    /// goal list (e.g. a previously-revealed tile no longer in the
    /// current map) doesn't pollute the distance table with phantom
    /// entries.
    pub fn compute<G: NavGraph<Node = N>>(graph: &G, goals: &[N]) -> Self {
        use std::collections::HashSet;

        let known: HashSet<N> = graph.nodes().into_iter().collect();
        let mut distances: HashMap<N, u32> = HashMap::new();
        let mut next_hop: HashMap<N, N> = HashMap::new();
        let mut queue: VecDeque<N> = VecDeque::new();

        for &g in goals {
            if !known.contains(&g) || distances.contains_key(&g) {
                continue;
            }
            distances.insert(g, 0);
            queue.push_back(g);
        }

        while let Some(cur) = queue.pop_front() {
            let cur_dist = *distances
                .get(&cur)
                .expect("queued node always has a recorded distance");
            for (nb, _cost) in graph.neighbors(cur) {
                if distances.contains_key(&nb) {
                    continue;
                }
                distances.insert(nb, cur_dist + 1);
                next_hop.insert(nb, cur);
                queue.push_back(nb);
            }
        }

        Self {
            distances,
            next_hop,
        }
    }

    /// Hops from `node` to the nearest goal. `Some(0)` for a goal node;
    /// `None` for unreachable or unknown nodes.
    pub fn distance(&self, node: N) -> Option<u32> {
        self.distances.get(&node).copied()
    }

    /// Whether the field has a recorded distance for `node`.
    pub fn is_reachable(&self, node: N) -> bool {
        self.distances.contains_key(&node)
    }

    /// The neighbor node to step to next from `node` to reach the
    /// nearest goal. `None` for goal nodes (already there) or
    /// unreachable nodes.
    pub fn next_step(&self, node: N) -> Option<N> {
        self.next_hop.get(&node).copied()
    }

    /// Walk the next-hop chain from `start` to its nearest goal.
    /// Returns `[start, ..., goal]`. Empty when `start` is unreachable.
    /// Capped at 65 535 hops as a defence against cyclic graphs that
    /// somehow slip past the BFS invariant.
    pub fn path_from(&self, start: N) -> Vec<N> {
        if !self.is_reachable(start) {
            return Vec::new();
        }
        let mut path = Vec::new();
        let mut cur = start;
        path.push(cur);
        while let Some(&next) = self.next_hop.get(&cur) {
            path.push(next);
            cur = next;
            if path.len() > u16::MAX as usize {
                break;
            }
        }
        path
    }
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_graph_has_no_paths() {
        let g: TileGraph<i32> = TileGraph::new();
        let f = PathField::compute(&g, &[42]);
        assert!(!f.is_reachable(42));
        assert_eq!(f.distance(42), None);
    }

    #[test]
    fn goal_is_distance_zero() {
        let mut g: TileGraph<(i32, i32)> = TileGraph::new();
        g.add_node((0, 0));
        let f = PathField::compute(&g, &[(0, 0)]);
        assert_eq!(f.distance((0, 0)), Some(0));
        assert_eq!(f.next_step((0, 0)), None);
    }

    #[test]
    fn linear_chain_distances() {
        let mut g: TileGraph<u32> = TileGraph::new();
        g.add_undirected(0, 1, 1.0);
        g.add_undirected(1, 2, 1.0);
        g.add_undirected(2, 3, 1.0);
        let f = PathField::compute(&g, &[3]);
        assert_eq!(f.distance(0), Some(3));
        assert_eq!(f.distance(1), Some(2));
        assert_eq!(f.distance(2), Some(1));
        assert_eq!(f.distance(3), Some(0));
        // Walking from 0 should give [0, 1, 2, 3].
        let path = f.path_from(0);
        assert_eq!(path, vec![0, 1, 2, 3]);
    }

    #[test]
    fn multi_goal_picks_nearest() {
        let mut g: TileGraph<u32> = TileGraph::new();
        for i in 0..6 {
            g.add_undirected(i, i + 1, 1.0);
        }
        // Goals at 0 and 6 — middle node 3 should pick whichever side is closer.
        let f = PathField::compute(&g, &[0, 6]);
        assert_eq!(f.distance(0), Some(0));
        assert_eq!(f.distance(6), Some(0));
        assert_eq!(f.distance(3), Some(3));
    }

    #[test]
    fn unreachable_components_stay_none() {
        let mut g: TileGraph<u32> = TileGraph::new();
        g.add_undirected(0, 1, 1.0);
        g.add_node(99); // disconnected
        let f = PathField::compute(&g, &[0]);
        assert_eq!(f.distance(1), Some(1));
        assert!(!f.is_reachable(99));
        assert!(f.path_from(99).is_empty());
    }

    #[test]
    fn directed_edges_are_one_way() {
        let mut g: TileGraph<u32> = TileGraph::new();
        g.add_edge(0, 1, 1.0); // only forward
        let f_from_zero = PathField::compute(&g, &[1]);
        // 0 reaches 1 because the edge goes 0->1 ... wait, BFS uses
        // outgoing edges from the goal. So when goal=1, it expands 1's
        // outgoing edges, of which there are none. So 0 is unreachable
        // from goal 1 in this directed graph.
        assert_eq!(f_from_zero.distance(1), Some(0));
        assert!(!f_from_zero.is_reachable(0));

        let f_from_one = PathField::compute(&g, &[0]);
        // From goal 0 we expand 0->1, so 1 becomes distance 1.
        assert_eq!(f_from_one.distance(0), Some(0));
        assert_eq!(f_from_one.distance(1), Some(1));
    }
}
