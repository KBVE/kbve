//! behavior_statetree — Hybrid Tokio/JNI NPC AI planner for Fabric Minecraft.
//!
//! Architecture: Tokio = AI brain, Fabric server tick = body + law.
//!
//! The JVM side (Fabric mod) calls into this library via JNI:
//!   1. `init()` — starts the Tokio runtime and channels
//!   2. `submitJob()` — sends NpcObservation for async planning (each server tick)
//!   3. `pollIntents()` — drains completed NpcIntents (each server tick)
//!   4. `shutdown()` — stops the runtime on server shutdown
//!
//! All message passing uses bounded channels with immutable snapshots.
//! Per-NPC epochs prevent stale decisions from being applied.

pub mod ecs;
pub mod runtime;
pub mod ship_db;
pub mod tree;
pub mod types;

use std::sync::OnceLock;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};

use bevy_pathfinder::grid::MapRegionSnapshot;
use runtime::AiRuntime;
use types::{NpcObservation, NpcThinkJob, PlayerSnapshot};

/// Global runtime instance — initialized once via JNI `init()`.
static RUNTIME: OnceLock<AiRuntime> = OnceLock::new();

/// Global ship database — initialized via JNI `initShipDb()`.
static SHIP_DB: OnceLock<ship_db::ShipDb> = OnceLock::new();

/// Initialize the Tokio AI runtime. Call once from Fabric mod startup.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_init(
    mut _env: JNIEnv,
    _class: JClass,
) {
    let _ = RUNTIME.set(AiRuntime::start());
}

/// Submit an NPC observation as a JSON string for async planning.
/// Returns true if the job was accepted, false if back-pressured.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_submitJob(
    mut env: JNIEnv,
    _class: JClass,
    observation_json: JString,
) -> jboolean {
    let Some(rt) = RUNTIME.get() else {
        return 0;
    };

    let json_str: String = match env.get_string(&observation_json) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    let Ok(observation) = serde_json::from_str::<NpcObservation>(&json_str) else {
        return 0;
    };

    if rt.submit_job(NpcThinkJob { observation }) {
        1
    } else {
        0
    }
}

/// Submit a snapshot of all online players. Java pushes one of these per
/// observation tick. The Rust ECS reconciles it against `OnlinePlayer`
/// entities so the population manager can run spawn/despawn purely on
/// in-Rust state — Java doesn't decide which mobs exist anymore.
///
/// Returns true if accepted, false if back-pressured.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_submitPlayerSnapshot(
    mut env: JNIEnv,
    _class: JClass,
    snapshot_json: JString,
) -> jboolean {
    let Some(rt) = RUNTIME.get() else {
        return 0;
    };

    let json_str: String = match env.get_string(&snapshot_json) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    let Ok(snapshot) = serde_json::from_str::<PlayerSnapshot>(&json_str) else {
        return 0;
    };

    if rt.submit_player_snapshot(snapshot) {
        1
    } else {
        0
    }
}

/// Submit a map region snapshot as a JSON string. Java scans the surface
/// around players every few seconds and packs walkability data into a
/// `MapRegionSnapshot`. Rust builds a `BlockGrid` and computes flow
/// fields + chokepoints from it.
///
/// Returns true if the snapshot was accepted, false if back-pressured.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_submitMapData(
    mut env: JNIEnv,
    _class: JClass,
    snapshot_json: JString,
) -> jboolean {
    let Some(rt) = RUNTIME.get() else {
        return 0;
    };

    let json_str: String = match env.get_string(&snapshot_json) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    let Ok(snapshot) = serde_json::from_str::<MapRegionSnapshot>(&json_str) else {
        return 0;
    };

    if rt.submit_map_data(snapshot) { 1 } else { 0 }
}

/// Poll all completed NPC intents. Returns a JSON array string.
/// Called each server tick to drain results.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_pollIntents(
    env: JNIEnv,
    _class: JClass,
) -> jstring {
    let json = match RUNTIME.get() {
        Some(rt) => {
            let intents = rt.poll_intents();
            serde_json::to_string(&intents).unwrap_or_else(|_| "[]".to_string())
        }
        None => "[]".to_string(),
    };

    env.new_string(&json)
        .expect("failed to create intent JSON string")
        .into_raw()
}

// ---------------------------------------------------------------------------
// Ship DB — SQLite persistence for ship state
// ---------------------------------------------------------------------------

/// Initialize the ship database. Call once from Fabric mod startup.
/// `db_path` is the path to the SQLite file (e.g., "/data/ships.db").
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_initShipDb(
    mut env: JNIEnv,
    _class: JClass,
    db_path: JString,
) -> jboolean {
    let path: String = match env.get_string(&db_path) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    match ship_db::ShipDb::open(&path) {
        Ok(db) => {
            let _ = SHIP_DB.set(db);
            1
        }
        Err(e) => {
            tracing::error!("[ShipDB] Failed to open: {}", e);
            0
        }
    }
}

/// Save or update a ship record. JSON-serialized ShipRecord.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_saveShip(
    mut env: JNIEnv,
    _class: JClass,
    ship_json: JString,
) -> jboolean {
    let Some(db) = SHIP_DB.get() else { return 0 };

    let json_str: String = match env.get_string(&ship_json) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    let Ok(record) = serde_json::from_str::<ship_db::ShipRecord>(&json_str) else {
        return 0;
    };

    match db.upsert(&record) {
        Ok(_) => 1,
        Err(e) => {
            tracing::error!("[ShipDB] Save failed: {}", e);
            0
        }
    }
}

/// Delete a ship record by ID.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_deleteShip(
    mut env: JNIEnv,
    _class: JClass,
    ship_id: JString,
) -> jboolean {
    let Some(db) = SHIP_DB.get() else { return 0 };

    let id: String = match env.get_string(&ship_id) {
        Ok(s) => s.into(),
        Err(_) => return 0,
    };

    match db.delete(&id) {
        Ok(_) => 1,
        Err(e) => {
            tracing::error!("[ShipDB] Delete failed: {}", e);
            0
        }
    }
}

/// Load all ship records. Returns a JSON array of ShipRecord.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_loadAllShips(
    env: JNIEnv,
    _class: JClass,
) -> jstring {
    let json = match SHIP_DB.get() {
        Some(db) => match db.load_all() {
            Ok(records) => serde_json::to_string(&records).unwrap_or_else(|_| "[]".to_string()),
            Err(e) => {
                tracing::error!("[ShipDB] Load failed: {}", e);
                "[]".to_string()
            }
        },
        None => "[]".to_string(),
    };

    env.new_string(&json)
        .expect("failed to create ship JSON string")
        .into_raw()
}

/// Delete all ships from the database (dev tool).
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_deleteAllShips(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let Some(db) = SHIP_DB.get() else { return 0 };
    match db.delete_all() {
        Ok(count) => {
            tracing::info!("[ShipDB] Deleted {} ship records", count);
            1
        }
        Err(e) => {
            tracing::error!("[ShipDB] Delete all failed: {}", e);
            0
        }
    }
}

/// Shutdown the Tokio runtime. Call from Fabric mod shutdown.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_NativeRuntime_shutdown(
    mut _env: JNIEnv,
    _class: JClass,
) {
    // Runtime drops when the process exits.
    // OnceLock doesn't support take(), so we let it live until JVM shutdown.
    // The channels will be dropped, causing the consumer loop to exit.
}

// ── ChatBridge JNI entry points ───────────────────────────────────────
//
// Thin JNI shim over `bevy_chat::ffi::kbve_chat_*`. The Java side holds
// the opaque handle as a `long` (native pointer) and passes it back on
// every call. Handles are per-connection — typically one per MC server
// at mod init.

use bevy_chat::ffi::{
    ChatHandle, kbve_chat_connect, kbve_chat_disconnect, kbve_chat_is_connected, kbve_chat_poll,
    kbve_chat_send,
};
use jni::sys::jlong;
use std::ffi::CString;

/// Helper: convert a Java string to a C string. Returns None on invalid UTF-8 or
/// null reference, which the caller translates into a failure return code.
fn jstring_to_cstring(env: &mut JNIEnv, s: &JString) -> Option<CString> {
    if s.is_null() {
        return None;
    }
    let rust_str: String = env.get_string(s).ok()?.into();
    CString::new(rust_str).ok()
}

/// Connect to an IRC server. Returns an opaque handle encoded as a `jlong`,
/// or `0` on failure. The handle must be freed via `disconnect`.
///
/// `password` and `channels` can be null / empty strings for defaults.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_ChatBridge_connect(
    mut env: JNIEnv,
    _class: JClass,
    host: JString,
    port: jni::sys::jint,
    tls: jni::sys::jboolean,
    nick: JString,
    password: JString,
    channels: JString,
) -> jlong {
    let host_c = match jstring_to_cstring(&mut env, &host) {
        Some(c) => c,
        None => return 0,
    };
    let nick_c = match jstring_to_cstring(&mut env, &nick) {
        Some(c) => c,
        None => return 0,
    };
    let channels_c = match jstring_to_cstring(&mut env, &channels) {
        Some(c) => c,
        None => return 0,
    };
    // Password is optional — empty or null both mean "no PASS".
    let password_c = jstring_to_cstring(&mut env, &password);
    let password_ptr = password_c
        .as_ref()
        .map(|c| c.as_ptr())
        .unwrap_or(std::ptr::null());

    let mut handle: *mut ChatHandle = std::ptr::null_mut();
    let rc = unsafe {
        kbve_chat_connect(
            host_c.as_ptr(),
            port as u16,
            if tls == 0 { 0 } else { 1 },
            nick_c.as_ptr(),
            password_ptr,
            channels_c.as_ptr(),
            &mut handle,
        )
    };
    if rc == 0 { handle as jlong } else { 0 }
}

/// Send a structured chat message. Returns `true` on success.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_ChatBridge_send(
    mut env: JNIEnv,
    _class: JClass,
    handle: jlong,
    kind: JString,
    sender: JString,
    platform: JString,
    channel: JString,
    content: JString,
    payload_json: JString,
) -> jboolean {
    if handle == 0 {
        return 0;
    }
    let kind_c = match jstring_to_cstring(&mut env, &kind) {
        Some(c) => c,
        None => return 0,
    };
    let sender_c = match jstring_to_cstring(&mut env, &sender) {
        Some(c) => c,
        None => return 0,
    };
    let platform_c = match jstring_to_cstring(&mut env, &platform) {
        Some(c) => c,
        None => return 0,
    };
    let channel_c = match jstring_to_cstring(&mut env, &channel) {
        Some(c) => c,
        None => return 0,
    };
    let content_c = match jstring_to_cstring(&mut env, &content) {
        Some(c) => c,
        None => return 0,
    };
    // Payload is optional — null Java string → null C pointer.
    let payload_c = jstring_to_cstring(&mut env, &payload_json);
    let payload_ptr = payload_c
        .as_ref()
        .map(|c| c.as_ptr())
        .unwrap_or(std::ptr::null());

    let rc = unsafe {
        kbve_chat_send(
            handle as *mut ChatHandle,
            kind_c.as_ptr(),
            sender_c.as_ptr(),
            platform_c.as_ptr(),
            channel_c.as_ptr(),
            content_c.as_ptr(),
            payload_ptr,
        )
    };
    if rc == 0 { 1 } else { 0 }
}

/// Drain pending incoming messages as a JSON array string. Returns null on
/// error; returns `"[]"` if the queue is empty. Buffer sizes up adaptively.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_ChatBridge_poll(
    env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jstring {
    if handle == 0 {
        return std::ptr::null_mut();
    }
    // Grow the buffer on each ERR_BUF_TOO_SMALL until it fits. Starting at
    // 4KiB covers typical batches; ceiling at 1MiB guards against runaway
    // payloads on misbehaving senders.
    let mut cap: usize = 4096;
    let ceiling: usize = 1 << 20;
    loop {
        let mut buf = vec![0i8; cap];
        let rc = unsafe {
            kbve_chat_poll(
                handle as *mut ChatHandle,
                buf.as_mut_ptr() as *mut std::ffi::c_char,
                cap,
            )
        };
        if rc >= 0 {
            let len = rc as usize;
            let json = match std::str::from_utf8(unsafe {
                std::slice::from_raw_parts(buf.as_ptr() as *const u8, len)
            }) {
                Ok(s) => s,
                Err(_) => return std::ptr::null_mut(),
            };
            return match env.new_string(json) {
                Ok(js) => js.into_raw(),
                Err(_) => std::ptr::null_mut(),
            };
        }
        if rc == -2 && cap < ceiling {
            cap = (cap * 2).min(ceiling);
            continue;
        }
        // Any other error, or buffer grew past ceiling — give up.
        return std::ptr::null_mut();
    }
}

/// Returns `true` if the handle is currently connected to IRC.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_ChatBridge_isConnected(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jboolean {
    if handle == 0 {
        return 0;
    }
    let rc = unsafe { kbve_chat_is_connected(handle as *mut ChatHandle) };
    if rc == 1 { 1 } else { 0 }
}

/// Close the connection and free the handle. Safe to call on a `0` handle.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_kbve_statetree_ChatBridge_disconnect(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) {
    if handle == 0 {
        return;
    }
    unsafe { kbve_chat_disconnect(handle as *mut ChatHandle) };
}
