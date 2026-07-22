pub mod actions;
pub mod audio_feedback;
pub mod audio_toolkit;
pub mod auth;
pub mod clipboard;
pub mod commands;
pub mod helpers;
pub mod input;
pub mod local_llm;
pub mod local_tts;
pub mod managers;
pub mod memory;
pub mod onichan;
pub mod onichan_conversation;
pub mod onichan_models;
pub mod overlay;
pub mod pty;
pub mod settings;
pub mod shortcut;
pub mod terminal;
pub mod tray;
pub mod tray_i18n;
pub mod utils;
pub mod vad_model;
mod views;

use std::collections::HashMap;
use std::sync::Mutex;

/// Tracks toggle-mode shortcut activation state (binding_id -> is_active).
#[derive(Default)]
pub struct ShortcutToggleStates {
    pub active_toggles: HashMap<String, bool>,
}

pub type ManagedToggleState = Mutex<ShortcutToggleStates>;

/// Bring the main window to the foreground (used by the tray "settings" item).
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

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
        // dictation: app/core
        commands::cancel_operation,
        commands::get_app_dir_path,
        commands::get_app_settings,
        commands::get_default_settings,
        commands::get_log_dir_path,
        commands::open_recordings_folder,
        commands::open_log_dir,
        commands::open_app_data_dir,
        commands::reset_app_data,
        // dictation: models
        commands::models::get_available_models,
        commands::models::get_model_info,
        commands::models::download_model,
        commands::models::delete_model,
        commands::models::set_active_model,
        commands::models::get_current_model,
        commands::models::get_transcription_model_status,
        commands::models::is_model_loading,
        commands::models::has_any_models_available,
        commands::models::has_any_models_or_downloads,
        commands::models::cancel_download,
        commands::models::get_recommended_first_model,
        // dictation: audio
        commands::audio::check_custom_sounds,
        commands::audio::update_microphone_mode,
        commands::audio::get_microphone_mode,
        commands::audio::get_available_microphones,
        commands::audio::set_selected_microphone,
        commands::audio::get_selected_microphone,
        commands::audio::get_available_output_devices,
        commands::audio::set_selected_output_device,
        commands::audio::get_selected_output_device,
        commands::audio::play_test_sound,
        commands::audio::set_clamshell_microphone,
        commands::audio::get_clamshell_microphone,
        commands::audio::is_recording,
        // dictation: transcription
        commands::transcription::set_model_unload_timeout,
        commands::transcription::get_model_load_status,
        commands::transcription::unload_model_manually,
        // dictation: shortcuts
        shortcut::change_binding,
        shortcut::reset_binding,
        shortcut::change_ptt_setting,
        shortcut::change_paste_method_setting,
        // onichan: assistant
        commands::onichan::onichan_enable,
        commands::onichan::onichan_disable,
        commands::onichan::onichan_is_active,
        commands::onichan::onichan_get_mode,
        commands::onichan::onichan_set_mode,
        commands::onichan::onichan_process_input,
        commands::onichan::onichan_speak,
        commands::onichan::onichan_clear_history,
        commands::onichan::onichan_get_history,
        commands::onichan::get_onichan_models,
        commands::onichan::get_onichan_llm_models,
        commands::onichan::get_onichan_tts_models,
        commands::onichan::download_onichan_model,
        commands::onichan::delete_onichan_model,
        commands::onichan::load_local_llm,
        commands::onichan::unload_local_llm,
        commands::onichan::is_local_llm_loaded,
        commands::onichan::get_local_llm_model_name,
        commands::onichan::local_llm_chat,
        commands::onichan::load_local_tts,
        commands::onichan::unload_local_tts,
        commands::onichan::is_local_tts_loaded,
        commands::onichan::local_tts_speak,
        commands::onichan::onichan_start_conversation,
        commands::onichan::onichan_stop_conversation,
        commands::onichan::onichan_is_conversation_running,
        // onichan: memory
        commands::memory::get_memory_status,
        commands::memory::query_all_memories,
        commands::memory::get_memory_count,
        commands::memory::clear_all_memories,
        commands::memory::cleanup_old_memories,
        commands::memory::list_embedding_models,
        commands::memory::load_embedding_model,
        commands::memory::get_current_embedding_model,
        commands::memory::stop_memory_sidecar,
        commands::memory::browse_recent_memories,
        commands::memory::list_memory_users,
        // onichan: sidecar quick-config
        commands::sidecar_config::get_sidecar_quick_config,
        commands::sidecar_config::set_sidecar_quick_config_field,
    ])
}

#[cfg(test)]
mod bindings_export {
    /// Regenerates src/bindings.ts from the current command set.
    /// Run with `cargo test export_bindings` (or it runs on `cargo test`).
    #[test]
    fn export_bindings() {
        super::specta_builder()
            .export(
                specta_typescript::Typescript::default().bigint(specta_typescript::BigIntExportBehavior::Number),
                "../src/bindings.ts",
            )
            .expect("failed to export typescript bindings");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default().bigint(specta_typescript::BigIntExportBehavior::Number),
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

            // Dictation engine: keyboard-sim state + the three managers.
            // Order matters: TranscriptionManager depends on ModelManager.
            let dict_handle = app.handle().clone();
            app.manage(
                input::EnigoState::new().expect("Failed to initialize input state (Enigo)"),
            );
            let recording_manager = Arc::new(
                managers::audio::AudioRecordingManager::new(&dict_handle)
                    .expect("Failed to initialize recording manager"),
            );
            let model_manager = Arc::new(
                managers::model::ModelManager::new(&dict_handle)
                    .expect("Failed to initialize model manager"),
            );
            let transcription_manager = Arc::new(
                managers::transcription::TranscriptionManager::new(
                    &dict_handle,
                    model_manager.clone(),
                )
                .expect("Failed to initialize transcription manager"),
            );
            app.manage(recording_manager);
            app.manage(model_manager);
            app.manage(transcription_manager.clone());
            app.manage(ManagedToggleState::default());

            // Register the global dictation hotkeys (transcribe / cancel).
            shortcut::init_shortcuts(&dict_handle);

            // Onichan pillar: local LLM/TTS/vector-memory sidecar drivers +
            // the STT->LLM->TTS orchestration. Sidecar binaries are staged by
            // src-tauri/sidecars/build.sh (dev) or bundled as resources (prod).
            let sidecar_triple = if cfg!(target_os = "macos") {
                if cfg!(target_arch = "aarch64") {
                    "aarch64-apple-darwin"
                } else {
                    "x86_64-apple-darwin"
                }
            } else if cfg!(target_os = "linux") {
                if cfg!(target_arch = "aarch64") {
                    "aarch64-unknown-linux-gnu"
                } else {
                    "x86_64-unknown-linux-gnu"
                }
            } else {
                "x86_64-pc-windows-msvc"
            };
            let sidecar_res_dir = dict_handle.path().resource_dir().ok();
            let sidecar_path = |name: &str| -> std::path::PathBuf {
                let file = format!("{}-{}", name, sidecar_triple);
                if cfg!(debug_assertions) {
                    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("sidecars")
                        .join(&file)
                } else if let Some(dir) = &sidecar_res_dir {
                    dir.join(&file)
                } else {
                    std::path::PathBuf::from(&file)
                }
            };

            let onichan_manager = Arc::new(onichan::OnichanManager::new(&dict_handle));
            let onichan_model_manager = Arc::new(
                onichan_models::OnichanModelManager::new(&dict_handle)
                    .expect("Failed to initialize onichan model manager"),
            );
            let local_llm_manager =
                Arc::new(local_llm::LocalLlmManager::new(sidecar_path("llm-sidecar")));
            let local_tts_manager =
                Arc::new(local_tts::LocalTtsManager::new(sidecar_path("tts-sidecar")));
            let memory_manager =
                Arc::new(memory::MemoryManager::new(sidecar_path("memory-sidecar")));

            onichan_manager.set_llm_manager(local_llm_manager.clone());
            onichan_manager.set_tts_manager(local_tts_manager.clone());
            onichan_manager.set_memory_manager(memory_manager.clone());

            let onichan_conversation_manager =
                Arc::new(onichan_conversation::OnichanConversationManager::new(
                    &dict_handle,
                    transcription_manager,
                    onichan_manager.clone(),
                ));

            app.manage(onichan_manager);
            app.manage(onichan_model_manager);
            app.manage(local_llm_manager);
            app.manage(local_tts_manager);
            app.manage(memory_manager);
            app.manage(onichan_conversation_manager);

            // System tray reflecting recording state (idle/recording/transcribing).
            let initial_theme = tray::get_current_theme(&dict_handle);
            let initial_icon_path = tray::get_icon_path(initial_theme, tray::TrayIconState::Idle);
            if let Ok(icon_abs) = dict_handle
                .path()
                .resolve(initial_icon_path, tauri::path::BaseDirectory::Resource)
            {
                if let Ok(image) = tauri::image::Image::from_path(icon_abs) {
                    match tauri::tray::TrayIconBuilder::new()
                        .icon(image)
                        .show_menu_on_left_click(true)
                        .icon_as_template(true)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "settings" => show_main_window(app),
                            "cancel" => utils::cancel_current_operation(app),
                            "quit" => app.exit(0),
                            _ => {}
                        })
                        .build(&dict_handle)
                    {
                        Ok(tray) => {
                            app.manage(tray);
                            utils::update_tray_menu(
                                &dict_handle,
                                &utils::TrayIconState::Idle,
                                None,
                            );
                        }
                        Err(e) => log::warn!("Failed to build tray icon: {}", e),
                    }
                }
            }

            // Hidden recording overlay window (shown during record/transcribe).
            utils::create_recording_overlay(&dict_handle);

            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
