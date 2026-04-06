//! Local persistence via `bevy_db` — caches player state, inventory, collected
//! tiles, and server sync data so the client can resume quickly on reconnect.

use bevy::prelude::*;
use bevy_db::{Db, DbRequest};
use bevy_inventory::Inventory;

use super::inventory::ItemKind;
use super::net::ServerTime;
use super::state::PlayerState;
use super::tilemap::CollectedTiles;

// ---------------------------------------------------------------------------
// Tables + keys
// ---------------------------------------------------------------------------

const TABLE_PLAYER: &str = "player";
const TABLE_WORLD: &str = "world";

const KEY_PLAYER_STATE: &str = "state";
const KEY_LAST_POSITION: &str = "last_position";
const KEY_INVENTORY: &str = "inventory";
const KEY_COLLECTED_TILES: &str = "collected_tiles";
const KEY_SERVER_TIME: &str = "server_time";

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
        app.add_systems(Startup, kick_off_loads);
        app.add_systems(
            Update,
            (
                receive_loads,
                save_periodic,
                save_collected_tiles_on_change,
                save_server_time_on_change,
                save_inventory_on_change,
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
