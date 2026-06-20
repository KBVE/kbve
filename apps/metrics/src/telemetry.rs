use serde::Deserialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

const MAX_MESSAGE: usize = 4096;
const MAX_STACK: usize = 16384;
const MAX_URL: usize = 1024;
const MAX_EXTRA_KEYS: usize = 32;
const MAX_EXTRA_VALUE: usize = 1024;

const NOISE: &[&str] = &[
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Script error.",
    "Non-Error promise rejection captured",
];

#[derive(Debug, Deserialize)]
pub struct ErrorBatch {
    pub events: Vec<ErrorEvent>,
}

#[derive(Debug, Deserialize)]
pub struct ErrorEvent {
    pub project: String,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub error_type: Option<String>,
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub handled: Option<bool>,
    #[serde(default)]
    pub extra: Option<Map<String, Value>>,
}

fn truncate(mut s: String, max: usize) -> String {
    if s.len() > max {
        s.truncate(max);
    }
    s
}

fn strip_query(url: &str) -> String {
    let base = url.split(['?', '#']).next().unwrap_or(url);
    truncate(base.to_string(), MAX_URL)
}

fn is_noise(message: &str) -> bool {
    NOISE.iter().any(|n| message.contains(n))
}

fn fingerprint(project: &str, error_type: &str, stack: &str, message: &str) -> String {
    let basis = if stack.is_empty() { message } else { stack };
    let normalized: String = basis
        .lines()
        .take(5)
        .map(|l| l.split(['(', '@']).next().unwrap_or(l).trim())
        .collect::<Vec<_>>()
        .join("|");
    let mut hasher = Sha256::new();
    hasher.update(project.as_bytes());
    hasher.update(b":");
    hasher.update(error_type.as_bytes());
    hasher.update(b":");
    hasher.update(normalized.as_bytes());
    hex::encode(&hasher.finalize()[..16])
}

fn sanitize_extra(extra: Option<Map<String, Value>>) -> String {
    let Some(map) = extra else {
        return "{}".to_string();
    };
    let mut out = Map::new();
    for (k, v) in map.into_iter().take(MAX_EXTRA_KEYS) {
        let s = match v {
            Value::String(s) => Value::String(truncate(s, MAX_EXTRA_VALUE)),
            Value::Object(_) | Value::Array(_) => {
                Value::String(truncate(v.to_string(), MAX_EXTRA_VALUE))
            }
            other => other,
        };
        out.insert(k, s);
    }
    serde_json::to_string(&out).unwrap_or_else(|_| "{}".to_string())
}

impl ErrorEvent {
    pub fn into_row(self, user_agent: &str) -> Option<Value> {
        let message = truncate(self.message, MAX_MESSAGE);
        if message.is_empty() || is_noise(&message) {
            return None;
        }
        let project = truncate(self.project, 128);
        if project.is_empty() {
            return None;
        }
        let error_type = truncate(self.error_type.unwrap_or_default(), 128);
        let stack = truncate(self.stack.unwrap_or_default(), MAX_STACK);
        let url = self.url.map(|u| strip_query(&u)).unwrap_or_default();
        let fp = fingerprint(&project, &error_type, &stack, &message);

        Some(json!({
            "project": project,
            "platform": truncate(self.platform.unwrap_or_else(|| "web".into()), 32),
            "release": truncate(self.release.unwrap_or_default(), 64),
            "environment": truncate(self.environment.unwrap_or_else(|| "production".into()), 32),
            "fingerprint": fp,
            "error_type": error_type,
            "message": message,
            "stack": stack,
            "url": url,
            "user_id": truncate(self.user_id.unwrap_or_default(), 128),
            "session_id": truncate(self.session_id.unwrap_or_default(), 128),
            "user_agent": truncate(user_agent.to_string(), 512),
            "handled": if self.handled.unwrap_or(false) { 1u8 } else { 0u8 },
            "extra": sanitize_extra(self.extra),
        }))
    }
}
