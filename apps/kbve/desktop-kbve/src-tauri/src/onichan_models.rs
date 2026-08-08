use anyhow::Result;
use futures_util::StreamExt;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Type of Onichan model
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum OnichanModelType {
    Llm,
    Tts,
}

/// Additional file belonging to a multi-part model download (split GGUF).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OnichanModelPart {
    pub filename: String,
    pub url: String,
    pub size_mb: u64,
}

/// Information about an Onichan model (LLM or TTS)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OnichanModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub model_type: OnichanModelType,
    /// For LLM models: context size
    pub context_size: Option<u32>,
    /// For TTS models: sample rate
    pub sample_rate: Option<u32>,
    /// For TTS models: voice name/style
    pub voice_name: Option<String>,
    /// Extra files for split multi-part downloads (empty for single-file models)
    #[serde(default)]
    pub extra_parts: Vec<OnichanModelPart>,
}

/// Download progress for Onichan models
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OnichanDownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
    /// Instantaneous download speed in bytes/sec (0 when unknown)
    #[serde(default)]
    pub speed_bps: u64,
}

/// Manages LLM and TTS models for Onichan
pub struct OnichanModelManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    available_models: Mutex<HashMap<String, OnichanModelInfo>>,
}

impl OnichanModelManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?
            .join("onichan_models");

        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let mut available_models = HashMap::new();

        // LLM Models
        available_models.insert(
            "llama-3.2-1b".to_string(),
            OnichanModelInfo {
                id: "llama-3.2-1b".to_string(),
                name: "Llama 3.2 1B".to_string(),
                description: "Fast and lightweight. Good for simple conversations.".to_string(),
                filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf".to_string(),
                url: Some("https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf".to_string()),
                size_mb: 775,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(8192),
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "llama-3.2-3b".to_string(),
            OnichanModelInfo {
                id: "llama-3.2-3b".to_string(),
                name: "Llama 3.2 3B".to_string(),
                description: "Balanced speed and quality. Recommended for most users.".to_string(),
                filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string(),
                url: Some("https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string()),
                size_mb: 2020,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(8192),
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "qwen-2.5-1.5b".to_string(),
            OnichanModelInfo {
                id: "qwen-2.5-1.5b".to_string(),
                name: "Qwen 2.5 1.5B".to_string(),
                description: "Excellent multilingual support. Fast responses.".to_string(),
                filename: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf".to_string(),
                url: Some("https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string()),
                size_mb: 1050,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(32768),
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        // Uncensored/less-restricted models for more fun conversations
        available_models.insert(
            "mistral-7b-instruct".to_string(),
            OnichanModelInfo {
                id: "mistral-7b-instruct".to_string(),
                name: "Mistral 7B Instruct (Recommended)".to_string(),
                description: "Best quality and personality. Less censored, more fun. Recommended for Discord.".to_string(),
                filename: "mistral-7b-instruct-v0.2.Q4_K_M.gguf".to_string(),
                url: Some("https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf".to_string()),
                size_mb: 4370,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(32768),
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "deepseek-v4-flash-q2".to_string(),
            OnichanModelInfo {
                id: "deepseek-v4-flash-q2".to_string(),
                name: "DeepSeek V4 Flash 0731 (284B MoE, 2-bit)".to_string(),
                description: "Frontier-class 284B MoE (13B active). ~97GB download — needs 128GB unified memory. llama.cpp engine.".to_string(),
                filename: "DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00001-of-00003.gguf".to_string(),
                url: Some("https://huggingface.co/unsloth/DeepSeek-V4-Flash-0731-GGUF/resolve/main/UD-Q2_K_XL/DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00001-of-00003.gguf".to_string()),
                size_mb: 5,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(262144),
                sample_rate: None,
                voice_name: None,
                extra_parts: vec![
                    OnichanModelPart {
                        filename: "DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00002-of-00003.gguf".to_string(),
                        url: "https://huggingface.co/unsloth/DeepSeek-V4-Flash-0731-GGUF/resolve/main/UD-Q2_K_XL/DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00002-of-00003.gguf".to_string(),
                        size_mb: 47111,
                    },
                    OnichanModelPart {
                        filename: "DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00003-of-00003.gguf".to_string(),
                        url: "https://huggingface.co/unsloth/DeepSeek-V4-Flash-0731-GGUF/resolve/main/UD-Q2_K_XL/DeepSeek-V4-Flash-0731-UD-Q2_K_XL-00003-of-00003.gguf".to_string(),
                        size_mb: 45204,
                    },
                ],
            },
        );

        available_models.insert(
            "dolphin-3.0-llama3.1-8b".to_string(),
            OnichanModelInfo {
                id: "dolphin-3.0-llama3.1-8b".to_string(),
                name: "Dolphin 3.0 Llama 3.1 8B (Recommended Uncensored)".to_string(),
                description: "Latest Dolphin. Uncensored, great personality, follows instructions well. Best for Discord.".to_string(),
                filename: "Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf".to_string(),
                url: Some("https://huggingface.co/bartowski/Dolphin3.0-Llama3.1-8B-GGUF/resolve/main/Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf".to_string()),
                size_mb: 4920,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(131072), // 128k context
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "neoplus-20b-uncensored".to_string(),
            OnichanModelInfo {
                id: "neoplus-20b-uncensored".to_string(),
                name: "NEOPlus 20B Uncensored (Best Quality)".to_string(),
                description: "Fully uncensored 20B model with DI-MATRIX optimization. Best quality responses. Requires 16GB+ RAM.".to_string(),
                filename: "OpenAI-20B-NEOPlus-Uncensored-IQ4_NL.gguf".to_string(),
                url: Some("https://huggingface.co/DavidAU/OpenAi-GPT-oss-20b-HERETIC-uncensored-NEO-Imatrix-gguf/resolve/main/OpenAI-20B-NEOPlus-Uncensored-IQ4_NL.gguf".to_string()),
                size_mb: 12600,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(4096),
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "brainstorm-36b-uncensored".to_string(),
            OnichanModelInfo {
                id: "brainstorm-36b-uncensored".to_string(),
                name: "BrainStorm 36B Uncensored Q8 (Best Quality)".to_string(),
                description: "Massive 36B uncensored model at Q8 quality. Best responses and creativity. Requires 40GB+ RAM.".to_string(),
                filename: "OpenAI-36B-Brains20x-Uncensored-Q8_0.gguf".to_string(),
                url: Some("https://huggingface.co/DavidAU/OpenAi-GPT-oss-36B-BrainStorm20x-uncensored-gguf/resolve/main/OpenAI-36B-Brains20x-Uncensored-Q8_0.gguf".to_string()),
                size_mb: 38900,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Llm,
                context_size: Some(131072), // 128k context
                sample_rate: None,
                voice_name: None,
                extra_parts: Vec::new(),
            },
        );

        // TTS Models (Piper voices)
        available_models.insert(
            "piper-amy".to_string(),
            OnichanModelInfo {
                id: "piper-amy".to_string(),
                name: "Amy (English US)".to_string(),
                description: "Clear female voice. Natural sounding.".to_string(),
                filename: "en_US-amy-medium.onnx".to_string(),
                url: Some("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx".to_string()),
                size_mb: 63,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Tts,
                context_size: None,
                sample_rate: Some(22050),
                voice_name: Some("Amy".to_string()),
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "piper-lessac".to_string(),
            OnichanModelInfo {
                id: "piper-lessac".to_string(),
                name: "Lessac (English US)".to_string(),
                description: "Professional female voice. Balanced quality.".to_string(),
                filename: "en_US-lessac-medium.onnx".to_string(),
                url: Some("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx".to_string()),
                size_mb: 63,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Tts,
                context_size: None,
                sample_rate: Some(22050),
                voice_name: Some("Lessac".to_string()),
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "piper-jenny".to_string(),
            OnichanModelInfo {
                id: "piper-jenny".to_string(),
                name: "Jenny (English UK)".to_string(),
                description: "British female voice. Warm and friendly.".to_string(),
                filename: "en_GB-jenny_dioco-medium.onnx".to_string(),
                url: Some("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx".to_string()),
                size_mb: 63,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Tts,
                context_size: None,
                sample_rate: Some(22050),
                voice_name: Some("Jenny".to_string()),
                extra_parts: Vec::new(),
            },
        );

        available_models.insert(
            "piper-lessac-high".to_string(),
            OnichanModelInfo {
                id: "piper-lessac-high".to_string(),
                name: "Lessac High (Anime Style)".to_string(),
                description: "Youthful female voice. Best for anime/VTuber style. Clear and energetic.".to_string(),
                filename: "en_US-lessac-high.onnx".to_string(),
                url: Some("https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx".to_string()),
                size_mb: 105,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                model_type: OnichanModelType::Tts,
                context_size: None,
                sample_rate: Some(22050),
                voice_name: Some("Lessac (Anime)".to_string()),
                extra_parts: Vec::new(),
            },
        );

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            available_models: Mutex::new(available_models),
        };

        manager.update_download_status()?;

        Ok(manager)
    }

    pub fn get_models_dir(&self) -> &PathBuf {
        &self.models_dir
    }

    pub fn get_available_models(&self) -> Vec<OnichanModelInfo> {
        self.scan_sideloaded_models();
        let _ = self.update_download_status();
        let models = self.available_models.lock().unwrap();
        models.values().cloned().collect()
    }

    pub fn get_llm_models(&self) -> Vec<OnichanModelInfo> {
        self.scan_sideloaded_models();
        let _ = self.update_download_status();
        let models = self.available_models.lock().unwrap();
        models
            .values()
            .filter(|m| m.model_type == OnichanModelType::Llm)
            .cloned()
            .collect()
    }

    pub fn get_tts_models(&self) -> Vec<OnichanModelInfo> {
        let _ = self.update_download_status();
        let models = self.available_models.lock().unwrap();
        models
            .values()
            .filter(|m| m.model_type == OnichanModelType::Tts)
            .cloned()
            .collect()
    }

    /// Register any GGUF dropped into the models dir that isn't part of the
    /// curated catalog, so users can sideload arbitrary models (e.g. large
    /// MoE quants downloaded manually). Split GGUFs (`-00001-of-000NN`) are
    /// registered once, pointing at the first part — llama.cpp resolves the
    /// remaining parts from it.
    fn scan_sideloaded_models(&self) {
        let entries = match fs::read_dir(&self.models_dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut models = self.available_models.lock().unwrap();
        let known: Vec<String> = models
            .values()
            .flat_map(|m| {
                std::iter::once(m.filename.clone())
                    .chain(m.extra_parts.iter().map(|p| p.filename.clone()))
            })
            .collect();

        for entry in entries.flatten() {
            let path = entry.path();
            let filename = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if !filename.ends_with(".gguf") || known.contains(&filename) {
                continue;
            }

            // Split GGUF: only the first part is loadable directly.
            if let Some(idx) = filename.find("-of-") {
                let before = &filename[..idx];
                if !before.ends_with("-00001") {
                    continue;
                }
            }

            let id = format!("sideload:{}", filename.trim_end_matches(".gguf"));
            if models.contains_key(&id) {
                continue;
            }

            let size_mb = entry.metadata().map(|m| m.len() / 1_048_576).unwrap_or(0);
            let display_name = filename
                .trim_end_matches(".gguf")
                .replace(['_', '-'], " ")
                .trim()
                .to_string();

            log::info!("Registered sideloaded model: {} ({} MB)", filename, size_mb);
            models.insert(
                id.clone(),
                OnichanModelInfo {
                    id,
                    name: display_name,
                    description: "Sideloaded from the models folder".to_string(),
                    filename,
                    url: None,
                    size_mb,
                    is_downloaded: true,
                    is_downloading: false,
                    partial_size: 0,
                    model_type: OnichanModelType::Llm,
                    context_size: None,
                    sample_rate: None,
                    voice_name: None,
                    extra_parts: Vec::new(),
                },
            );
        }

        // Drop sideloaded entries whose file was removed.
        models.retain(|id, m| {
            !id.starts_with("sideload:") || self.models_dir.join(&m.filename).exists()
        });
    }

    pub fn get_model_info(&self, model_id: &str) -> Option<OnichanModelInfo> {
        let models = self.available_models.lock().unwrap();
        models.get(model_id).cloned()
    }

    fn update_download_status(&self) -> Result<()> {
        let mut models = self.available_models.lock().unwrap();

        for model in models.values_mut() {
            let model_path = self.models_dir.join(&model.filename);
            let partial_path = self.models_dir.join(format!("{}.partial", &model.filename));

            model.is_downloaded = model_path.exists()
                && model
                    .extra_parts
                    .iter()
                    .all(|p| self.models_dir.join(&p.filename).exists());

            let mut partial = partial_path.metadata().map(|m| m.len()).unwrap_or(0);
            for part in &model.extra_parts {
                let part_partial = self.models_dir.join(format!("{}.partial", &part.filename));
                partial += part_partial.metadata().map(|m| m.len()).unwrap_or(0);
            }
            model.partial_size = partial;
        }

        Ok(())
    }

    pub async fn download_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let url = model_info
            .url
            .clone()
            .ok_or_else(|| anyhow::anyhow!("No download URL for model"))?;

        // Also download the JSON config for TTS models
        let config_url = if model_info.model_type == OnichanModelType::Tts {
            Some(url.replace(".onnx", ".onnx.json"))
        } else {
            None
        };

        // Full file list: main file + any extra parts (split GGUF).
        let mut files: Vec<(String, String, u64)> =
            vec![(model_info.filename.clone(), url, model_info.size_mb)];
        for part in &model_info.extra_parts {
            files.push((part.filename.clone(), part.url.clone(), part.size_mb));
        }
        let combined_total: u64 = files.iter().map(|(_, _, mb)| mb * 1024 * 1024).sum();

        // Mark as downloading
        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = true;
            }
        }

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .redirect(reqwest::redirect::Policy::limited(10))
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(600)) // 10 min timeout per chunk
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to build HTTP client: {}", e))?;

        let mut completed_bytes: u64 = 0;
        for (filename, file_url, size_mb) in &files {
            let result = self
                .download_single_file(
                    model_id,
                    filename,
                    file_url,
                    &client,
                    completed_bytes,
                    combined_total,
                )
                .await;
            if let Err(e) = result {
                let mut models = self.available_models.lock().unwrap();
                if let Some(model) = models.get_mut(model_id) {
                    model.is_downloading = false;
                }
                return Err(e);
            }
            completed_bytes += size_mb * 1024 * 1024;
        }

        // Download config file for TTS models
        if let Some(config_url) = config_url {
            let config_path = self
                .models_dir
                .join(format!("{}.json", &model_info.filename));
            if !config_path.exists() {
                info!("Downloading TTS config from {}", config_url);
                match client.get(&config_url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(bytes) = resp.bytes().await {
                            let _ = fs::write(&config_path, &bytes);
                        }
                    }
                    _ => {
                        warn!("Could not download TTS config, will use defaults");
                    }
                }
            }
        }

        // Update download status
        {
            let mut models = self.available_models.lock().unwrap();
            if let Some(model) = models.get_mut(model_id) {
                model.is_downloading = false;
                model.is_downloaded = true;
                model.partial_size = 0;
            }
        }

        let _ = self
            .app_handle
            .emit("onichan-model-download-complete", model_id);

        info!("Successfully downloaded onichan model {}", model_id);

        Ok(())
    }

    /// Download one file of a model, emitting progress against the combined
    /// multi-part total (base_bytes = bytes already accounted for by earlier
    /// parts).
    async fn download_single_file(
        &self,
        model_id: &str,
        filename: &str,
        url: &str,
        client: &reqwest::Client,
        base_bytes: u64,
        combined_total: u64,
    ) -> Result<()> {
        let model_path = self.models_dir.join(filename);
        let partial_path = self.models_dir.join(format!("{}.partial", filename));

        if model_path.exists() {
            if partial_path.exists() {
                let _ = fs::remove_file(&partial_path);
            }
            return Ok(());
        }

        let mut resume_from = if partial_path.exists() {
            let size = partial_path.metadata()?.len();
            info!("Resuming download of {} from byte {}", filename, size);
            size
        } else {
            info!("Starting fresh download of {} from {}", filename, url);
            0
        };

        let emit_progress = |downloaded_in_file: u64, speed_bps: u64| {
            let downloaded = base_bytes + downloaded_in_file;
            let progress = OnichanDownloadProgress {
                model_id: model_id.to_string(),
                downloaded,
                total: combined_total,
                percentage: if combined_total > 0 {
                    (downloaded as f64 / combined_total as f64) * 100.0
                } else {
                    0.0
                },
                speed_bps,
            };
            let _ = self
                .app_handle
                .emit("onichan-model-download-progress", &progress);
        };

        emit_progress(resume_from, 0);

        let mut request = client.get(url);
        if resume_from > 0 {
            request = request.header("Range", format!("bytes={}-", resume_from));
        }

        let mut response = request.send().await?;

        if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
            warn!(
                "Server doesn't support range requests for {}, restarting download",
                filename
            );
            drop(response);
            let _ = fs::remove_file(&partial_path);
            resume_from = 0;
            response = client.get(url).send().await?;
        }

        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            return Err(anyhow::anyhow!(
                "Failed to download {}: HTTP {}",
                filename,
                response.status()
            ));
        }

        let file_total = if resume_from > 0 {
            resume_from + response.content_length().unwrap_or(0)
        } else {
            response.content_length().unwrap_or(0)
        };

        let mut downloaded = resume_from;
        let mut stream = response.bytes_stream();

        let mut file = if resume_from > 0 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&partial_path)?
        } else {
            std::fs::File::create(&partial_path)?
        };

        info!("Download of {} started - {} bytes", filename, file_total);

        // Throttle progress events: one per ~250ms keeps the UI smooth
        // without a re-render per network chunk.
        let mut last_emit = std::time::Instant::now();
        let mut last_emit_bytes = downloaded;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;
            let elapsed = last_emit.elapsed();
            if elapsed >= std::time::Duration::from_millis(250) {
                let speed_bps =
                    ((downloaded - last_emit_bytes) as f64 / elapsed.as_secs_f64()) as u64;
                emit_progress(downloaded, speed_bps);
                last_emit = std::time::Instant::now();
                last_emit_bytes = downloaded;
            }
        }
        emit_progress(downloaded, 0);

        file.flush()?;
        drop(file);

        if file_total > 0 {
            let actual_size = partial_path.metadata()?.len();
            if actual_size != file_total {
                let _ = fs::remove_file(&partial_path);
                return Err(anyhow::anyhow!(
                    "Download of {} incomplete: expected {} bytes, got {} bytes",
                    filename,
                    file_total,
                    actual_size
                ));
            }
        }

        fs::rename(&partial_path, &model_path)?;
        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        let model_info = {
            let models = self.available_models.lock().unwrap();
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));
        let config_path = self
            .models_dir
            .join(format!("{}.json", &model_info.filename));

        let mut deleted_something = false;

        if model_path.exists() {
            fs::remove_file(&model_path)?;
            deleted_something = true;
        }

        if partial_path.exists() {
            fs::remove_file(&partial_path)?;
            deleted_something = true;
        }

        if config_path.exists() {
            fs::remove_file(&config_path)?;
        }

        for part in &model_info.extra_parts {
            for path in [
                self.models_dir.join(&part.filename),
                self.models_dir.join(format!("{}.partial", &part.filename)),
            ] {
                if path.exists() {
                    fs::remove_file(&path)?;
                    deleted_something = true;
                }
            }
        }

        if !deleted_something {
            return Err(anyhow::anyhow!("No model files found to delete"));
        }

        self.update_download_status()?;

        Ok(())
    }

    pub fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not downloaded: {}", model_id));
        }

        let model_path = self.models_dir.join(&model_info.filename);
        if model_path.exists() {
            Ok(model_path)
        } else {
            Err(anyhow::anyhow!("Model file not found: {}", model_id))
        }
    }
}
