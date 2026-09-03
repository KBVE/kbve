use bevy::prelude::*;

pub const TILE_SIZE: f32 = 1.0;

#[derive(Component, Copy, Clone, Eq, PartialEq, Hash, Debug)]
pub struct GridPos {
    pub x: i32,
    pub z: i32,
}

impl GridPos {
    pub const fn new(x: i32, z: i32) -> Self {
        Self { x, z }
    }

    pub fn center(self) -> Vec3 {
        Vec3::new(
            self.x as f32 * TILE_SIZE + TILE_SIZE * 0.5,
            0.0,
            self.z as f32 * TILE_SIZE + TILE_SIZE * 0.5,
        )
    }

    pub fn from_world(world: Vec3) -> Self {
        Self {
            x: (world.x / TILE_SIZE).floor() as i32,
            z: (world.z / TILE_SIZE).floor() as i32,
        }
    }

    pub fn neighbors(self) -> [Self; 4] {
        [
            Self::new(self.x + 1, self.z),
            Self::new(self.x - 1, self.z),
            Self::new(self.x, self.z + 1),
            Self::new(self.x, self.z - 1),
        ]
    }
}

#[derive(Copy, Clone, Eq, PartialEq, Debug, Default)]
pub enum Terrain {
    #[default]
    Grass,
    Dirt,
    Stone,
    Water,
}

impl Terrain {
    pub fn walkable(self) -> bool {
        !matches!(self, Terrain::Water | Terrain::Stone)
    }

    pub fn color(self) -> Color {
        match self {
            Terrain::Grass => Color::srgb(0.35, 0.55, 0.28),
            Terrain::Dirt => Color::srgb(0.45, 0.35, 0.24),
            Terrain::Stone => Color::srgb(0.48, 0.48, 0.52),
            Terrain::Water => Color::srgb(0.20, 0.36, 0.58),
        }
    }
}

#[derive(Resource, Clone, Debug)]
pub struct ColonyGrid {
    pub width: i32,
    pub depth: i32,
    tiles: Vec<Terrain>,
}

impl ColonyGrid {
    pub fn new(width: i32, depth: i32) -> Self {
        Self {
            width,
            depth,
            tiles: vec![Terrain::Grass; (width * depth) as usize],
        }
    }

    pub fn contains(&self, pos: GridPos) -> bool {
        pos.x >= 0 && pos.z >= 0 && pos.x < self.width && pos.z < self.depth
    }

    fn index(&self, pos: GridPos) -> Option<usize> {
        self.contains(pos)
            .then(|| (pos.z * self.width + pos.x) as usize)
    }

    pub fn terrain(&self, pos: GridPos) -> Terrain {
        self.index(pos)
            .map(|i| self.tiles[i])
            .unwrap_or(Terrain::Water)
    }

    pub fn set_terrain(&mut self, pos: GridPos, terrain: Terrain) {
        if let Some(i) = self.index(pos) {
            self.tiles[i] = terrain;
        }
    }

    pub fn walkable(&self, pos: GridPos) -> bool {
        self.terrain(pos).walkable()
    }

    pub fn positions(&self) -> impl Iterator<Item = GridPos> + '_ {
        (0..self.depth).flat_map(move |z| (0..self.width).map(move |x| GridPos::new(x, z)))
    }

    pub fn world_size(&self) -> Vec2 {
        Vec2::new(self.width as f32, self.depth as f32) * TILE_SIZE
    }
}

impl Default for ColonyGrid {
    fn default() -> Self {
        Self::new(48, 48)
    }
}
