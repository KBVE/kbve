use bevy::prelude::{Commands, Entity, Query, Res, ResMut, With, Without};
use simgrid::arpg_dungeon;
use simgrid::proto::Tile;
use simgrid::rng::hash3;
use simgrid::{
    AggroSpec, EntityKind, Floor, GridPos, KindRegistry, NpcSpec, PersistedEnvLog, PlayerSlotTag,
    SIM_TICK_HZ, SimClock, SimSeed, TREE_REF, TREE_VARIANTS, TreeState, WalkableMap, has_clearance,
    spawn_npc_from_spec, spawn_tree,
};

use crate::game::{DUNGEON_SEED, DUNGEON_TOP_Z, SPAWN_FLOOR, floor_near_z, player_spawn};

pub const NPC_RESPAWN_TICKS: u32 = SIM_TICK_HZ * 30;

pub const GOBLIN_REF: &str = "goblin";
pub const GOBLIN_COUNT: i32 = 6;
pub const GOBLIN_LOOT_REF: &str = "coin";

pub const GOBLIN_HP: i32 = 24;
pub const GOBLIN_DAMAGE: i32 = 3;
pub const GOBLIN_DEFENSE: i32 = 0;
pub const GOBLIN_TICKS_PER_TILE: u8 = 6;
pub const HOSTILE_AGGRO_RANGE: i32 = 6;

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
// Open-space ring the predator needs per tile: its sprite spans ~2.5 tiles, so
// it only roams/spawns where a 3×3 block is clear — keeps the big body in rooms
// and wide junctions instead of clipping walls or overhanging the void.
pub const PREDATOR_CLEARANCE: i32 = 1;
// Streaming spawn budget: how many predators may exist near each player, the
// ring (in tiles) they appear within, and how close they're allowed to pop in.
pub const PREDATOR_PER_PLAYER: usize = 3;
pub const PREDATOR_SPAWN_MIN: i32 = 12;
pub const PREDATOR_SPAWN_MAX: i32 = 22;
pub const PREDATOR_DESPAWN_RADIUS: i32 = 40;
// Re-evaluate the streamed population a few times a second, not every tick.
pub const PREDATOR_STREAM_PERIOD_TICKS: u32 = SIM_TICK_HZ / 2;
// Safe zone (Chebyshev tiles) around each floor's up-stair — the room players
// land in when they descend. No predator spawns inside it, so arriving on a new
// floor isn't an instant ambush.
pub const STAIR_SAFE_RADIUS: i32 = 8;

// Wyvern — a NEUTRAL flying creature that drifts over the grass surface (z >= 0),
// the peaceful counterpart to the underground predator. It roams but never aggros
// (aggro: None), so the surface stays safe. Ships as four elemental variant sheets
// on the client; the server rolls one per spawn. Flyer, so no big-body clearance
// rule — it hovers above the tiles instead of clipping walls.
pub const WYVERN_REFS: [&str; 4] = ["wyvern_air", "wyvern_water", "wyvern_fire", "wyvern_shadow"];
pub const WYVERN_HP: i32 = 40;
pub const WYVERN_DEFENSE: i32 = 1;
pub const WYVERN_TICKS_PER_TILE: u8 = 4;
pub const WYVERN_LEVEL: i32 = 2;
pub const WYVERN_ROAM_RADIUS: i32 = 14;
pub const WYVERN_DWELL_MIN_TICKS: u32 = SIM_TICK_HZ;
pub const WYVERN_DWELL_MAX_TICKS: u32 = SIM_TICK_HZ * 2;
pub const WYVERN_CLEARANCE: i32 = 0;
pub const WYVERN_PER_PLAYER: usize = 2;
pub const WYVERN_SPAWN_MIN: i32 = 14;
pub const WYVERN_SPAWN_MAX: i32 = 24;
pub const WYVERN_DESPAWN_RADIUS: i32 = 44;
pub const WYVERN_STREAM_PERIOD_TICKS: u32 = SIM_TICK_HZ / 2;

pub fn register(reg: &mut KindRegistry) {
    reg.register_npc(GOBLIN_REF);
    reg.register_npc(PREDATOR_REF);
    for wyvern in WYVERN_REFS {
        reg.register_npc(wyvern);
    }
}

pub fn goblin_spec(registry: &KindRegistry, origin: Tile, floor: i32) -> Option<NpcSpec> {
    let kind = registry.kind_of(GOBLIN_REF)?;
    Some(NpcSpec {
        kind,
        origin,
        floor,
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

fn predator_spec(registry: &KindRegistry, origin: Tile, floor: i32) -> Option<NpcSpec> {
    let kind = registry.kind_of(PREDATOR_REF)?;
    Some(NpcSpec {
        kind,
        origin,
        floor,
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
            PREDATOR_CLEARANCE,
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
    map: Res<WalkableMap>,
    players: Query<(&GridPos, Option<&Floor>), With<PlayerSlotTag>>,
    predators: Query<(Entity, &GridPos, Option<&Floor>, &EntityKind), Without<PlayerSlotTag>>,
    mut commands: Commands,
) {
    if !clock.tick.is_multiple_of(PREDATOR_STREAM_PERIOD_TICKS) {
        return;
    }
    let Some(pred_kind) = registry.kind_of(PREDATOR_REF) else {
        return;
    };

    // Only players underground (z <= DUNGEON_TOP_Z) attract predators — the grass
    // surface (z >= 0) is peaceful. Track each dungeon player's floor so spawns +
    // culling stay on the right level.
    let dungeon_players: Vec<(Tile, i32)> = players
        .iter()
        .map(|(p, f)| (p.tile, f.map(|f| f.0).unwrap_or(0)))
        .filter(|(_, z)| *z <= DUNGEON_TOP_Z)
        .collect();

    // Cull any predator not near a player on its own floor (surface players never
    // keep one alive). Despawns everything when no one is underground.
    let mut alive: Vec<(Tile, i32)> = Vec::new();
    for (entity, pos, pfloor, kind) in predators.iter() {
        if kind.0 != pred_kind {
            continue;
        }
        let pz = pfloor.map(|f| f.0).unwrap_or(0);
        let near = dungeon_players
            .iter()
            .any(|(pt, z)| *z == pz && chebyshev(*pt, pos.tile) <= PREDATOR_DESPAWN_RADIUS);
        if near {
            alive.push((pos.tile, pz));
        } else {
            commands.entity(entity).despawn();
        }
    }

    for (i, (ptile, pz)) in dungeon_players.iter().enumerate() {
        let local = alive
            .iter()
            .filter(|(t, z)| z == pz && chebyshev(*t, *ptile) <= PREDATOR_SPAWN_MAX)
            .count();
        if local >= PREDATOR_PER_PLAYER {
            continue;
        }
        // This floor's arrival room: the up-stair tile players land on when they
        // descend. Keep predators out of a safe radius around it.
        let (ex, ey) = arpg_dungeon::stair_tile(DUNGEON_SEED, *pz, arpg_dungeon::StairKind::Up);
        let entry = Tile::new(ex, ey);
        for attempt in 0..8u64 {
            let h = hash3(seed.0, ((i as u64) << 8) | attempt, clock.tick as u64);
            let span = (PREDATOR_SPAWN_MAX - PREDATOR_SPAWN_MIN + 1) as u64;
            let dist = PREDATOR_SPAWN_MIN + ((h >> 8) % span) as i32;
            let (dx, dy) = ring_offset((h % 8) as u8, dist);
            let hint = Tile::new(ptile.x + dx, ptile.y + dy);
            let origin = floor_near_z(hint, *pz);
            if chebyshev(origin, *ptile) < PREDATOR_SPAWN_MIN {
                continue;
            }
            if chebyshev(origin, entry) <= STAIR_SAFE_RADIUS {
                continue;
            }
            // Don't spawn the big creature pinned against a wall — require the
            // same open ring it needs to roam.
            if !has_clearance(&map, *pz, origin, PREDATOR_CLEARANCE) {
                continue;
            }
            if let Some(spec) = predator_spec(&registry, origin, *pz) {
                spawn_npc_from_spec(&mut commands, &spec);
                alive.push((origin, *pz));
            }
            break;
        }
    }
}

fn wyvern_spec(
    registry: &KindRegistry,
    origin: Tile,
    floor: i32,
    variant: usize,
) -> Option<NpcSpec> {
    let kind = registry.kind_of(WYVERN_REFS[variant % WYVERN_REFS.len()])?;
    Some(NpcSpec {
        kind,
        origin,
        floor,
        ticks_per_tile: WYVERN_TICKS_PER_TILE,
        max_hp: WYVERN_HP,
        level: WYVERN_LEVEL,
        defense: WYVERN_DEFENSE,
        wander: None,
        roam: Some((
            WYVERN_ROAM_RADIUS,
            WYVERN_DWELL_MIN_TICKS,
            WYVERN_DWELL_MAX_TICKS,
            WYVERN_CLEARANCE,
        )),
        // Neutral: drifts past players without engaging.
        aggro: None,
        loot: None,
        respawn_ticks: 0,
    })
}

/// Stream neutral wyverns over the grass surface, mirroring `stream_predators`
/// but for SURFACE players (z >= 0) and with no aggro. Periodically culls any
/// wyvern that drifted out of every surface player's despawn radius, then tops
/// each player's local flock back up to `WYVERN_PER_PLAYER` on open tiles in a
/// ring around them, rolling a random elemental variant per spawn.
pub fn stream_wyverns(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    registry: Res<KindRegistry>,
    map: Res<WalkableMap>,
    players: Query<(&GridPos, Option<&Floor>), With<PlayerSlotTag>>,
    wyverns: Query<(Entity, &GridPos, Option<&Floor>, &EntityKind), Without<PlayerSlotTag>>,
    mut commands: Commands,
) {
    if !clock.tick.is_multiple_of(WYVERN_STREAM_PERIOD_TICKS) {
        return;
    }
    let wyvern_kinds: Vec<u16> = WYVERN_REFS
        .iter()
        .filter_map(|r| registry.kind_of(r))
        .collect();
    if wyvern_kinds.is_empty() {
        return;
    }

    // Only players on the surface (z >= 0) attract wyverns; the dungeon is the
    // predator's domain.
    let surface_players: Vec<(Tile, i32)> = players
        .iter()
        .map(|(p, f)| (p.tile, f.map(|f| f.0).unwrap_or(0)))
        .filter(|(_, z)| *z >= 0)
        .collect();

    let mut alive: Vec<(Tile, i32)> = Vec::new();
    for (entity, pos, pfloor, kind) in wyverns.iter() {
        if !wyvern_kinds.contains(&kind.0) {
            continue;
        }
        let pz = pfloor.map(|f| f.0).unwrap_or(0);
        let near = surface_players
            .iter()
            .any(|(pt, z)| *z == pz && chebyshev(*pt, pos.tile) <= WYVERN_DESPAWN_RADIUS);
        if near {
            alive.push((pos.tile, pz));
        } else {
            commands.entity(entity).despawn();
        }
    }

    for (i, (ptile, pz)) in surface_players.iter().enumerate() {
        let local = alive
            .iter()
            .filter(|(t, z)| z == pz && chebyshev(*t, *ptile) <= WYVERN_SPAWN_MAX)
            .count();
        if local >= WYVERN_PER_PLAYER {
            continue;
        }
        for attempt in 0..8u64 {
            let h = hash3(seed.0, ((i as u64) << 8) | attempt, clock.tick as u64);
            let span = (WYVERN_SPAWN_MAX - WYVERN_SPAWN_MIN + 1) as u64;
            let dist = WYVERN_SPAWN_MIN + ((h >> 8) % span) as i32;
            let (dx, dy) = ring_offset((h % 8) as u8, dist);
            let hint = Tile::new(ptile.x + dx, ptile.y + dy);
            let origin = floor_near_z(hint, *pz);
            if chebyshev(origin, *ptile) < WYVERN_SPAWN_MIN {
                continue;
            }
            if !has_clearance(&map, *pz, origin, WYVERN_CLEARANCE) {
                continue;
            }
            let variant = ((h >> 16) % WYVERN_REFS.len() as u64) as usize;
            if let Some(spec) = wyvern_spec(&registry, origin, *pz, variant) {
                spawn_npc_from_spec(&mut commands, &spec);
                alive.push((origin, *pz));
            }
            break;
        }
    }
}

// Trees — NEUTRAL static env props on the z=0 grass surface. Each standing tree
// blocks its tile; a player adjacent to one fells it (server-authoritative). They
// stream around surface players like wyverns, each rolling a random visual variant
// (0..=69), and persist their felled state via the env log.
pub const TREE_PER_PLAYER: usize = 6;
pub const TREE_SPAWN_MIN: i32 = 5;
pub const TREE_SPAWN_MAX: i32 = 18;
pub const TREE_DESPAWN_RADIUS: i32 = 40;
pub const TREE_STREAM_PERIOD_TICKS: u32 = SIM_TICK_HZ / 2;

/// Stream surface trees around z=0 players, mirroring `stream_wyverns` but for a
/// static blocking prop. Periodically tops each surface player's local stand back
/// up to `TREE_PER_PLAYER` on open grass tiles in a ring, rolling a random variant
/// per spawn and blocking the tile. Never spawns on the player spawn tile, the
/// surface stairs, an already-occupied tile, or a tile a felled tree persisted to.
#[allow(clippy::too_many_arguments)]
pub fn stream_trees(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    registry: Res<KindRegistry>,
    mut map: ResMut<WalkableMap>,
    log: Res<PersistedEnvLog>,
    players: Query<(&GridPos, Option<&Floor>), With<PlayerSlotTag>>,
    trees: Query<(Entity, &GridPos, Option<&Floor>), With<TreeState>>,
    mut commands: Commands,
) {
    if !clock.tick.is_multiple_of(TREE_STREAM_PERIOD_TICKS) {
        return;
    }
    if registry.kind_of(TREE_REF).is_none() {
        return;
    }

    let surface_players: Vec<Tile> = players
        .iter()
        .filter(|(_, f)| f.map(|f| f.0).unwrap_or(0) == SPAWN_FLOOR)
        .map(|(p, _)| p.tile)
        .collect();

    let mut alive: Vec<Tile> = Vec::new();
    for (entity, pos, pfloor) in trees.iter() {
        if pfloor.map(|f| f.0).unwrap_or(0) != SPAWN_FLOOR {
            continue;
        }
        let near = surface_players
            .iter()
            .any(|pt| chebyshev(*pt, pos.tile) <= TREE_DESPAWN_RADIUS);
        if near {
            alive.push(pos.tile);
        } else {
            commands.entity(entity).despawn();
            map.unblock_tile_z(SPAWN_FLOOR, pos.tile);
        }
    }

    let spawn = player_spawn();
    let (dx_t, dy_t) =
        arpg_dungeon::stair_tile(DUNGEON_SEED, SPAWN_FLOOR, arpg_dungeon::StairKind::Down);
    let down_stair = Tile::new(dx_t, dy_t);

    for (i, ptile) in surface_players.iter().enumerate() {
        let local = alive
            .iter()
            .filter(|t| chebyshev(**t, *ptile) <= TREE_SPAWN_MAX)
            .count();
        if local >= TREE_PER_PLAYER {
            continue;
        }
        for attempt in 0..8u64 {
            let h = hash3(seed.0, ((i as u64) << 8) | attempt, clock.tick as u64);
            let span = (TREE_SPAWN_MAX - TREE_SPAWN_MIN + 1) as u64;
            let dist = TREE_SPAWN_MIN + ((h >> 8) % span) as i32;
            let (dx, dy) = ring_offset((h % 8) as u8, dist);
            let tile = Tile::new(ptile.x + dx, ptile.y + dy);
            if tile == spawn || tile == down_stair {
                continue;
            }
            if !map.is_walkable_z(SPAWN_FLOOR, tile) {
                continue;
            }
            if alive.contains(&tile) {
                continue;
            }
            if log.0.iter().any(|o| {
                o.env_ref == TREE_REF && o.x == tile.x && o.y == tile.y && o.floor == SPAWN_FLOOR
            }) {
                continue;
            }
            let variant = ((h >> 16) % TREE_VARIANTS as u64) as u8;
            let state = TreeState {
                variant,
                felled: false,
            };
            if spawn_tree(&mut commands, &registry, tile, SPAWN_FLOOR, state).is_some() {
                map.block_tile_z(SPAWN_FLOOR, tile);
                alive.push(tile);
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
