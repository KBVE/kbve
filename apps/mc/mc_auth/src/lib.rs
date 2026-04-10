//! mc_auth — Minecraft ↔ Supabase authentication bridge.
//!
//! Architecture mirrors `behavior_statetree`: the JVM side is the thin
//! transport layer, the Rust side owns the Tokio runtime and all network
//! I/O. Only JSON-serialized snapshots cross the JNI boundary.
//!
//! JNI surface:
//!   1. `init()` — start the Tokio runtime + worker loop.
//!   2. `authenticate(uuid, username) -> JSON` — enqueue an auth check and
//!      return an immediate stub response (the real result flows back via
//!      `pollEvents`).
//!   3. `pollEvents() -> JSON` — drain completed `PlayerEvent`s.
//!   4. `shutdown()` — no-op placeholder; the runtime lives until JVM exit.
//!
//! All network work is stubbed for now — see `supabase.rs` for the planned
//! shape of the real integration.

pub mod agones;
pub mod runtime;
pub mod supabase;
pub mod types;

use std::sync::OnceLock;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::jstring;

use runtime::AuthRuntime;
use types::{AuthRequest, AuthResponse};

/// Global runtime instance — initialized once via JNI `init()`.
static RUNTIME: OnceLock<AuthRuntime> = OnceLock::new();

/// Initialize the Tokio auth runtime. Call once from Fabric mod startup.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_init(mut _env: JNIEnv, _class: JClass) {
    let _ = RUNTIME.set(AuthRuntime::start());
}

/// Submit an auth request for a player. Returns an immediate JSON
/// `AuthResponse` — the real result (link code, success, failure) is
/// delivered asynchronously through `pollEvents`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_authenticate<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    uuid: JString<'local>,
    username: JString<'local>,
) -> jstring {
    let player_uuid: String = match env.get_string(&uuid) {
        Ok(s) => s.into(),
        Err(_) => {
            return make_jstring(&mut env, &AuthResponse::error("invalid uuid string"));
        }
    };

    let username_s: String = match env.get_string(&username) {
        Ok(s) => s.into(),
        Err(_) => {
            return make_jstring(&mut env, &AuthResponse::error("invalid username string"));
        }
    };

    let response = match RUNTIME.get() {
        Some(rt) => rt.authenticate(AuthRequest {
            player_uuid,
            username: username_s,
        }),
        None => AuthResponse::error("runtime not initialized"),
    };

    make_jstring(&mut env, &response)
}

/// Poll all pending `PlayerEvent`s as a JSON array string. Called each
/// server tick to drain results back into Fabric.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_pollEvents<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let json = match RUNTIME.get() {
        Some(rt) => {
            let events = rt.poll_events();
            serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string())
        }
        None => "[]".to_string(),
    };

    env.new_string(&json)
        .expect("failed to create events JSON string")
        .into_raw()
}

/// Shutdown the Tokio runtime. Call from Fabric mod shutdown.
///
/// Sends a graceful Agones `Shutdown()` so the Fleet drains the gameserver
/// instead of letting it die from a health timeout.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_shutdown(
    mut _env: JNIEnv,
    _class: JClass,
) {
    if let Some(rt) = RUNTIME.get() {
        rt.shutdown_blocking();
    }
    // OnceLock doesn't support take(), so the runtime lives until JVM exit.
    // Channels close when the static drops; the Tokio worker exits cleanly.
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

fn make_jstring(env: &mut JNIEnv, response: &AuthResponse) -> jstring {
    let json = serde_json::to_string(response)
        .unwrap_or_else(|_| "{\"status\":\"error\",\"linked\":false}".to_string());
    env.new_string(&json)
        .expect("failed to create auth response JSON string")
        .into_raw()
}
