use bevy::prelude::{Commands, Local, Res};
use simgrid::arpg_dungeon;
use simgrid::proto::Tile;
use simgrid::{
    AggroSpec, KindRegistry, NpcSpec, SIM_TICK_HZ, SimConfig, WalkableMap, ground_item_bundle,
    spawn_npc_from_spec,
};

pub const MAX_PLAYERS: usize = 32;

// Endless dungeon shared with the client. The seed MUST equal the client's
// DUNGEON_SEED (isometric-arpg/config.ts) so server collision matches the tiles
// the client predicts. Collision is computed on demand from the seed — nothing
// is stored, so the world is unbounded. PATH_WINDOW only caps find_path's BFS
// frontier (an open grid needs a search bound); movement itself has no edges.
pub const DUNGEON_SEED: u32 = 0x5eed1;
pub const PATH_WINDOW: i32 = 96;

pub const PLAYER_HP: i32 = 100;
pub const PLAYER_ATTACK: i32 = 5;
pub const PLAYER_TICKS_PER_TILE: u8 = 3;
// Aim spawn near the client's debug spawn tile; snap to the nearest floor so a
// player never drops into rock.
pub const PLAYER_SPAWN_HINT: Tile = Tile::new(12, 12);
pub const PLAYER_SAFE_RADIUS: i32 = 6;

pub const NPC_RESPAWN_TICKS: u32 = SIM_TICK_HZ * 30;

pub const GOBLIN_REF: &str = "goblin";
pub const GOBLIN_COUNT: i32 = 6;
pub const GOBLIN_LOOT_REF: &str = "coin";
pub const GOBLIN_HP: i32 = 24;
pub const GOBLIN_DAMAGE: i32 = 3;
pub const GOBLIN_DEFENSE: i32 = 0;
pub const GOBLIN_TICKS_PER_TILE: u8 = 6;
pub const HOSTILE_AGGRO_RANGE: i32 = 6;

/// Player spawn snapped onto a real floor tile of the seeded dungeon.
pub fn player_spawn() -> Tile {
    let (x, y) = arpg_dungeon::nearest_floor(
        DUNGEON_SEED,
        PLAYER_SPAWN_HINT.x,
        PLAYER_SPAWN_HINT.y,
        arpg_dungeon::CHUNK_SIZE,
    );
    Tile::new(x, y)
}

/// Nearest floor tile to a hint — keeps NPC/item spawns out of the rock.
fn floor_near(hint: Tile) -> Tile {
    let (x, y) =
        arpg_dungeon::nearest_floor(DUNGEON_SEED, hint.x, hint.y, arpg_dungeon::CHUNK_SIZE);
    Tile::new(x, y)
}

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(GOBLIN_REF);
    reg.register_item(GOBLIN_LOOT_REF);
    reg
}

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: 0,
        player_hp: PLAYER_HP,
        player_attack: PLAYER_ATTACK,
        spawn: player_spawn(),
        ticks_per_tile: PLAYER_TICKS_PER_TILE,
        safe_radius: PLAYER_SAFE_RADIUS,
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::arpg_dungeon(DUNGEON_SEED, PATH_WINDOW)
}

fn goblin_spec(registry: &KindRegistry, origin: Tile) -> Option<NpcSpec> {
    let kind = registry.kind_of(GOBLIN_REF)?;
    Some(NpcSpec {
        kind,
        origin,
        ticks_per_tile: GOBLIN_TICKS_PER_TILE,
        max_hp: GOBLIN_HP,
        level: 1,
        defense: GOBLIN_DEFENSE,
        wander: Some((8, 25)),
        aggro: Some(AggroSpec {
            range: HOSTILE_AGGRO_RANGE,
            damage: GOBLIN_DAMAGE,
            period_ticks: SIM_TICK_HZ,
            poison: None,
        }),
        loot: Some(GOBLIN_LOOT_REF.to_string()),
        respawn_ticks: NPC_RESPAWN_TICKS,
    })
}

pub fn spawn_world(mut done: Local<bool>, registry: Res<KindRegistry>, mut commands: Commands) {
    if *done {
        return;
    }
    *done = true;

    // Seed a few goblins around the spawn room, each snapped to a floor tile so
    // none start embedded in rock. They wander/respawn within their own bounds,
    // so the sim only ticks this populated pocket of the endless dungeon.
    let spawn = player_spawn();
    for i in 0..GOBLIN_COUNT {
        let hint = Tile::new(spawn.x + 4 + (i % 3) * 2, spawn.y + 4 + (i / 3) * 2);
        let origin = floor_near(hint);
        if let Some(spec) = goblin_spec(&registry, origin) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    // One starter loot pile near spawn.
    let coin = floor_near(Tile::new(spawn.x + 2, spawn.y + 1));
    if let Some(bundle) = ground_item_bundle(&registry, GOBLIN_LOOT_REF, 5, coin) {
        commands.spawn(bundle);
    }
}
