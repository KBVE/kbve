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

pub mod planner;
pub mod runtime;
pub mod tree;
pub mod types;

use std::sync::OnceLock;

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};

use runtime::AiRuntime;
use types::{NpcObservation, NpcThinkJob};

/// Global runtime instance — initialized once via JNI `init()`.
static RUNTIME: OnceLock<AiRuntime> = OnceLock::new();

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
