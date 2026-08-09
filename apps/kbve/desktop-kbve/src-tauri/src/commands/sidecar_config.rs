//! Sidecar quick-start configuration persistence
//!
//! Stores the last-used model IDs and Discord connection details so the footer
//! can offer one-click start/stop for each sidecar.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const SIDECAR_CONFIG_STORE: &str = "sidecar_config.json";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SidecarQuickConfig {
    pub last_llm_model_id: Option<String>,
    pub last_tts_model_id: Option<String>,
    pub last_discord_guild_id: Option<String>,
    pub last_discord_channel_id: Option<String>,
    pub last_discord_guild_name: Option<String>,
    pub last_discord_channel_name: Option<String>,
    pub last_embedding_model_id: Option<String>,
    pub discord_quick_connect: bool,
    pub discord_auto_conversation: bool,
}

#[tauri::command]
#[specta::specta]
pub fn get_sidecar_quick_config(app: AppHandle) -> SidecarQuickConfig {
    let store = match app.store(SIDECAR_CONFIG_STORE) {
        Ok(s) => s,
        Err(_) => return default_config(),
    };

    SidecarQuickConfig {
        last_llm_model_id: read_string(&store, "last_llm_model_id"),
        last_tts_model_id: read_string(&store, "last_tts_model_id"),
        last_discord_guild_id: read_string(&store, "last_discord_guild_id"),
        last_discord_channel_id: read_string(&store, "last_discord_channel_id"),
        last_discord_guild_name: read_string(&store, "last_discord_guild_name"),
        last_discord_channel_name: read_string(&store, "last_discord_channel_name"),
        last_embedding_model_id: read_string(&store, "last_embedding_model_id"),
        discord_quick_connect: read_bool(&store, "discord_quick_connect"),
        discord_auto_conversation: read_bool(&store, "discord_auto_conversation"),
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_sidecar_quick_config_flag(
    app: AppHandle,
    key: String,
    value: bool,
) -> Result<(), String> {
    let store = app
        .store(SIDECAR_CONFIG_STORE)
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;

    store.set(&key, serde_json::json!(value));

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_sidecar_quick_config_field(
    app: AppHandle,
    key: String,
    value: Option<String>,
) -> Result<(), String> {
    let store = app
        .store(SIDECAR_CONFIG_STORE)
        .map_err(|e| format!("Failed to access sidecar config store: {}", e))?;

    match value {
        Some(v) => store.set(&key, serde_json::json!(v)),
        None => {
            store.delete(&key);
        }
    }

    Ok(())
}

fn default_config() -> SidecarQuickConfig {
    SidecarQuickConfig {
        last_llm_model_id: None,
        last_tts_model_id: None,
        last_discord_guild_id: None,
        last_discord_channel_id: None,
        last_discord_guild_name: None,
        last_discord_channel_name: None,
        last_embedding_model_id: None,
        discord_quick_connect: false,
        discord_auto_conversation: false,
    }
}

fn read_string(store: &tauri_plugin_store::Store<tauri::Wry>, key: &str) -> Option<String> {
    store.get(key).and_then(|v| v.as_str().map(String::from))
}

fn read_bool(store: &tauri_plugin_store::Store<tauri::Wry>, key: &str) -> bool {
    store.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}
