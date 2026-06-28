mod launcher;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use launcher::{ClientVersion, GameSession, Installed, LauncherError};
use serde::Serialize;
use tauri::{Emitter, Window};

struct LaunchGuard(Arc<Mutex<Option<Instant>>>);

const LAUNCH_DEBOUNCE: Duration = Duration::from_secs(5);

fn backend(arg: Option<String>) -> String {
    arg.filter(|s| !s.is_empty())
        .or_else(|| {
            std::env::var("CHUCK_BACKEND")
                .ok()
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(default_backend)
}

fn default_backend() -> String {
    if cfg!(debug_assertions) {
        "http://localhost:4399".to_string()
    } else {
        launcher::DEFAULT_BACKEND.to_string()
    }
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
fn launch(
    window: Window,
    url: Option<String>,
    session: Option<GameSession>,
    guard: tauri::State<'_, LaunchGuard>,
) -> Result<(), LauncherError> {
    {
        let mut last = guard.0.lock().unwrap();
        if last.map(|t| t.elapsed() < LAUNCH_DEBOUNCE).unwrap_or(false) {
            return Ok(());
        }
        *last = Some(Instant::now());
    }
    match launcher::launch(url.as_deref(), session.as_ref()) {
        Ok(mut child) => {
            let win = window.clone();
            let last = guard.0.clone();
            std::thread::spawn(move || {
                let _ = child.wait();
                *last.lock().unwrap() = None;
                let _ = win.emit("game://exited", ());
            });
            Ok(())
        }
        Err(e) => {
            *guard.0.lock().unwrap() = None;
            Err(e)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(LaunchGuard(Arc::new(Mutex::new(None))))
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
