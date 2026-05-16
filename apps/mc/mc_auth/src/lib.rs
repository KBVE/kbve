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
pub mod chat_jwt;
pub mod runtime;
pub mod supabase;
pub mod types;
pub mod wallet;

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

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_loadPlayerSnapshot<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    uuid: JString<'local>,
    server_id: JString<'local>,
) -> jstring {
    let player_uuid: String = match env.get_string(&uuid) {
        Ok(s) => s.into(),
        Err(_) => return make_jstring(&mut env, &AuthResponse::error("invalid uuid string")),
    };
    let server_id_s: String = match env.get_string(&server_id) {
        Ok(s) => s.into(),
        Err(_) => return make_jstring(&mut env, &AuthResponse::error("invalid server_id string")),
    };
    let response = match RUNTIME.get() {
        Some(rt) => rt.submit(AuthJob::LoadPlayerSnapshot {
            player_uuid,
            server_id: server_id_s,
        }),
        None => AuthResponse::error("runtime not initialized"),
    };
    make_jstring(&mut env, &response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_savePlayerSnapshot<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    uuid: JString<'local>,
    snapshot_json: JString<'local>,
) -> jstring {
    let player_uuid: String = match env.get_string(&uuid) {
        Ok(s) => s.into(),
        Err(_) => return make_jstring(&mut env, &AuthResponse::error("invalid uuid string")),
    };
    let snapshot_s: String = match env.get_string(&snapshot_json) {
        Ok(s) => s.into(),
        Err(_) => return make_jstring(&mut env, &AuthResponse::error("invalid snapshot string")),
    };
    let response = match RUNTIME.get() {
        Some(rt) => rt.submit(AuthJob::SavePlayerSnapshot {
            player_uuid,
            snapshot_json: snapshot_s,
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

/// Mint a short-lived HS256 JWT for the `/minechat` gateway.
///
/// Returns a JSON object — either `{"token":"<jwt>","expires_in":300}`
/// on success or `{"error":"<reason>"}` on any failure. Java consumes
/// this as-is (no async queue involved; minting is local and fast).
///
/// Why JSON and not just the raw token: the Java side surfaces errors
/// to the player directly, so we need a stable shape that distinguishes
/// "signing key not configured" (retry later) from "mint succeeded"
/// without relying on out-of-band error codes.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_mcauth_NativeRuntime_mintChatToken<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    uuid: JString<'local>,
    username: JString<'local>,
) -> jstring {
    let mc_uuid: String = match env.get_string(&uuid) {
        Ok(s) => s.into(),
        Err(_) => {
            return make_chat_jstring(&mut env, ChatMintResult::err("invalid uuid string"));
        }
    };
    let mc_username: String = match env.get_string(&username) {
        Ok(s) => s.into(),
        Err(_) => {
            return make_chat_jstring(&mut env, ChatMintResult::err("invalid username string"));
        }
    };

    let response = match chat_jwt::mint(&mc_uuid, &mc_username) {
        Ok(token) => ChatMintResult::ok(token),
        Err(e) => ChatMintResult::err(e.to_string()),
    };
    make_chat_jstring(&mut env, response)
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

/// Minimal result shape for `mintChatToken`. Kept out of `types.rs`
/// because it doesn't participate in the AuthJob / PlayerEvent pipeline —
/// minting is strictly synchronous and local to the JNI call.
#[derive(serde::Serialize)]
struct ChatMintResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    /// Seconds until the minted token expires. Present on success only.
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_in: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl ChatMintResult {
    fn ok(token: String) -> Self {
        Self {
            token: Some(token),
            expires_in: Some(300),
            error: None,
        }
    }
    fn err(msg: impl Into<String>) -> Self {
        Self {
            token: None,
            expires_in: None,
            error: Some(msg.into()),
        }
    }
}

fn make_chat_jstring(env: &mut JNIEnv, response: ChatMintResult) -> jstring {
    let json = serde_json::to_string(&response)
        .unwrap_or_else(|_| "{\"error\":\"serialize\"}".to_string());
    env.new_string(&json)
        .expect("failed to create chat mint response JSON string")
        .into_raw()
}
