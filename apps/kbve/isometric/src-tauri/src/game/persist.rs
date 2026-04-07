//! Local persistence via `bevy_db` — caches player state, inventory, collected
//! tiles, and server sync data so the client can resume quickly on reconnect.

use bevy::prelude::*;
use bevy_db::{Db, DbRequest};
use bevy_inventory::Inventory;
use bevy_kbve_net::creatures::influence::PatrolMode;
use bevy_kbve_net::creatures::nav_systems::NeedsPatrolRoute;
use bevy_kbve_net::creatures::patrol::{DwellAction, PatrolRoute, PatrolStep};
use bevy_kbve_net::creatures::types::{
    Creature, CreatureState, SpriteCreatureMarker, SpriteCreatureTypes, SpriteData,
};
use bevy_kbve_net::creatures::waypoint_graph::WaypointGraph;

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
const TABLE_NAV: &str = "nav";

const TABLE_CREATURES: &str = "creatures";

const KEY_WAYPOINT_GRAPH: &str = "waypoint_graph";
const KEY_CACHE_SEED: &str = "cache_seed";

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
        app.init_resource::<WaypointGraphCacheState>();
        app.init_resource::<CacheSeedCheck>();
        app.add_systems(
            Startup,
            (
                kick_off_loads,
                kick_off_waypoint_graph_load,
                kick_off_cache_seed_check,
            ),
        );
        app.add_systems(
            Update,
            (
                // Core state
                receive_loads,
                save_periodic,
                save_collected_tiles_on_change,
                save_server_time_on_change,
                save_inventory_on_change,
                // Terrain cache
                load_cached_terrain_chunks,
                receive_cached_terrain_chunks,
                cache_new_terrain_chunks,
                // Navigation cache
                receive_waypoint_graph_cache,
                cache_waypoint_graph_on_change,
                cache_new_patrol_routes,
                // Patrol route cache loading (intercepts before generation)
                try_load_patrol_from_cache,
                receive_cached_patrol_routes,
                // Creature state
                save_creature_states,
                // Cache invalidation
                receive_cache_seed_check,
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

// ---------------------------------------------------------------------------
// WaypointGraph caching
// ---------------------------------------------------------------------------

/// Tracks whether we've saved/loaded the waypoint graph this session.
#[derive(Resource, Default)]
struct WaypointGraphCacheState {
    saved_version: usize,
    load_pending: Option<DbRequest<Option<WaypointGraph>>>,
    load_done: bool,
}

/// On startup, try to load a cached WaypointGraph.
fn kick_off_waypoint_graph_load(db: Res<Db>, mut state: ResMut<WaypointGraphCacheState>) {
    if state.load_done {
        return;
    }
    if state.load_pending.is_some() {
        return;
    }
    state.load_pending = Some(db.get::<WaypointGraph>(TABLE_NAV, KEY_WAYPOINT_GRAPH));
}

/// Receive cached WaypointGraph and inject into ECS.
/// `WaypointGraph` may not exist yet at startup (inserted by another plugin),
/// so we accept `Option<ResMut<..>>` and skip if absent.
fn receive_waypoint_graph_cache(
    graph: Option<ResMut<WaypointGraph>>,
    mut state: ResMut<WaypointGraphCacheState>,
) {
    if state.load_done {
        return;
    }
    let Some(ref req) = state.load_pending else {
        return;
    };
    if let Some(result) = req.try_recv() {
        if let Ok(Some(cached)) = result {
            if !cached.waypoints.is_empty() {
                if let Some(mut graph) = graph {
                    *graph = cached;
                }
            }
        }
        state.load_pending = None;
        state.load_done = true;
    }
}

/// Cache the WaypointGraph when it changes (new waypoints built by nav_systems).
fn cache_waypoint_graph_on_change(
    db: Res<Db>,
    graph: Option<Res<WaypointGraph>>,
    mut state: ResMut<WaypointGraphCacheState>,
) {
    let Some(graph) = graph else { return };
    if !graph.is_changed() {
        return;
    }
    let version = graph.waypoints.len();
    if version == state.saved_version || graph.waypoints.is_empty() {
        return;
    }
    state.saved_version = version;
    let _ = db.put(TABLE_NAV, KEY_WAYPOINT_GRAPH, &*graph);
}

// ---------------------------------------------------------------------------
// PatrolRoute caching — serializable DTO
// ---------------------------------------------------------------------------

/// Serializable version of PatrolStep (replaces &'static str with String).
#[derive(serde::Serialize, serde::Deserialize)]
struct CachedDwell {
    kind: u8, // 0 = Idle, 1 = Emote
    duration: f32,
    anim: String,
    repeat: u32,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CachedPatrolStep {
    target: [f32; 3],
    dwell: CachedDwell,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CachedPatrolRoute {
    steps: Vec<CachedPatrolStep>,
    mode: PatrolMode,
}

impl CachedPatrolRoute {
    fn from_route(route: &PatrolRoute) -> Self {
        Self {
            steps: route
                .steps
                .iter()
                .map(|s| CachedPatrolStep {
                    target: [s.target.x, s.target.y, s.target.z],
                    dwell: match s.dwell {
                        DwellAction::Idle { duration } => CachedDwell {
                            kind: 0,
                            duration,
                            anim: String::new(),
                            repeat: 0,
                        },
                        DwellAction::Emote { anim, repeat } => CachedDwell {
                            kind: 1,
                            duration: 0.0,
                            anim: anim.to_string(),
                            repeat,
                        },
                    },
                })
                .collect(),
            mode: route.mode,
        }
    }

    fn to_route(&self, anim_lookup: &[&'static str]) -> PatrolRoute {
        PatrolRoute {
            steps: self
                .steps
                .iter()
                .map(|s| PatrolStep {
                    target: Vec3::new(s.target[0], s.target[1], s.target[2]),
                    dwell: if s.dwell.kind == 0 {
                        DwellAction::Idle {
                            duration: s.dwell.duration,
                        }
                    } else {
                        // Find the static str that matches, or fall back to idle
                        let anim = anim_lookup
                            .iter()
                            .find(|&&a| a == s.dwell.anim)
                            .copied()
                            .unwrap_or("idle");
                        DwellAction::Emote {
                            anim,
                            repeat: s.dwell.repeat,
                        }
                    },
                })
                .collect(),
            current: 0,
            mode: self.mode,
            forward: true,
        }
    }
}

/// Format patrol route key: "type_key:slot_seed"
fn patrol_key(type_key: &str, slot_seed: u32) -> String {
    format!("{type_key}:{slot_seed}")
}

/// Cache newly-created patrol routes (fire-and-forget).
fn cache_new_patrol_routes(
    db: Res<Db>,
    query: Query<(&Creature, &SpriteCreatureMarker, &PatrolRoute), Added<PatrolRoute>>,
) {
    for (cr, marker, route) in &query {
        let key = patrol_key(marker.type_key, cr.slot_seed);
        let cached = CachedPatrolRoute::from_route(route);
        let _ = db.put(TABLE_NAV, &key, &cached);
    }
}

// ---------------------------------------------------------------------------
// PatrolRoute cache loading — try cache before generating
// ---------------------------------------------------------------------------

/// Pending cache load for a patrol route.
#[derive(Component)]
struct PendingPatrolCacheLoad {
    req: DbRequest<Option<CachedPatrolRoute>>,
}

/// For creatures tagged NeedsPatrolRoute, try loading from cache first.
/// If we dispatch a cache load, remove NeedsPatrolRoute so the generation
/// pipeline doesn't also fire. If cache misses, we re-add NeedsPatrolRoute.
fn try_load_patrol_from_cache(
    mut commands: Commands,
    db: Res<Db>,
    query: Query<
        (Entity, &Creature, &SpriteCreatureMarker),
        (With<NeedsPatrolRoute>, Without<PendingPatrolCacheLoad>),
    >,
) {
    for (entity, cr, marker) in &query {
        let key = patrol_key(marker.type_key, cr.slot_seed);
        let req = db.get::<CachedPatrolRoute>(TABLE_NAV, &key);
        commands
            .entity(entity)
            .remove::<NeedsPatrolRoute>()
            .insert(PendingPatrolCacheLoad { req });
    }
}

/// Receive cached patrol routes. On hit, insert PatrolRoute directly.
/// On miss, re-add NeedsPatrolRoute so the generation pipeline picks it up.
fn receive_cached_patrol_routes(
    mut commands: Commands,
    types: Option<Res<SpriteCreatureTypes>>,
    query: Query<(Entity, &SpriteCreatureMarker, &PendingPatrolCacheLoad)>,
) {
    let Some(types) = types else { return };
    for (entity, marker, pending) in &query {
        match pending.req.try_recv() {
            Some(Ok(Some(cached))) => {
                // Look up emote anims for the anim_lookup table
                let anim_lookup: Vec<&'static str> = types
                    .types
                    .iter()
                    .find(|t| t.npc_ref == marker.type_key)
                    .map(|t| t.patrol_emotes.to_vec())
                    .unwrap_or_default();
                let route = cached.to_route(&anim_lookup);
                commands
                    .entity(entity)
                    .remove::<PendingPatrolCacheLoad>()
                    .insert(route);
            }
            Some(_) => {
                // Cache miss or error — fall back to generation
                commands
                    .entity(entity)
                    .remove::<PendingPatrolCacheLoad>()
                    .insert(NeedsPatrolRoute);
            }
            None => {} // Still loading
        }
    }
}

// ---------------------------------------------------------------------------
// Creature state caching — save/restore active creature positions
// ---------------------------------------------------------------------------

/// Serializable snapshot of one creature's state.
#[derive(serde::Serialize, serde::Deserialize)]
struct CachedCreatureState {
    anchor: [f32; 3],
    facing_left: bool,
    patrol_step: u32,
}

/// Format creature state key: "type_key:pool_index"
fn creature_state_key(type_key: &str, slot_seed: u32) -> String {
    format!("{type_key}:{slot_seed}")
}

/// Periodically save active creature positions (runs on the same 5s timer).
fn save_creature_states(
    time: Res<Time>,
    timer: Res<PersistTimer>,
    db: Res<Db>,
    query: Query<(&Creature, &SpriteCreatureMarker, &SpriteData)>,
) {
    // Piggyback on the persist timer (already ticked by save_periodic)
    if !timer.0.just_finished() {
        return;
    }

    for (cr, marker, sd) in &query {
        if cr.state != CreatureState::Active {
            continue;
        }
        // Skip pooled creatures (y < -50)
        if cr.anchor.y < -50.0 {
            continue;
        }

        let key = creature_state_key(marker.type_key, cr.slot_seed);
        let state = CachedCreatureState {
            anchor: [cr.anchor.x, cr.anchor.y, cr.anchor.z],
            facing_left: sd.facing_left,
            patrol_step: marker.patrol_step,
        };
        let _ = db.put(TABLE_CREATURES, &key, &state);
    }
}

// ---------------------------------------------------------------------------
// Cache invalidation — detect terrain seed changes
// ---------------------------------------------------------------------------

/// Resource tracking whether we've validated the cache seed.
#[derive(Resource, Default)]
struct CacheSeedCheck {
    req: Option<DbRequest<Option<u32>>>,
    done: bool,
}

fn kick_off_cache_seed_check(db: Res<Db>, mut check: ResMut<CacheSeedCheck>) {
    if check.done || check.req.is_some() {
        return;
    }
    check.req = Some(db.get::<u32>(TABLE_WORLD, KEY_CACHE_SEED));
}

fn receive_cache_seed_check(
    db: Res<Db>,
    terrain: Res<TerrainMap>,
    mut check: ResMut<CacheSeedCheck>,
    mut terrain_cache: ResMut<TerrainCacheState>,
    mut wp_cache: ResMut<WaypointGraphCacheState>,
) {
    if check.done {
        return;
    }
    let Some(ref req) = check.req else { return };

    if let Some(result) = req.try_recv() {
        let cached_seed = result.ok().flatten();
        let current_seed = terrain.seed;

        if cached_seed != Some(current_seed) {
            // Seed changed — invalidate terrain and nav caches
            // Clear local tracking so everything gets re-cached
            terrain_cache.saved.clear();
            terrain_cache.resolved.clear();
            wp_cache.saved_version = 0;

            // Overwrite the stored seed
            let _ = db.put(TABLE_WORLD, KEY_CACHE_SEED, &current_seed);
        }

        check.req = None;
        check.done = true;
    }
}
