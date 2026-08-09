//! Local LLM Manager - Communicates with LLM sidecar process
//!
//! The LLM runs in a separate process to avoid GGML symbol conflicts with whisper-rs.
//! Communication is via JSON over stdin/stdout pipes.

use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

/// Request types sent to the sidecar
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum SidecarRequest {
    #[serde(rename = "load")]
    Load { model_path: String },
    #[serde(rename = "unload")]
    Unload,
    #[serde(rename = "chat")]
    Chat {
        system_prompt: String,
        user_message: String,
        max_tokens: u32,
    },
    #[serde(rename = "generate")]
    Generate { prompt: String, max_tokens: u32 },
    #[serde(rename = "status")]
    Status,
    #[serde(rename = "shutdown")]
    Shutdown,
}

/// Response types from the sidecar
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum SidecarResponse {
    #[serde(rename = "ok")]
    Ok { message: String },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "result")]
    Result { text: String },
    #[serde(rename = "status")]
    Status {
        loaded: bool,
        model_path: Option<String>,
    },
}

/// Manages communication with the LLM sidecar process
struct SidecarProcess {
    child: Child,
    model_path: Option<String>,
}

impl SidecarProcess {
    fn spawn(sidecar_path: &Path) -> Result<Self, String> {
        info!("Spawning LLM sidecar from: {:?}", sidecar_path);

        let mut child = Command::new(sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null()) // Suppress llama.cpp debug spam
            .env("LLAMA_LOG_DISABLE", "1") // Try to disable llama.cpp logging
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        // Wait for the ready message
        let stdout = child
            .stdout
            .as_mut()
            .ok_or_else(|| "Failed to get sidecar stdout".to_string())?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("Failed to read sidecar ready message: {}", e))?;

        let response: SidecarResponse =
            serde_json::from_str(&line).map_err(|e| format!("Invalid sidecar response: {}", e))?;

        match response {
            SidecarResponse::Ok { message } => {
                info!("Sidecar ready: {}", message);
            }
            SidecarResponse::Error { message } => {
                return Err(format!("Sidecar failed to start: {}", message));
            }
            _ => {
                return Err("Unexpected response from sidecar".to_string());
            }
        }

        Ok(Self {
            child,
            model_path: None,
        })
    }

    fn send_request(&mut self, request: &SidecarRequest) -> Result<SidecarResponse, String> {
        let stdin = self
            .child
            .stdin
            .as_mut()
            .ok_or_else(|| "Sidecar stdin not available".to_string())?;

        let json = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        writeln!(stdin, "{}", json).map_err(|e| format!("Failed to write to sidecar: {}", e))?;
        stdin
            .flush()
            .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;

        // Read response - skip any non-JSON lines (llama.cpp debug output)
        let stdout = self
            .child
            .stdout
            .as_mut()
            .ok_or_else(|| "Sidecar stdout not available".to_string())?;
        let mut reader = BufReader::new(stdout);

        // Try up to 10 lines to find a valid JSON response
        for attempt in 0..10 {
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .map_err(|e| format!("Failed to read sidecar response: {}", e))?;

            // Check for empty response (sidecar likely crashed)
            if line.trim().is_empty() {
                return Err("Sidecar returned empty response (may have crashed)".to_string());
            }

            // Try to parse as JSON - if it fails and looks like debug output, skip it
            match serde_json::from_str::<SidecarResponse>(&line) {
                Ok(response) => return Ok(response),
                Err(e) => {
                    // Check if this looks like llama.cpp debug output (doesn't start with '{')
                    let trimmed = line.trim();
                    if !trimmed.starts_with('{') {
                        warn!(
                            "Skipping non-JSON sidecar output (attempt {}): {}",
                            attempt + 1,
                            trimmed
                        );
                        continue;
                    }
                    // It started with '{' but failed to parse - real error
                    return Err(format!("Invalid sidecar response: {}", e));
                }
            }
        }

        Err("Too many non-JSON lines from sidecar, giving up".to_string())
    }

    /// Check if the sidecar process is still alive
    fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(Some(_)) => false, // Process has exited
            Ok(None) => true,     // Process is still running
            Err(_) => false,      // Error checking - assume dead
        }
    }

    fn load_model(&mut self, model_path: &str) -> Result<(), String> {
        let response = self.send_request(&SidecarRequest::Load {
            model_path: model_path.to_string(),
        })?;

        match response {
            SidecarResponse::Ok { .. } => {
                self.model_path = Some(model_path.to_string());
                Ok(())
            }
            SidecarResponse::Error { message } => Err(message),
            _ => Err("Unexpected response from sidecar".to_string()),
        }
    }

    fn unload_model(&mut self) -> Result<(), String> {
        let response = self.send_request(&SidecarRequest::Unload)?;

        match response {
            SidecarResponse::Ok { .. } => {
                self.model_path = None;
                Ok(())
            }
            SidecarResponse::Error { message } => Err(message),
            _ => Err("Unexpected response from sidecar".to_string()),
        }
    }

    fn chat(
        &mut self,
        system_prompt: &str,
        user_message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let response = self.send_request(&SidecarRequest::Chat {
            system_prompt: system_prompt.to_string(),
            user_message: user_message.to_string(),
            max_tokens,
        })?;

        match response {
            SidecarResponse::Result { text } => Ok(text),
            SidecarResponse::Error { message } => Err(message),
            _ => Err("Unexpected response from sidecar".to_string()),
        }
    }

    fn generate(&mut self, prompt: &str, max_tokens: u32) -> Result<String, String> {
        let response = self.send_request(&SidecarRequest::Generate {
            prompt: prompt.to_string(),
            max_tokens,
        })?;

        match response {
            SidecarResponse::Result { text } => Ok(text),
            SidecarResponse::Error { message } => Err(message),
            _ => Err("Unexpected response from sidecar".to_string()),
        }
    }

    fn shutdown(&mut self) {
        if let Err(e) = self.send_request(&SidecarRequest::Shutdown) {
            warn!("Error sending shutdown to sidecar: {}", e);
        }
        if let Err(e) = self.child.wait() {
            warn!("Error waiting for sidecar to exit: {}", e);
        }
    }

    fn is_loaded(&self) -> bool {
        self.model_path.is_some()
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        info!("Dropping sidecar process");
        self.shutdown();
    }
}

/// Thread-safe manager for the LLM sidecar
/// Which inference engine backs the local LLM.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum LlmEngine {
    /// llama.cpp via llm-sidecar (default)
    LlamaCpp,
    /// mistral.rs via mistralrs-sidecar (pure Rust)
    MistralRs,
    /// External OpenAI-compatible server (oMLX, rMLX, ollama, LM Studio, ...)
    OpenaiCompat,
    /// Built-in MLX engine: bundled rMLX sidecar serving mlx-community models
    Mlx,
}

impl LlmEngine {
    pub fn from_str_or_default(s: &str) -> Self {
        match s {
            "mistral_rs" => Self::MistralRs,
            "openai_compat" => Self::OpenaiCompat,
            "mlx" => Self::Mlx,
            _ => Self::LlamaCpp,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LlamaCpp => "llama_cpp",
            Self::MistralRs => "mistral_rs",
            Self::OpenaiCompat => "openai_compat",
            Self::Mlx => "mlx",
        }
    }
}

pub struct LocalLlmManager {
    sidecar: Mutex<Option<SidecarProcess>>,
    sidecar_path: PathBuf,
    mistralrs_path: PathBuf,
    engine: Mutex<LlmEngine>,
    /// Base URL for the OpenAI-compatible engine (e.g. http://localhost:8000/v1)
    endpoint_url: Mutex<String>,
    /// Staged rMLX binary for the built-in MLX engine
    mlx_binary_path: PathBuf,
    /// Managed rMLX server process (Mlx engine only)
    mlx_process: Mutex<Option<Child>>,
    mlx_model_dir: Mutex<Option<PathBuf>>,
    /// Track the loaded model path so we can reload after crash
    loaded_model_path: Mutex<Option<PathBuf>>,
    /// Short-lived cache of the HTTP server's model name; status polls hit
    /// is_loaded + get_loaded_model_name back-to-back and shouldn't double
    /// the network round-trips.
    http_name_cache: Mutex<Option<(std::time::Instant, Option<String>)>>,
}

impl LocalLlmManager {
    pub fn new(sidecar_path: PathBuf, mistralrs_path: PathBuf, mlx_binary_path: PathBuf) -> Self {
        Self {
            sidecar: Mutex::new(None),
            sidecar_path,
            mistralrs_path,
            mlx_binary_path,
            mlx_process: Mutex::new(None),
            mlx_model_dir: Mutex::new(None),
            engine: Mutex::new(LlmEngine::LlamaCpp),
            endpoint_url: Mutex::new("http://localhost:8000/v1".to_string()),
            loaded_model_path: Mutex::new(None),
            http_name_cache: Mutex::new(None),
        }
    }

    fn clear_http_name_cache(&self) {
        *self.http_name_cache.lock().unwrap() = None;
    }

    const MLX_PORT: u16 = 18434;

    fn mlx_base_url() -> String {
        format!("http://127.0.0.1:{}/v1", Self::MLX_PORT)
    }

    fn active_http_base(&self) -> String {
        match self.engine() {
            LlmEngine::Mlx => Self::mlx_base_url(),
            _ => self.endpoint_url(),
        }
    }

    fn mlx_stop(&self) {
        let mut guard = self.mlx_process.lock().unwrap();
        if let Some(mut child) = guard.take() {
            info!("Stopping rMLX server");
            let _ = child.kill();
            let _ = child.wait();
        }
        *self.mlx_model_dir.lock().unwrap() = None;
        self.clear_http_name_cache();
    }

    fn mlx_load(&self, model_dir: &Path) -> Result<(), String> {
        if !self.mlx_binary_path.exists() {
            return Err(format!(
                "rMLX binary not staged at {:?} — run build:sidecars",
                self.mlx_binary_path
            ));
        }
        if !model_dir.is_dir() {
            return Err(format!(
                "MLX engine needs an MLX model folder (safetensors layout), got: {:?}",
                model_dir
            ));
        }

        self.mlx_stop();
        info!("Starting rMLX server for {:?}", model_dir);
        let child = Command::new(&self.mlx_binary_path)
            .arg("serve")
            .arg("--model")
            .arg(model_dir)
            .arg("--port")
            .arg(Self::MLX_PORT.to_string())
            // rMLX writes .rmlx/ logs+metrics into its cwd — keep that in the
            // model folder (app data), not wherever the app was launched from.
            .current_dir(model_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn rMLX: {}", e))?;
        *self.mlx_process.lock().unwrap() = Some(child);

        // Poll until the server answers (large models take a while to load).
        let deadline = std::time::Instant::now() + Duration::from_secs(180);
        loop {
            if self.http_model_name_at(&Self::mlx_base_url()).is_some() {
                break;
            }
            if std::time::Instant::now() > deadline {
                self.mlx_stop();
                return Err("rMLX server did not become ready within 180s".to_string());
            }
            // Bail fast if the process died (bad model dir, port clash, ...)
            if let Some(child) = self.mlx_process.lock().unwrap().as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    *self.mlx_model_dir.lock().unwrap() = None;
                    return Err(format!("rMLX exited during startup: {}", status));
                }
            }
            thread::sleep(Duration::from_millis(500));
        }

        *self.mlx_model_dir.lock().unwrap() = Some(model_dir.to_path_buf());
        self.clear_http_name_cache();
        info!("rMLX server ready on port {}", Self::MLX_PORT);
        Ok(())
    }

    pub fn endpoint_url(&self) -> String {
        self.endpoint_url.lock().unwrap().clone()
    }

    pub fn set_endpoint_url(&self, url: String) {
        *self.endpoint_url.lock().unwrap() = url.trim_end_matches('/').to_string();
        self.clear_http_name_cache();
    }

    fn http_client() -> Result<reqwest::blocking::Client, String> {
        reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))
    }

    fn http_chat(
        &self,
        system_prompt: Option<&str>,
        user_message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let base = self.active_http_base();
        let mut messages = Vec::new();
        if let Some(sys) = system_prompt {
            messages.push(serde_json::json!({"role": "system", "content": sys}));
        }
        messages.push(serde_json::json!({"role": "user", "content": user_message}));

        let body = serde_json::json!({
            "model": "default",
            "messages": messages,
            "max_tokens": max_tokens,
        });

        let resp = Self::http_client()?
            .post(format!("{}/chat/completions", base))
            .json(&body)
            .send()
            .map_err(|e| format!("LLM server request failed ({}): {}", base, e))?;

        if !resp.status().is_success() {
            return Err(format!("LLM server returned HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp
            .json()
            .map_err(|e| format!("Invalid LLM server response: {}", e))?;
        json["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.trim().to_string())
            .ok_or_else(|| "LLM server response had no content".to_string())
    }

    fn http_model_name(&self) -> Option<String> {
        {
            let cache = self.http_name_cache.lock().unwrap();
            if let Some((at, ref name)) = *cache {
                if at.elapsed() < Duration::from_secs(2) {
                    return name.clone();
                }
            }
        }
        let base = self.active_http_base();
        let name = self.http_model_name_at(&base);
        *self.http_name_cache.lock().unwrap() = Some((std::time::Instant::now(), name.clone()));
        name
    }

    fn http_model_name_at(&self, base: &str) -> Option<String> {
        let resp = Self::http_client()
            .ok()?
            .get(format!("{}/models", base))
            .send()
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let json: serde_json::Value = resp.json().ok()?;
        json["data"][0]["id"].as_str().map(|s| s.to_string())
    }

    pub fn engine(&self) -> LlmEngine {
        *self.engine.lock().unwrap()
    }

    fn engine_path(&self) -> PathBuf {
        match self.engine() {
            LlmEngine::LlamaCpp => self.sidecar_path.clone(),
            LlmEngine::MistralRs => self.mistralrs_path.clone(),
            LlmEngine::OpenaiCompat | LlmEngine::Mlx => PathBuf::new(),
        }
    }

    /// Switch engines. Shuts down the running sidecar; the previously loaded
    /// model (if any) is reloaded into the new engine on demand.
    pub fn set_engine(&self, engine: LlmEngine) -> Result<(), String> {
        if engine == LlmEngine::OpenaiCompat {
            // External server: nothing to stage; sidecar shut down below.
        } else if engine == LlmEngine::Mlx && !self.mlx_binary_path.exists() {
            return Err(format!(
                "rMLX binary not staged at {:?} — run build:sidecars",
                self.mlx_binary_path
            ));
        } else if engine == LlmEngine::MistralRs && !self.mistralrs_path.exists() {
            return Err(format!(
                "mistral.rs sidecar not staged at {:?} — run build:sidecars",
                self.mistralrs_path
            ));
        }
        {
            let mut current = self.engine.lock().unwrap();
            if *current == engine {
                return Ok(());
            }
            *current = engine;
        }
        info!("LLM engine switched to {:?}", engine);
        self.clear_http_name_cache();
        let mut guard = self.sidecar.lock().unwrap();
        if let Some(mut sidecar) = guard.take() {
            sidecar.shutdown();
        }
        drop(guard);
        if engine != LlmEngine::Mlx {
            self.mlx_stop();
        }
        Ok(())
    }

    /// Get the sidecar, spawning it if necessary or if it crashed
    fn ensure_sidecar(&self) -> Result<(), String> {
        let mut guard = self.sidecar.lock().unwrap();

        // Check if existing sidecar is still alive
        let needs_respawn = match guard.as_mut() {
            Some(sidecar) => !sidecar.is_alive(),
            None => true,
        };

        if needs_respawn {
            // Clear the dead sidecar if any
            let was_running = guard.is_some();
            if was_running {
                warn!("LLM sidecar crashed, respawning...");
                *guard = None;
            }

            info!("Starting LLM sidecar process...");
            let mut sidecar = SidecarProcess::spawn(&self.engine_path())?;

            // If we had a model loaded before the crash, reload it
            if was_running {
                let model_path_guard = self.loaded_model_path.lock().unwrap();
                if let Some(ref model_path) = *model_path_guard {
                    info!("Reloading model after crash: {:?}", model_path);
                    if let Err(e) = sidecar.load_model(&model_path.to_string_lossy()) {
                        error!("Failed to reload model after crash: {}", e);
                        // Don't fail - the sidecar is running, just without a model
                    } else {
                        // Give the model a moment to stabilize after loading
                        info!("Model reloaded, waiting for stabilization...");
                        thread::sleep(Duration::from_millis(500));
                    }
                }
            }

            *guard = Some(sidecar);
        }
        Ok(())
    }

    pub fn load_model(&self, model_path: &Path) -> Result<(), String> {
        info!(
            "LocalLlmManager::load_model() called with path: {:?}",
            model_path
        );

        if self.engine() == LlmEngine::Mlx {
            // Catalog MLX entries point at a file inside the model folder
            // (config.json); rMLX wants the folder itself.
            let dir = if model_path.is_file() {
                model_path.parent().unwrap_or(model_path)
            } else {
                model_path
            };
            return self.mlx_load(dir);
        }

        if self.engine() == LlmEngine::OpenaiCompat {
            // The external server manages its own models; verify it responds.
            return match self.http_model_name() {
                Some(name) => {
                    info!("OpenAI-compatible server ready, serving: {}", name);
                    Ok(())
                }
                None => Err(format!(
                    "No OpenAI-compatible server reachable at {}",
                    self.endpoint_url()
                )),
            };
        }

        // Verify the file exists first
        if !model_path.exists() {
            let err = format!("Model file does not exist: {:?}", model_path);
            error!("{}", err);
            return Err(err);
        }

        self.ensure_sidecar()?;

        let mut guard = self.sidecar.lock().unwrap();
        let sidecar = guard
            .as_mut()
            .ok_or_else(|| "Sidecar not available".to_string())?;

        let result = sidecar.load_model(&model_path.to_string_lossy());

        // Track the loaded model path for crash recovery
        if result.is_ok() {
            let mut model_path_guard = self.loaded_model_path.lock().unwrap();
            *model_path_guard = Some(model_path.to_path_buf());
        }

        result
    }

    pub fn unload_model(&self) {
        if self.engine() == LlmEngine::OpenaiCompat {
            return;
        }
        if self.engine() == LlmEngine::Mlx {
            self.mlx_stop();
            let mut model_path_guard = self.loaded_model_path.lock().unwrap();
            *model_path_guard = None;
            return;
        }
        let mut guard = self.sidecar.lock().unwrap();
        if let Some(ref mut sidecar) = *guard {
            if let Err(e) = sidecar.unload_model() {
                error!("Failed to unload model: {}", e);
            }
        }
        // Clear the tracked model path
        let mut model_path_guard = self.loaded_model_path.lock().unwrap();
        *model_path_guard = None;
    }

    pub fn is_loaded(&self) -> bool {
        if matches!(self.engine(), LlmEngine::OpenaiCompat | LlmEngine::Mlx) {
            return self.http_model_name().is_some();
        }
        let guard = self.sidecar.lock().unwrap();
        guard.as_ref().map(|s| s.is_loaded()).unwrap_or(false)
    }

    /// Get the currently loaded model name (file stem without extension)
    pub fn get_loaded_model_name(&self) -> Option<String> {
        if matches!(self.engine(), LlmEngine::OpenaiCompat | LlmEngine::Mlx) {
            return self.http_model_name();
        }
        let guard = self.loaded_model_path.lock().unwrap();
        guard.as_ref().and_then(|path| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
    }

    pub fn chat(
        &self,
        system_prompt: &str,
        user_message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        if matches!(self.engine(), LlmEngine::OpenaiCompat | LlmEngine::Mlx) {
            return self.http_chat(Some(system_prompt), user_message, max_tokens);
        }
        self.ensure_sidecar()?;

        let result = {
            let mut guard = self.sidecar.lock().unwrap();
            let sidecar = guard
                .as_mut()
                .ok_or_else(|| "Sidecar not available".to_string())?;
            sidecar.chat(system_prompt, user_message, max_tokens)
        };

        // If we got a broken pipe, empty response, or invalid JSON, the sidecar crashed - try to recover once
        if let Err(ref e) = result {
            if e.contains("Broken pipe")
                || e.contains("empty response")
                || e.contains("crashed")
                || e.contains("Invalid sidecar response")
                || e.contains("expected value")
            {
                warn!("Sidecar appears to have crashed during chat, attempting recovery...");

                // Force respawn by clearing the sidecar
                {
                    let mut guard = self.sidecar.lock().unwrap();
                    *guard = None;
                }

                // Respawn sidecar
                self.ensure_sidecar()?;

                // Reload the model after crash recovery (ensure_sidecar won't do it since guard was None)
                {
                    let model_path = self.loaded_model_path.lock().unwrap().clone();
                    if let Some(ref path) = model_path {
                        info!("Reloading model after crash recovery: {:?}", path);
                        let mut guard = self.sidecar.lock().unwrap();
                        if let Some(ref mut sidecar) = *guard {
                            if let Err(e) = sidecar.load_model(&path.to_string_lossy()) {
                                error!("Failed to reload model after crash: {}", e);
                                return Err(format!("Failed to reload model after crash: {}", e));
                            }
                        }
                    } else {
                        return Err("No model was loaded before crash".to_string());
                    }
                }

                // Wait for the model to stabilize after reload
                info!("Waiting for model to stabilize after crash recovery...");
                thread::sleep(Duration::from_secs(1));

                // Retry the chat
                let mut guard = self.sidecar.lock().unwrap();
                let sidecar = guard
                    .as_mut()
                    .ok_or_else(|| "Sidecar not available after recovery".to_string())?;

                return sidecar.chat(system_prompt, user_message, max_tokens);
            }
        }

        result
    }

    pub fn generate(&self, prompt: &str, max_tokens: u32) -> Result<String, String> {
        if matches!(self.engine(), LlmEngine::OpenaiCompat | LlmEngine::Mlx) {
            return self.http_chat(None, prompt, max_tokens);
        }
        self.ensure_sidecar()?;

        let result = {
            let mut guard = self.sidecar.lock().unwrap();
            let sidecar = guard
                .as_mut()
                .ok_or_else(|| "Sidecar not available".to_string())?;
            sidecar.generate(prompt, max_tokens)
        };

        // If we got a broken pipe, empty response, or invalid JSON, the sidecar crashed - try to recover once
        if let Err(ref e) = result {
            if e.contains("Broken pipe")
                || e.contains("empty response")
                || e.contains("crashed")
                || e.contains("Invalid sidecar response")
                || e.contains("expected value")
            {
                warn!("Sidecar appears to have crashed during generate, attempting recovery...");

                // Force respawn by clearing the sidecar
                {
                    let mut guard = self.sidecar.lock().unwrap();
                    *guard = None;
                }

                // Respawn sidecar
                self.ensure_sidecar()?;

                // Reload the model after crash recovery (ensure_sidecar won't do it since guard was None)
                {
                    let model_path = self.loaded_model_path.lock().unwrap().clone();
                    if let Some(ref path) = model_path {
                        info!("Reloading model after crash recovery: {:?}", path);
                        let mut guard = self.sidecar.lock().unwrap();
                        if let Some(ref mut sidecar) = *guard {
                            if let Err(e) = sidecar.load_model(&path.to_string_lossy()) {
                                error!("Failed to reload model after crash: {}", e);
                                return Err(format!("Failed to reload model after crash: {}", e));
                            }
                        }
                    } else {
                        return Err("No model was loaded before crash".to_string());
                    }
                }

                // Wait for the model to stabilize after reload
                info!("Waiting for model to stabilize after crash recovery...");
                thread::sleep(Duration::from_secs(1));

                // Retry the generate
                let mut guard = self.sidecar.lock().unwrap();
                let sidecar = guard
                    .as_mut()
                    .ok_or_else(|| "Sidecar not available after recovery".to_string())?;

                return sidecar.generate(prompt, max_tokens);
            }
        }

        result
    }

    /// Shutdown the sidecar process
    pub fn shutdown(&self) {
        let mut guard = self.sidecar.lock().unwrap();
        if let Some(mut sidecar) = guard.take() {
            sidecar.shutdown();
        }
    }
}

impl Default for LocalLlmManager {
    fn default() -> Self {
        // Default paths - will be set properly from tauri config
        Self::new(
            PathBuf::from("llm-sidecar"),
            PathBuf::from("mistralrs-sidecar"),
            PathBuf::from("rmlx"),
        )
    }
}

impl Drop for LocalLlmManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}
