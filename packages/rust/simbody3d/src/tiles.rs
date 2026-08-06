/// How a consumer's tile bitfield maps onto the only two properties this crate
/// cares about. Everything else a game encodes in a tile — occlusion, doorways,
/// lighting, ownership — is irrelevant to collision and is never read here.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TileMask {
    /// Bits that make a tile block movement and grow a wall block.
    pub solid: u8,
    /// Bits that suppress the floor slab, so a character walks in and falls.
    pub no_floor: u8,
}

impl Default for TileMask {
    fn default() -> Self {
        Self {
            solid: 1 << 0,
            no_floor: 1 << 1,
        }
    }
}

impl TileMask {
    #[inline]
    pub fn is_solid(&self, tile: u8) -> bool {
        tile & self.solid != 0
    }

    /// A slab is emitted only where the tile is neither solid nor explicitly
    /// floorless.
    #[inline]
    pub fn has_floor(&self, tile: u8) -> bool {
        tile & (self.solid | self.no_floor) == 0
    }
}

/// One rectangular block of tiles, positioned in world tile coordinates.
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

    /// Out of bounds reads as all-bits-set so every mask treats it as solid: a
    /// sector edge must not silently become walkable when a neighbour is not
    /// mounted.
    #[inline]
    pub fn at(&self, col: i32, row: i32) -> u8 {
        if col < 0 || row < 0 || col >= self.cols || row >= self.rows {
            return u8::MAX;
        }
        self.tiles[(row * self.cols + col) as usize]
    }

    pub fn set(&mut self, col: i32, row: i32, tile: u8) {
        self.tiles[(row * self.cols + col) as usize] = tile;
    }
}
