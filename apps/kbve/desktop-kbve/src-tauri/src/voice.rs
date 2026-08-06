//! Unified voice interface over the STT and TTS engines.
//!
//! Everything that talks (agent announcements, Discord replies) or listens
//! (voice commands) should go through `VoiceEngine` rather than the concrete
//! managers, so a future duplex speech model (single model doing both
//! directions) can replace `PairedVoiceEngine` without touching callers.

use std::sync::Arc;

use crate::local_tts::LocalTtsManager;
use crate::managers::transcription::TranscriptionManager;

/// Synthesized speech: base64-encoded 16-bit PCM mono samples + sample rate.
pub struct SynthesizedAudio {
    pub base64: String,
    pub sample_rate: u32,
}

pub trait VoiceEngine: Send + Sync {
    /// Transcribe 16 kHz mono f32 samples to text.
    fn transcribe(&self, samples: Vec<f32>) -> Result<String, String>;

    /// Synthesize text to audio for streaming (e.g. into Discord voice).
    fn synthesize(&self, text: &str) -> Result<SynthesizedAudio, String>;

    /// Speak text on the local output device.
    fn speak_local(&self, text: &str, volume: f32) -> Result<(), String>;

    fn stt_ready(&self) -> bool;
    fn tts_ready(&self) -> bool;
}

/// Today's implementation: separate STT (whisper/parakeet, in-process) and
/// TTS (piper sidecar) models behind the one interface.
pub struct PairedVoiceEngine {
    stt: Arc<TranscriptionManager>,
    tts: Arc<LocalTtsManager>,
}

impl PairedVoiceEngine {
    pub fn new(stt: Arc<TranscriptionManager>, tts: Arc<LocalTtsManager>) -> Self {
        Self { stt, tts }
    }
}

impl VoiceEngine for PairedVoiceEngine {
    fn transcribe(&self, samples: Vec<f32>) -> Result<String, String> {
        self.stt.transcribe(samples).map_err(|e| e.to_string())
    }

    fn synthesize(&self, text: &str) -> Result<SynthesizedAudio, String> {
        let (base64, sample_rate) = self.tts.synthesize(text)?;
        Ok(SynthesizedAudio {
            base64,
            sample_rate,
        })
    }

    fn speak_local(&self, text: &str, volume: f32) -> Result<(), String> {
        self.tts.speak(text, volume)
    }

    fn stt_ready(&self) -> bool {
        true
    }

    fn tts_ready(&self) -> bool {
        self.tts.is_loaded()
    }
}
