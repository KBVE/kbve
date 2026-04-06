//! Local persistence via `bevy_db` — caches player state, inventory, collected
//! tiles, and server sync data so the client can resume quickly on reconnect.

use bevy::prelude::*;
use bevy_db::{Db, DbRequest};

use super::state::PlayerState;
use super::tilemap::CollectedTiles;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/// bevy_db table names — all persistence goes through these.
const TABLE_PLAYER: &str = "player";
const TABLE_WORLD: &str = "world";

/// Fixed keys within each table.
const KEY_PLAYER_STATE: &str = "state";
const KEY_COLLECTED_TILES: &str = "collected_tiles";
const KEY_LAST_POSITION: &str = "last_position";

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

/// Throttle for player state saves (every 5 seconds).
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
                save_player_state,
                save_collected_tiles_on_change,
            ),
        );
    }
}

// ---------------------------------------------------------------------------
// Startup: kick off load requests
// ---------------------------------------------------------------------------

fn kick_off_loads(db: Res<Db>, mut pending: ResMut<PendingLoads>) {
    pending.player_state = Some(db.get::<PlayerState>(TABLE_PLAYER, KEY_PLAYER_STATE));
    pending.collected_tiles = Some(db.get::<Vec<(i32, i32)>>(TABLE_WORLD, KEY_COLLECTED_TILES));
    pending.last_position = Some(db.get::<[f32; 3]>(TABLE_PLAYER, KEY_LAST_POSITION));
}

// ---------------------------------------------------------------------------
// Receive cached data and apply to ECS
// ---------------------------------------------------------------------------

fn receive_loads(
    mut pending: ResMut<PendingLoads>,
    mut player_state: ResMut<PlayerState>,
    mut collected: ResMut<CollectedTiles>,
) {
    if pending.done {
        return;
    }

    let mut all_done = true;

    // Player state
    if let Some(ref req) = pending.player_state {
        if let Some(result) = req.try_recv() {
            if let Ok(Some(cached)) = result {
                // Restore cached vitals (position restored separately after spawn)
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

    // Last position (just store it — player spawn system will use it)
    if let Some(ref req) = pending.last_position {
        if let Some(_result) = req.try_recv() {
            pending.last_position = None;
        } else {
            all_done = false;
        }
    }

    if all_done {
        pending.done = true;
    }
}

// ---------------------------------------------------------------------------
// Save: player state (throttled)
// ---------------------------------------------------------------------------

fn save_player_state(
    time: Res<Time>,
    mut timer: ResMut<PersistTimer>,
    db: Res<Db>,
    player_state: Res<PlayerState>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    // Fire-and-forget writes
    let _ = db.put(TABLE_PLAYER, KEY_PLAYER_STATE, &*player_state);
    let _ = db.put(TABLE_PLAYER, KEY_LAST_POSITION, &player_state.position);
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
