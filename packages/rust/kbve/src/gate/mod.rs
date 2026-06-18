//! Reusable auth reverse-proxy ("gate"). Sits in front of any upstream and
//! gates traffic on a Supabase JWT plus an authz policy (`jwt-only` or
//! `is_staff`). Designed to run as a sidecar so the upstream binds localhost
//! and only the gate is exposed.
//!
//! Feature-gated behind `gate`. The `kbve-gate` binary is the thin consumer;
//! axum-kbve can adopt the same module later.

mod auth;
mod proxy;

pub use auth::{AuthError, Authz, Claims, StaffGate, validate_token};
pub use proxy::{GateConfig, GateState};

use std::net::SocketAddr;

/// Build a [`GateConfig`] from environment variables.
///
/// - `GATE_UPSTREAM`        upstream base URL (default `http://127.0.0.1:5679`)
/// - `GATE_UPSTREAM_PREFIX` path prefix prepended upstream (default empty)
/// - `GATE_AUTHZ`           `is_staff` (default) | `jwt-only`
/// - `GATE_UPSTREAM_BASIC`  optional `Basic <b64>` injected upstream
/// - `GATE_LOGIN_REDIRECT`  optional 302 target for unauthed navigations
/// - `GATE_COOKIE_DOMAIN`   optional domain scope for the session cookie
/// - `GATE_STAFF_TTL_SECS`  is_staff cache TTL (default 30)
/// - `GATE_STAFF_SCHEMA`    PostgREST schema for the RPC (default `forum`)
/// - `SUPABASE_JWT_SECRET`        required
/// - `SUPABASE_URL`               required when authz=is_staff
/// - `SUPABASE_SERVICE_ROLE_KEY`  required when authz=is_staff
pub fn config_from_env() -> Result<GateConfig, String> {
    let upstream =
        std::env::var("GATE_UPSTREAM").unwrap_or_else(|_| "http://127.0.0.1:5679".to_string());
    let upstream_prefix = std::env::var("GATE_UPSTREAM_PREFIX")
        .ok()
        .map(|p| format!("/{}", p.trim_matches('/')))
        .filter(|p| p != "/")
        .unwrap_or_default();
    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
        .map_err(|_| "SUPABASE_JWT_SECRET is required".to_string())?;
    let authz = Authz::from_env(&std::env::var("GATE_AUTHZ").unwrap_or_else(|_| "is_staff".into()));

    let upstream_basic = std::env::var("GATE_UPSTREAM_BASIC")
        .ok()
        .filter(|s| !s.is_empty());
    let login_redirect = std::env::var("GATE_LOGIN_REDIRECT")
        .ok()
        .filter(|s| !s.is_empty());
    let cookie_domain = std::env::var("GATE_COOKIE_DOMAIN")
        .ok()
        .filter(|s| !s.is_empty());

    let staff = match authz {
        Authz::IsStaff => {
            let url = std::env::var("SUPABASE_URL")
                .map_err(|_| "SUPABASE_URL is required for authz=is_staff".to_string())?;
            let apikey = std::env::var("SUPABASE_ANON_KEY")
                .ok()
                .filter(|s| !s.is_empty());
            let schema = std::env::var("GATE_STAFF_SCHEMA").unwrap_or_else(|_| "forum".into());
            let ttl = std::env::var("GATE_STAFF_TTL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30);
            Some(StaffGate::new(
                &url,
                jwt_secret.clone(),
                apikey,
                schema,
                ttl,
            ))
        }
        Authz::JwtOnly => None,
    };

    Ok(GateConfig {
        upstream,
        upstream_prefix,
        jwt_secret,
        authz,
        upstream_basic,
        login_redirect,
        cookie_domain,
        staff,
    })
}

/// Bind `GATE_LISTEN` (default `0.0.0.0:5678`) and serve the gate forever.
pub async fn serve(cfg: GateConfig) -> Result<(), String> {
    let listen: SocketAddr = std::env::var("GATE_LISTEN")
        .unwrap_or_else(|_| "0.0.0.0:5678".to_string())
        .parse()
        .map_err(|e| format!("invalid GATE_LISTEN: {e}"))?;

    let router = GateState::new(cfg).into_router();
    let listener = tokio::net::TcpListener::bind(listen)
        .await
        .map_err(|e| format!("bind {listen}: {e}"))?;

    tracing::info!(%listen, "kbve gate listening");
    axum::serve(listener, router)
        .await
        .map_err(|e| format!("serve: {e}"))
}
