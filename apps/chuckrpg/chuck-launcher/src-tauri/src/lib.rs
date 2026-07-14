mod launcher;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use erust::supabase::Session;
use erust::tauri as ebridge;
use erust::SupabaseClient;
use launcher::{ClientVersion, Installed, LauncherError};
use serde::Serialize;
use tauri::{Emitter, Window};

struct LaunchGuard(Arc<Mutex<Option<Instant>>>);
struct Auth(SupabaseClient);

const LAUNCH_DEBOUNCE: Duration = Duration::from_secs(5);
const SUPABASE_URL: &str = "https://supabase.kbve.com";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg";

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

#[tauri::command]
fn auth_authorize_url(provider: String, redirect_to: String, auth: tauri::State<'_, Auth>) -> String {
    auth.0.authorize_url(&provider, &redirect_to)
}

#[tauri::command]
async fn auth_complete(
    callback_url: String,
    auth: tauri::State<'_, Auth>,
) -> Result<Session, String> {
    let client = auth.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::complete_oauth_blocking(&client.config, &callback_url) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(session)
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn auth_session(auth: tauri::State<'_, Auth>) -> Option<Session> {
    auth.0.get_session()
}

#[tauri::command]
fn auth_restore(session: Session, auth: tauri::State<'_, Auth>) {
    auth.0.set_session(session);
}

#[tauri::command]
async fn auth_refresh(auth: tauri::State<'_, Auth>) -> Result<Option<Session>, String> {
    let client = auth.0.clone();
    let refresh = match client.get_session() {
        Some(s) => s.refresh_token,
        None => return Ok(None),
    };
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::refresh_blocking(&client.config, &refresh) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(Some(session))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn auth_sign_out(auth: tauri::State<'_, Auth>) {
    auth.0.clear_session();
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
    session: Option<Session>,
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
        .manage(Auth(SupabaseClient::new(SUPABASE_URL, SUPABASE_ANON_KEY)))
        .invoke_handler(tauri::generate_handler![
            current_platform,
            fetch_clients,
            install_state,
            install_update,
            launch,
            auth_authorize_url,
            auth_complete,
            auth_session,
            auth_restore,
            auth_refresh,
            auth_sign_out,
        ])
        .run(tauri::generate_context!())
        .expect("error while running chuck-launcher");
}
