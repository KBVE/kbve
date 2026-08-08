//! mistral.rs LLM Sidecar Process
//!
//! Pure-Rust inference engine alternative to llm-sidecar (llama.cpp).
//! Speaks the identical JSON-over-stdio protocol so LocalLlmManager can
//! drive either engine interchangeably:
//! - Requests are JSON objects on stdin (one per line)
//! - Responses are JSON objects on stdout (one per line)

use mistralrs::{GgufModelBuilder, Model, RequestBuilder, TextMessageRole, TextMessages};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum Request {
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

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum Response {
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

fn send(response: &Response) {
    if let Ok(json) = serde_json::to_string(response) {
        println!("{}", json);
        let _ = io::stdout().flush();
    }
}

struct LlmState {
    model: Option<Model>,
    model_path: Option<String>,
}

impl LlmState {
    fn new() -> Self {
        Self {
            model: None,
            model_path: None,
        }
    }

    async fn load_model(&mut self, model_path: &str) -> Result<(), String> {
        let path = Path::new(model_path);
        if !path.exists() {
            return Err(format!("Model file does not exist: {}", model_path));
        }
        let dir = path
            .parent()
            .ok_or_else(|| "Model path has no parent directory".to_string())?
            .to_string_lossy()
            .to_string();
        let file = path
            .file_name()
            .ok_or_else(|| "Model path has no file name".to_string())?
            .to_string_lossy()
            .to_string();

        log::info!("Loading GGUF model via mistral.rs: {}/{}", dir, file);
        self.model = None;
        let model = GgufModelBuilder::new(dir, vec![file])
            .with_logging()
            .build()
            .await
            .map_err(|e| format!("Failed to load model: {}", e))?;

        self.model = Some(model);
        self.model_path = Some(model_path.to_string());
        Ok(())
    }

    fn unload(&mut self) {
        self.model = None;
        self.model_path = None;
    }

    async fn chat(
        &self,
        system_prompt: &str,
        user_message: &str,
        max_tokens: u32,
    ) -> Result<String, String> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| "No model loaded".to_string())?;

        let messages = TextMessages::new()
            .add_message(TextMessageRole::System, system_prompt)
            .add_message(TextMessageRole::User, user_message);
        let request = RequestBuilder::from(messages).set_sampler_max_len(max_tokens as usize);

        let response = model
            .send_chat_request(request)
            .await
            .map_err(|e| format!("Chat failed: {}", e))?;

        response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| "Empty response from model".to_string())
    }

    async fn generate(&self, prompt: &str, max_tokens: u32) -> Result<String, String> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| "No model loaded".to_string())?;

        let messages = TextMessages::new().add_message(TextMessageRole::User, prompt);
        let request = RequestBuilder::from(messages).set_sampler_max_len(max_tokens as usize);

        let response = model
            .send_chat_request(request)
            .await
            .map_err(|e| format!("Generate failed: {}", e))?;

        response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| "Empty response from model".to_string())
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .target(env_logger::Target::Stderr)
        .init();

    let runtime = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    let mut state = LlmState::new();

    // Signal ready
    send(&Response::Ok {
        message: "mistral.rs sidecar ready".to_string(),
    });

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                send(&Response::Error {
                    message: format!("Invalid request: {}", e),
                });
                continue;
            }
        };

        match request {
            Request::Load { model_path } => match runtime.block_on(state.load_model(&model_path)) {
                Ok(()) => send(&Response::Ok {
                    message: format!("Model loaded: {}", model_path),
                }),
                Err(e) => send(&Response::Error { message: e }),
            },
            Request::Unload => {
                state.unload();
                send(&Response::Ok {
                    message: "Model unloaded".to_string(),
                });
            }
            Request::Chat {
                system_prompt,
                user_message,
                max_tokens,
            } => match runtime.block_on(state.chat(&system_prompt, &user_message, max_tokens)) {
                Ok(text) => send(&Response::Result { text }),
                Err(e) => send(&Response::Error { message: e }),
            },
            Request::Generate { prompt, max_tokens } => {
                match runtime.block_on(state.generate(&prompt, max_tokens)) {
                    Ok(text) => send(&Response::Result { text }),
                    Err(e) => send(&Response::Error { message: e }),
                }
            }
            Request::Status => {
                send(&Response::Status {
                    loaded: state.model.is_some(),
                    model_path: state.model_path.clone(),
                });
            }
            Request::Shutdown => {
                send(&Response::Ok {
                    message: "Shutting down".to_string(),
                });
                break;
            }
        }
    }
}
