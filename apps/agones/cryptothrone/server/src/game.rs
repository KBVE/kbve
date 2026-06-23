use std::collections::HashMap;

use bevy::prelude::{Commands, Local, Res};
use simgrid::proto::{StatusKind, Tile};
use simgrid::{
    AggroSpec, BuffEffects, BuffSpec, ConsumableEffects, EquipBonus, EquipmentEffects, ItemDb,
    ItemPrices, KindRegistry, NpcDb, NpcSpec, SIM_TICK_HZ, ShopStock, SimConfig, TableDef, Tables,
    WalkableMap, ground_item_bundle, spawn_npc_from_spec,
};

pub const MAP_WIDTH: i32 = 50;
pub const MAP_HEIGHT: i32 = 50;
pub const MAX_PLAYERS: usize = 32;

const CLOUD_CITY_MAP: &[u8] = include_bytes!("../assets/cloud_city.tilemap.json");
const NPCDB_JSON: &[u8] =
    include_bytes!("../../../../../packages/data/codegen/generated/npcdb-data.json");
const ITEMDB_JSON: &[u8] =
    include_bytes!("../../../../../packages/data/codegen/generated/itemdb-data.json");

pub const PLAYER_HP: i32 = 100;
pub const PLAYER_ATTACK: i32 = 5;
pub const PLAYER_TICKS_PER_TILE: u8 = 3;
pub const PLAYER_SPAWN: Tile = Tile::new(5, 12);
// Cloud City plaza is a safe town — hostiles can't aggro players within
// this Chebyshev radius of spawn. Venture out to find combat.
pub const PLAYER_SAFE_RADIUS: i32 = 12;

pub const NPC_RESPAWN_TICKS: u32 = SIM_TICK_HZ * 30;

pub const CLERIC_REF: &str = "cleric";
pub const CLERIC_SPAWN: Tile = Tile::new(4, 10);

pub const BAT_REF: &str = "crystal-bat";
pub const BAT_COUNT: i32 = 8;
// Crystal cavern, far SE of the plaza — outside the safe zone.
pub const BAT_ORIGIN: Tile = Tile::new(34, 30);
pub const BAT_LOOT_REF: &str = "potion";

pub const GOBLIN_REF: &str = "goblin";
pub const GOBLIN_COUNT: i32 = 4;
pub const GOBLIN_ORIGIN: Tile = Tile::new(24, 24);
pub const GOBLIN_LOOT_REF: &str = "coin";

// Friendly town NPCs (player faction — never aggro, give the plaza life).
pub const MERCHANT_REF: &str = "merchant";
pub const MERCHANT_SPAWN: Tile = Tile::new(8, 9);

// Casino blackjack table. `table_ref` is the shared key the client passes in
// `JoinTable`; keep it byte-identical with the client's `joinTable(...)` call.
pub const CASINO_TABLE_REF: &str = "cloud-city:casino:6,8";
pub const CASINO_TABLE_TILE: Tile = Tile::new(6, 8);
pub const CASINO_TABLE_SEATS: u8 = 5;
pub const SOLDIER_REF: &str = "soldier";
pub const SOLDIER_SPAWN: Tile = Tile::new(3, 14);
pub const KING_REF: &str = "king";
pub const KING_SPAWN: Tile = Tile::new(6, 6);

// Boss — goblin general, deep in the camp; drops a gold bar.
pub const BOSS_REF: &str = "goblin-general";
pub const BOSS_SPAWN: Tile = Tile::new(27, 27);
pub const BOSS_LOOT_REF: &str = "gold-bar";

// Wolves roam the wilds (beast faction — wander but don't hunt players).
pub const WOLF_REF: &str = "wolf";
pub const WOLF_COUNT: i32 = 3;
pub const WOLF_ORIGIN: Tile = Tile::new(18, 14);
pub const WOLF_LOOT_REF: &str = "coin";

pub const HOSTILE_AGGRO_RANGE: i32 = 6;
pub const IRON_SWORD_ATTACK: i32 = 5;
pub const IRON_SHIELD_DEFENSE: i32 = 3;

pub const POTION_HEAL: i32 = 25;

// Buff consumables: the elixir regenerates HP over time, the swift tonic grants
// a burst of movement haste. Both are timed status effects, not instant heals.
pub const ELIXIR_REF: &str = "elixir";
pub const ELIXIR_REGEN: i32 = 4;
pub const ELIXIR_PERIOD_TICKS: u32 = SIM_TICK_HZ;
pub const SWIFT_TONIC_REF: &str = "swift-tonic";
pub const SWIFT_TONIC_HASTE: i32 = 1;
pub const BUFF_DURATION_TICKS: u32 = SIM_TICK_HZ * 10;

// Goblins and the boss carry venom — landing a hit poisons the player.
pub const GOBLIN_POISON_DMG: i32 = 2;
pub const POISON_PERIOD_TICKS: u32 = SIM_TICK_HZ;
pub const POISON_DURATION_TICKS: u32 = SIM_TICK_HZ * 6;

pub const GROUND_ITEMS: &[(&str, u32, Tile)] = &[
    ("potion", 1, Tile::new(8, 12)),
    ("coin", 5, Tile::new(12, 9)),
    ("iron-sword", 1, Tile::new(6, 15)),
    ("iron-shield", 1, Tile::new(10, 16)),
    (ELIXIR_REF, 1, Tile::new(9, 11)),
    (SWIFT_TONIC_REF, 1, Tile::new(11, 13)),
];

fn goblin_venom() -> BuffSpec {
    BuffSpec {
        kind: StatusKind::Poison,
        magnitude: GOBLIN_POISON_DMG,
        period_ticks: POISON_PERIOD_TICKS,
        duration_ticks: POISON_DURATION_TICKS,
    }
}

pub fn npc_db() -> NpcDb {
    NpcDb::from_json(NPCDB_JSON).expect("npcdb-data.json parses")
}

pub fn item_db() -> ItemDb {
    ItemDb::from_json(ITEMDB_JSON).expect("itemdb-data.json parses")
}

/// item ref -> (buy_price, sell_price), straight from itemdb economy fields.
pub fn item_prices() -> ItemPrices {
    let mut prices = ItemPrices::default();
    for item in &item_db().items {
        if item.buy_price > 0 || item.sell_price > 0 {
            prices
                .0
                .insert(item.ref_id.clone(), (item.buy_price, item.sell_price));
        }
    }
    prices
}

/// merchant npc ref -> the item refs it stocks, from npcdb `shop_items`.
pub fn shop_stock() -> ShopStock {
    let mut stock = ShopStock::default();
    for npc in &npc_db().npcs {
        if !npc.shop_items.is_empty() {
            stock.0.insert(npc.ref_id.clone(), npc.shop_items.clone());
        }
    }
    stock
}

pub fn tables() -> Tables {
    Tables(vec![TableDef {
        table_ref: CASINO_TABLE_REF.to_string(),
        tile: CASINO_TABLE_TILE,
        seats: CASINO_TABLE_SEATS,
    }])
}

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(CLERIC_REF);
    reg.register_npc(BAT_REF);
    reg.register_npc(GOBLIN_REF);
    reg.register_npc(MERCHANT_REF);
    reg.register_npc(SOLDIER_REF);
    reg.register_npc(KING_REF);
    reg.register_npc(BOSS_REF);
    reg.register_npc(WOLF_REF);
    for (item_ref, _, _) in GROUND_ITEMS {
        reg.register_item(item_ref);
    }
    reg.register_item(BAT_LOOT_REF);
    reg.register_item(GOBLIN_LOOT_REF);
    reg.register_item(BOSS_LOOT_REF);
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
    }
}

pub fn consumables() -> ConsumableEffects {
    ConsumableEffects(HashMap::from([("potion".to_string(), POTION_HEAL)]))
}

pub fn buffs() -> BuffEffects {
    BuffEffects(HashMap::from([
        (
            ELIXIR_REF.to_string(),
            BuffSpec {
                kind: StatusKind::Regen,
                magnitude: ELIXIR_REGEN,
                period_ticks: ELIXIR_PERIOD_TICKS,
                duration_ticks: BUFF_DURATION_TICKS,
            },
        ),
        (
            SWIFT_TONIC_REF.to_string(),
            BuffSpec {
                kind: StatusKind::Haste,
                magnitude: SWIFT_TONIC_HASTE,
                period_ticks: 0,
                duration_ticks: BUFF_DURATION_TICKS,
            },
        ),
    ]))
}

pub fn equipment() -> EquipmentEffects {
    EquipmentEffects(HashMap::from([
        (
            "iron-sword".to_string(),
            EquipBonus {
                attack: IRON_SWORD_ATTACK,
                defense: 0,
            },
        ),
        (
            "iron-shield".to_string(),
            EquipBonus {
                attack: 0,
                defense: IRON_SHIELD_DEFENSE,
            },
        ),
    ]))
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::from_grid_tilemap_json(CLOUD_CITY_MAP)
        .unwrap_or_else(|_| WalkableMap::open(MAP_WIDTH, MAP_HEIGHT))
}

fn ticks_per_tile_for_speed(speed: i32) -> u8 {
    (20 / speed.clamp(2, 10)).clamp(2, 10) as u8
}

#[allow(clippy::too_many_arguments)]
fn npc_spec(
    db: &NpcDb,
    registry: &KindRegistry,
    ref_id: &str,
    origin: Tile,
    wander: Option<(i32, u32)>,
    loot: Option<&str>,
    poison: Option<BuffSpec>,
) -> Option<NpcSpec> {
    let def = db.get(ref_id)?;
    let kind = registry.kind_of(ref_id)?;
    let max_hp = def.stats.max_hp.max(def.stats.hp).max(1);
    Some(NpcSpec {
        kind,
        origin,
        ticks_per_tile: ticks_per_tile_for_speed(def.stats.speed),
        max_hp,
        level: def.level.max(1),
        defense: def.stats.defense.max(0),
        wander,
        aggro: def.is_hostile().then(|| AggroSpec {
            range: HOSTILE_AGGRO_RANGE,
            damage: def.stats.attack.max(1),
            period_ticks: SIM_TICK_HZ,
            poison,
        }),
        loot: loot.map(str::to_string),
        respawn_ticks: NPC_RESPAWN_TICKS,
    })
}

pub fn spawn_world(mut done: Local<bool>, registry: Res<KindRegistry>, mut commands: Commands) {
    if *done {
        return;
    }
    *done = true;

    let db = npc_db();

    if let Some(spec) = npc_spec(
        &db,
        &registry,
        CLERIC_REF,
        CLERIC_SPAWN,
        Some((3, 30)),
        None,
        None,
    ) {
        spawn_npc_from_spec(&mut commands, &spec);
    }

    for i in 0..BAT_COUNT {
        let origin = Tile::new(BAT_ORIGIN.x, BAT_ORIGIN.y + i);
        if let Some(spec) = npc_spec(
            &db,
            &registry,
            BAT_REF,
            origin,
            Some((6, 20)),
            Some(BAT_LOOT_REF),
            None,
        ) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    for i in 0..GOBLIN_COUNT {
        let origin = Tile::new(GOBLIN_ORIGIN.x + (i % 2) * 2, GOBLIN_ORIGIN.y + (i / 2) * 2);
        if let Some(spec) = npc_spec(
            &db,
            &registry,
            GOBLIN_REF,
            origin,
            Some((8, 25)),
            Some(GOBLIN_LOOT_REF),
            Some(goblin_venom()),
        ) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    for (ref_id, tile) in [
        (MERCHANT_REF, MERCHANT_SPAWN),
        (SOLDIER_REF, SOLDIER_SPAWN),
        (KING_REF, KING_SPAWN),
    ] {
        if let Some(spec) = npc_spec(&db, &registry, ref_id, tile, Some((2, 40)), None, None) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    if let Some(spec) = npc_spec(
        &db,
        &registry,
        BOSS_REF,
        BOSS_SPAWN,
        Some((4, 30)),
        Some(BOSS_LOOT_REF),
        Some(goblin_venom()),
    ) {
        spawn_npc_from_spec(&mut commands, &spec);
    }

    for i in 0..WOLF_COUNT {
        let origin = Tile::new(WOLF_ORIGIN.x + i * 2, WOLF_ORIGIN.y);
        if let Some(spec) = npc_spec(
            &db,
            &registry,
            WOLF_REF,
            origin,
            Some((10, 22)),
            Some(WOLF_LOOT_REF),
            None,
        ) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    for (item_ref, count, tile) in GROUND_ITEMS {
        if let Some(bundle) = ground_item_bundle(&registry, item_ref, *count, *tile) {
            commands.spawn(bundle);
        }
    }
}
