use std::collections::HashMap;
use std::sync::LazyLock;

use bevy::prelude::{Commands, Entity, Local, Query, Res, ResMut, With, Without};
use bevy_items::{StatusEffectKind, UseEffect, UseEffectType};
use simgrid::arpg_dungeon;
use simgrid::proto::{StatusKind, Tile};
use simgrid::rng::hash3;
use simgrid::{
    AggroSpec, BuffEffects, BuffSpec, ConsumableEffects, DeployableSpec, Deployables, EntityKind,
    EnvOpts, GridPos, HazardZone, HealAura, KindRegistry, NpcSpec, PersistedEnvLog, PlayerSlotTag,
    SIM_TICK_HZ, SimClock, SimConfig, SimSeed, Stairs, WalkableMap, ground_item_bundle,
    spawn_env_object, spawn_npc_from_spec,
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

// Descending the stairs to a deeper floor needs a dungeon key the player must
// find/loot. Ascending is always free.
pub const STAIR_KEY_REF: &str = "dungeon-key";
pub const GOBLIN_HP: i32 = 24;
pub const GOBLIN_DAMAGE: i32 = 3;
pub const GOBLIN_DEFENSE: i32 = 0;
pub const GOBLIN_TICKS_PER_TILE: u8 = 6;
pub const HOSTILE_AGGRO_RANGE: i32 = 6;

// Campfire: a placed env object near spawn. Blocks its tile, heals players in the
// adjacent ring, and burns anything forced onto the tile. Behavior is read from
// the `campfire` mapdb WorldObjectDef — change the MDX + sync:mapdb to retune it.
// Apex Predator — a roaming hostile creature streamed in around players as they
// explore the endless dungeon (vs goblins, which are seeded once near spawn).
// Tankier and harder-hitting than a goblin; rendered with the packed creature
// sheets on the client.
pub const PREDATOR_REF: &str = "apex_predator";
pub const PREDATOR_HP: i32 = 60;
pub const PREDATOR_DAMAGE: i32 = 8;
pub const PREDATOR_DEFENSE: i32 = 2;
pub const PREDATOR_TICKS_PER_TILE: u8 = 5;
pub const PREDATOR_LEVEL: i32 = 3;
// Roam: wander toward a random tile up to this far from spawn, then idle a
// random dwell in [min,max] before the next trip — longer, deliberate movement.
pub const PREDATOR_ROAM_RADIUS: i32 = 10;
pub const PREDATOR_DWELL_MIN_TICKS: u32 = SIM_TICK_HZ;
pub const PREDATOR_DWELL_MAX_TICKS: u32 = SIM_TICK_HZ * 3;
// Streaming spawn budget: how many predators may exist near each player, the
// ring (in tiles) they appear within, and how close they're allowed to pop in.
pub const PREDATOR_PER_PLAYER: usize = 3;
pub const PREDATOR_SPAWN_MIN: i32 = 12;
pub const PREDATOR_SPAWN_MAX: i32 = 22;
pub const PREDATOR_DESPAWN_RADIUS: i32 = 40;
// Re-evaluate the streamed population a few times a second, not every tick.
pub const PREDATOR_STREAM_PERIOD_TICKS: u32 = SIM_TICK_HZ / 2;

pub const CAMPFIRE_REF: &str = "campfire";

// The deployable inventory item that places a `campfire` env object. Carried in
// the pack, consumed on placement. itemdb ref `campfire-kit` (key 77).
pub const CAMPFIRE_KIT_REF: &str = "campfire-kit";

// A few starter potions drop near spawn so the inventory + item-usage loop is
// usable immediately: pick up -> 1-9 hotkey -> heal (itemdb says potion heals 15).
pub const POTION_REF: &str = "potion";
pub const POTION_START_COUNT: u32 = 3;

/// Ground floor — players spawn here; stairs descend to deeper floors.
pub const SPAWN_FLOOR: i32 = 0;

/// Player spawn snapped onto a real floor tile of the ground floor.
pub fn player_spawn() -> Tile {
    let (x, y) = arpg_dungeon::nearest_floor(
        DUNGEON_SEED,
        SPAWN_FLOOR,
        PLAYER_SPAWN_HINT.x,
        PLAYER_SPAWN_HINT.y,
        arpg_dungeon::CHUNK_SIZE,
    );
    Tile::new(x, y)
}

/// Nearest floor tile to a hint on the ground floor — keeps spawns out of rock.
fn floor_near(hint: Tile) -> Tile {
    let (x, y) = arpg_dungeon::nearest_floor(
        DUNGEON_SEED,
        SPAWN_FLOOR,
        hint.x,
        hint.y,
        arpg_dungeon::CHUNK_SIZE,
    );
    Tile::new(x, y)
}

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    reg.register_npc(GOBLIN_REF);
    reg.register_npc(PREDATOR_REF);
    reg.register_item(GOBLIN_LOOT_REF);
    reg.register_item(STAIR_KEY_REF);
    reg.register_item(POTION_REF);
    reg.register_item(CAMPFIRE_KIT_REF);
    reg.register_env(CAMPFIRE_REF);
    reg
}

/// Embedded mapdb registry, decoded once from the canonical proto binary
/// (`mapdb-data.binpb`, a `map.MapRegistry`). Carries every world-object def —
/// placed-object behavior (blocker, auras, hazards) lives here. Regenerated by
/// `sync:mapdb`.
static MAP_DB: LazyLock<bevy_mapdb::MapDb> = LazyLock::new(|| {
    bevy_mapdb::MapDb::from_bytes(include_bytes!(
        "../../../../../packages/data/codegen/generated/mapdb-data.binpb"
    ))
    .expect("embedded mapdb-data.binpb decodes as map.MapRegistry")
});

/// Build `EnvOpts` for a placed object from its mapdb `WorldObjectDef`. A
/// `regen` placed-effect becomes the heal aura (`range >= 1`), a `burning` one
/// the on-tile hazard (`range 0`). Returns `None` when the ref is absent.
fn env_opts_from_mapdb(ref_id: &str, floor: i32) -> Option<EnvOpts> {
    let def = MAP_DB.get_object_def_by_ref(ref_id)?;
    let mut heal_aura = None;
    let mut hazard = None;
    for e in &def.placed_effects {
        let magnitude = e.magnitude.unwrap_or(0);
        let period_ticks = e.period_ticks.unwrap_or(0) as u32;
        match e.status.as_str() {
            "regen" => {
                heal_aura = Some(HealAura {
                    range: e.range.unwrap_or(1),
                    magnitude,
                    period_ticks,
                })
            }
            "burning" => {
                hazard = Some(HazardZone {
                    magnitude,
                    period_ticks,
                })
            }
            _ => {}
        }
    }
    Some(EnvOpts {
        blocker: def.blocks_movement.unwrap_or(false),
        heal_aura,
        hazard,
        floor,
    })
}

/// Behavior for a campfire env object: blocks its tile, heals the adjacent ring,
/// burns anything forced onto it. Shared by the starter campfire near spawn and
/// player-placed campfires (`floor` set per spawn). Traces to the `campfire`
/// mapdb WorldObjectDef.
pub fn campfire_env_opts(floor: i32) -> EnvOpts {
    env_opts_from_mapdb(CAMPFIRE_REF, floor)
        .expect("`campfire` WorldObjectDef present in mapdb-data.binpb")
}

/// Item-ref -> placement spec. Driving the sim's `PlaceItem` handling: using a
/// `campfire-kit` from the inventory spawns a `campfire` env object on the target
/// tile. `apply_placements` overrides `floor` with the placer's level.
pub fn deployables() -> Deployables {
    let mut map = HashMap::new();
    map.insert(
        CAMPFIRE_KIT_REF.to_string(),
        DeployableSpec {
            env_ref: CAMPFIRE_REF.to_string(),
            opts: campfire_env_opts(SPAWN_FLOOR),
        },
    );
    Deployables(map)
}

/// Full itemdb registry, embedded from the canonical proto binary
/// (`itemdb-data.binpb`, an `item.ItemRegistry`). Carries every item's data —
/// names, prices, use_effects/status_effect, food/regen — so server systems
/// resolve any ref without a DB round-trip. Regenerated by `sync:itemdb`.
pub fn item_db() -> bevy_items::ItemDb {
    bevy_items::ItemDb::from_bytes(include_bytes!(
        "../../../../../packages/data/codegen/generated/itemdb-data.binpb"
    ))
    .expect("embedded itemdb-data.binpb decodes as item.ItemRegistry")
}

pub fn spell_db() -> bevy_spells::SpellDb {
    bevy_spells::SpellDb::from_bytes(include_bytes!(
        "../../../../../packages/data/codegen/generated/spelldb-data.binpb"
    ))
    .expect("embedded spelldb-data.binpb decodes")
}

/// FullHeal has no amount on the wire — use a large heal; `use_item` clamps to
/// max_hp.
const FULL_HEAL: i32 = 9_999;

/// Map an itemdb `StatusEffectKind` onto the runtime `StatusKind`s the sim
/// supports. Unsupported effects return `None` so the item simply grants no buff.
fn map_status(raw: i32) -> Option<StatusKind> {
    match StatusEffectKind::try_from(raw).ok()? {
        StatusEffectKind::StatusEffectRegen => Some(StatusKind::Regen),
        StatusEffectKind::StatusEffectHaste => Some(StatusKind::Haste),
        StatusEffectKind::StatusEffectPoison => Some(StatusKind::Poison),
        StatusEffectKind::StatusEffectBurning => Some(StatusKind::Burn),
        _ => None,
    }
}

/// Fold one itemdb `UseEffect` into the consumable-heal / status-buff maps.
fn ingest_effect(
    ref_id: &str,
    ue: &UseEffect,
    heals: &mut HashMap<String, i32>,
    buffs: &mut HashMap<String, BuffSpec>,
) {
    match UseEffectType::try_from(ue.r#type) {
        Ok(UseEffectType::UseEffectHeal) => {
            if let Some(a) = ue.amount {
                heals.entry(ref_id.to_string()).or_insert(a);
            }
        }
        Ok(UseEffectType::UseEffectFullHeal) => {
            heals.entry(ref_id.to_string()).or_insert(FULL_HEAL);
        }
        Ok(UseEffectType::UseEffectApplyEffect) => {
            if let Some(kind) = ue.status_effect.and_then(map_status) {
                let turns = ue.turns.unwrap_or(8).max(1) as u32;
                let magnitude = ue.amount.or(ue.stacks).unwrap_or(2).max(1);
                // Haste is a flat move-speed modifier (no periodic tick); damage
                // and regen tick about once per second.
                let period_ticks = if kind == StatusKind::Haste {
                    0
                } else {
                    SIM_TICK_HZ
                };
                buffs.entry(ref_id.to_string()).or_insert(BuffSpec {
                    kind,
                    magnitude,
                    period_ticks,
                    duration_ticks: turns.saturating_mul(SIM_TICK_HZ),
                });
            }
        }
        _ => {}
    }
}

/// Derive consumable heals + status buffs from the itemdb so `UseItem` resolves
/// real effects instead of being a no-op. Reads each item's `use_effects` and
/// `food.buff_effects` / `food.heals`. This is the data-driven path (#12972) —
/// editing the MDX + `sync:itemdb` changes in-game item behavior with no code.
pub fn item_effects(db: &bevy_items::ItemDb) -> (ConsumableEffects, BuffEffects) {
    let mut heals: HashMap<String, i32> = HashMap::new();
    let mut buffs: HashMap<String, BuffSpec> = HashMap::new();
    for (_, item) in db.iter() {
        let ref_id = item.r#ref.as_str();
        for ue in &item.use_effects {
            ingest_effect(ref_id, ue, &mut heals, &mut buffs);
        }
        if let Some(food) = &item.food {
            for ue in &food.buff_effects {
                ingest_effect(ref_id, ue, &mut heals, &mut buffs);
            }
            if let Some(h) = food.heals
                && h > 0
            {
                heals.entry(ref_id.to_string()).or_insert(h);
            }
        }
    }
    (ConsumableEffects(heals), BuffEffects(buffs))
}

/// Endless dungeon stairs: two seed-derived stairs per floor (down + up).
/// Descending is gated on the dungeon key; ascending is free.
pub fn stairs() -> Stairs {
    Stairs::Dungeon {
        seed: DUNGEON_SEED,
        descend_key: Some(STAIR_KEY_REF.to_string()),
    }
}

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: 0,
        player_hp: PLAYER_HP,
        player_attack: PLAYER_ATTACK,
        spawn: player_spawn(),
        ticks_per_tile: PLAYER_TICKS_PER_TILE,
        safe_radius: PLAYER_SAFE_RADIUS,
        starting_inventory: vec![
            (CAMPFIRE_KIT_REF.to_string(), 5),
            (POTION_REF.to_string(), 3),
        ],
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
        roam: None,
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

fn predator_spec(registry: &KindRegistry, origin: Tile) -> Option<NpcSpec> {
    let kind = registry.kind_of(PREDATOR_REF)?;
    Some(NpcSpec {
        kind,
        origin,
        ticks_per_tile: PREDATOR_TICKS_PER_TILE,
        max_hp: PREDATOR_HP,
        level: PREDATOR_LEVEL,
        defense: PREDATOR_DEFENSE,
        wander: None,
        // Roam in longer purposeful trips with idle dwells between, instead of
        // the single-tile jitter `wander` produces.
        roam: Some((
            PREDATOR_ROAM_RADIUS,
            PREDATOR_DWELL_MIN_TICKS,
            PREDATOR_DWELL_MAX_TICKS,
        )),
        aggro: Some(AggroSpec {
            range: HOSTILE_AGGRO_RANGE,
            damage: PREDATOR_DAMAGE,
            period_ticks: SIM_TICK_HZ,
            poison: None,
        }),
        loot: Some(GOBLIN_LOOT_REF.to_string()),
        // Streamed predators are culled by distance, not respawned in place.
        respawn_ticks: 0,
    })
}

fn chebyshev(a: Tile, b: Tile) -> i32 {
    (a.x - b.x).abs().max((a.y - b.y).abs())
}

/// Stream apex predators around players as they explore. Periodically: cull any
/// predator that has drifted out of every player's despawn radius, then top each
/// player's local population back up to `PREDATOR_PER_PLAYER` by spawning fresh
/// ones on floor tiles in a ring ahead of them. Ground-floor only for now
/// (matches the seeded-goblin scope); deeper floors stream once spawns carry a
/// `Floor`.
pub fn stream_predators(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    registry: Res<KindRegistry>,
    players: Query<&GridPos, With<PlayerSlotTag>>,
    predators: Query<(Entity, &GridPos, &EntityKind), Without<PlayerSlotTag>>,
    mut commands: Commands,
) {
    if !clock.tick.is_multiple_of(PREDATOR_STREAM_PERIOD_TICKS) {
        return;
    }
    let Some(pred_kind) = registry.kind_of(PREDATOR_REF) else {
        return;
    };

    let player_tiles: Vec<Tile> = players.iter().map(|p| p.tile).collect();
    if player_tiles.is_empty() {
        return;
    }

    let mut alive: Vec<Tile> = Vec::new();
    for (entity, pos, kind) in predators.iter() {
        if kind.0 != pred_kind {
            continue;
        }
        let near_any = player_tiles
            .iter()
            .any(|pt| chebyshev(*pt, pos.tile) <= PREDATOR_DESPAWN_RADIUS);
        if near_any {
            alive.push(pos.tile);
        } else {
            commands.entity(entity).despawn();
        }
    }

    for (i, ptile) in player_tiles.iter().enumerate() {
        let local = alive
            .iter()
            .filter(|t| chebyshev(**t, *ptile) <= PREDATOR_SPAWN_MAX)
            .count();
        if local >= PREDATOR_PER_PLAYER {
            continue;
        }
        for attempt in 0..8u64 {
            let h = hash3(seed.0, ((i as u64) << 8) | attempt, clock.tick as u64);
            let span = (PREDATOR_SPAWN_MAX - PREDATOR_SPAWN_MIN + 1) as u64;
            let dist = PREDATOR_SPAWN_MIN + ((h >> 8) % span) as i32;
            let (dx, dy) = ring_offset((h % 8) as u8, dist);
            let hint = Tile::new(ptile.x + dx, ptile.y + dy);
            let origin = floor_near(hint);
            if chebyshev(origin, *ptile) < PREDATOR_SPAWN_MIN {
                continue;
            }
            if let Some(spec) = predator_spec(&registry, origin) {
                spawn_npc_from_spec(&mut commands, &spec);
                alive.push(origin);
            }
            break;
        }
    }
}

/// One of 8 compass offsets at `dist` tiles — picks a coarse heading for a ring
/// spawn so predators appear spread around the player, not all in a line.
fn ring_offset(oct: u8, dist: i32) -> (i32, i32) {
    match oct % 8 {
        0 => (0, -dist),
        1 => (dist, -dist),
        2 => (dist, 0),
        3 => (dist, dist),
        4 => (0, dist),
        5 => (-dist, dist),
        6 => (-dist, 0),
        _ => (-dist, -dist),
    }
}

pub fn spawn_world(
    mut done: Local<bool>,
    registry: Res<KindRegistry>,
    mut walkable: ResMut<WalkableMap>,
    restored: Res<PersistedEnvLog>,
    mut commands: Commands,
) {
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

    // A dungeon key on the ground floor so a fresh player can reach the stairs
    // down. Deeper floors gate their own keys via loot later.
    let key_tile = floor_near(Tile::new(spawn.x - 2, spawn.y + 2));
    if let Some(bundle) = ground_item_bundle(&registry, STAIR_KEY_REF, 1, key_tile) {
        commands.spawn(bundle);
    }

    // Starter potions so the inventory + use-item loop works from spawn.
    let potion_tile = floor_near(Tile::new(spawn.x + 1, spawn.y - 2));
    if let Some(bundle) = ground_item_bundle(&registry, POTION_REF, POTION_START_COUNT, potion_tile)
    {
        commands.spawn(bundle);
    }

    // A campfire kit on the ground so the placement loop is testable from spawn:
    // pick up -> select -> place on a target tile -> server spawns the campfire.
    let kit_tile = floor_near(Tile::new(spawn.x - 1, spawn.y - 2));
    if let Some(bundle) = ground_item_bundle(&registry, CAMPFIRE_KIT_REF, 25, kit_tile) {
        commands.spawn(bundle);
    }

    // A campfire near spawn: blocks its tile, heals the adjacent ring, burns
    // anything forced onto it. Snap to a floor tile distinct from the player
    // spawn so no one starts trapped on it.
    let fire = floor_near(Tile::new(spawn.x + 3, spawn.y - 1));
    if fire != spawn
        && spawn_env_object(
            &mut commands,
            &registry,
            CAMPFIRE_REF,
            fire,
            campfire_env_opts(SPAWN_FLOOR),
        )
        .is_some()
    {
        walkable.block_tile_z(SPAWN_FLOOR, fire);
    }

    // Restore player-placed objects persisted from a previous server lifetime.
    // They return as unowned world fixtures (no PlacedBy, behavior re-derived
    // from the mapdb def) — still block/heal/burn, but no longer reclaimable.
    for o in &restored.0 {
        let tile = Tile::new(o.x, o.y);
        let Some(opts) = env_opts_from_mapdb(&o.env_ref, o.floor) else {
            continue;
        };
        let blocker = opts.blocker;
        if spawn_env_object(&mut commands, &registry, &o.env_ref, tile, opts).is_some() && blocker {
            walkable.block_tile_z(o.floor, tile);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn itemdb_embeds_and_decodes() {
        let db = super::item_db();
        assert!(
            db.len() >= 100,
            "embedded itemdb decoded {} items",
            db.len()
        );
        assert!(
            db.get_by_ref("campfire-kit").is_some(),
            "campfire-kit present"
        );
    }

    #[test]
    fn campfire_env_opts_trace_to_mapdb() {
        let opts = super::campfire_env_opts(super::SPAWN_FLOOR);
        assert!(opts.blocker, "campfire blocks its tile");
        let aura = opts.heal_aura.expect("regen placed-effect → heal aura");
        assert_eq!((aura.range, aura.magnitude, aura.period_ticks), (2, 3, 20));
        let hazard = opts.hazard.expect("burning placed-effect → hazard");
        assert_eq!((hazard.magnitude, hazard.period_ticks), (8, 20));
    }

    #[test]
    fn itemdb_effects_map_heal_and_buff() {
        let db = super::item_db();
        let (heals, buffs) = super::item_effects(&db);
        // potion: use_effects [{ HEAL, amount 15 }]
        assert_eq!(heals.0.get("potion").copied(), Some(15));
        // elixir: use_effects [{ FULL_HEAL }]
        assert_eq!(heals.0.get("elixir").copied(), Some(super::FULL_HEAL));
        // mana-potion: food.buff_effects [{ APPLY_EFFECT, REGEN }]
        let mana = buffs.0.get("mana-potion").expect("mana-potion buff");
        assert_eq!(mana.kind, super::StatusKind::Regen);
        assert!(!heals.0.is_empty() && !buffs.0.is_empty());
    }

    #[test]
    fn status_kind_subset_of_itemdb() {
        use super::{StatusEffectKind, StatusKind};
        fn itemdb_of(k: StatusKind) -> StatusEffectKind {
            match k {
                StatusKind::Poison => StatusEffectKind::StatusEffectPoison,
                StatusKind::Regen => StatusEffectKind::StatusEffectRegen,
                StatusKind::Haste => StatusEffectKind::StatusEffectHaste,
                StatusKind::Burn => StatusEffectKind::StatusEffectBurning,
            }
        }
        for (k, name) in [
            (StatusKind::Poison, "STATUS_EFFECT_POISON"),
            (StatusKind::Regen, "STATUS_EFFECT_REGEN"),
            (StatusKind::Haste, "STATUS_EFFECT_HASTE"),
            (StatusKind::Burn, "STATUS_EFFECT_BURNING"),
        ] {
            assert_eq!(itemdb_of(k).as_str_name(), name);
        }
    }
}
