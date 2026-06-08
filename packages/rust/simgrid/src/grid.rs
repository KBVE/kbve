use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::prelude::{Component, Resource};

use crate::proto::{Facing, Tile};

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
