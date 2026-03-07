use crate::game::state::{PLAYER_STATE_SNAPSHOT, PlayerState};
use crate::tauri_plugin::AVERAGE_FRAME_RATE;
use std::sync::atomic::Ordering;

#[tauri::command]
pub fn get_fps() -> usize {
    AVERAGE_FRAME_RATE.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn get_player_state() -> PlayerState {
    PLAYER_STATE_SNAPSHOT
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}
