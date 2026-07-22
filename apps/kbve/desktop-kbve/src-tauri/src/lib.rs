pub mod auth;
pub mod pty;
pub mod terminal;
mod views;

use auth::{
    auth_authorize_url, auth_complete, auth_refresh, auth_restore, auth_session, auth_sign_out,
};
use std::sync::Arc;
use tauri::{Manager, State};
use tauri_specta::{collect_commands, Builder};
use terminal::{terminal_close, terminal_open, terminal_resize, terminal_write};
use tokio::sync::mpsc;
use views::{ViewCommand, ViewError, ViewManager, ViewSnapshot, ViewStatus};

#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to KBVE Desktop.", name)
}

/// Send a Start command to a view actor.
#[tauri::command]
#[specta::specta]
async fn view_start(id: String, manager: State<'_, Arc<ViewManager>>) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::Start).await
}

/// Send a Stop command to a view actor.
#[tauri::command]
#[specta::specta]
async fn view_stop(id: String, manager: State<'_, Arc<ViewManager>>) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::Stop).await
}

/// Get the current status of a view.
#[tauri::command]
#[specta::specta]
fn view_status(id: String, manager: State<'_, Arc<ViewManager>>) -> Result<ViewStatus, ViewError> {
    manager.status(&id)
}

/// Get a full snapshot of a view's state.
#[tauri::command]
#[specta::specta]
async fn view_snapshot(
    id: String,
    manager: State<'_, Arc<ViewManager>>,
) -> Result<ViewSnapshot, ViewError> {
    manager.snapshot(&id).await
}

/// Update a view's configuration.
#[tauri::command]
#[specta::specta]
async fn view_update_config(
    id: String,
    config: serde_json::Value,
    manager: State<'_, Arc<ViewManager>>,
) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::UpdateConfig(config)).await
}

/// List all registered views and their statuses.
#[tauri::command]
#[specta::specta]
fn view_list(manager: State<'_, Arc<ViewManager>>) -> Vec<(String, ViewStatus)> {
    manager.list()
}

/// Build the tauri-specta command collection. Kept as a free function so it can
/// be reused by the bindings-export path and the runtime invoke_handler.
fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        greet,
        view_start,
        view_stop,
        view_status,
        view_snapshot,
        view_update_config,
        view_list,
        terminal_open,
        terminal_write,
        terminal_resize,
        terminal_close,
        auth_authorize_url,
        auth_complete,
        auth_session,
        auth_restore,
        auth_refresh,
        auth_sign_out,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    #[allow(unused_mut)]
    let mut app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_macos_permissions::init());

    #[cfg(desktop)]
    {
        app = app
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ));
    }

    app.manage(auth::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let manager = Arc::new(ViewManager::new(handle));
            app.manage(manager.clone());

            // Defer view registration to run inside the Tokio runtime
            tauri::async_runtime::spawn(async move {
                views::register_all(&manager);
            });

            let (tx, rx) = mpsc::channel(256);
            let pty_manager = Arc::new(pty::PtyManager::new(tx));
            app.manage(pty_manager);
            terminal::spawn_event_pump(app.handle().clone(), rx);

            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
