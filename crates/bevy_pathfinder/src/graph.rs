//! Generic graph trait shared by both the dense [`BlockGrid`] world and
//! sparse [`TileGraph`] adjacency lists.
//!
//! [`BlockGrid`]: crate::grid::BlockGrid
//! [`TileGraph`]: crate::tile_graph::TileGraph

use std::hash::Hash;

/// Minimal directed-graph abstraction used by the generic
/// [`PathField`](crate::tile_graph::PathField) BFS.
///
/// An implementor describes a finite set of nodes and, for each node,
/// the set of nodes reachable in one step along with the cost of each
/// edge. Implementors are free to store nodes/edges however they like
/// (adjacency list, on-the-fly grid neighbors, etc.).
///
/// Nodes must be cheaply copyable, equatable, and hashable so they can
/// flow through `HashMap`-backed BFS state without further bookkeeping.
pub trait NavGraph {
    /// Identifier for a single node. Typical implementors use small
    /// blittable types — `(i32, i32)`, packed coords, ULID-style ids.
    type Node: Copy + Eq + Hash;

    /// Every node currently present in the graph. Order is
    /// implementation-defined; callers must not rely on it.
    fn nodes(&self) -> Vec<Self::Node>;

    /// Outgoing edges from `node` as `(neighbor, cost)` pairs. Returns
    /// an empty vector when `node` is not present in the graph.
    fn neighbors(&self, node: Self::Node) -> Vec<(Self::Node, f32)>;
}
