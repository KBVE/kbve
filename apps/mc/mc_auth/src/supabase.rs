//! Supabase client — STUB ONLY.
//!
//! ============================================================================
//! TODO — future scope
//! ============================================================================
//! This module will eventually talk to Supabase over REST and drive the full
//! Minecraft ↔ Supabase auth flow. The planned surface is:
//!
//!   - `lookup_player_link(uuid)` — GET `/rest/v1/mc_auth?player_uuid=eq.<uuid>`
//!     via the service-role key, bypassing RLS. Returns `Option<LinkRecord>`.
//!
//!   - `create_link_code(uuid)` — POST `/rest/v1/mc_auth_link_codes` with a
//!     short-lived (e.g. 10 min) one-time code the player types in the web
//!     UI at https://kbve.com/auth to bind their Minecraft UUID to their
//!     Supabase user. The code is hashed at rest.
//!
//!   - `confirm_link(code, supabase_user_id)` — called indirectly via a
//!     Supabase RPC / edge function once the browser-side flow completes.
//!     Here in Rust we only _poll_ the `mc_auth` table; the JVM side gets
//!     the result via a `PlayerEvent::AuthSuccess`.
//!
//! RLS strategy:
//!   - `mc_auth` table is owned by the `mc` schema.
//!   - Only the service-role key (held by this binary) can write.
//!   - Players read their own row via the anon key + JWT on the web side.
//!
//! For now every method logs the call and returns a hardcoded stub so the
//! scaffolding compiles without a live Supabase instance.
//! ============================================================================

use reqwest::Client;
use tracing::debug;

use crate::types::AuthResponse;

/// Thin wrapper around a reqwest client + Supabase credentials.
///
/// Currently stores the URL + anon key but issues no real HTTP calls. This
/// is intentionally a placeholder to freeze the public API while the real
/// integration lands in a follow-up.
pub struct SupabaseClient {
    #[allow(dead_code)]
    url: String,
    #[allow(dead_code)]
    anon_key: String,
    #[allow(dead_code)]
    http: Client,
}

impl SupabaseClient {
    /// Build a new client. The `anon_key` can later be swapped for a
    /// service-role key depending on the call site's needs.
    pub fn new(url: impl Into<String>, anon_key: impl Into<String>) -> Self {
        let url = url.into();
        let anon_key = anon_key.into();
        debug!(%url, "SupabaseClient::new — stub");
        Self {
            url,
            anon_key,
            http: Client::new(),
        }
    }

    /// Look up whether a Minecraft UUID is already linked to a Supabase user.
    ///
    /// STUB — always returns a `pending` response.
    pub async fn lookup_player_link(&self, player_uuid: &str) -> AuthResponse {
        debug!(%player_uuid, "SupabaseClient::lookup_player_link — stub");
        AuthResponse::pending_stub()
    }

    /// Create a new one-time link code for the given Minecraft UUID.
    ///
    /// STUB — returns a deterministic placeholder code so the JVM side can
    /// exercise the serialization path before the real DB write lands.
    pub async fn create_link_code(&self, player_uuid: &str) -> String {
        debug!(%player_uuid, "SupabaseClient::create_link_code — stub");
        format!("STUB-{}", &player_uuid[..player_uuid.len().min(8)])
    }
}
