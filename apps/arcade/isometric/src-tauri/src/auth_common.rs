use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// One-shot drop-off for sign-ins observed by the OAuth listener / deep-link
/// handler. Drained by `game::phase::drain_pending_signin` once per frame
/// into `PreFlight`.
static PENDING_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

/// Persistent snapshot of the current sign-in. React components on either
/// platform poll this via `get_signin_state_json` (WASM) or
/// `get_signin_state` (Tauri) to decide whether to prompt for a username.
static CURRENT_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

/// Persistent copy of the latest Supabase access token observed by either
/// the localhost OAuth listener or the `set_signed_in` wasm-bindgen
/// export. Read by `game::chat` to authenticate against the IRC gateway
/// (`wss://chat.kbve.com`) using the JWT as the `PASS` line.
static CURRENT_JWT: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct SignInResult {
    pub jwt_valid: bool,
    pub username: Option<String>,
}

pub fn take_pending_signin() -> Option<SignInResult> {
    PENDING_SIGNIN.lock().ok().and_then(|mut g| g.take())
}

pub fn current_signin_snapshot() -> SignInResult {
    CURRENT_SIGNIN
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_default()
}

pub fn record_signin(jwt: &str) {
    let result = SignInResult {
        jwt_valid: true,
        username: parse_kbve_username(jwt),
    };
    if let Ok(mut g) = PENDING_SIGNIN.lock() {
        *g = Some(result.clone());
    }
    if let Ok(mut g) = CURRENT_SIGNIN.lock() {
        *g = Some(result);
    }
    if let Ok(mut g) = CURRENT_JWT.lock() {
        *g = Some(jwt.to_string());
    }
    persist_jwt(jwt);
}

#[derive(Serialize, Deserialize)]
struct PersistedSession {
    jwt: String,
}

fn session_file_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|p| p.join("kbve_session.json"))
}

fn jwt_expiry(jwt: &str) -> Option<i64> {
    let payload_b64 = jwt.split('.').nth(1)?;
    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .ok()
        .or_else(|| {
            base64::engine::general_purpose::STANDARD_NO_PAD
                .decode(payload_b64)
                .ok()
        })?;
    let payload: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;
    payload.get("exp").and_then(|v| v.as_i64())
}

fn jwt_is_fresh(jwt: &str) -> bool {
    let Some(exp) = jwt_expiry(jwt) else {
        return false;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    exp > now + 60
}

fn persist_jwt(jwt: &str) {
    let Some(path) = session_file_path() else {
        return;
    };
    let session = PersistedSession {
        jwt: jwt.to_string(),
    };
    let Ok(json) = serde_json::to_string(&session) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, json);
}

/// Read the persisted session from disk and restore the in-memory sign-in
/// state if the JWT is still valid. Called once at boot before the Bevy app
/// starts so `PreFlight` observes the sign-in on its first tick.
pub fn restore_persisted_session() {
    let Some(path) = session_file_path() else {
        return;
    };
    let Ok(json) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(session) = serde_json::from_str::<PersistedSession>(&json) else {
        return;
    };
    if !jwt_is_fresh(&session.jwt) {
        let _ = std::fs::remove_file(&path);
        return;
    }
    let result = SignInResult {
        jwt_valid: true,
        username: parse_kbve_username(&session.jwt),
    };
    if let Ok(mut g) = PENDING_SIGNIN.lock() {
        *g = Some(result.clone());
    }
    if let Ok(mut g) = CURRENT_SIGNIN.lock() {
        *g = Some(result);
    }
    if let Ok(mut g) = CURRENT_JWT.lock() {
        *g = Some(session.jwt);
    }
}

pub fn clear_persisted_session() {
    if let Some(path) = session_file_path() {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(mut g) = CURRENT_JWT.lock() {
        *g = None;
    }
    if let Ok(mut g) = CURRENT_SIGNIN.lock() {
        *g = None;
    }
}

pub fn current_jwt() -> Option<String> {
    CURRENT_JWT.lock().ok().and_then(|g| g.clone())
}

pub fn record_username(username: String) {
    if let Ok(mut g) = CURRENT_SIGNIN.lock() {
        let mut current = g.clone().unwrap_or_default();
        current.username = Some(username);
        *g = Some(current);
    }
}

pub fn parse_kbve_username(jwt: &str) -> Option<String> {
    let payload_b64 = jwt.split('.').nth(1)?;
    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .ok()
        .or_else(|| {
            base64::engine::general_purpose::STANDARD_NO_PAD
                .decode(payload_b64)
                .ok()
        })?;
    let payload: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;
    if let Some(v) = payload.get("kbve_username").and_then(|v| v.as_str()) {
        return Some(v.to_string());
    }
    payload
        .get("user_metadata")
        .and_then(|m| m.get("kbve_username").or_else(|| m.get("user_name")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}
