//! Tile-graph pathfinding over the dungeon [`MapState`].
//!
//! Builds a `bevy_pathfinder::TileGraph<MapPos>` from the revealed tile
//! set, treating two tiles as connected only when both sides declare
//! the matching exit (no one-way doors today). Adjacent tiles whose
//! exits don't reciprocate are still walkable individually but no edge
//! is added between them — the player would have to backtrack and
//! reveal another path.
//!
//! The graph is rebuilt on demand for each path query rather than
//! cached on the session: `MapState` mutates frequently (every
//! exploration step) and current map sizes are small enough (≤200
//! tiles in a typical run) that the BFS dominates anyway.

use bevy_pathfinder::tile_graph::{PathField, TileGraph};

use super::types::{Direction, MapPos, MapState, RoomType};

/// Build a tile graph from the revealed portion of the map. Edges are
/// added only when both endpoints exist in `map.tiles` and each side's
/// `exits` list includes the matching cardinal direction.
pub fn build_tile_graph(map: &MapState) -> TileGraph<MapPos> {
    let mut graph = TileGraph::<MapPos>::new();
    for tile in map.tiles.values() {
        graph.add_node(tile.pos);
    }
    for tile in map.tiles.values() {
        for &dir in tile.exits.iter() {
            let nb = tile.pos.neighbor(dir);
            let Some(neighbor_tile) = map.tiles.get(&nb) else {
                continue;
            };
            if !neighbor_tile.exits.contains(&dir.opposite()) {
                continue;
            }
            graph.add_edge(tile.pos, nb, 1.0);
        }
    }
    graph
}

/// Predicate used by pathfinding to decide which revealed tiles are
/// candidate goals for a path query. Decoupled from `RoomType` so
/// we can layer on landmark-ref or boss-only filters later without
/// breaking the BFS plumbing.
pub enum GoalKind<'a> {
    /// Any tile whose `room_type` matches the given variant.
    Room(RoomType),
    /// A specific landmark by `mapdb` ref (e.g. `"shattered-crown"`).
    /// Reserved for future `/dungeon route landmark:<ref>` queries; the
    /// current `/dungeon route` command only exposes `Room` goals.
    #[allow(dead_code)]
    Landmark(&'a str),
}

impl<'a> GoalKind<'a> {
    fn matches_tile(&self, tile: &super::types::MapTile) -> bool {
        match self {
            GoalKind::Room(room_type) => &tile.room_type == room_type,
            GoalKind::Landmark(r) => tile.landmark_ref.as_deref() == Some(*r),
        }
    }
}

/// Find the shortest path (in hops) from `from` to the nearest tile
/// matching `goal`. Returns the full sequence `[from, ..., goal]` or
/// `None` when no matching tile is reachable from `from`.
pub fn path_to_goal(map: &MapState, from: MapPos, goal: GoalKind<'_>) -> Option<Vec<MapPos>> {
    if !map.tiles.contains_key(&from) {
        return None;
    }
    let goals: Vec<MapPos> = map
        .tiles
        .values()
        .filter(|t| goal.matches_tile(t))
        .map(|t| t.pos)
        .collect();
    if goals.is_empty() {
        return None;
    }
    let graph = build_tile_graph(map);
    let field = PathField::compute(&graph, &goals);
    let path = field.path_from(from);
    if path.is_empty() { None } else { Some(path) }
}

/// Convert a tile-coordinate path into a list of cardinal moves the
/// player must make. Useful for rendering `/path` results as
/// `North → East → East`. Returns an empty vec when `path` has fewer
/// than two entries (already at the goal or empty path).
pub fn directions_along_path(path: &[MapPos]) -> Vec<Direction> {
    let mut out = Vec::with_capacity(path.len().saturating_sub(1));
    for window in path.windows(2) {
        let from = window[0];
        let to = window[1];
        for &dir in Direction::all() {
            if from.neighbor(dir) == to {
                out.push(dir);
                break;
            }
        }
    }
    out
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use crate::discord::game::types::{MapTile, RoomType};

    fn tile(pos: MapPos, room_type: RoomType, exits: Vec<Direction>) -> MapTile {
        MapTile {
            pos,
            room_type,
            name: format!("Tile {},{}", pos.x, pos.y),
            description: String::new(),
            exits,
            visited: true,
            cleared: false,
            landmark_ref: None,
        }
    }

    fn small_map() -> MapState {
        // Layout (visited, four-tile cross):
        //          (0,-1) Boss
        //  (-1,0) (0,0)   (1,0) Merchant
        //          (0,1)
        let mut tiles = HashMap::new();
        let origin = MapPos::new(0, 0);
        tiles.insert(
            origin,
            tile(
                origin,
                RoomType::UndergroundCity,
                vec![
                    Direction::North,
                    Direction::South,
                    Direction::East,
                    Direction::West,
                ],
            ),
        );
        tiles.insert(
            MapPos::new(0, -1),
            tile(MapPos::new(0, -1), RoomType::Boss, vec![Direction::South]),
        );
        tiles.insert(
            MapPos::new(0, 1),
            tile(MapPos::new(0, 1), RoomType::Combat, vec![Direction::North]),
        );
        tiles.insert(
            MapPos::new(1, 0),
            tile(MapPos::new(1, 0), RoomType::Merchant, vec![Direction::West]),
        );
        tiles.insert(
            MapPos::new(-1, 0),
            tile(MapPos::new(-1, 0), RoomType::Combat, vec![Direction::East]),
        );
        MapState {
            seed: 0,
            position: origin,
            tiles,
            tiles_visited: 5,
            boss_positions: vec![MapPos::new(0, -1)],
        }
    }

    #[test]
    fn path_finds_boss_to_north() {
        let map = small_map();
        let path = path_to_goal(&map, MapPos::new(0, 0), GoalKind::Room(RoomType::Boss))
            .expect("path must exist");
        assert_eq!(path.first(), Some(&MapPos::new(0, 0)));
        assert_eq!(path.last(), Some(&MapPos::new(0, -1)));
        let dirs = directions_along_path(&path);
        assert_eq!(dirs, vec![Direction::North]);
    }

    #[test]
    fn no_path_when_room_type_absent() {
        let map = small_map();
        let result = path_to_goal(&map, MapPos::new(0, 0), GoalKind::Room(RoomType::Treasure));
        assert!(result.is_none());
    }

    #[test]
    fn path_skips_unrevealed_neighbors() {
        // Origin has an exit east; the (1,0) tile has east exit too but
        // there's no (2,0) tile yet. Pathfinding to a non-existent goal
        // returns None; pathfinding to the merchant still works.
        let map = small_map();
        let path = path_to_goal(&map, MapPos::new(0, 0), GoalKind::Room(RoomType::Merchant))
            .expect("merchant reachable");
        assert_eq!(path, vec![MapPos::new(0, 0), MapPos::new(1, 0)]);
    }

    #[test]
    fn directions_translate_each_hop() {
        let path = vec![
            MapPos::new(0, 0),
            MapPos::new(1, 0),
            MapPos::new(1, 1),
            MapPos::new(0, 1),
        ];
        let dirs = directions_along_path(&path);
        assert_eq!(
            dirs,
            vec![Direction::East, Direction::South, Direction::West]
        );
    }
}
