//! Message types for the Minecraft ↔ Supabase auth pipeline.
//!
//! All types are immutable snapshots. The JVM side calls `authenticate()` with
//! a player UUID + username, the Rust worker resolves the link state against
//! Supabase (stub for now), and events are drained via `pollEvents()` each
//! server tick.

use serde::{Deserialize, Serialize};

/// Inbound authentication request — produced by the Fabric join handler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    /// Canonical Minecraft UUID string (with dashes).
    pub player_uuid: String,
    /// Current in-game username — may change across sessions.
    pub username: String,
}

/// Immediate response returned synchronously from `authenticate()`.
///
/// The JVM side uses this to decide whether to greet the player or prompt
/// them to link their account. Rich async results flow through `PlayerEvent`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    /// High-level status: `pending`, `linked`, `unlinked`, `error`.
    pub status: String,
    /// True when the player is already linked to a Supabase user.
    pub linked: bool,
    /// Supabase user id when `linked == true`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supabase_user_id: Option<String>,
    /// Populated only when `status == "error"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AuthResponse {
    /// Canonical "we haven't checked yet" stub returned by the scaffold.
    pub fn pending_stub() -> Self {
        Self {
            status: "pending".to_string(),
            linked: false,
            supabase_user_id: None,
            error: None,
        }
    }

    /// Explicit error response carrying a short human-readable reason.
    pub fn error(reason: impl Into<String>) -> Self {
        Self {
            status: "error".to_string(),
            linked: false,
            supabase_user_id: None,
            error: Some(reason.into()),
        }
    }
}

/// Events emitted by the Rust worker and drained by the JVM side each tick.
///
/// Serialized as an externally-tagged JSON enum so the Java side can pattern
/// match on a top-level key (see `NpcTickHandler` for the equivalent pattern
/// in `behavior_statetree`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlayerEvent {
    /// The player is not yet linked — prompt them to visit the link URL.
    LinkRequested {
        player_uuid: String,
        username: String,
        link_code: String,
    },
    /// The player was successfully authenticated against Supabase.
    AuthSuccess {
        player_uuid: String,
        supabase_user_id: String,
    },
    /// Authentication failed (network error, rejected token, rate limit…).
    AuthFailure { player_uuid: String, reason: String },
    /// Informational log event forwarded to the Fabric logger.
    Log { level: String, message: String },
}
