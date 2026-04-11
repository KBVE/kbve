//! Message types for the Minecraft ↔ Supabase auth pipeline.
//!
//! All types are immutable snapshots. The JVM side calls `authenticate()` with
//! a player UUID + username, the Rust worker resolves the link state against
//! Supabase, and events are drained via `pollEvents()` each server tick.

use serde::{Deserialize, Serialize};

/// Inbound requests the Rust worker processes from the JVM side.
///
/// `Authenticate` runs on player join and looks up the link status; the
/// result flows back as a `PlayerEvent::AlreadyLinked` or `Unlinked`.
/// `VerifyLink` runs when the player types `/link <code>` in-game and
/// returns a `LinkVerified` or `LinkRejected` event on completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthJob {
    Authenticate {
        player_uuid: String,
        username: String,
    },
    VerifyLink {
        player_uuid: String,
        code: i32,
    },
}

/// Immediate response returned synchronously from JNI entry points.
///
/// The JVM side uses this only to know the request was accepted. Rich
/// async results flow through `PlayerEvent` drained on the server tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    /// High-level status: `queued`, `error`.
    pub status: String,
    /// Populated only when `status == "error"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AuthResponse {
    /// The request was accepted by the worker. Result lands via pollEvents.
    pub fn queued() -> Self {
        Self {
            status: "queued".to_string(),
            error: None,
        }
    }

    /// The request was rejected synchronously (e.g. back-pressure, bad input).
    pub fn error(reason: impl Into<String>) -> Self {
        Self {
            status: "error".to_string(),
            error: Some(reason.into()),
        }
    }
}

/// Link status row returned by `mc.service_get_user_by_mc_uuid`.
///
/// The RPC returns a set; we take the first row (there's at most one).
#[derive(Debug, Clone, Deserialize)]
pub struct LinkStatusRow {
    pub user_id: String,
    #[allow(dead_code)]
    pub mc_uuid: String,
    #[allow(dead_code)]
    pub status: i32,
    pub is_verified: bool,
}

/// Events emitted by the Rust worker and drained by the JVM side each tick.
///
/// Serialized as an externally-tagged JSON enum so the Java side can pattern
/// match on a top-level key (see `NpcTickHandler` for the equivalent pattern
/// in `behavior_statetree`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlayerEvent {
    /// Player is already linked — greet them and unlock gated features.
    AlreadyLinked {
        player_uuid: String,
        supabase_user_id: String,
    },
    /// Player has no link row yet OR the row is not verified. Tell them
    /// to visit kbve.com to request a code, then run `/link <code>`.
    Unlinked {
        player_uuid: String,
        username: String,
    },
    /// `/link <code>` succeeded — the player is now linked to this user.
    LinkVerified {
        player_uuid: String,
        supabase_user_id: String,
    },
    /// `/link <code>` failed — wrong/expired code, or the link is locked.
    /// `reason` is a short human-readable hint for the player.
    LinkRejected { player_uuid: String, reason: String },
    /// Supabase lookup / verify failed for a transport reason (network,
    /// 5xx, bad JSON). Treat as unlinked in graceful mode — never kick.
    AuthFailure { player_uuid: String, reason: String },
}
