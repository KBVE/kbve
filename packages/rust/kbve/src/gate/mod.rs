//! Reusable auth reverse-proxy ("gate"). Sits in front of any upstream and
//! gates traffic on a Supabase JWT plus an authz policy (`jwt-only` or
//! `is_staff`). Designed to run as a sidecar so the upstream binds localhost
//! and only the gate is exposed.
//!
//! Feature-gated behind `gate`. The `kbve-gate` binary is the thin consumer;
//! axum-kbve can adopt the same module later.

mod auth;
#[cfg(feature = "gate")]
mod proxy;
#[cfg(feature = "gate")]
mod windmill;

pub use auth::{AuthError, Authz, Claims, StaffGate, extract_token, validate_token};
#[cfg(feature = "gate")]
pub use proxy::{GateConfig, GateState};
#[cfg(feature = "gate")]
pub use windmill::WindmillBridge;

#[cfg(feature = "gate")]
use std::net::SocketAddr;

/// Build a [`GateConfig`] from environment variables.
///
/// - `GATE_UPSTREAM`        upstream base URL (default `http://127.0.0.1:5679`)
/// - `GATE_UPSTREAM_PREFIX` path prefix prepended upstream (default empty)
/// - `GATE_UPSTREAM_CA_CERT_PATH` PEM CA trusted for upstream TLS (private CA)
/// - `GATE_UPSTREAM_BEARER` token injected as `Authorization: Bearer` upstream
/// - `GATE_FORWARD_USER_HEADER` header carrying the authed user upstream
///   (e.g. `X-WEBAUTH-USER` for a Grafana auth-proxy)
/// - `GATE_FORWARD_USER_VALUE` constant override for that header (shared
///   upstream identity for everyone who passes the gate)
/// - `GATE_AUTHZ`           `is_staff` (default) | `jwt-only`
/// - `GATE_UPSTREAM_BASIC`  optional `Basic <b64>` injected upstream
/// - `GATE_LOGIN_REDIRECT`  optional 302 target for unauthed navigations
/// - `GATE_COOKIE_DOMAIN`   optional domain scope for the session cookie
/// - `GATE_STAFF_TTL_SECS`  is_staff cache TTL (default 30)
/// - `GATE_STAFF_SCHEMA`    PostgREST schema for the RPC (default `forum`)
/// - `GATE_STAFF_RPC`       PostgREST RPC name (default `is_staff`); e.g.
///   `is_superadmin` against the `authz` schema gates on the SUPERADMIN bit
/// - `SUPABASE_JWT_SECRET`  required
/// - `SUPABASE_URL`         required when authz=is_staff
/// - `SUPABASE_ANON_KEY`    optional PostgREST apikey when authz=is_staff
///   (falls back to the minted service_role bearer)
/// - `SUPABASE_JWT_ISSUER`  optional; pins the accepted token issuer when set
/// - `WINDMILL_SUPERADMIN_TOKEN` when set, enables the Windmill session
///   bridge: the gate provisions a Windmill user for the authed email and
///   injects a per-user impersonation token upstream (Windmill CE has no
///   custom SSO)
/// - `GATE_WINDMILL_WORKSPACE` workspace new users are auto-added to
/// - `GATE_WINDMILL_TOKEN_TTL_SECS` impersonation token TTL (default 43200)
#[cfg(feature = "gate")]
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
    let upstream_ca_cert_path = std::env::var("GATE_UPSTREAM_CA_CERT_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let upstream_bearer = std::env::var("GATE_UPSTREAM_BEARER")
        .ok()
        .filter(|s| !s.is_empty());
    let forward_user_header = std::env::var("GATE_FORWARD_USER_HEADER")
        .ok()
        .filter(|s| !s.is_empty());
    let forward_user_value = std::env::var("GATE_FORWARD_USER_VALUE")
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
            let rpc = std::env::var("GATE_STAFF_RPC").unwrap_or_else(|_| "is_staff".into());
            let ttl = std::env::var("GATE_STAFF_TTL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30);
            Some(StaffGate::new(
                &url,
                jwt_secret.clone(),
                apikey,
                schema,
                &rpc,
                ttl,
            ))
        }
        Authz::JwtOnly => None,
    };

    // Accept-both JWT verifier (HS256 + ES256/JWKS) for the asymmetric-signing
    // transition. JWKS URI is GATE_JWKS_URI, else derived from SUPABASE_URL. When
    // neither is set the gate stays HS256-only (verifier None).
    let verifier = std::env::var("GATE_JWKS_URI")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::var("SUPABASE_URL").ok().and_then(|u| {
                let u = u.trim().trim_end_matches('/');
                (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
            })
        })
        .map(|jwks_uri| {
            let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                .ok()
                .filter(|s| !s.trim().is_empty());
            jedi::jwks::JwtVerifier::new(jwks_uri, Some(jwt_secret.as_bytes()), issuer, None)
        });

    let windmill = std::env::var("WINDMILL_SUPERADMIN_TOKEN")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|admin_token| {
            let workspace = std::env::var("GATE_WINDMILL_WORKSPACE")
                .ok()
                .filter(|s| !s.is_empty());
            let ttl = std::env::var("GATE_WINDMILL_TOKEN_TTL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(43200);
            WindmillBridge::new(&upstream, admin_token, workspace, ttl)
        });

    Ok(GateConfig {
        upstream,
        upstream_prefix,
        jwt_secret,
        authz,
        upstream_basic,
        login_redirect,
        cookie_domain,
        staff,
        upstream_ca_cert_path,
        upstream_bearer,
        forward_user_header,
        forward_user_value,
        verifier,
        windmill,
    })
}

/// Bind `GATE_LISTEN` (default `0.0.0.0:5678`) and serve the gate forever.
///
/// A Prometheus `/metrics` endpoint is served on `GATE_METRICS_PORT`
/// (default `9090`) with the gate's low-cardinality counters.
#[cfg(feature = "gate")]
pub async fn serve(cfg: GateConfig) -> Result<(), String> {
    let listen: SocketAddr = std::env::var("GATE_LISTEN")
        .unwrap_or_else(|_| "0.0.0.0:5678".to_string())
        .parse()
        .map_err(|e| format!("invalid GATE_LISTEN: {e}"))?;

    // Prime the JWKS cache + start background refresh (non-fatal — HS256 still
    // verifies if GoTrue's JWKS isn't serving ES256 keys yet).
    if let Some(verifier) = cfg.verifier.clone() {
        verifier.start(std::time::Duration::from_secs(300)).await;
    }

    let metrics_port: u16 = std::env::var("GATE_METRICS_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9090);
    let (_layer, handle) = jedi::entity::pipe_prometheus::build_metrics_layer("kbve-gate");
    tokio::spawn(jedi::entity::pipe_prometheus::serve_metrics(
        jedi::entity::pipe_prometheus::MetricsConfig {
            service_name: "kbve-gate",
            port: metrics_port,
        },
        handle,
    ));

    let router = GateState::new(cfg).into_router();
    let listener = tokio::net::TcpListener::bind(listen)
        .await
        .map_err(|e| format!("bind {listen}: {e}"))?;

    tracing::info!(%listen, "kbve gate listening");
    axum::serve(listener, router)
        .await
        .map_err(|e| format!("serve: {e}"))
}
