use crate::AVERAGE_FRAME_RATE;
#[cfg(not(target_arch = "wasm32"))]
use crate::game::inventory::get_inventory_snapshot_json;
use crate::game::object_registry::get_registry_snapshot;
use crate::game::scene_objects::{get_hovered_snapshot, get_selected_snapshot};
use crate::game::state::get_player_snapshot;
use std::sync::atomic::Ordering;

#[cfg(not(target_arch = "wasm32"))]
use crate::game::object_registry::ObjectRegistrySnapshot;
#[cfg(not(target_arch = "wasm32"))]
use crate::game::scene_objects::{HoveredObject, SelectedObject};
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
pub fn get_selected_object() -> Option<SelectedObject> {
    get_selected_snapshot()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn get_hovered_object() -> Option<HoveredObject> {
    get_hovered_snapshot()
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn get_inventory() -> Option<String> {
    get_inventory_snapshot_json()
}

#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn dispatch_action(entity_id: f64, action: String) {
    crate::game::actions::push_action(crate::game::actions::ActionRequest {
        entity_id: entity_id as u64,
        action,
    });
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}

// ── Native input forwarders ──────────────────────────────────────────
// JS captures pointer/key/wheel on `window` (capture phase) and invokes
// these commands. Each pushes a typed event onto the static buffer
// drained by `game::native_input::drain_native_input` once per frame.

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_pointer_move(x: f64, y: f64) {
    static FIRST: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
    if FIRST.swap(false, std::sync::atomic::Ordering::Relaxed) {
        eprintln!("[native-input] first pointer move received x={x} y={y}");
    }
    crate::game::native_input::push_event(
        crate::game::native_input::NativeInputEvent::PointerMove { x, y },
    );
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_pointer_button(button: u8, pressed: bool) {
    eprintln!("[native-input] pointer button={button} pressed={pressed}");
    crate::game::native_input::push_event(
        crate::game::native_input::NativeInputEvent::PointerButton { button, pressed },
    );
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_pointer_enter(x: f64, y: f64) {
    crate::game::native_input::push_event(
        crate::game::native_input::NativeInputEvent::PointerEntered { x, y },
    );
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_pointer_leave() {
    crate::game::native_input::push_event(crate::game::native_input::NativeInputEvent::PointerLeft);
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_wheel(dx: f64, dy: f64) {
    crate::game::native_input::push_event(crate::game::native_input::NativeInputEvent::Wheel {
        dx,
        dy,
    });
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_viewport(css_w: f64, css_h: f64, dpr: f64) {
    crate::game::native_input::push_event(crate::game::native_input::NativeInputEvent::Viewport {
        css_w,
        css_h,
        dpr,
    });
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn forward_key(code: String, pressed: bool, repeat: bool) {
    if !repeat {
        eprintln!("[native-input] key code={code} pressed={pressed}");
    }
    crate::game::native_input::push_event(crate::game::native_input::NativeInputEvent::Key {
        code,
        pressed,
        repeat,
    });
}

#[cfg(not(target_arch = "wasm32"))]
#[tauri::command]
pub fn open_oauth_url(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let redirect = crate::auth::build_redirect_url();
    let url = format!(
        "https://kbve.com/auth/desktop?provider={}&redirect={}",
        provider,
        urlencoding::encode(&redirect),
    );
    eprintln!("[auth] opening OAuth url for provider={provider}: {url}");
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(not(target_arch = "wasm32"))]
pub fn handle_deep_link(_app: &tauri::AppHandle, url: &str) {
    crate::auth::handle_deep_link(url);
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
pub fn get_selected_object_json() -> Option<String> {
    get_selected_snapshot().map(|s| serde_json::to_string(&s).unwrap_or_default())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn get_hovered_object_json() -> Option<String> {
    get_hovered_snapshot().map(|s| serde_json::to_string(&s).unwrap_or_default())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn dispatch_action(entity_id: f64, action: &str) {
    crate::game::actions::push_action(crate::game::actions::ActionRequest {
        entity_id: entity_id as u64,
        action: action.to_owned(),
    });
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn go_online(server_addr: &str, jwt: &str) {
    crate::game::net::request_go_online(server_addr, jwt);
}

/// Browser-side sign-in path: Astro arcade page reads the Supabase session
/// from IndexedDB via `authBridge` and calls this after the WASM module
/// boots. Mirrors the native localhost-listener flow — records the
/// username for the title-screen badge AND kicks off `request_go_online`
/// so the netcode handshake fires immediately, no Play Online click
/// needed.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn set_signed_in(jwt: &str) {
    if jwt.is_empty() {
        return;
    }
    crate::auth_common::record_signin(jwt);
    crate::game::net::request_go_online("", jwt);
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn set_username(username: &str) {
    crate::game::net::request_set_username(username);
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn get_online_status() -> bool {
    crate::game::net::is_online()
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Welcome to the Isometric realm, {}!", name)
}
