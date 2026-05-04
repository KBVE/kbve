//! Layer 1: BlockGrid — 2D walkability grid from Minecraft block data.
//!
//! The Java side scans a region around each player and sends a flattened
//! heightmap + walkability snapshot. The grid stores one [`CellNav`] per
//! (x, z) tile in the region, ignoring the full 3D column — ground-based
//! mobs only care about the surface they walk on.
//!
//! Coordinates are absolute Minecraft block coords (i32). The grid covers
//! a rectangular region from `(origin_x, origin_z)` to
//! `(origin_x + width - 1, origin_z + depth - 1)`.

use serde::{Deserialize, Serialize};

/// Simplified block surface classification for pathfinding cost.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum SurfaceKind {
    /// Impassable (water, lava, void, out of bounds).
    Blocked = 0,
    /// Normal solid ground (stone, dirt, grass, wood, etc.).
    Solid = 1,
    /// Slow terrain (soul sand, honey, cobweb-adjacent).
    Slow = 2,
    /// Dangerous but walkable (magma, cactus-adjacent, fire-adjacent).
    Hazard = 3,
}

impl SurfaceKind {
    /// Base traversal cost for entering a cell with this surface.
    ///
    /// # Returns
    ///
    /// `f32::MAX` for [`SurfaceKind::Blocked`] (effectively infinite),
    /// `1.0` for [`SurfaceKind::Solid`], `2.5` for [`SurfaceKind::Slow`],
    /// `4.0` for [`SurfaceKind::Hazard`].
    pub fn base_cost(self) -> f32 {
        match self {
            Self::Blocked => f32::MAX,
            Self::Solid => 1.0,
            Self::Slow => 2.5,
            Self::Hazard => 4.0,
        }
    }
}

/// Navigation data for one (x, z) cell in the grid.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct CellNav {
    /// Y coordinate of the walkable surface (feet level).
    pub height: i32,
    /// Surface classification.
    pub surface: SurfaceKind,
    /// Traversal cost (surface base cost, possibly modified by neighbors).
    pub cost: f32,
}

impl Default for CellNav {
    fn default() -> Self {
        Self {
            height: 0,
            surface: SurfaceKind::Blocked,
            cost: f32::MAX,
        }
    }
}

impl CellNav {
    /// Returns `true` if the cell's surface is anything other than
    /// [`SurfaceKind::Blocked`].
    #[inline]
    pub fn walkable(&self) -> bool {
        self.surface != SurfaceKind::Blocked
    }
}

/// 2D walkability grid covering a rectangular region of the Minecraft world.
///
/// Internally a flat `Vec<CellNav>` in row-major order (z-major):
/// index = `(z - origin_z) * width + (x - origin_x)`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Resource))]
pub struct BlockGrid {
    /// Minimum X block coordinate of the grid.
    pub origin_x: i32,
    /// Minimum Z block coordinate of the grid.
    pub origin_z: i32,
    /// Number of cells along the X axis.
    pub width: u32,
    /// Number of cells along the Z axis.
    pub depth: u32,
    /// Flat cell array, row-major (z-major).
    cells: Vec<CellNav>,
}

/// Maximum step height a mob can walk up between adjacent cells.
pub const MAX_STEP_HEIGHT: i32 = 1;

impl BlockGrid {
    /// Create an empty grid (all cells [`SurfaceKind::Blocked`]) covering
    /// the given region.
    ///
    /// # Arguments
    ///
    /// * `origin_x` — minimum X block coord of the grid (inclusive).
    /// * `origin_z` — minimum Z block coord of the grid (inclusive).
    /// * `width` — number of cells along the X axis.
    /// * `depth` — number of cells along the Z axis.
    ///
    /// # Examples
    ///
    /// ```
    /// use bevy_pathfinder::grid::BlockGrid;
    ///
    /// let grid = BlockGrid::new(0, 0, 64, 64);
    /// assert_eq!(grid.len(), 64 * 64);
    /// ```
    pub fn new(origin_x: i32, origin_z: i32, width: u32, depth: u32) -> Self {
        Self {
            origin_x,
            origin_z,
            width,
            depth,
            cells: vec![CellNav::default(); (width * depth) as usize],
        }
    }

    /// Build a grid from a flat array of cell data.
    ///
    /// # Arguments
    ///
    /// * `origin_x`, `origin_z` — minimum block coords (inclusive).
    /// * `width`, `depth` — region dimensions in cells.
    /// * `cells` — flat row-major (z-major) cell array of length
    ///   `width * depth`.
    ///
    /// # Returns
    ///
    /// `Some(grid)` on success, `None` if `cells.len() != width * depth`.
    pub fn from_cells(
        origin_x: i32,
        origin_z: i32,
        width: u32,
        depth: u32,
        cells: Vec<CellNav>,
    ) -> Option<Self> {
        if cells.len() != (width * depth) as usize {
            return None;
        }
        Some(Self {
            origin_x,
            origin_z,
            width,
            depth,
            cells,
        })
    }

    /// Convert absolute block coords to a flat cell index.
    ///
    /// # Returns
    ///
    /// `Some(idx)` if `(x, z)` is inside the grid, `None` otherwise.
    #[inline]
    fn index(&self, x: i32, z: i32) -> Option<usize> {
        let lx = x - self.origin_x;
        let lz = z - self.origin_z;
        if lx < 0 || lz < 0 || lx >= self.width as i32 || lz >= self.depth as i32 {
            return None;
        }
        Some((lz as u32 * self.width + lx as u32) as usize)
    }

    /// Get cell nav data at absolute block coords.
    ///
    /// # Returns
    ///
    /// The stored [`CellNav`] when in bounds, or [`CellNav::default()`]
    /// (a [`SurfaceKind::Blocked`] cell at height 0) when out of bounds.
    #[inline]
    pub fn get(&self, x: i32, z: i32) -> CellNav {
        self.index(x, z).map(|i| self.cells[i]).unwrap_or_default()
    }

    /// Set cell nav data at absolute block coords. No-op if out of bounds.
    #[inline]
    pub fn set(&mut self, x: i32, z: i32, cell: CellNav) {
        if let Some(i) = self.index(x, z) {
            self.cells[i] = cell;
        }
    }

    /// Returns `true` if the cell at `(x, z)` is walkable. Out-of-bounds
    /// coords return `false`.
    #[inline]
    pub fn is_walkable(&self, x: i32, z: i32) -> bool {
        self.get(x, z).walkable()
    }

    /// Traversal cost at the given cell. Returns `f32::MAX` for
    /// out-of-bounds or blocked cells.
    #[inline]
    pub fn cost(&self, x: i32, z: i32) -> f32 {
        self.get(x, z).cost
    }

    /// Return walkable 8-connected neighbors of `(x, z)` whose height
    /// delta is within [`MAX_STEP_HEIGHT`].
    ///
    /// # Returns
    ///
    /// An empty `Vec` if the center cell is itself non-walkable; up to
    /// 8 `(x, z)` pairs otherwise.
    pub fn walkable_neighbors(&self, x: i32, z: i32) -> Vec<(i32, i32)> {
        let center = self.get(x, z);
        if !center.walkable() {
            return Vec::new();
        }

        static OFFSETS: [(i32, i32); 8] = [
            (-1, -1),
            (0, -1),
            (1, -1),
            (-1, 0),
            (1, 0),
            (-1, 1),
            (0, 1),
            (1, 1),
        ];

        let mut result = Vec::with_capacity(8);
        for &(dx, dz) in &OFFSETS {
            let nx = x + dx;
            let nz = z + dz;
            let n = self.get(nx, nz);
            if n.walkable() && (n.height - center.height).abs() <= MAX_STEP_HEIGHT {
                result.push((nx, nz));
            }
        }
        result
    }

    /// Total number of cells in the grid (`width * depth`).
    #[inline]
    pub fn len(&self) -> usize {
        self.cells.len()
    }

    /// Whether the grid covers a zero-area region.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }

    /// Iterate all cells with their absolute `(x, z)` coordinates.
    pub fn iter(&self) -> impl Iterator<Item = (i32, i32, &CellNav)> {
        self.cells.iter().enumerate().map(move |(i, cell)| {
            let lx = (i as u32) % self.width;
            let lz = (i as u32) / self.width;
            (self.origin_x + lx as i32, self.origin_z + lz as i32, cell)
        })
    }

    /// Returns `true` if the given coordinate is within the grid bounds.
    #[inline]
    pub fn in_bounds(&self, x: i32, z: i32) -> bool {
        self.index(x, z).is_some()
    }
}

/// Snapshot of a rectangular region of the Minecraft world, sent from Java
/// to Rust periodically (every few seconds, not every tick).
///
/// Java scans the surface around each player and packs the walkability
/// data into this struct. Rust deserializes it and builds a [`BlockGrid`]
/// via [`MapRegionSnapshot::into_grid`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapRegionSnapshot {
    /// Minimum X block coordinate of the scanned region.
    pub origin_x: i32,
    /// Minimum Z block coordinate of the scanned region.
    pub origin_z: i32,
    /// Number of cells along the X axis.
    pub width: u32,
    /// Number of cells along the Z axis.
    pub depth: u32,
    /// Flat array of per-cell data, row-major (z-major).
    /// Each entry: `[height_y, surface_kind]` where `surface_kind` is the
    /// [`SurfaceKind`] discriminant (0 = Blocked, 1 = Solid, 2 = Slow,
    /// 3 = Hazard).
    pub cells: Vec<[i32; 2]>,
    /// Server tick at which this snapshot was taken.
    pub tick: u64,
}

impl MapRegionSnapshot {
    /// Convert this snapshot into a [`BlockGrid`].
    ///
    /// # Returns
    ///
    /// `Some(grid)` on success, `None` if `cells.len() != width * depth`.
    pub fn into_grid(self) -> Option<BlockGrid> {
        let expected = (self.width * self.depth) as usize;
        if self.cells.len() != expected {
            return None;
        }

        let cells: Vec<CellNav> = self
            .cells
            .iter()
            .map(|&[height, kind]| {
                let surface = match kind {
                    1 => SurfaceKind::Solid,
                    2 => SurfaceKind::Slow,
                    3 => SurfaceKind::Hazard,
                    _ => SurfaceKind::Blocked,
                };
                CellNav {
                    height,
                    surface,
                    cost: surface.base_cost(),
                }
            })
            .collect();

        BlockGrid::from_cells(self.origin_x, self.origin_z, self.width, self.depth, cells)
    }
}
