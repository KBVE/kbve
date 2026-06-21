use serde::Deserialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

const MAX_MESSAGE: usize = 4096;
const MAX_STACK: usize = 16384;
const MAX_URL: usize = 1024;
const MAX_EXTRA_KEYS: usize = 32;
const MAX_EXTRA_KEY: usize = 128;
const MAX_EXTRA_VALUE: usize = 1024;

const PLATFORMS: &[&str] = &[
    "web", "ios", "android", "desktop", "server", "node", "unknown",
];
const ENVIRONMENTS: &[&str] = &[
    "production",
    "staging",
    "development",
    "preview",
    "test",
    "local",
];

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

/// Byte-truncate without splitting a UTF-8 code point (`String::truncate`
/// panics on a non-boundary index — a multibyte char at the limit would crash
/// the ingest handler).
fn truncate(s: String, max: usize) -> String {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

/// Strip null bytes and control characters (incl. ESC, so ANSI escape
/// sequences and terminal/log-injection payloads can't survive), then truncate.
/// `keep_newlines` preserves `\n`/`\t` for multi-line fields like stacks.
fn sanitize(s: &str, max: usize, keep_newlines: bool) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| {
            if keep_newlines && (*c == '\n' || *c == '\t') {
                return true;
            }
            !c.is_control()
        })
        .collect();
    truncate(cleaned, max)
}

/// Clamp a free-form dimension to a known allow-list, falling back to a default.
/// Keeps `LowCardinality` columns from exploding on attacker-supplied values.
fn allow_enum(val: Option<String>, allowed: &[&str], default: &str) -> String {
    match val {
        Some(v) => {
            let v = v.trim().to_lowercase();
            if allowed.contains(&v.as_str()) {
                v
            } else {
                default.to_string()
            }
        }
        None => default.to_string(),
    }
}

fn strip_query(url: &str) -> String {
    let base = url.split(['?', '#']).next().unwrap_or(url);
    sanitize(base, MAX_URL, false)
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
        let key = sanitize(&k, MAX_EXTRA_KEY, false);
        if key.is_empty() {
            continue;
        }
        let s = match v {
            Value::String(s) => Value::String(sanitize(&s, MAX_EXTRA_VALUE, false)),
            Value::Object(_) | Value::Array(_) => {
                Value::String(sanitize(&v.to_string(), MAX_EXTRA_VALUE, false))
            }
            other => other,
        };
        out.insert(key, s);
    }
    serde_json::to_string(&out).unwrap_or_else(|_| "{}".to_string())
}

impl ErrorEvent {
    pub fn into_row(self, user_agent: &str) -> Option<Value> {
        let message = sanitize(&self.message, MAX_MESSAGE, true);
        if message.is_empty() || is_noise(&message) {
            return None;
        }
        let project = sanitize(&self.project, 128, false);
        if project.is_empty() {
            return None;
        }
        let error_type = sanitize(&self.error_type.unwrap_or_default(), 128, false);
        let stack = sanitize(&self.stack.unwrap_or_default(), MAX_STACK, true);
        let url = self.url.map(|u| strip_query(&u)).unwrap_or_default();
        let fp = fingerprint(&project, &error_type, &stack, &message);

        Some(json!({
            "project": project,
            "platform": allow_enum(self.platform, PLATFORMS, "web"),
            "release": sanitize(&self.release.unwrap_or_default(), 64, false),
            "environment": allow_enum(self.environment, ENVIRONMENTS, "production"),
            "fingerprint": fp,
            "error_type": error_type,
            "message": message,
            "stack": stack,
            "url": url,
            "user_id": sanitize(&self.user_id.unwrap_or_default(), 128, false),
            "session_id": sanitize(&self.session_id.unwrap_or_default(), 128, false),
            "user_agent": sanitize(user_agent, 512, false),
            "handled": if self.handled.unwrap_or(false) { 1u8 } else { 0u8 },
            "extra": sanitize_extra(self.extra),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(message: &str) -> ErrorEvent {
        ErrorEvent {
            project: "kbve".into(),
            platform: None,
            release: None,
            environment: None,
            error_type: None,
            message: message.into(),
            stack: None,
            url: None,
            user_id: None,
            session_id: None,
            handled: None,
            extra: None,
        }
    }

    #[test]
    fn truncate_does_not_split_utf8() {
        // "💥" is 4 bytes; truncating to 2 must not panic and yields "".
        let out = truncate("💥".to_string(), 2);
        assert!(out.is_empty());
        // Boundary inside the second char drops it cleanly.
        let out = truncate("a💥".to_string(), 3);
        assert_eq!(out, "a");
    }

    #[test]
    fn sanitize_strips_control_and_ansi() {
        let out = sanitize("a\u{0}b\u{1b}[31mred\u{1b}[0mc\u{7}", 64, false);
        assert_eq!(out, "ab[31mred[0mc");
    }

    #[test]
    fn sanitize_keeps_newlines_when_asked() {
        assert_eq!(sanitize("a\nb\tc", 64, true), "a\nb\tc");
        assert_eq!(sanitize("a\nb\tc", 64, false), "abc");
    }

    #[test]
    fn allow_enum_clamps_unknown() {
        assert_eq!(allow_enum(Some("iOS".into()), PLATFORMS, "web"), "ios");
        assert_eq!(allow_enum(Some("'; DROP".into()), PLATFORMS, "web"), "web");
        assert_eq!(allow_enum(None, ENVIRONMENTS, "production"), "production");
    }

    #[test]
    fn multibyte_message_at_limit_does_not_panic() {
        let msg = "x".repeat(MAX_MESSAGE - 1) + "💥";
        let row = event(&msg).into_row("ua");
        assert!(row.is_some());
    }

    #[test]
    fn empty_and_noise_dropped() {
        assert!(event("").into_row("ua").is_none());
        assert!(event("Script error.").into_row("ua").is_none());
    }

    #[test]
    fn enum_and_extra_sanitized_in_row() {
        let mut ev = event("boom");
        ev.platform = Some("android".into());
        ev.environment = Some("hacker".into());
        let mut map = Map::new();
        map.insert("ok\u{0}key".into(), Value::String("va\u{1b}lue".into()));
        ev.extra = Some(map);
        let row = ev.into_row("agent\u{0}x").unwrap();
        assert_eq!(row["platform"], "android");
        assert_eq!(row["environment"], "production");
        assert_eq!(row["user_agent"], "agentx");
        let extra: Value = serde_json::from_str(row["extra"].as_str().unwrap()).unwrap();
        assert_eq!(extra["okkey"], "value");
    }
}
