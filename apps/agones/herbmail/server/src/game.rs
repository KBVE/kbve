use herbmail_sim::PhysicsWorld;
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

/// Fully open until the seed-derived tile grid is ported — the server cannot
/// reproduce the client's walls yet, so it must not claim to. simgrid's own
/// grid map stays open; rapier is what will actually arbitrate movement.
pub fn walkable_map() -> WalkableMap {
    WalkableMap::open(MAP_SPAN_TILES, MAP_SPAN_TILES)
}

pub fn collision_is_authoritative() -> bool {
    false
}

/// The rapier world the server resolves movement against.
///
/// Returned empty: `SectorTiles` has to come from the ported tile-grid
/// generator, and mounting anything else would put the server in a different
/// dungeon than the client.
pub fn physics_world() -> PhysicsWorld {
    PhysicsWorld::new()
}
