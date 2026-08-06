//! Spoken feedback for DevOps agent activity.
//!
//! Routes announcement text through the `VoiceEngine`: into the connected
//! Discord voice channel when the bot is in one, otherwise onto the local
//! output device. Disabled by default; toggled from the DevOps view and
//! persisted in settings.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use log::{info, warn};
use tauri::{AppHandle, Emitter, Manager};

use crate::discord::DiscordManager;
use crate::settings::{get_settings, write_settings};
use crate::voice::VoiceEngine;

pub struct AgentVoiceManager {
    app_handle: AppHandle,
    voice: Arc<dyn VoiceEngine>,
    discord: Arc<DiscordManager>,
    enabled: AtomicBool,
}

impl AgentVoiceManager {
    pub fn new(
        app_handle: &AppHandle,
        voice: Arc<dyn VoiceEngine>,
        discord: Arc<DiscordManager>,
    ) -> Self {
        let enabled = get_settings(app_handle).agent_voice_enabled;
        Self {
            app_handle: app_handle.clone(),
            voice,
            discord,
            enabled: AtomicBool::new(enabled),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        let mut settings = get_settings(&self.app_handle);
        settings.agent_voice_enabled = enabled;
        write_settings(&self.app_handle, settings);
        info!("Agent voice announcements enabled: {}", enabled);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Speak an announcement without blocking the caller. No-op unless
    /// enabled; never fails the caller's workflow.
    pub fn announce(self: &Arc<Self>, text: &str) {
        if !self.is_enabled() {
            return;
        }
        let this = self.clone();
        let text = text.to_string();
        std::thread::spawn(move || this.announce_blocking(&text));
    }

    /// Synthesize and play: Discord voice channel when connected, local
    /// output device otherwise.
    fn announce_blocking(&self, text: &str) {
        let _ = self.app_handle.emit("agent-voice-announcement", text);
        if !self.voice.tts_ready() {
            warn!("Agent voice announcement skipped, TTS model not loaded");
            return;
        }
        let in_voice = self.discord.status().in_voice;
        if in_voice {
            match self.voice.synthesize(text) {
                Ok(audio) => {
                    if let Err(e) = self.discord.play_audio(&audio.base64, audio.sample_rate) {
                        warn!("Agent voice Discord playback failed: {}", e);
                    }
                    return;
                }
                Err(e) => warn!("Agent voice synthesis failed: {}", e),
            }
        }
        if let Err(e) = self.voice.speak_local(text, 1.0) {
            warn!("Agent voice local playback failed: {}", e);
        }
    }
}

/// Announce via the managed `AgentVoiceManager`, if initialized. For use
/// inside commands that only have an `AppHandle`.
pub fn announce_from_app(app: &AppHandle, text: &str) {
    if let Some(manager) = app.try_state::<Arc<AgentVoiceManager>>() {
        manager.announce(text);
    }
}
