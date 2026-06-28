use std::collections::HashMap;
use std::sync::LazyLock;

use bevy::prelude::{Commands, Local, Query, Res, ResMut, With, Without};
use bevy_items::{StatusEffectKind, UseEffect, UseEffectType};
use simgrid::arpg_dungeon;
use simgrid::proto::{StatusKind, Tile};
use simgrid::{
    BuffEffects, BuffSpec, ConsumableEffects, DeployableSpec, Deployables, EnvObject, EnvOpts,
    FloatMove, Floor, FurnitureRot, GridPos, HazardZone, HealAura, KindRegistry, ManaAura,
    PersistedEnvLog, PlayerSlotTag, SIM_TICK_HZ, SimConfig, Stairs, WalkableMap,
    ground_item_bundle, spawn_env_object, spawn_npc_from_spec,
};

use crate::creatures;
use crate::creatures::{GOBLIN_COUNT, GOBLIN_LOOT_REF, goblin_spec};

pub use crate::creatures::{stream_predators, stream_trees, stream_wyverns};

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

// Descending the stairs to a deeper floor needs a dungeon key the player must
// find/loot. Ascending is always free.
pub const STAIR_KEY_REF: &str = "dungeon-key";

// Campfire: a placed env object near spawn. Blocks its tile, heals players in the
// adjacent ring, and burns anything forced onto the tile. Behavior is read from
// the `campfire` mapdb WorldObjectDef — change the MDX + sync:mapdb to retune it.
pub const CAMPFIRE_REF: &str = "campfire";

// The deployable inventory item that places a `campfire` env object. Carried in
// the pack, consumed on placement. itemdb ref `campfire-kit` (key 77).
pub const CAMPFIRE_KIT_REF: &str = "campfire-kit";

// Candelabrum: a placed, ROTATABLE env furniture (4 facings, R cycles during
// placement). Blocks its tile and restores mana in the adjacent ring — no burn.
// Behavior from the `candelabrum` mapdb WorldObjectDef. The deployable item that
// places it is `candelabrum-stand` (itemdb, key 563); the placed env is `candelabrum`.
pub const CANDELABRUM_REF: &str = "candelabrum";
pub const CANDELABRUM_KIT_REF: &str = "candelabrum-stand";

// Starship: a DEPLOYABLE vehicle. The `starship-kit` item (itemdb key 600) places a
// `ship` env that drops from orbit (ENTERING phase, pilotless) and lands; reclaiming it
// flies the ship back to space and returns the kit. Board a landed ship to pilot it.
pub const STARSHIP_KIT_REF: &str = "starship-kit";

// Shrine: a static decorative stone structure placed near spawn, set apart from
// the campfire and tree line. Purely a landmark — blocks only its base tile, no
// auras or hazards (constructed inline, not driven from mapdb).
pub const SHRINE_REF: &str = "shrine";

// Ship: a parked starfighter landmark near spawn. A multi-tile vehicle — blocks a
// small footprint (not just its base tile), no auras or hazards (constructed inline,
// not driven from mapdb).
pub const SHIP_REF: &str = "ship";

// Which of the 16 baked facings the parked ship shows, streamed as `EntityDelta.sub`
// (frame index into the 4x4 sheet). 0 reads as West in-game; each step is +22.5deg.
// Bump this to re-aim the parked ship — no re-render, all 16 facings are baked.
pub const SHIP_PARKED_FACING: u8 = 0;

// --- Ship collision footprint ---------------------------------------------------
// The hull is elongated and rotates through 16 facings, so a single symmetric radius
// either over-blocks empty ground at the tips or under-blocks the body. Instead each
// facing carries the exact tiles its sprite-hull covers, baked from the art alpha by
// `kbve-ship-footprint` (kbve.sprite.ship_footprint) into `ship_footprint_gen.rs`
// (and the byte-identical client `shipFootprint.generated.ts`). Facing == the sub /
// FurnitureRot byte the server streams, so client prediction blocks the same tiles.

/// Tiles the ship occupies, centered on `base`, for `facing` (sub 0..15). The
/// per-facing offsets come from the baked `SHIP_FOOTPRINTS` table. Float movement
/// (`float_move::step_float`) resolves smoothly against whichever tiles are blocked,
/// so this set IS the collision shape. Reused for driving: unblock the old footprint,
/// move, block the new one (recompute with the new facing).
pub fn ship_footprint(base: Tile, facing: u8) -> Vec<Tile> {
    let f = (facing as usize) % 16;
    crate::ship_footprint_gen::SHIP_FOOTPRINTS[f]
        .iter()
        .map(|&(dx, dy)| Tile::new(base.x + dx, base.y + dy))
        .collect()
}

/// The ship's starter parked tile — where it spawns, and where the orphan-recovery
/// system (`pilot::recover_orphaned_ships`) returns a ship whose pilot vanished
/// mid-flight or in the space instance. Single indestructible ship for now.
pub fn ship_home_tile() -> Tile {
    let spawn = player_spawn();
    floor_near(Tile::new(spawn.x + 6, spawn.y + 4))
}

/// Would the ship's footprint (centered on `base`, at `facing`) overlap any impassable
/// tile? The multi-tile collision test for a DRIVEN ship: feed it as the `is_blocked`
/// closure to `float_move::step_float` (testing the footprint, not a single point) so
/// the whole hull stops at walls. Block the ship's own tiles only AFTER a move
/// resolves, so it never collides with itself.
#[allow(dead_code)] // wired in when driving lands; foundation only for now
pub fn ship_blocked(map: &WalkableMap, z: i32, base: Tile, facing: u8) -> bool {
    ship_footprint(base, facing)
        .into_iter()
        .any(|t| !map.is_walkable_z(z, t))
}

/// Player collision radius, in tiles. Mirrors the web `BODY_RADIUS` (config.ts) so
/// the server and client push the player out of the hull to the exact same spot.
const PLAYER_BODY_RADIUS: f32 = 0.34;

/// Push a circle (px,py,r) out of a CCW convex polygon (world-tile verts). Returns the
/// corrected position + world surface normal (to cancel inward velocity), or `None` if
/// already clear. The hull is baked CCW (interior-left, outward = right-of-edge) by
/// gen-ship-footprint.py. BYTE-FOR-BYTE mirror of the web `resolveShipHull`
/// (entities/env.ts) — both must agree or prediction rubber-bands.
fn resolve_circle_poly(
    px: f32,
    py: f32,
    r: f32,
    verts: &[(f32, f32)],
) -> Option<(f32, f32, f32, f32)> {
    let n = verts.len();
    if n < 3 {
        return None;
    }
    let mut inside = true;
    let mut best_d2 = f32::INFINITY;
    let (mut cx, mut cy, mut enx, mut eny) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for i in 0..n {
        let (ax, ay) = verts[i];
        let (bx, by) = verts[(i + 1) % n];
        let (ex, ey) = (bx - ax, by - ay);
        let len2 = (ex * ex + ey * ey).max(1e-9);
        let t = (((px - ax) * ex + (py - ay) * ey) / len2).clamp(0.0, 1.0);
        let (qx, qy) = (ax + t * ex, ay + t * ey);
        let (ddx, ddy) = (px - qx, py - qy);
        let d2 = ddx * ddx + ddy * ddy;
        // Interior is left of each directed edge (CCW); right of any → outside.
        if ex * (py - ay) - ey * (px - ax) < 0.0 {
            inside = false;
        }
        if d2 < best_d2 {
            best_d2 = d2;
            cx = qx;
            cy = qy;
            let el = len2.sqrt();
            enx = ey / el; // right-of-edge = outward
            eny = -ex / el;
        }
    }
    let d = best_d2.sqrt();
    if inside {
        // Exit through the nearest edge, clearing the radius.
        return Some((cx + r * enx, cy + r * eny, enx, eny));
    }
    if d < r {
        let (nx, ny) = if d > 1e-6 {
            ((px - cx) / d, (py - cy) / d)
        } else {
            (enx, eny)
        };
        return Some((cx + r * nx, cy + r * ny, nx, ny));
    }
    None
}

/// Smooth hull collision: after `advance_float` moves the players, push each player's
/// float body out of every ship's convex hull polygon (the accurate collision shape;
/// the tile footprint is only coarse NPC-pathing blocking). Runs before the snapshot so
/// the corrected position is authoritative, and mirrors the client `resolveShipHull` so
/// prediction agrees. Velocity into the hull is cancelled; tangential speed slides.
#[allow(clippy::type_complexity)]
pub fn resolve_ship_collision(
    ships: Query<
        (&GridPos, Option<&Floor>, Option<&FurnitureRot>, &EnvObject),
        Without<PlayerSlotTag>,
    >,
    // `Without<Piloting>` exempts the pilot — it must not be pushed out of the ship it
    // is currently flying (the pilot rides inside the hull by design).
    mut players: Query<
        (&mut FloatMove, &mut GridPos, Option<&Floor>),
        (With<PlayerSlotTag>, Without<simgrid::Piloting>),
    >,
) {
    // (z, base tile, world-space hull verts) per ship.
    let hulls: Vec<(i32, Vec<(f32, f32)>)> = ships
        .iter()
        .filter(|(_, _, _, env)| env.def_ref == SHIP_REF)
        .map(|(pos, floor, rot, _)| {
            let z = floor.map(|f| f.0).unwrap_or(0);
            let facing = (rot.map(|r| r.0).unwrap_or(0) as usize) % 16;
            let (bx, by) = (pos.tile.x as f32, pos.tile.y as f32);
            let verts = crate::ship_footprint_gen::SHIP_HULLS[facing]
                .iter()
                .map(|&(x, y)| (bx + x, by + y))
                .collect();
            (z, verts)
        })
        .collect();
    if hulls.is_empty() {
        return;
    }
    for (mut fm, mut pos, floor) in players.iter_mut() {
        let pz = floor.map(|f| f.0).unwrap_or(0);
        for (z, verts) in &hulls {
            if *z != pz {
                continue;
            }
            if let Some((nx, ny, wnx, wny)) =
                resolve_circle_poly(fm.body.x, fm.body.y, PLAYER_BODY_RADIUS, verts)
            {
                fm.body.x = nx;
                fm.body.y = ny;
                let vn = fm.body.vx * wnx + fm.body.vy * wny;
                if vn < 0.0 {
                    fm.body.vx -= vn * wnx;
                    fm.body.vy -= vn * wny;
                }
            }
        }
        let (tx, ty) = fm.body.tile();
        pos.tile = Tile::new(tx, ty);
    }
}

// Corpse: spawned where a player dies (PvE + PvP), holding their dropped
// inventory. Walkable + lootable (ACTION_LOOT from an adjacent tile transfers
// everything). The client renders it as the dead class's death-frame, staled,
// labelled "Graveyard of <name>". One env kind covers every corpse.
pub const CORPSE_REF: &str = "corpse";

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

/// First dungeon floor below the grass surface. Hostile creatures live here and
/// deeper (z <= this); the surface (z >= 0) is peaceful.
pub const DUNGEON_TOP_Z: i32 = -1;

/// Nearest floor tile to a hint on the ground floor — keeps spawns out of rock.
fn floor_near(hint: Tile) -> Tile {
    floor_near_z(hint, SPAWN_FLOOR)
}

/// Nearest walkable tile to a hint on dungeon floor `z` — keeps spawns out of
/// rock on any floor (the surface is fully open; dungeon floors snap to carve).
pub(crate) fn floor_near_z(hint: Tile, z: i32) -> Tile {
    let (x, y) =
        arpg_dungeon::nearest_floor(DUNGEON_SEED, z, hint.x, hint.y, arpg_dungeon::CHUNK_SIZE);
    Tile::new(x, y)
}

pub fn registry() -> KindRegistry {
    let mut reg = KindRegistry::new();
    creatures::register(&mut reg);
    reg.register_item(GOBLIN_LOOT_REF);
    reg.register_item(STAIR_KEY_REF);
    reg.register_item(POTION_REF);
    reg.register_item(CAMPFIRE_KIT_REF);
    reg.register_item(CANDELABRUM_KIT_REF);
    reg.register_item(STARSHIP_KIT_REF);
    reg.register_env(CAMPFIRE_REF);
    reg.register_env(CANDELABRUM_REF);
    reg.register_env(SHRINE_REF);
    reg.register_env(SHIP_REF);
    reg.register_env(CORPSE_REF);
    reg.register_env(simgrid::TREE_REF);
    reg.register_env(simgrid::BUSH_REF);
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
/// `regen` placed-effect becomes the heal aura (`range >= 1`), `mana_regen` the
/// mana aura, and `burning` the on-tile hazard (`range 0`). Returns `None` when
/// the ref is absent.
fn env_opts_from_mapdb(ref_id: &str, floor: i32) -> Option<EnvOpts> {
    let def = MAP_DB.get_object_def_by_ref(ref_id)?;
    let mut heal_aura = None;
    let mut mana_aura = None;
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
            "mana_regen" => {
                mana_aura = Some(ManaAura {
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
        mana_aura,
        hazard,
        floor,
    })
}

/// Behavior for a candelabrum env object: blocks its tile and restores mana in the
/// adjacent ring (no burn). Traces to the `candelabrum` mapdb WorldObjectDef.
pub fn candelabrum_env_opts(floor: i32) -> EnvOpts {
    env_opts_from_mapdb(CANDELABRUM_REF, floor)
        .expect("`candelabrum` WorldObjectDef present in mapdb-data.binpb")
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
    map.insert(
        CANDELABRUM_KIT_REF.to_string(),
        DeployableSpec {
            env_ref: CANDELABRUM_REF.to_string(),
            opts: candelabrum_env_opts(SPAWN_FLOOR),
        },
    );
    // The starship places a `ship` env that is NOT a static blocker: it spawns airborne
    // (the descent system gives it the ENTERING phase) and only blocks its hull footprint
    // once it lands, managed by the ship phase machine (pilot::drive_ships).
    map.insert(
        STARSHIP_KIT_REF.to_string(),
        DeployableSpec {
            env_ref: SHIP_REF.to_string(),
            opts: EnvOpts {
                blocker: false,
                heal_aura: None,
                mana_aura: None,
                hazard: None,
                floor: SPAWN_FLOOR,
            },
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

/// Embedded npcdb registry — the species templates the pet system mints instances
/// from (base stats, movepool, pet/catch metadata). Decoded from the canonical
/// `npcdb-data.json` (an `npc.NpcRegistry`), regenerated by `sync:npcdb`. Foundation
/// for catch + battle; wired into those systems in the pet phase.
#[allow(dead_code)]
pub fn npc_db() -> simgrid::NpcDb {
    simgrid::NpcDb::from_json(include_bytes!(
        "../../../../../packages/data/codegen/generated/npcdb-data.json"
    ))
    .expect("embedded npcdb-data.json decodes as npc registry")
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
        // Dead players drop everything into a `corpse` env object (resolved from
        // the deterministic registry, so the kind matches build_app's).
        corpse_kind: registry().kind_of(CORPSE_REF),
        starting_inventory: vec![
            // First slot: every player spawns with their own deployable ship (place
            // it, board, fly, recall). Per-player here instead of a single shared
            // ground drop so it works in multiplayer; max_stack 1 caps it at one.
            (STARSHIP_KIT_REF.to_string(), 1),
            (CAMPFIRE_KIT_REF.to_string(), 5),
            (CANDELABRUM_KIT_REF.to_string(), 3),
            (POTION_REF.to_string(), 3),
            // One dungeon-key so the first descent isn't gated behind loot the
            // player hasn't found yet. Held, not consumed (Stairs::at only checks
            // count > 0), so one lasts.
            (STAIR_KEY_REF.to_string(), 1),
        ],
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::arpg_dungeon(DUNGEON_SEED, PATH_WINDOW)
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

    // Seed a few goblins on the FIRST DUNGEON FLOOR (z=-1), clustered near where
    // the surface down-stair drops players in, so the dungeon has hostiles
    // waiting while the grass surface stays peaceful. Each snaps to a carve floor
    // tile so none start embedded in rock.
    let (dungeon_z, (lx, ly)) =
        arpg_dungeon::stair_dest(DUNGEON_SEED, SPAWN_FLOOR, arpg_dungeon::StairKind::Down);
    for i in 0..GOBLIN_COUNT {
        let hint = Tile::new(lx + 4 + (i % 3) * 2, ly + 4 + (i / 3) * 2);
        let origin = floor_near_z(hint, dungeon_z);
        if let Some(spec) = goblin_spec(&registry, origin, dungeon_z) {
            spawn_npc_from_spec(&mut commands, &spec);
        }
    }

    // Starter loot/key/potions sit on the grass surface near the player spawn.
    let spawn = player_spawn();
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

    // A stack of candelabrum stands too, so the rotatable mana-furniture loop is
    // testable from spawn (pick up -> place -> R rotates -> mana ring).
    let cand_tile = floor_near(Tile::new(spawn.x - 2, spawn.y - 2));
    if let Some(bundle) = ground_item_bundle(&registry, CANDELABRUM_KIT_REF, 25, cand_tile) {
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

    // A stone shrine set well apart from the campfire and the immediate tree line
    // — a landmark to orient new players. Blocks only its base tile.
    let shrine = floor_near(Tile::new(spawn.x - 6, spawn.y + 5));
    if shrine != spawn
        && shrine != fire
        && spawn_env_object(
            &mut commands,
            &registry,
            SHRINE_REF,
            shrine,
            EnvOpts {
                blocker: true,
                heal_aura: None,
                mana_aura: None,
                hazard: None,
                floor: SPAWN_FLOOR,
            },
        )
        .is_some()
    {
        walkable.block_tile_z(SPAWN_FLOOR, shrine);
    }

    // The ship is no longer a boot fixture — it's a DEPLOYABLE item every player now
    // spawns with (see `config().starting_inventory`), so no shared ground drop is
    // needed. `ship_home_tile()` survives as the tile the orphan-recovery system
    // re-parks a stranded ship onto.

    // Restore player-placed objects persisted from a previous server lifetime.
    // They return as unowned world fixtures (no PlacedBy, behavior re-derived
    // from the mapdb def) — still block/heal/burn, but no longer reclaimable.
    for o in &restored.0 {
        let tile = Tile::new(o.x, o.y);
        // Felled trees persist as `tree` records carrying their variant|0x80 in
        // `sub`. They come back already felled (walkable, no blocker) so a
        // re-streamed tree on that tile stays down.
        if o.env_ref == simgrid::TREE_REF {
            simgrid::spawn_tree(
                &mut commands,
                &registry,
                tile,
                o.floor,
                simgrid::TreeState::from_sub(o.sub),
            );
            continue;
        }
        // Harvested bushes persist as `bush` records carrying their variant|0x80 in
        // `sub`. They come back already harvested (walkable, never blocking) so a
        // re-streamed bush on that tile stays picked.
        if o.env_ref == simgrid::BUSH_REF {
            simgrid::spawn_bush(
                &mut commands,
                &registry,
                tile,
                o.floor,
                simgrid::BushState::from_sub(o.sub),
            );
            continue;
        }
        let Some(opts) = env_opts_from_mapdb(&o.env_ref, o.floor) else {
            continue;
        };
        let blocker = opts.blocker;
        if let Some(eid) = spawn_env_object(&mut commands, &registry, &o.env_ref, tile, opts) {
            // Rotatable furniture persists its facing in `sub`; bring it back so the
            // restored prop renders the same orientation it was placed at.
            if o.env_ref == CANDELABRUM_REF {
                commands.entity(eid).insert(simgrid::FurnitureRot(o.sub));
            }
            if blocker {
                walkable.block_tile_z(o.floor, tile);
            }
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
    fn npcdb_embeds_and_mints_mechamutt() {
        let db = super::npc_db();
        let species = db.get("mechamutt").expect("mechamutt species present");
        assert!(species.is_catchable(), "mechamutt is catchable");
        let snap = simgrid::mint_pet_from_species(species, 5).expect("mints a pet");
        assert_eq!(snap.species_ref, "mechamutt");
        assert!(snap.vitals.max_hp > 0 && !snap.moves.is_empty());
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
    fn candelabrum_env_opts_trace_to_mapdb() {
        let opts = super::candelabrum_env_opts(super::SPAWN_FLOOR);
        assert!(opts.blocker, "candelabrum blocks its tile");
        let aura = opts
            .mana_aura
            .expect("mana_regen placed-effect → mana aura");
        assert_eq!((aura.range, aura.magnitude, aura.period_ticks), (2, 2, 20));
        assert!(opts.hazard.is_none(), "candelabrum has no burn hazard");
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

    #[test]
    fn ship_footprint_translates_baked_offsets() {
        use super::Tile;
        let base = Tile::new(10, 20);
        for facing in 0u8..16 {
            let tiles = super::ship_footprint(base, facing);
            let baked = &crate::ship_footprint_gen::SHIP_FOOTPRINTS[facing as usize];
            assert!(
                !tiles.is_empty(),
                "facing {facing} has a non-empty footprint"
            );
            assert_eq!(
                tiles.len(),
                baked.len(),
                "facing {facing} tile count matches table"
            );
            // Each tile is the baked offset translated onto the base.
            for (t, &(dx, dy)) in tiles.iter().zip(baked.iter()) {
                assert_eq!(*t, Tile::new(base.x + dx, base.y + dy));
            }
        }
    }

    #[test]
    fn ship_footprint_facing_wraps_mod_16() {
        use super::Tile;
        let base = Tile::new(0, 0);
        // The sub byte can carry phase in its high bits; ship_footprint masks to 16.
        assert_eq!(
            super::ship_footprint(base, 3),
            super::ship_footprint(base, 3 + 16)
        );
    }
}
