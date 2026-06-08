use simgrid::SimConfig;
use simgrid::grid::WalkableMap;
use simgrid::proto::Tile;

pub const MAP_WIDTH: i32 = 40;
pub const MAP_HEIGHT: i32 = 30;
pub const MAX_PLAYERS: usize = 32;

pub const PLAYER_KIND: u16 = 0;
pub const PLAYER_HP: i32 = 100;
pub const TICKS_PER_TILE: u8 = 4;

pub fn spawn_tile() -> Tile {
    Tile::new(MAP_WIDTH / 2, MAP_HEIGHT / 2)
}

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: PLAYER_KIND,
        player_hp: PLAYER_HP,
        spawn: spawn_tile(),
        ticks_per_tile: TICKS_PER_TILE,
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::open(MAP_WIDTH, MAP_HEIGHT)
}
