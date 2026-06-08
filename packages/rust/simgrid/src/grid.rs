use std::collections::{HashMap, HashSet};

use bevy::ecs::entity::Entity;
use bevy::prelude::{Component, Resource};
use serde::Deserialize;

use crate::proto::{Facing, Tile};

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

#[derive(Resource, Clone)]
pub struct WalkableMap {
    pub width: i32,
    pub height: i32,
    blocked: Vec<bool>,
}

impl WalkableMap {
    pub fn open(width: i32, height: i32) -> Self {
        let w = width.max(1);
        let h = height.max(1);
        Self {
            width: w,
            height: h,
            blocked: vec![false; (w * h) as usize],
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
            blocked: cells,
        }
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
        tile.x >= 0 && tile.y >= 0 && tile.x < self.width && tile.y < self.height
    }

    fn index(&self, tile: Tile) -> Option<usize> {
        if self.in_bounds(tile) {
            Some((tile.y * self.width + tile.x) as usize)
        } else {
            None
        }
    }

    pub fn set_blocked(&mut self, tile: Tile, value: bool) {
        if let Some(i) = self.index(tile) {
            self.blocked[i] = value;
        }
    }

    pub fn is_walkable(&self, tile: Tile) -> bool {
        self.index(tile).map(|i| !self.blocked[i]).unwrap_or(false)
    }
}

#[derive(Resource, Default)]
pub struct Occupancy {
    by_tile: HashMap<Tile, Entity>,
}

impl Occupancy {
    pub fn clear(&mut self) {
        self.by_tile.clear();
    }

    pub fn occupant(&self, tile: Tile) -> Option<Entity> {
        self.by_tile.get(&tile).copied()
    }

    pub fn is_free(&self, tile: Tile) -> bool {
        !self.by_tile.contains_key(&tile)
    }

    pub fn set(&mut self, tile: Tile, entity: Entity) {
        self.by_tile.insert(tile, entity);
    }

    pub fn remove(&mut self, tile: Tile) {
        self.by_tile.remove(&tile);
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
