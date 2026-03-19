mod views;

use tauri::State;
use views::{ViewCommand, ViewError, ViewManager, ViewSnapshot, ViewStatus};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to KBVE Desktop.", name)
}

/// Send a Start command to a view actor.
#[tauri::command]
async fn view_start(id: String, manager: State<'_, ViewManager>) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::Start).await
}

/// Send a Stop command to a view actor.
#[tauri::command]
async fn view_stop(id: String, manager: State<'_, ViewManager>) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::Stop).await
}

/// Get the current status of a view.
#[tauri::command]
fn view_status(id: String, manager: State<'_, ViewManager>) -> Result<ViewStatus, ViewError> {
    manager.status(&id)
}

/// Get a full snapshot of a view's state.
#[tauri::command]
async fn view_snapshot(
    id: String,
    manager: State<'_, ViewManager>,
) -> Result<ViewSnapshot, ViewError> {
    manager.snapshot(&id).await
}

/// Update a view's configuration.
#[tauri::command]
async fn view_update_config(
    id: String,
    config: serde_json::Value,
    manager: State<'_, ViewManager>,
) -> Result<(), ViewError> {
    manager.send(&id, ViewCommand::UpdateConfig(config)).await
}

/// List all registered views and their statuses.
#[tauri::command]
fn view_list(manager: State<'_, ViewManager>) -> Vec<(String, ViewStatus)> {
    manager.list()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let manager = ViewManager::new();
    views::register_all(&manager);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(manager)
        .invoke_handler(tauri::generate_handler![
            greet,
            view_start,
            view_stop,
            view_status,
            view_snapshot,
            view_update_config,
            view_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
