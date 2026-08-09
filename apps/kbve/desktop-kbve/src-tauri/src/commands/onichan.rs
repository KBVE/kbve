use crate::local_llm::{LlmEngine, LocalLlmManager};
use crate::local_tts::{LocalTtsManager, TtsEngine};
use crate::onichan::{ConversationMessage, OnichanManager, OnichanMode};
use crate::onichan_conversation::OnichanConversationManager;
use crate::onichan_models::{OnichanModelInfo, OnichanModelManager};
use crate::settings::get_settings;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub fn onichan_enable(manager: State<'_, Arc<OnichanManager>>) {
    manager.enable();
}

#[tauri::command]
#[specta::specta]
pub fn onichan_disable(manager: State<'_, Arc<OnichanManager>>) {
    manager.disable();
}

#[tauri::command]
#[specta::specta]
pub fn onichan_is_active(manager: State<'_, Arc<OnichanManager>>) -> bool {
    manager.is_active()
}

#[tauri::command]
#[specta::specta]
pub fn onichan_get_mode(manager: State<'_, Arc<OnichanManager>>) -> OnichanMode {
    manager.get_mode()
}

#[tauri::command]
#[specta::specta]
pub fn onichan_set_mode(manager: State<'_, Arc<OnichanManager>>, mode: OnichanMode) {
    manager.set_mode(mode);
}

#[tauri::command]
#[specta::specta]
pub async fn onichan_process_input(
    manager: State<'_, Arc<OnichanManager>>,
    text: String,
) -> Result<String, String> {
    manager.process_input(text).await
}

#[tauri::command]
#[specta::specta]
pub async fn onichan_speak(
    manager: State<'_, Arc<OnichanManager>>,
    text: String,
) -> Result<(), String> {
    manager.speak(&text).await
}

#[tauri::command]
#[specta::specta]
pub fn onichan_clear_history(manager: State<'_, Arc<OnichanManager>>) {
    manager.clear_history();
}

#[tauri::command]
#[specta::specta]
pub fn onichan_get_history(manager: State<'_, Arc<OnichanManager>>) -> Vec<ConversationMessage> {
    manager.get_history()
}

// Model management commands

#[tauri::command]
#[specta::specta]
pub fn get_onichan_models(manager: State<'_, Arc<OnichanModelManager>>) -> Vec<OnichanModelInfo> {
    manager.get_available_models()
}

#[tauri::command]
#[specta::specta]
pub fn get_onichan_llm_models(
    manager: State<'_, Arc<OnichanModelManager>>,
) -> Vec<OnichanModelInfo> {
    manager.get_llm_models()
}

#[tauri::command]
#[specta::specta]
pub fn get_onichan_tts_models(
    manager: State<'_, Arc<OnichanModelManager>>,
) -> Vec<OnichanModelInfo> {
    manager.get_tts_models()
}

#[tauri::command]
#[specta::specta]
pub async fn download_onichan_model(
    manager: State<'_, Arc<OnichanModelManager>>,
    model_id: String,
) -> Result<(), String> {
    manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn cancel_onichan_download(manager: State<'_, Arc<OnichanModelManager>>, model_id: String) {
    manager.cancel_download(&model_id);
}

#[tauri::command]
#[specta::specta]
pub fn delete_onichan_model(
    manager: State<'_, Arc<OnichanModelManager>>,
    model_id: String,
) -> Result<(), String> {
    manager.delete_model(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn load_local_llm(
    model_manager: State<'_, Arc<OnichanModelManager>>,
    llm_manager: State<'_, Arc<LocalLlmManager>>,
    model_id: String,
) -> Result<(), String> {
    log::info!("load_local_llm command called with model_id: {}", model_id);

    let model_path = model_manager.get_model_path(&model_id).map_err(|e| {
        log::error!("Failed to get model path: {}", e);
        e.to_string()
    })?;

    log::info!("Model path resolved to: {:?}", model_path);

    // The load blocks on sidecar IPC (all llama.cpp work happens in the
    // sidecar process) — keep it off the main thread so the UI stays live.
    let llm_manager = llm_manager.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || llm_manager.load_model(&model_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?;

    match &result {
        Ok(()) => log::info!("Model loaded successfully via command"),
        Err(e) => log::error!("Model load failed: {}", e),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn unload_local_llm(llm_manager: State<'_, Arc<LocalLlmManager>>) -> Result<(), String> {
    let llm_manager = llm_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || llm_manager.unload_model())
        .await
        .map_err(|e| format!("Task failed: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn is_local_llm_loaded(llm_manager: State<'_, Arc<LocalLlmManager>>) -> bool {
    llm_manager.is_loaded()
}

#[tauri::command]
#[specta::specta]
pub fn open_onichan_models_dir(
    app: AppHandle,
    manager: State<'_, Arc<OnichanModelManager>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(
            manager.get_models_dir().to_string_lossy().to_string(),
            None::<String>,
        )
        .map_err(|e| format!("Failed to open models folder: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn get_llm_engine(llm_manager: State<'_, Arc<LocalLlmManager>>) -> LlmEngine {
    llm_manager.engine()
}

#[tauri::command]
#[specta::specta]
pub fn set_llm_engine(
    app: AppHandle,
    llm_manager: State<'_, Arc<LocalLlmManager>>,
    engine: LlmEngine,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    llm_manager.set_engine(engine)?;
    let store = app
        .store("sidecar_config.json")
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;
    store.set("llm_engine", serde_json::json!(engine.as_str()));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_llm_endpoint(llm_manager: State<'_, Arc<LocalLlmManager>>) -> String {
    llm_manager.endpoint_url()
}

#[tauri::command]
#[specta::specta]
pub fn set_llm_endpoint(
    app: AppHandle,
    llm_manager: State<'_, Arc<LocalLlmManager>>,
    url: String,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let url = url.trim().to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Endpoint must start with http:// or https://".to_string());
    }
    llm_manager.set_endpoint_url(url.clone());
    let store = app
        .store("sidecar_config.json")
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;
    store.set("llm_endpoint_url", serde_json::json!(url));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_local_llm_model_name(llm_manager: State<'_, Arc<LocalLlmManager>>) -> Option<String> {
    llm_manager.get_loaded_model_name()
}

#[tauri::command]
#[specta::specta]
pub async fn local_llm_chat(
    llm_manager: State<'_, Arc<LocalLlmManager>>,
    system_prompt: String,
    user_message: String,
    max_tokens: u32,
) -> Result<String, String> {
    let llm_manager = llm_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        llm_manager.chat(&system_prompt, &user_message, max_tokens)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn load_local_tts(
    model_manager: State<'_, Arc<OnichanModelManager>>,
    tts_manager: State<'_, Arc<LocalTtsManager>>,
    model_id: String,
) -> Result<(), String> {
    let model_path = model_manager
        .get_model_path(&model_id)
        .map_err(|e| e.to_string())?;
    let tts_manager = tts_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || tts_manager.load_model(&model_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn unload_local_tts(tts_manager: State<'_, Arc<LocalTtsManager>>) -> Result<(), String> {
    let tts_manager = tts_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || tts_manager.unload_model())
        .await
        .map_err(|e| format!("Task failed: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn get_local_tts_model_name(tts_manager: State<'_, Arc<LocalTtsManager>>) -> Option<String> {
    tts_manager.get_loaded_model_name()
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct TtsHttpConfig {
    pub model: String,
    pub voice: String,
}

#[tauri::command]
#[specta::specta]
pub fn get_tts_engine(tts_manager: State<'_, Arc<LocalTtsManager>>) -> TtsEngine {
    tts_manager.engine()
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_engine(
    app: AppHandle,
    tts_manager: State<'_, Arc<LocalTtsManager>>,
    engine: TtsEngine,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    tts_manager.set_engine(engine);
    let store = app
        .store("sidecar_config.json")
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;
    store.set("tts_engine", serde_json::json!(engine.as_str()));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_tts_endpoint(tts_manager: State<'_, Arc<LocalTtsManager>>) -> String {
    tts_manager.endpoint_url()
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_endpoint(
    app: AppHandle,
    tts_manager: State<'_, Arc<LocalTtsManager>>,
    url: String,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let url = url.trim().to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Endpoint must start with http:// or https://".to_string());
    }
    tts_manager.set_endpoint_url(url.clone());
    let store = app
        .store("sidecar_config.json")
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;
    store.set("tts_endpoint_url", serde_json::json!(url));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_tts_http_config(tts_manager: State<'_, Arc<LocalTtsManager>>) -> TtsHttpConfig {
    TtsHttpConfig {
        model: tts_manager.http_model(),
        voice: tts_manager.http_voice(),
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_http_config(
    app: AppHandle,
    tts_manager: State<'_, Arc<LocalTtsManager>>,
    config: TtsHttpConfig,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let model = config.model.trim().to_string();
    if model.is_empty() {
        return Err("Model id cannot be empty".to_string());
    }
    let voice = config.voice.trim().to_string();
    tts_manager.set_http_model(model.clone());
    tts_manager.set_http_voice(voice.clone());
    let store = app
        .store("sidecar_config.json")
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;
    store.set("tts_http_model", serde_json::json!(model));
    store.set("tts_http_voice", serde_json::json!(voice));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn is_local_tts_loaded(tts_manager: State<'_, Arc<LocalTtsManager>>) -> bool {
    tts_manager.is_loaded()
}

#[tauri::command]
#[specta::specta]
pub async fn local_tts_speak(
    app: AppHandle,
    tts_manager: State<'_, Arc<LocalTtsManager>>,
    text: String,
) -> Result<(), String> {
    let settings = get_settings(&app);
    let volume = settings.audio_feedback_volume;
    // Set the output device from settings before speaking
    tts_manager.set_output_device(settings.selected_output_device.clone());
    let tts_manager = tts_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || tts_manager.speak(&text, volume))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

// Conversation mode commands

#[tauri::command]
#[specta::specta]
pub fn onichan_start_conversation(
    conversation_manager: State<'_, Arc<OnichanConversationManager>>,
) -> Result<(), String> {
    conversation_manager.start()
}

#[tauri::command]
#[specta::specta]
pub fn onichan_stop_conversation(conversation_manager: State<'_, Arc<OnichanConversationManager>>) {
    conversation_manager.stop();
}

#[tauri::command]
#[specta::specta]
pub fn onichan_is_conversation_running(
    conversation_manager: State<'_, Arc<OnichanConversationManager>>,
) -> bool {
    conversation_manager.is_running()
}
