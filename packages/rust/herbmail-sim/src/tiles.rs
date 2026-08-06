pub const SOLID: u8 = 1 << 0;
pub const OCCLUDES: u8 = 1 << 1;
pub const DOORWAY: u8 = 1 << 2;
pub const PILLAR: u8 = 1 << 3;
pub const PIT: u8 = 1 << 4;
pub const OPEN: u8 = 1 << 5;

pub const FLOOR: u8 = 0;
pub const WALL: u8 = SOLID | OCCLUDES;
pub const ARCH: u8 = DOORWAY;
pub const COLUMN: u8 = SOLID | PILLAR;
pub const OASIS: u8 = PIT;

/// One sector's tile grid, positioned in world tile coordinates.
#[derive(Clone, Debug)]
pub struct SectorTiles {
    pub cols: i32,
    pub rows: i32,
    pub origin_col: i32,
    pub origin_row: i32,
    pub tiles: Vec<u8>,
}

impl SectorTiles {
    pub fn new(cols: i32, rows: i32, origin_col: i32, origin_row: i32, tiles: Vec<u8>) -> Self {
        assert_eq!(
            tiles.len(),
            (cols * rows) as usize,
            "tile buffer must be cols*rows"
        );
        Self {
            cols,
            rows,
            origin_col,
            origin_row,
            tiles,
        }
    }

    pub fn filled(cols: i32, rows: i32, origin_col: i32, origin_row: i32, tile: u8) -> Self {
        Self::new(
            cols,
            rows,
            origin_col,
            origin_row,
            vec![tile; (cols * rows) as usize],
        )
    }

    #[inline]
    pub fn at(&self, col: i32, row: i32) -> u8 {
        if col < 0 || row < 0 || col >= self.cols || row >= self.rows {
            return SOLID;
        }
        self.tiles[(row * self.cols + col) as usize]
    }

    pub fn set(&mut self, col: i32, row: i32, tile: u8) {
        self.tiles[(row * self.cols + col) as usize] = tile;
    }

    /// Whether a floor slab is emitted here. Mirrors `addSectorFloor`'s `open`:
    /// a PIT tile is walkable-into but has no slab, so you fall in.
    #[inline]
    pub fn has_floor(&self, col: i32, row: i32) -> bool {
        self.at(col, row) & (SOLID | PIT) == 0
    }
}
