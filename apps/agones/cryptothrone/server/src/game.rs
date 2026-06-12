use bevy::prelude::{Commands, Local, Res};
use simgrid::proto::Tile;
use simgrid::{
    EntityKind, GridPos, Health, KindRegistry, Loot, MoveSpeed, MoveTarget, NpcDb, SimConfig,
    WalkableMap, Wander, ground_item_bundle,
};

pub const MAP_WIDTH: i32 = 50;
pub const MAP_HEIGHT: i32 = 50;
pub const MAX_PLAYERS: usize = 32;

const CLOUD_CITY_MAP: &[u8] = include_bytes!("../assets/cloud_city_large.json");
const NPCDB_JSON: &[u8] =
    include_bytes!("../../../../../packages/data/codegen/generated/npcdb-data.json");

pub const PLAYER_HP: i32 = 100;
pub const PLAYER_ATTACK: i32 = 5;
pub const PLAYER_TICKS_PER_TILE: u8 = 4;
pub const PLAYER_SPAWN: Tile = Tile::new(5, 12);

pub const CLERIC_REF: &str = "cleric";
pub const CLERIC_SPAWN: Tile = Tile::new(4, 10);
pub const CLERIC_WANDER_RADIUS: i32 = 3;
pub const CLERIC_WANDER_PERIOD_TICKS: u32 = 30;

pub const BAT_REF: &str = "crystal-bat";
pub const BAT_COUNT: i32 = 10;
pub const BAT_ORIGIN: Tile = Tile::new(7, 7);
pub const BAT_WANDER_RADIUS: i32 = 20;
pub const BAT_WANDER_PERIOD_TICKS: u32 = 20;
pub const BAT_LOOT_REF: &str = "potion";

pub const GROUND_ITEMS: &[(&str, u32, Tile)] = &[
    ("potion", 1, Tile::new(8, 12)),
    ("coin", 5, Tile::new(12, 9)),
    ("iron-sword", 1, Tile::new(6, 15)),
];

pub fn npc_db() -> NpcDb {
    NpcDb::from_json(NPCDB_JSON).expect("npcdb-data.json parses")
}

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(CLERIC_REF);
    reg.register_npc(BAT_REF);
    for (item_ref, _, _) in GROUND_ITEMS {
        reg.register_item(item_ref);
    }
    reg.register_item(BAT_LOOT_REF);
    reg
}

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: 0,
        player_hp: PLAYER_HP,
        player_attack: PLAYER_ATTACK,
        spawn: PLAYER_SPAWN,
        ticks_per_tile: PLAYER_TICKS_PER_TILE,
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::from_tiled_json(CLOUD_CITY_MAP)
        .unwrap_or_else(|_| WalkableMap::open(MAP_WIDTH, MAP_HEIGHT))
}

fn ticks_per_tile_for_speed(speed: i32) -> u8 {
    (20 / speed.clamp(2, 10)).clamp(2, 10) as u8
}

fn spawn_npc(
    commands: &mut Commands,
    db: &NpcDb,
    registry: &KindRegistry,
    ref_id: &str,
    tile: Tile,
    wander: Wander,
    loot: Option<&str>,
) {
    let Some(def) = db.get(ref_id) else { return };
    let Some(kind) = registry.kind_of(ref_id) else {
        return;
    };
    let hp = def.stats.max_hp.max(def.stats.hp).max(1);
    commands.spawn((
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        MoveSpeed {
            ticks_per_tile: ticks_per_tile_for_speed(def.stats.speed),
        },
        Health { hp, max_hp: hp },
        wander,
        Loot {
            item_ref: loot.map(str::to_string),
        },
    ));
}

pub fn spawn_world(mut done: Local<bool>, registry: Res<KindRegistry>, mut commands: Commands) {
    if *done {
        return;
    }
    *done = true;

    let db = npc_db();

    spawn_npc(
        &mut commands,
        &db,
        &registry,
        CLERIC_REF,
        CLERIC_SPAWN,
        Wander::new(
            CLERIC_SPAWN,
            CLERIC_WANDER_RADIUS,
            CLERIC_WANDER_PERIOD_TICKS,
        ),
        None,
    );

    for i in 0..BAT_COUNT {
        let origin = Tile::new(BAT_ORIGIN.x, BAT_ORIGIN.y + i);
        spawn_npc(
            &mut commands,
            &db,
            &registry,
            BAT_REF,
            origin,
            Wander::new(origin, BAT_WANDER_RADIUS, BAT_WANDER_PERIOD_TICKS),
            Some(BAT_LOOT_REF),
        );
    }

    for (item_ref, count, tile) in GROUND_ITEMS {
        if let Some(bundle) = ground_item_bundle(&registry, item_ref, *count, *tile) {
            commands.spawn(bundle);
        }
    }
}
