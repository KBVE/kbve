use std::sync::Arc;

use tauri::State;

use crate::agent_voice::AgentVoiceManager;

#[tauri::command]
#[specta::specta]
pub fn agent_voice_set_enabled(
    enabled: bool,
    manager: State<'_, Arc<AgentVoiceManager>>,
) -> Result<(), String> {
    manager.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn agent_voice_is_enabled(manager: State<'_, Arc<AgentVoiceManager>>) -> bool {
    manager.is_enabled()
}

#[tauri::command]
#[specta::specta]
pub fn agent_voice_announce(
    text: String,
    manager: State<'_, Arc<AgentVoiceManager>>,
) -> Result<(), String> {
    manager.announce(&text);
    Ok(())
}
