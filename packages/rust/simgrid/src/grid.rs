use std::collections::{HashSet, VecDeque};

use bevy::prelude::{Component, Resource};
use serde::Deserialize;

use crate::proto::{Facing, Tile};

/// Dungeon floor (z-axis). Default 0 = ground floor. Single-floor games never
/// add this component and behave as if every entity is on floor 0; multi-floor
/// games (ARPG) attach it and move it via stairs.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Floor(pub i32);

/// Step-off grace for stairs: the tile a player just arrived on via a stair.
/// `stair_system` won't re-trigger while the player still stands here, so a
/// descent that lands on the destination floor's reciprocal stair doesn't
/// instantly bounce back (z+1 -> z-1 -> ...). Cleared once they move off it.
#[derive(Component, Clone, Copy)]
pub struct StairGrace(pub Tile);

const TILED_GID_FLAGS_MASK: u32 = 0x1FFF_FFFF;
const TILED_COLLIDE_PROP: &str = "ge_collide";

#[derive(Deserialize)]
struct TiledMap {
    width: i32,
    height: i32,
    #[serde(default)]
    layers: Vec<TiledLayer>,
    #[serde(default)]
    tilesets: Vec<TiledTileset>,
}

#[derive(Deserialize)]
struct TiledLayer {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    data: Vec<u32>,
}

#[derive(Deserialize)]
struct TiledTileset {
    firstgid: u32,
    #[serde(default)]
    tiles: Vec<TiledTile>,
}

#[derive(Deserialize)]
struct TiledTile {
    id: u32,
    #[serde(default)]
    properties: Vec<TiledProp>,
}

#[derive(Deserialize)]
struct TiledProp {
    name: String,
    #[serde(default)]
    value: serde_json::Value,
}

#[derive(Deserialize)]
struct GridTilemapJson {
    width: i32,
    height: i32,
    #[serde(default)]
    blocked: Vec<bool>,
}

/// How a [`WalkableMap`] answers collision. A finite `Bitset` (Tiled / mapdb /
/// bounded dungeon) or an infinite `Dungeon` computed on demand from a seed —
/// the ARPG endless world stores nothing, so only tiles entities actually visit
/// are ever evaluated.
#[derive(Clone)]
enum Collision {
    Bitset(Vec<bool>),
    Dungeon { seed: u32 },
}

#[derive(Resource, Clone)]
pub struct WalkableMap {
    pub width: i32,
    pub height: i32,
    collision: Collision,
    /// Dynamically blocked tiles, keyed by `(floor_z, tile)`. Placed env objects
    /// (campfires, walls) occupy a tile without touching the seed-derived layout,
    /// so the endless dungeon stays stateless except for what players build.
    blocked: HashSet<(i32, Tile)>,
}

impl WalkableMap {
    pub fn open(width: i32, height: i32) -> Self {
        let w = width.max(1);
        let h = height.max(1);
        Self {
            width: w,
            height: h,
            collision: Collision::Bitset(vec![false; (w * h) as usize]),
            blocked: HashSet::new(),
        }
    }

    /// An endless ARPG dungeon: collision is the pure `arpg_dungeon::is_floor`
    /// function of the seed, so the map is unbounded and costs no memory. The
    /// `width`/`height` only bound `find_path`'s BFS window (path search needs a
    /// frontier cap); movement itself has no edges. The client reproduces the
    /// identical layout from the same seed.
    pub fn arpg_dungeon(seed: u32, path_window: i32) -> Self {
        let w = path_window.max(1);
        Self {
            width: w,
            height: w,
            collision: Collision::Dungeon { seed },
            blocked: HashSet::new(),
        }
    }

    pub fn from_blocked(width: i32, height: i32, blocked: Vec<bool>) -> Self {
        let w = width.max(1);
        let h = height.max(1);
        let mut cells = blocked;
        cells.resize((w * h) as usize, false);
        Self {
            width: w,
            height: h,
            collision: Collision::Bitset(cells),
            blocked: HashSet::new(),
        }
    }

    fn is_dungeon(&self) -> bool {
        matches!(self.collision, Collision::Dungeon { .. })
    }

    /// Load from a mapdb GridTilemap JSON (proto-canonical). The collision
    /// is the precomputed `blocked` bitset — no Tiled/tileset parsing.
    pub fn from_grid_tilemap_json(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        let tm: GridTilemapJson = serde_json::from_slice(bytes)?;
        Ok(Self::from_blocked(tm.width, tm.height, tm.blocked))
    }

    /// Build a walkable map from a procedural dungeon seed. The client
    /// reproduces the identical layout from the same seed (see
    /// dungeon.ts), so only the seed needs to cross the wire.
    pub fn from_dungeon(seed: u32, width: i32, height: i32) -> Self {
        let d = crate::dungeon::generate(seed, width, height);
        Self::from_blocked(d.width, d.height, d.blocked)
    }

    pub fn from_tiled_json(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        let map: TiledMap = serde_json::from_slice(bytes)?;
        let w = map.width.max(1);
        let h = map.height.max(1);

        let mut collide_gids: HashSet<u32> = HashSet::new();
        for ts in &map.tilesets {
            for t in &ts.tiles {
                let collides = t
                    .properties
                    .iter()
                    .any(|p| p.name == TILED_COLLIDE_PROP && p.value.as_bool() == Some(true));
                if collides {
                    collide_gids.insert(ts.firstgid + t.id);
                }
            }
        }

        let mut blocked = vec![false; (w * h) as usize];
        for layer in &map.layers {
            if layer.kind != "tilelayer" {
                continue;
            }
            for (i, &raw) in layer.data.iter().enumerate() {
                if i >= blocked.len() {
                    break;
                }
                let gid = raw & TILED_GID_FLAGS_MASK;
                if gid != 0 && collide_gids.contains(&gid) {
                    blocked[i] = true;
                }
            }
        }

        Ok(Self::from_blocked(w, h, blocked))
    }

    pub fn in_bounds(&self, tile: Tile) -> bool {
        // An endless dungeon has no edges — every tile is "in bounds"; only the
        // floor/wall test (is_walkable) gates movement.
        if self.is_dungeon() {
            return true;
        }
        tile.x >= 0 && tile.y >= 0 && tile.x < self.width && tile.y < self.height
    }

    fn index(&self, tile: Tile) -> Option<usize> {
        match &self.collision {
            Collision::Bitset(_) if self.in_bounds(tile) => {
                Some((tile.y * self.width + tile.x) as usize)
            }
            _ => None,
        }
    }

    pub fn set_blocked(&mut self, tile: Tile, value: bool) {
        if let Collision::Bitset(cells) = &mut self.collision
            && tile.x >= 0
            && tile.y >= 0
            && tile.x < self.width
            && tile.y < self.height
        {
            cells[(tile.y * self.width + tile.x) as usize] = value;
        }
    }

    /// Mark a tile on floor `z` impassable (placed env object). Checked by every
    /// collision query via `is_walkable_z`, so movement and pathfinding both
    /// route around it without touching the seed-derived layout.
    pub fn block_tile_z(&mut self, z: i32, tile: Tile) {
        self.blocked.insert((z, tile));
    }

    pub fn unblock_tile_z(&mut self, z: i32, tile: Tile) {
        self.blocked.remove(&(z, tile));
    }

    /// Ground-floor convenience for single-floor callers.
    pub fn block_tile(&mut self, tile: Tile) {
        self.block_tile_z(0, tile);
    }

    pub fn unblock_tile(&mut self, tile: Tile) {
        self.unblock_tile_z(0, tile);
    }

    /// Walkability on the ground floor (z = 0). Single-floor games call this.
    pub fn is_walkable(&self, tile: Tile) -> bool {
        self.is_walkable_z(0, tile)
    }

    /// Walkability on dungeon floor `z`. A bitset map is one fixed floor and
    /// ignores `z`; the endless dungeon derives the per-floor layout from `z`.
    pub fn is_walkable_z(&self, z: i32, tile: Tile) -> bool {
        if self.blocked.contains(&(z, tile)) {
            return false;
        }
        match &self.collision {
            Collision::Bitset(cells) => self.index(tile).map(|i| !cells[i]).unwrap_or(false),
            Collision::Dungeon { seed } => crate::arpg_dungeon::is_floor(*seed, z, tile.x, tile.y),
        }
    }

    pub fn find_path(&self, from: Tile, to: Tile, max_len: usize) -> Option<Vec<Tile>> {
        self.find_path_z(0, from, to, max_len)
    }

    /// Path on dungeon floor `z` (stairs aside, a path never leaves its floor).
    pub fn find_path_z(&self, z: i32, from: Tile, to: Tile, max_len: usize) -> Option<Vec<Tile>> {
        if from == to || !self.is_walkable_z(z, to) || !self.is_walkable_z(z, from) {
            return None;
        }
        match &self.collision {
            Collision::Bitset(_) => self.find_path_bitset(from, to, max_len),
            Collision::Dungeon { .. } => self.find_path_open(z, from, to, max_len),
        }
    }

    /// BFS over the finite bitset (indexable grid, prev[] keyed by cell index).
    fn find_path_bitset(&self, from: Tile, to: Tile, max_len: usize) -> Option<Vec<Tile>> {
        let start = self.index(from)?;
        let goal = self.index(to)?;
        let Collision::Bitset(cells) = &self.collision else {
            return None;
        };

        let mut prev: Vec<i32> = vec![-1; (self.width * self.height) as usize];
        prev[start] = start as i32;
        let mut queue = VecDeque::from([start]);

        'search: while let Some(cur) = queue.pop_front() {
            let cx = cur as i32 % self.width;
            let cy = cur as i32 / self.width;
            for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)] {
                let next = Tile::new(cx + dx, cy + dy);
                let Some(ni) = self.index(next) else { continue };
                if prev[ni] >= 0 || cells[ni] {
                    continue;
                }
                prev[ni] = cur as i32;
                if ni == goal {
                    break 'search;
                }
                queue.push_back(ni);
            }
        }

        if prev[goal] < 0 {
            return None;
        }
        let mut path = Vec::new();
        let mut cur = goal;
        while cur != start {
            path.push(Tile::new(cur as i32 % self.width, cur as i32 / self.width));
            cur = prev[cur] as usize;
            if path.len() > max_len {
                return None;
            }
        }
        path.reverse();
        Some(path)
    }

    /// BFS over the open/infinite dungeon: no global index, so the frontier is
    /// bounded by `max_len` steps and a chebyshev window around the endpoints
    /// (a sane cap on an unbounded grid). `prev` is a coord map, not a flat
    /// array. Endpoints proven walkable by the caller.
    fn find_path_open(&self, z: i32, from: Tile, to: Tile, max_len: usize) -> Option<Vec<Tile>> {
        use std::collections::HashMap;

        // Search a box around the two endpoints with a margin so the route can
        // bow out around a wall without escaping to infinity.
        let margin = (self.width / 2).max(8);
        let min_x = from.x.min(to.x) - margin;
        let max_x = from.x.max(to.x) + margin;
        let min_y = from.y.min(to.y) - margin;
        let max_y = from.y.max(to.y) + margin;
        let in_window = |t: Tile| t.x >= min_x && t.x <= max_x && t.y >= min_y && t.y <= max_y;

        let mut prev: HashMap<(i32, i32), (i32, i32)> = HashMap::new();
        prev.insert((from.x, from.y), (from.x, from.y));
        let mut queue = VecDeque::from([from]);
        let mut found = false;

        'search: while let Some(cur) = queue.pop_front() {
            for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)] {
                let next = Tile::new(cur.x + dx, cur.y + dy);
                if !in_window(next) || prev.contains_key(&(next.x, next.y)) {
                    continue;
                }
                if !self.is_walkable_z(z, next) {
                    continue;
                }
                prev.insert((next.x, next.y), (cur.x, cur.y));
                if next == to {
                    found = true;
                    break 'search;
                }
                queue.push_back(next);
            }
        }

        if !found {
            return None;
        }
        let mut path = Vec::new();
        let mut cur = (to.x, to.y);
        while cur != (from.x, from.y) {
            path.push(Tile::new(cur.0, cur.1));
            cur = *prev.get(&cur)?;
            if path.len() > max_len {
                return None;
            }
        }
        path.reverse();
        Some(path)
    }
}

/// One stair: stepping onto `(z, tile)` moves the entity to `(dest_z,
/// dest_tile)`. An optional `lock` names a key item the player must hold to use
/// it — absent = open.
#[derive(Clone, Debug)]
pub struct StairLink {
    pub z: i32,
    pub tile: Tile,
    pub dest_z: i32,
    pub dest_tile: Tile,
    pub lock: Option<String>,
}

/// How a world resolves the stair (if any) under a tile. `Explicit` is a fixed
/// list (cryptothrone hand-places); `Dungeon` derives the two seed-driven stairs
/// per floor on demand for the endless ARPG. Inserted as a Bevy resource; absent
/// = no stairs (single-floor default).
#[derive(Resource, Clone)]
pub enum Stairs {
    Explicit(Vec<StairLink>),
    Dungeon {
        seed: u32,
        /// Key item ref required to descend (None = open). Ascending is free.
        descend_key: Option<String>,
    },
}

impl Stairs {
    /// The stair under `(z, tile)`, if any. Pure for the Dungeon variant.
    pub fn at(&self, z: i32, tile: Tile) -> Option<StairLink> {
        match self {
            Stairs::Explicit(links) => links.iter().find(|l| l.z == z && l.tile == tile).cloned(),
            Stairs::Dungeon { seed, descend_key } => {
                use crate::arpg_dungeon::{StairKind, stair_dest, stair_tile};
                let (dx, dy) = stair_tile(*seed, z, StairKind::Down);
                if tile == Tile::new(dx, dy) {
                    let (dest_z, (tx, ty)) = stair_dest(*seed, z, StairKind::Down);
                    return Some(StairLink {
                        z,
                        tile,
                        dest_z,
                        dest_tile: Tile::new(tx, ty),
                        lock: descend_key.clone(),
                    });
                }
                let (ux, uy) = stair_tile(*seed, z, StairKind::Up);
                if tile == Tile::new(ux, uy) {
                    let (dest_z, (tx, ty)) = stair_dest(*seed, z, StairKind::Up);
                    // Surface cap: z=0 is the top of the world for now (no cities /
                    // above-ground floors built yet), so ascending past it leads
                    // nowhere — the up-stair on the surface is a dead end. Only
                    // allow Up while still underground (dest stays <= 0).
                    if dest_z <= 0 {
                        return Some(StairLink {
                            z,
                            tile,
                            dest_z,
                            dest_tile: Tile::new(tx, ty),
                            lock: None, // ascending is always free
                        });
                    }
                }
                None
            }
        }
    }
}

#[derive(Component, Clone, Copy)]
pub struct GridPos {
    pub tile: Tile,
    pub facing: Facing,
}

impl GridPos {
    pub fn at(tile: Tile) -> Self {
        Self {
            tile,
            facing: Facing::Down,
        }
    }
}

#[derive(Component, Clone, Copy, Default)]
pub struct MoveTarget {
    pub target: Option<Tile>,
    pub progress: u8,
}

#[derive(Component, Clone, Copy)]
pub struct FloatMove {
    pub body: crate::float_move::FloatBody,
    pub intent_x: i8,
    pub intent_y: i8,
    pub run: bool,
    pub last_seq: u32,
    pub acked_seq: u32,
}

impl FloatMove {
    pub fn at(tile: Tile) -> Self {
        Self {
            body: crate::float_move::FloatBody::at(tile.x as f32, tile.y as f32),
            intent_x: 0,
            intent_y: 0,
            run: false,
            last_seq: 0,
            acked_seq: 0,
        }
    }
}

#[derive(Component, Clone, Copy)]
pub struct MoveSpeed {
    pub ticks_per_tile: u8,
}

impl Default for MoveSpeed {
    fn default() -> Self {
        Self { ticks_per_tile: 4 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dungeon_map_is_endless_and_negative_safe() {
        let m = WalkableMap::arpg_dungeon(0x5eed1, 96);
        // Every tile "in bounds" (no edges); a room center is walkable; negative
        // coords resolve fine.
        assert!(m.in_bounds(Tile::new(-500, 9999)));
        let g = crate::arpg_dungeon::chunk_gate(0x5eed1, 0, 0, 0);
        assert!(m.is_walkable(Tile::new(g.0, g.1)));
        // Different floors give different walkability at the same tile (probabil-
        // istically — assert the floor-0 ground center is floor on z0).
        assert!(m.is_walkable_z(0, Tile::new(g.0, g.1)));
    }

    #[test]
    fn explicit_stair_resolves_and_locks() {
        let stairs = Stairs::Explicit(vec![StairLink {
            z: 0,
            tile: Tile::new(3, 3),
            dest_z: 1,
            dest_tile: Tile::new(7, 7),
            lock: Some("dungeon-key".into()),
        }]);
        let hit = stairs.at(0, Tile::new(3, 3)).expect("stair present");
        assert_eq!(hit.dest_z, 1);
        assert_eq!(hit.dest_tile, Tile::new(7, 7));
        assert_eq!(hit.lock.as_deref(), Some("dungeon-key"));
        assert!(stairs.at(0, Tile::new(0, 0)).is_none());
        assert!(stairs.at(1, Tile::new(3, 3)).is_none(), "wrong floor");
    }

    #[test]
    fn dungeon_stairs_resolve_both_directions() {
        use crate::arpg_dungeon::{StairKind, stair_tile};
        let seed = 0x5eed1;
        let stairs = Stairs::Dungeon {
            seed,
            descend_key: Some("dungeon-key".into()),
        };
        // Descend from the surface (z=0) goes underground to z-1, key-gated.
        let down = stair_tile(seed, 0, StairKind::Down);
        let d = stairs.at(0, Tile::new(down.0, down.1)).expect("down stair");
        assert_eq!(d.dest_z, -1);
        assert_eq!(d.lock.as_deref(), Some("dungeon-key"), "descend is locked");

        // Ascend from underground (z=-1) returns to the surface, free.
        let up = stair_tile(seed, -1, StairKind::Up);
        let u = stairs.at(-1, Tile::new(up.0, up.1)).expect("up stair");
        assert_eq!(u.dest_z, 0);
        assert!(u.lock.is_none(), "ascend is free");

        // The surface up-stair leads to z>0, which isn't built yet — dead end.
        let up0 = stair_tile(seed, 0, StairKind::Up);
        assert!(
            stairs.at(0, Tile::new(up0.0, up0.1)).is_none(),
            "surface up-stair caps at z=0 (no cities/above-ground yet)"
        );
    }

    #[test]
    fn tiled_collision_parsed() {
        let json = r#"{"width":2,"height":1,
            "layers":[{"type":"tilelayer","data":[1,2]}],
            "tilesets":[{"firstgid":1,"tiles":[
                {"id":0,"properties":[{"name":"ge_collide","value":true}]}
            ]}]}"#;
        let m = WalkableMap::from_tiled_json(json.as_bytes()).expect("parse");
        assert_eq!((m.width, m.height), (2, 1));
        assert!(!m.is_walkable(Tile::new(0, 0)));
        assert!(m.is_walkable(Tile::new(1, 0)));
    }

    #[test]
    fn grid_tilemap_json_collision() {
        let json = r#"{"width":2,"height":2,"blocked":[false,true,false,false]}"#;
        let m = WalkableMap::from_grid_tilemap_json(json.as_bytes()).expect("parse");
        assert_eq!((m.width, m.height), (2, 2));
        assert!(m.is_walkable(Tile::new(0, 0)));
        assert!(!m.is_walkable(Tile::new(1, 0)));
        assert!(m.is_walkable(Tile::new(0, 1)));
    }

    #[test]
    fn find_path_routes_around_walls() {
        let mut m = WalkableMap::open(5, 5);
        m.set_blocked(Tile::new(2, 0), true);
        m.set_blocked(Tile::new(2, 1), true);
        m.set_blocked(Tile::new(2, 2), true);
        m.set_blocked(Tile::new(2, 3), true);
        let path = m
            .find_path(Tile::new(0, 0), Tile::new(4, 0), 64)
            .expect("path exists");
        assert_eq!(path.last(), Some(&Tile::new(4, 0)));
        assert!(path.iter().all(|t| m.is_walkable(*t)));
        assert!(path.len() >= 8, "must route around the wall");
        for pair in path.windows(2) {
            assert_eq!(pair[0].manhattan(pair[1]), 1, "path must be contiguous");
        }
    }

    #[test]
    fn find_path_rejects_unreachable() {
        let mut m = WalkableMap::open(3, 3);
        for y in 0..3 {
            m.set_blocked(Tile::new(1, y), true);
        }
        assert!(m.find_path(Tile::new(0, 0), Tile::new(2, 0), 64).is_none());
    }

    #[test]
    fn dynamic_block_tile_overlay() {
        let mut m = WalkableMap::open(5, 5);
        let t = Tile::new(2, 2);
        assert!(m.is_walkable_z(0, t));
        m.block_tile_z(0, t);
        assert!(!m.is_walkable_z(0, t), "blocked tile impassable");
        assert!(m.is_walkable_z(1, t), "overlay is per-floor");
        assert!(m.is_walkable_z(0, Tile::new(2, 1)), "neighbor unaffected");
        m.unblock_tile_z(0, t);
        assert!(m.is_walkable_z(0, t), "unblock restores");
    }

    #[test]
    fn tiled_flip_flags_masked() {
        let blocked_gid: u32 = 1 | 0x8000_0000;
        let json = format!(
            r#"{{"width":1,"height":1,"layers":[{{"type":"tilelayer","data":[{blocked_gid}]}}],
            "tilesets":[{{"firstgid":1,"tiles":[{{"id":0,"properties":[{{"name":"ge_collide","value":true}}]}}]}}]}}"#
        );
        let m = WalkableMap::from_tiled_json(json.as_bytes()).expect("parse");
        assert!(!m.is_walkable(Tile::new(0, 0)));
    }
}
