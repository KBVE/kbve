//! Local persistence via `bevy_db` — caches player state, inventory, collected
//! tiles, and server sync data so the client can resume quickly on reconnect.

use bevy::prelude::*;
use bevy_db::{Db, DbRequest};
use bevy_inventory::Inventory;

use std::collections::{HashMap, HashSet};

use super::inventory::ItemKind;
use super::net::ServerTime;
use super::state::PlayerState;
use super::terrain::TerrainMap;
use super::tilemap::CollectedTiles;

// ---------------------------------------------------------------------------
// Tables + keys
// ---------------------------------------------------------------------------

const TABLE_PLAYER: &str = "player";
const TABLE_WORLD: &str = "world";
const TABLE_TERRAIN: &str = "terrain";

const KEY_PLAYER_STATE: &str = "state";
const KEY_LAST_POSITION: &str = "last_position";
const KEY_INVENTORY: &str = "inventory";
const KEY_COLLECTED_TILES: &str = "collected_tiles";
const KEY_SERVER_TIME: &str = "server_time";

/// Format a terrain chunk key: "cx:cz"
fn chunk_key(cx: i32, cz: i32) -> String {
    format!("{cx}:{cz}")
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

/// Throttle for periodic saves (every 5 seconds).
#[derive(Resource)]
struct PersistTimer(Timer);

impl Default for PersistTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(5.0, TimerMode::Repeating))
    }
}

// ---------------------------------------------------------------------------
// Pending load requests (startup)
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
struct PendingLoads {
    player_state: Option<DbRequest<Option<PlayerState>>>,
    collected_tiles: Option<DbRequest<Option<Vec<(i32, i32)>>>>,
    last_position: Option<DbRequest<Option<[f32; 3]>>>,
    inventory: Option<DbRequest<Option<Inventory<ItemKind>>>>,
    server_time: Option<DbRequest<Option<ServerTime>>>,
    done: bool,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct PersistPlugin;

impl Plugin for PersistPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<PersistTimer>();
        app.init_resource::<PendingLoads>();
        app.init_resource::<TerrainCacheState>();
        app.add_systems(Startup, kick_off_loads);
        app.add_systems(
            Update,
            (
                receive_loads,
                save_periodic,
                save_collected_tiles_on_change,
                save_server_time_on_change,
                save_inventory_on_change,
                load_cached_terrain_chunks,
                receive_cached_terrain_chunks,
                cache_new_terrain_chunks,
            ),
        );
    }
}

// ---------------------------------------------------------------------------
// Startup: kick off all load requests in parallel
// ---------------------------------------------------------------------------

fn kick_off_loads(db: Res<Db>, mut pending: ResMut<PendingLoads>) {
    pending.player_state = Some(db.get::<PlayerState>(TABLE_PLAYER, KEY_PLAYER_STATE));
    pending.collected_tiles = Some(db.get::<Vec<(i32, i32)>>(TABLE_WORLD, KEY_COLLECTED_TILES));
    pending.last_position = Some(db.get::<[f32; 3]>(TABLE_PLAYER, KEY_LAST_POSITION));
    pending.inventory = Some(db.get::<Inventory<ItemKind>>(TABLE_PLAYER, KEY_INVENTORY));
    pending.server_time = Some(db.get::<ServerTime>(TABLE_WORLD, KEY_SERVER_TIME));
}

// ---------------------------------------------------------------------------
// Receive cached data and apply to ECS resources
// ---------------------------------------------------------------------------

fn receive_loads(
    mut pending: ResMut<PendingLoads>,
    mut player_state: ResMut<PlayerState>,
    mut collected: ResMut<CollectedTiles>,
    mut server_time: ResMut<ServerTime>,
    inventory_q: Option<ResMut<Inventory<ItemKind>>>,
) {
    if pending.done {
        return;
    }

    let mut all_done = true;

    // Player state
    if let Some(ref req) = pending.player_state {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(cached)) = result {
                player_state.health = cached.health;
                player_state.max_health = cached.max_health;
                player_state.mana = cached.mana;
                player_state.max_mana = cached.max_mana;
                player_state.energy = cached.energy;
                player_state.max_energy = cached.max_energy;
                player_state.inventory_slots = cached.inventory_slots;
            }
            pending.player_state = None;
        } else {
            all_done = false;
        }
    }

    // Collected tiles
    if let Some(ref req) = pending.collected_tiles {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(tiles)) = result {
                for tile in tiles {
                    collected.0.insert(tile);
                }
            }
            pending.collected_tiles = None;
        } else {
            all_done = false;
        }
    }

    // Last position
    if let Some(ref req) = pending.last_position {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(pos)) = result {
                player_state.position = pos;
            }
            pending.last_position = None;
        } else {
            all_done = false;
        }
    }

    // Inventory
    if let Some(ref req) = pending.inventory {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(cached_inv)) = result {
                if let Some(mut inv) = inventory_q {
                    *inv = cached_inv;
                }
            }
            pending.inventory = None;
        } else {
            all_done = false;
        }
    }

    // Server time (creature_seed, game_hour, etc.)
    if let Some(ref req) = pending.server_time {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(cached)) = result {
                // Restore cached time sync — will be overwritten once server connects
                if !server_time.active {
                    server_time.game_hour = cached.game_hour;
                    server_time.creature_seed = cached.creature_seed;
                    server_time.wind_speed_mph = cached.wind_speed_mph;
                    server_time.wind_direction = cached.wind_direction;
                    // Don't set active=true — that's for live server sync only
                }
            }
            pending.server_time = None;
        } else {
            all_done = false;
        }
    }

    if all_done {
        pending.done = true;
    }
}

// ---------------------------------------------------------------------------
// Save: player state + inventory (throttled every 5s)
// ---------------------------------------------------------------------------

fn save_periodic(
    time: Res<Time>,
    mut timer: ResMut<PersistTimer>,
    db: Res<Db>,
    player_state: Res<PlayerState>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    let _ = db.put(TABLE_PLAYER, KEY_PLAYER_STATE, &*player_state);
    let _ = db.put(TABLE_PLAYER, KEY_LAST_POSITION, &player_state.position);
}

// ---------------------------------------------------------------------------
// Save: inventory (on change)
// ---------------------------------------------------------------------------

fn save_inventory_on_change(db: Res<Db>, inventory: Option<Res<Inventory<ItemKind>>>) {
    let Some(inv) = inventory else { return };
    if !inv.is_changed() {
        return;
    }

    let _ = db.put(TABLE_PLAYER, KEY_INVENTORY, &*inv);
}

// ---------------------------------------------------------------------------
// Save: collected tiles (on change)
// ---------------------------------------------------------------------------

fn save_collected_tiles_on_change(db: Res<Db>, collected: Res<CollectedTiles>) {
    if !collected.is_changed() {
        return;
    }

    let tiles: Vec<(i32, i32)> = collected.0.iter().copied().collect();
    let _ = db.put(TABLE_WORLD, KEY_COLLECTED_TILES, &tiles);
}

// ---------------------------------------------------------------------------
// Save: server time sync (on change)
// ---------------------------------------------------------------------------

fn save_server_time_on_change(db: Res<Db>, server_time: Res<ServerTime>) {
    if !server_time.is_changed() || !server_time.active {
        return;
    }

    let _ = db.put(TABLE_WORLD, KEY_SERVER_TIME, &*server_time);
}

// ---------------------------------------------------------------------------
// Terrain chunk caching
// ---------------------------------------------------------------------------

/// Tracks which chunks have been written to / loaded from the cache,
/// so we don't re-save or re-request them every frame.
#[derive(Resource, Default)]
struct TerrainCacheState {
    /// Chunks we've already saved to bevy_db.
    saved: HashSet<(i32, i32)>,
    /// Chunks we've dispatched a load request for.
    pending_loads: HashMap<(i32, i32), DbRequest<Option<Vec<((i32, i32), f32)>>>>,
    /// Chunks that have been fully resolved (loaded or generated).
    resolved: HashSet<(i32, i32)>,
}

/// Cache newly-generated terrain chunks to bevy_db (fire-and-forget).
fn cache_new_terrain_chunks(
    db: Res<Db>,
    terrain: Res<TerrainMap>,
    mut cache_state: ResMut<TerrainCacheState>,
) {
    // Look at chunks_to_spawn — these are freshly generated chunks that need
    // tile entities. If we haven't cached them yet, save their height maps.
    for &(cx, cz) in &terrain.chunks_to_spawn {
        if cache_state.saved.contains(&(cx, cz)) {
            continue;
        }
        if let Some(heights) = terrain.chunk_heights(cx, cz) {
            let data: Vec<((i32, i32), f32)> = heights.iter().map(|(&k, &v)| (k, v)).collect();
            let key = chunk_key(cx, cz);
            let _ = db.put(TABLE_TERRAIN, &key, &data);
            cache_state.saved.insert((cx, cz));
        }
    }
}

/// Before terrain generates a chunk, try to load it from cache.
/// This runs every frame and checks if there are chunks that terrain wants
/// to generate that we could satisfy from bevy_db instead.
fn load_cached_terrain_chunks(
    db: Res<Db>,
    terrain: Res<TerrainMap>,
    mut cache_state: ResMut<TerrainCacheState>,
) {
    // Check chunks_to_spawn for any we haven't resolved yet
    for &(cx, cz) in &terrain.chunks_to_spawn {
        if cache_state.resolved.contains(&(cx, cz)) {
            continue;
        }
        if cache_state.pending_loads.contains_key(&(cx, cz)) {
            continue;
        }
        // Only request from cache if we haven't already saved it this session
        // (if we saved it, it was generated fresh and doesn't need loading)
        if cache_state.saved.contains(&(cx, cz)) {
            cache_state.resolved.insert((cx, cz));
            continue;
        }

        let key = chunk_key(cx, cz);
        let req = db.get::<Vec<((i32, i32), f32)>>(TABLE_TERRAIN, &key);
        cache_state.pending_loads.insert((cx, cz), req);
    }
}

/// Receive cached terrain chunks and inject them into TerrainMap.
fn receive_cached_terrain_chunks(
    mut terrain: ResMut<TerrainMap>,
    mut cache_state: ResMut<TerrainCacheState>,
) {
    // Collect completed keys first to avoid borrow conflict
    let completed: Vec<((i32, i32), Option<Vec<((i32, i32), f32)>>)> = cache_state
        .pending_loads
        .iter()
        .filter_map(|(&key, req)| {
            req.try_recv().map(|result| {
                let data = result.ok().flatten();
                (key, data)
            })
        })
        .collect();

    for ((cx, cz), data) in completed {
        if let Some(heights_vec) = data {
            let heights: HashMap<(i32, i32), f32> = heights_vec.into_iter().collect();
            terrain.insert_cached_chunk(cx, cz, heights);
            cache_state.saved.insert((cx, cz));
        }
        cache_state.resolved.insert((cx, cz));
        cache_state.pending_loads.remove(&(cx, cz));
    }
}
