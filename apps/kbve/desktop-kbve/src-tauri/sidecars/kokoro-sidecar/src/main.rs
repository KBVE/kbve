//! Kokoro TTS Sidecar Process
//!
//! Runs Kokoro-82M (ONNX) in a separate process so its ort version cannot
//! conflict with piper-rs (tts-sidecar) or vad-rs (main app).
//!
//! Speaks the same JSON-over-stdio protocol as tts-sidecar.

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use cpal::traits::{DeviceTrait, HostTrait};
use kokoro_en::{KokoroTts, Voice};
use rodio::buffer::SamplesBuffer;
use rodio::{OutputStream, Sink};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::path::Path;

const SAMPLE_RATE: u32 = 24000;
const DEFAULT_VOICE: &str = "af_heart";

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum Request {
    #[serde(rename = "load")]
    Load { model_path: String },
    #[serde(rename = "unload")]
    Unload,
    #[serde(rename = "speak")]
    Speak {
        text: String,
        #[serde(default)]
        output_device: Option<String>,
        #[serde(default = "default_volume")]
        volume: f32,
        #[serde(default)]
        voice: Option<String>,
    },
    #[serde(rename = "synthesize")]
    Synthesize {
        text: String,
        #[serde(default)]
        voice: Option<String>,
    },
    #[serde(rename = "list_devices")]
    ListDevices,
    #[serde(rename = "status")]
    Status,
    #[serde(rename = "shutdown")]
    Shutdown,
}

fn default_volume() -> f32 {
    1.0
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum Response {
    #[serde(rename = "ok")]
    Ok { message: String },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "devices")]
    Devices { devices: Vec<String> },
    #[serde(rename = "status")]
    Status {
        loaded: bool,
        model_path: Option<String>,
    },
    #[serde(rename = "audio")]
    Audio {
        /// Base64 encoded f32 PCM samples
        audio_base64: String,
        sample_rate: u32,
    },
}

struct KokoroState {
    tts: Option<KokoroTts>,
    model_path: Option<String>,
    runtime: tokio::runtime::Runtime,
}

impl KokoroState {
    fn new() -> Self {
        Self {
            tts: None,
            model_path: None,
            runtime: tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .expect("Failed to build tokio runtime"),
        }
    }

    fn load_model(&mut self, model_path: &str) -> Result<(), String> {
        let onnx = Path::new(model_path);
        if !onnx.exists() {
            return Err(format!("Model file does not exist: {}", model_path));
        }
        // Voice styles live in a `voices/` directory next to the model file.
        let voices_dir = onnx
            .parent()
            .map(|p| p.join("voices"))
            .filter(|p| p.is_dir())
            .ok_or_else(|| format!("Missing voices directory next to model: {}", model_path))?;

        if self.model_path.as_deref() == Some(model_path) && self.tts.is_some() {
            return Ok(());
        }

        self.tts = None;
        self.model_path = None;

        let voices_str = voices_dir.to_string_lossy().to_string();
        let tts = self
            .runtime
            .block_on(KokoroTts::new(model_path, &voices_str))
            .map_err(|e| format!("Failed to load Kokoro model: {}", e))?;

        self.tts = Some(tts);
        self.model_path = Some(model_path.to_string());
        Ok(())
    }

    fn unload_model(&mut self) {
        self.tts = None;
        self.model_path = None;
    }

    fn is_loaded(&self) -> bool {
        self.tts.is_some()
    }

    fn synthesize_samples(&self, text: &str, voice: Option<&str>) -> Result<Vec<f32>, String> {
        let tts = self
            .tts
            .as_ref()
            .ok_or_else(|| "No TTS model loaded".to_string())?;

        let voice = Voice::new(voice.unwrap_or(DEFAULT_VOICE));
        let (samples, _took) = self
            .runtime
            .block_on(tts.synth(text, voice))
            .map_err(|e| format!("Failed to synthesize: {}", e))?;

        Ok(samples
            .into_iter()
            .map(|s| s as f32 / i16::MAX as f32)
            .collect())
    }

    fn synthesize(&self, text: &str, voice: Option<&str>) -> Result<(String, u32), String> {
        let samples = self.synthesize_samples(text, voice)?;
        let bytes: Vec<u8> = samples.iter().flat_map(|&s| s.to_le_bytes()).collect();
        Ok((BASE64.encode(&bytes), SAMPLE_RATE))
    }

    fn speak(
        &self,
        text: &str,
        output_device: Option<&str>,
        volume: f32,
        voice: Option<&str>,
    ) -> Result<(), String> {
        let samples = self.synthesize_samples(text, voice)?;
        play_audio(&samples, SAMPLE_RATE, output_device, volume)
    }
}

fn play_audio(
    samples: &[f32],
    sample_rate: u32,
    output_device: Option<&str>,
    volume: f32,
) -> Result<(), String> {
    let (_stream, stream_handle) = if let Some(device_name) = output_device {
        let host = cpal::default_host();
        let device = host
            .output_devices()
            .map_err(|e| format!("Failed to enumerate devices: {}", e))?
            .find(|d| {
                d.name()
                    .map(|n| n.contains(device_name) || device_name.contains(&n))
                    .unwrap_or(false)
            });

        if let Some(dev) = device {
            log::info!("Using output device: {:?}", dev.name());
            OutputStream::try_from_device(&dev)
                .map_err(|e| format!("Failed to open device '{}': {}", device_name, e))?
        } else {
            log::warn!("Device '{}' not found, using default", device_name);
            OutputStream::try_default()
                .map_err(|e| format!("Failed to open default device: {}", e))?
        }
    } else {
        OutputStream::try_default().map_err(|e| format!("Failed to open default device: {}", e))?
    };

    let sink =
        Sink::try_new(&stream_handle).map_err(|e| format!("Failed to create sink: {}", e))?;
    sink.set_volume(volume);
    sink.append(SamplesBuffer::new(1, sample_rate, samples.to_vec()));
    sink.sleep_until_end();
    Ok(())
}

fn list_output_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host
        .output_devices()
        .map_err(|e| format!("Failed to enumerate devices: {}", e))?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

fn send_response(response: &Response) {
    let json = serde_json::to_string(response).unwrap();
    println!("{}", json);
    io::stdout().flush().unwrap();
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp(None)
        .format_target(false)
        .init();

    log::info!("Kokoro sidecar starting...");

    let mut state = KokoroState::new();

    send_response(&Response::Ok {
        message: "Kokoro sidecar ready".to_string(),
    });

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to read stdin: {}", e);
                break;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                send_response(&Response::Error {
                    message: format!("Invalid JSON: {}", e),
                });
                continue;
            }
        };

        match request {
            Request::Load { model_path } => {
                log::info!("Loading Kokoro model: {}", model_path);
                match state.load_model(&model_path) {
                    Ok(()) => {
                        log::info!("Kokoro model loaded");
                        send_response(&Response::Ok {
                            message: "Model loaded".to_string(),
                        });
                    }
                    Err(e) => {
                        log::error!("Failed to load Kokoro model: {}", e);
                        send_response(&Response::Error { message: e });
                    }
                }
            }
            Request::Unload => {
                state.unload_model();
                send_response(&Response::Ok {
                    message: "Model unloaded".to_string(),
                });
            }
            Request::Speak {
                text,
                output_device,
                volume,
                voice,
            } => {
                log::info!("Speak request: {} chars", text.len());
                match state.speak(&text, output_device.as_deref(), volume, voice.as_deref()) {
                    Ok(()) => send_response(&Response::Ok {
                        message: "Speech complete".to_string(),
                    }),
                    Err(e) => {
                        log::error!("Speech failed: {}", e);
                        send_response(&Response::Error { message: e });
                    }
                }
            }
            Request::Synthesize { text, voice } => {
                log::debug!("Synthesize request: {} chars", text.len());
                match state.synthesize(&text, voice.as_deref()) {
                    Ok((audio_base64, sample_rate)) => send_response(&Response::Audio {
                        audio_base64,
                        sample_rate,
                    }),
                    Err(e) => {
                        log::error!("Synthesis failed: {}", e);
                        send_response(&Response::Error { message: e });
                    }
                }
            }
            Request::ListDevices => match list_output_devices() {
                Ok(devices) => send_response(&Response::Devices { devices }),
                Err(e) => send_response(&Response::Error { message: e }),
            },
            Request::Status => send_response(&Response::Status {
                loaded: state.is_loaded(),
                model_path: state.model_path.clone(),
            }),
            Request::Shutdown => {
                send_response(&Response::Ok {
                    message: "Shutting down".to_string(),
                });
                break;
            }
        }
    }

    log::info!("Kokoro sidecar exiting");
}
