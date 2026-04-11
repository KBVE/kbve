//! mc_auth — Minecraft ↔ Supabase authentication bridge.
//!
//! Architecture mirrors `behavior_statetree`: the JVM side is the thin
//! transport layer, the Rust side owns the Tokio runtime and all network
//! I/O. Only JSON-serialized snapshots cross the JNI boundary.
//!
//! JNI surface:
//!   1. `init()` — start the Tokio runtime + worker loop.
//!   2. `authenticate(uuid, username) -> JSON` — enqueue a lookup. Result
//!      lands asynchronously as an `AlreadyLinked` / `Unlinked` PlayerEvent.
//!   3. `verifyLink(uuid, code) -> JSON` — enqueue a verify_link call.
//!      Result lands as a `LinkVerified` / `LinkRejected` PlayerEvent.
//!   4. `pollEvents() -> JSON` — drain completed `PlayerEvent`s.
//!   5. `shutdown()` — graceful Agones shutdown.
//!
//! All HTTP work is non-blocking for the JVM thread — the JNI entry points
//! only enqueue jobs and return immediately. Any Supabase failure is
//! downgraded to a graceful `Unlinked` event so players are never kicked.

pub mod agones;
pub mod runtime;
pub mod supabase;
pub mod types;

use std::sync::OnceLock;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jint, jstring};

use runtime::AuthRuntime;
use types::{AuthJob, AuthResponse};

/// Global runtime instance — initialized once via JNI `init()`.
static RUNTIME: OnceLock<AuthRuntime> = OnceLock::new();

/// Initialize the Tokio auth runtime. Call once from Fabric mod startup.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_init(mut _env: JNIEnv, _class: JClass) {
    let _ = RUNTIME.set(AuthRuntime::start());
}

/// Submit an auth lookup for a player. Returns an immediate ack JSON —
/// the real result arrives asynchronously via `pollEvents`.
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
        Some(rt) => rt.submit(AuthJob::Authenticate {
            player_uuid,
            username: username_s,
        }),
        None => AuthResponse::error("runtime not initialized"),
    };

    make_jstring(&mut env, &response)
}

/// Submit a link-code verification for a player. Called by `/link <code>`.
/// Returns an immediate ack; the `LinkVerified` / `LinkRejected` result
/// lands via `pollEvents`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_verifyLink<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    uuid: JString<'local>,
    code: jint,
) -> jstring {
    let player_uuid: String = match env.get_string(&uuid) {
        Ok(s) => s.into(),
        Err(_) => {
            return make_jstring(&mut env, &AuthResponse::error("invalid uuid string"));
        }
    };

    let response = match RUNTIME.get() {
        Some(rt) => rt.submit(AuthJob::VerifyLink {
            player_uuid,
            code: code as i32,
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
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

fn make_jstring(env: &mut JNIEnv, response: &AuthResponse) -> jstring {
    let json =
        serde_json::to_string(response).unwrap_or_else(|_| "{\"status\":\"error\"}".to_string());
    env.new_string(&json)
        .expect("failed to create auth response JSON string")
        .into_raw()
}
