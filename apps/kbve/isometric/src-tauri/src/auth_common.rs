use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// One-shot drop-off for sign-ins observed by the OAuth listener / deep-link
/// handler. Drained by `game::phase::drain_pending_signin` once per frame
/// into `PreFlight`.
static PENDING_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

/// Persistent snapshot of the current sign-in. React components on either
/// platform poll this via `get_signin_state_json` (WASM) or
/// `get_signin_state` (Tauri) to decide whether to prompt for a username.
static CURRENT_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

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
