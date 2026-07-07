// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod launcher;

#[tauri::command]
async fn check_updates() -> Result<String, String> {
    launcher::check_for_updates().await
}

#[tauri::command]
async fn download_game(version: String) -> Result<String, String> {
    launcher::download_game_version(&version).await
}

#[tauri::command]
async fn launch_game() -> Result<(), String> {
    launcher::launch_game()
}

#[tauri::command]
async fn get_game_status() -> Result<launcher::GameStatus, String> {
    launcher::get_status()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();

            println!("Single instance called with args: {:?}", args);
        }))
        .invoke_handler(tauri::generate_handler![
            check_updates,
            download_game,
            launch_game,
            get_game_status
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
