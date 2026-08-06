use simgrid::proto::Tile;
use simgrid::{KindRegistry, SimConfig, WalkableMap};

pub const SECTOR: i32 = 8;
pub const CELL: i32 = 6;
pub const SECTOR_TILES: i32 = SECTOR * CELL;
pub const DUNGEON_SEED: u64 = 1337;

pub const MAX_PLAYERS: usize = 32;
pub const PLAYER_HP: i32 = 100;
pub const PLAYER_ATTACK: i32 = 5;
pub const PLAYER_TICKS_PER_TILE: u8 = 3;
pub const PLAYER_SPAWN: Tile = Tile::new(2, 2);
pub const PLAYER_SAFE_RADIUS: i32 = 8;

pub const PLAYER_REF: &str = "player";

/// Bound on the mounted 3x3 sector ring, which is what the client streams.
pub const MAP_SPAN_TILES: i32 = SECTOR_TILES * 3;

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(PLAYER_REF);
    reg
}

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: 0,
        player_hp: PLAYER_HP,
        player_attack: PLAYER_ATTACK,
        spawn: PLAYER_SPAWN,
        ticks_per_tile: PLAYER_TICKS_PER_TILE,
        safe_radius: PLAYER_SAFE_RADIUS,
        starting_inventory: Vec::new(),
        corpse_kind: None,
    }
}

/// Fully open until the M1 geometry port lands — the server does not yet
/// reproduce the client's seed-derived walls, so it must not claim to.
pub fn walkable_map() -> WalkableMap {
    WalkableMap::open(MAP_SPAN_TILES, MAP_SPAN_TILES)
}

pub fn collision_is_authoritative() -> bool {
    false
}
