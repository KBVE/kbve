use crate::AVERAGE_FRAME_RATE;
use crate::game::object_registry::get_registry_snapshot;
use crate::game::state::get_player_snapshot;
use std::sync::atomic::Ordering;

#[cfg(not(target_arch = "wasm32"))]
use crate::game::object_registry::ObjectRegistrySnapshot;
#[cfg(not(target_arch = "wasm32"))]
use crate::game::state::PlayerState;

// ---------------------------------------------------------------------------
// Desktop: Tauri IPC commands
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn get_fps() -> usize {
    AVERAGE_FRAME_RATE.load(Ordering::Relaxed)
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn get_player_state() -> PlayerState {
    get_player_snapshot().unwrap_or_default()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn get_object_registry() -> Option<ObjectRegistrySnapshot> {
    get_registry_snapshot()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}

// ---------------------------------------------------------------------------
// WASM: wasm-bindgen exports (returns JSON strings for JS consumption)
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn get_fps() -> usize {
    AVERAGE_FRAME_RATE.load(Ordering::Relaxed)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn get_player_state_json() -> String {
    let state = get_player_snapshot().unwrap_or_default();
    serde_json::to_string(&state).unwrap_or_default()
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn get_object_registry_json() -> Option<String> {
    get_registry_snapshot().map(|s| serde_json::to_string(&s).unwrap_or_default())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}
