use base64::Engine;
use std::sync::Mutex;

/// Cross-platform sign-in observation. Native (`auth.rs` localhost listener +
/// deep-link handler) and WASM (`set_signed_in` wasm-bindgen export) both
/// funnel completed OAuth callbacks through here. A Bevy system in
/// `game::phase::drain_pending_signin` consumes it to update `PreFlight`.
static PENDING_SIGNIN: Mutex<Option<SignInResult>> = Mutex::new(None);

#[derive(Clone)]
pub struct SignInResult {
    pub username: Option<String>,
}

pub fn take_pending_signin() -> Option<SignInResult> {
    PENDING_SIGNIN.lock().ok().and_then(|mut g| g.take())
}

pub fn record_signin(jwt: &str) {
    let username = parse_kbve_username(jwt);
    if let Ok(mut g) = PENDING_SIGNIN.lock() {
        *g = Some(SignInResult { username });
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
