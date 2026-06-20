use bevy::prelude::{Commands, Local, Res};
use simgrid::proto::Tile;
use simgrid::{
    AggroSpec, KindRegistry, NpcSpec, SIM_TICK_HZ, SimConfig, WalkableMap, ground_item_bundle,
    spawn_npc_from_spec,
};

pub const MAP_WIDTH: i32 = 50;
pub const MAP_HEIGHT: i32 = 50;
pub const MAX_PLAYERS: usize = 32;

pub const PLAYER_HP: i32 = 100;
pub const PLAYER_ATTACK: i32 = 5;
pub const PLAYER_TICKS_PER_TILE: u8 = 3;
pub const PLAYER_SPAWN: Tile = Tile::new(25, 25);
pub const PLAYER_SAFE_RADIUS: i32 = 6;

pub const NPC_RESPAWN_TICKS: u32 = SIM_TICK_HZ * 30;

pub const GOBLIN_REF: &str = "goblin";
pub const GOBLIN_COUNT: i32 = 6;
pub const GOBLIN_ORIGIN: Tile = Tile::new(34, 34);
pub const GOBLIN_LOOT_REF: &str = "coin";
pub const GOBLIN_HP: i32 = 24;
pub const GOBLIN_DAMAGE: i32 = 3;
pub const GOBLIN_DEFENSE: i32 = 0;
pub const GOBLIN_TICKS_PER_TILE: u8 = 6;
pub const HOSTILE_AGGRO_RANGE: i32 = 6;

pub const GROUND_ITEMS: &[(&str, u32, Tile)] = &[("coin", 5, Tile::new(28, 26))];

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(GOBLIN_REF);
    reg.register_item(GOBLIN_LOOT_REF);
    for (item_ref, _, _) in GROUND_ITEMS {
        reg.register_item(item_ref);
    }
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
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::open(MAP_WIDTH, MAP_HEIGHT)
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

    for i in 0..GOBLIN_COUNT {
        let origin = Tile::new(GOBLIN_ORIGIN.x + (i % 3) * 2, GOBLIN_ORIGIN.y + (i / 3) * 2);
        if let Some(spec) = goblin_spec(&registry, origin) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    for (item_ref, count, tile) in GROUND_ITEMS {
        if let Some(bundle) = ground_item_bundle(&registry, item_ref, *count, *tile) {
            commands.spawn(bundle);
        }
    }
}
