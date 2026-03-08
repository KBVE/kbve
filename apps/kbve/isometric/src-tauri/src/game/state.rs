use bevy::prelude::*;
use serde::{Deserialize, Serialize};

// Desktop: DashMap for thread-safe cross-thread snapshot access (Tauri IPC)
#[cfg(not(target_arch = "wasm32"))]
use dashmap::DashMap;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::LazyLock;

#[cfg(not(target_arch = "wasm32"))]
pub static PLAYER_STATE_SNAPSHOT: LazyLock<DashMap<(), PlayerState>> = LazyLock::new(DashMap::new);

// WASM: single-threaded RefCell (no atomics needed)
#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
thread_local! {
    pub static PLAYER_STATE_SNAPSHOT_WASM: RefCell<Option<PlayerState>> = const { RefCell::new(None) };
}

/// Read the latest player state snapshot (platform-independent).
pub fn get_player_snapshot() -> Option<PlayerState> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        PLAYER_STATE_SNAPSHOT.get(&()).map(|r| r.value().clone())
    }
    #[cfg(target_arch = "wasm32")]
    {
        PLAYER_STATE_SNAPSHOT_WASM.with(|cell| cell.borrow().clone())
    }
}

#[derive(Resource, Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub health: f32,
    pub max_health: f32,
    pub mana: f32,
    pub max_mana: f32,
    pub position: [f32; 3],
    pub inventory_slots: usize,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            health: 100.0,
            max_health: 100.0,
            mana: 50.0,
            max_mana: 50.0,
            position: [0.0, 0.0, 0.0],
            inventory_slots: 16,
        }
    }
}

pub struct GameStatePlugin;

impl Plugin for GameStatePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<PlayerState>();
        app.add_systems(Update, snapshot_player_state);
    }
}

fn snapshot_player_state(state: Res<PlayerState>) {
    if state.is_changed() {
        #[cfg(not(target_arch = "wasm32"))]
        {
            PLAYER_STATE_SNAPSHOT.insert((), state.clone());
        }
        #[cfg(target_arch = "wasm32")]
        {
            PLAYER_STATE_SNAPSHOT_WASM.with(|cell| {
                *cell.borrow_mut() = Some(state.clone());
            });
        }
    }
}
