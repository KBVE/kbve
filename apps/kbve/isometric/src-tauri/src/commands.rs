use crate::game::object_registry::{OBJECT_REGISTRY_SNAPSHOT, ObjectRegistrySnapshot};
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
        .get(&())
        .map(|r| r.value().clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_object_registry() -> Option<ObjectRegistrySnapshot> {
    OBJECT_REGISTRY_SNAPSHOT.get(&()).map(|r| r.value().clone())
}

#[tauri::command]
pub fn on_input_frame(
    keys_pressed: Vec<String>,
    keys_released: Vec<String>,
    cursor_x: f32,
    cursor_y: f32,
    cursor_valid: bool,
    mouse_pressed: Vec<u8>,
    mouse_released: Vec<u8>,
    scroll_y: f32,
) {
    crate::game::input_bridge::receive_input(
        keys_pressed,
        keys_released,
        cursor_x,
        cursor_y,
        cursor_valid,
        mouse_pressed,
        mouse_released,
        scroll_y,
    );
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}
