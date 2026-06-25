mod launcher;

use launcher::{ClientVersion, Installed, LauncherError};
use serde::Serialize;
use tauri::{Emitter, Window};

fn backend(arg: Option<String>) -> String {
    arg.filter(|s| !s.is_empty())
        .or_else(|| std::env::var("CHUCK_BACKEND").ok())
        .unwrap_or_else(|| launcher::DEFAULT_BACKEND.to_string())
}

#[tauri::command]
fn current_platform() -> String {
    launcher::current_platform().to_string()
}

#[tauri::command]
async fn fetch_clients(backend_url: Option<String>) -> Result<Vec<ClientVersion>, LauncherError> {
    launcher::fetch_clients(&backend(backend_url)).await
}

#[tauri::command]
fn install_state() -> Option<Installed> {
    launcher::read_state()
}

#[derive(Clone, Serialize)]
struct Progress {
    received: u64,
    total: u64,
}

#[tauri::command]
async fn install_update(
    window: Window,
    backend_url: Option<String>,
) -> Result<Installed, LauncherError> {
    let win = window.clone();
    launcher::install_update(&backend(backend_url), move |received, total| {
        let _ = win.emit("install://progress", Progress { received, total });
    })
    .await
}

#[tauri::command]
fn launch() -> Result<(), LauncherError> {
    launcher::launch()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            current_platform,
            fetch_clients,
            install_state,
            install_update,
            launch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running chuck-launcher");
}
