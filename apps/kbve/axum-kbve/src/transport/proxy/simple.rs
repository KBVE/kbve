use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::Body,
    extract::{Path, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::{debug, warn};

use super::core::*;

/// Which auth gate a simple proxy runs before forwarding.
#[derive(Clone, Copy)]
enum GateMode {
    /// Every method requires DASHBOARD_VIEW.
    View,
    /// Reads require DASHBOARD_VIEW, mutating verbs require DASHBOARD_MANAGE.
    MethodAware,
}

/// Declarative description of a "simple" proxy target: one upstream, a stock
/// reqwest client, and one of the standard auth gates. Targets with bespoke
/// request handling (KASM, ChuckRPG, Firecracker, KubeVirt, Factorio) are not
/// modelled here — they live in their own modules.
struct ProxySpec {
    /// Human label, used as `ServiceProxy.name` and in the "not configured" body.
    name: &'static str,
    /// Env var holding the upstream base URL.
    upstream_env: &'static str,
    /// Fallback upstream when `upstream_env` is unset. `None` = required.
    upstream_default: Option<&'static str>,
    /// Appended to the resolved base (e.g. Edge's `/functions/v1`).
    upstream_suffix: Option<&'static str>,
    /// Env var holding the upstream bearer token. `Some` = required; when unset
    /// at runtime the proxy stays unconfigured. `None` = anonymous upstream.
    token_env: Option<&'static str>,
    /// Env var pointing at a PEM CA cert to trust (e.g. ArgoCD's self-signed API).
    ca_cert_env: Option<&'static str>,
    connect_timeout: Duration,
    timeout: Duration,
    gate: GateMode,
}

/// Build a `ServiceProxy` from a spec, or `None` if a required env var / CA
/// cert is missing or malformed (the caller reports this as "not configured").
fn build_proxy(spec: &ProxySpec) -> Option<ServiceProxy> {
    let base = match std::env::var(spec.upstream_env) {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => spec.upstream_default?.to_string(),
    };
    let upstream = match spec.upstream_suffix {
        Some(suffix) => format!("{base}{suffix}"),
        None => base,
    };

    let upstream_token = match spec.token_env {
        Some(env) => Some(std::env::var(env).ok()?),
        None => None,
    };

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(spec.connect_timeout)
        .timeout(spec.timeout);

    if let Some(ca_env) = spec.ca_cert_env {
        if let Ok(ca_path) = std::env::var(ca_env) {
            let pem = match std::fs::read(&ca_path) {
                Ok(pem) => pem,
                Err(e) => {
                    warn!("failed to read {} CA cert at {ca_path}: {e}", spec.name);
                    return None;
                }
            };
            match reqwest::Certificate::from_pem(&pem) {
                Ok(cert) => {
                    builder = builder.add_root_certificate(cert);
                    debug!("loaded {} CA certificate from {ca_path}", spec.name);
                }
                Err(e) => {
                    warn!("failed to parse {} CA cert at {ca_path}: {e}", spec.name);
                    return None;
                }
            }
        }
    }

    let client = builder
        .build()
        .expect("failed to build reqwest client for simple proxy");

    Some(ServiceProxy {
        name: spec.name,
        client,
        upstream,
        upstream_token,
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: false,
    })
}

fn not_configured(name: &str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        axum::Json(json!({ "error": format!("{name} proxy not configured") })),
    )
        .into_response()
}

/// Run the spec's gate then forward, or return "not configured".
async fn serve(
    cell: &OnceLock<ServiceProxy>,
    spec: &ProxySpec,
    path: Option<Path<String>>,
    req: Request<Body>,
) -> Response {
    match cell.get() {
        Some(proxy) => match spec.gate {
            GateMode::View => proxy.handle(path, req).await,
            GateMode::MethodAware => proxy.handle_method_aware(path, req).await,
        },
        None => not_configured(spec.name),
    }
}

macro_rules! simple_proxy {
    ($cell:ident, $spec:ident, $init:ident, $handler:ident, $def:expr) => {
        static $cell: OnceLock<ServiceProxy> = OnceLock::new();
        const $spec: ProxySpec = $def;

        pub fn $init() -> bool {
            match build_proxy(&$spec) {
                Some(proxy) => $cell.set(proxy).is_ok(),
                None => false,
            }
        }

        pub async fn $handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
            serve(&$cell, &$spec, path, req).await
        }
    };
}

simple_proxy!(
    GRAFANA,
    GRAFANA_SPEC,
    init_grafana_proxy,
    grafana_proxy_handler,
    ProxySpec {
        name: "Grafana",
        upstream_env: "GRAFANA_UPSTREAM_URL",
        upstream_default: None,
        upstream_suffix: None,
        token_env: None,
        ca_cert_env: None,
        connect_timeout: Duration::from_secs(5),
        timeout: Duration::from_secs(15),
        gate: GateMode::View,
    }
);

simple_proxy!(
    ARGO,
    ARGO_SPEC,
    init_argo_proxy,
    argo_proxy_handler,
    ProxySpec {
        name: "ArgoCD",
        upstream_env: "ARGOCD_UPSTREAM_URL",
        upstream_default: None,
        upstream_suffix: None,
        token_env: Some("ARGOCD_AUTH_TOKEN"),
        ca_cert_env: Some("ARGOCD_CA_CERT_PATH"),
        connect_timeout: Duration::from_secs(10),
        timeout: Duration::from_secs(120),
        gate: GateMode::MethodAware,
    }
);

simple_proxy!(
    FORGEJO,
    FORGEJO_SPEC,
    init_forgejo_proxy,
    forgejo_proxy_handler,
    ProxySpec {
        name: "Forgejo",
        upstream_env: "FORGEJO_UPSTREAM_URL",
        upstream_default: None,
        upstream_suffix: None,
        token_env: Some("FORGEJO_AUTH_TOKEN"),
        ca_cert_env: None,
        connect_timeout: Duration::from_secs(5),
        timeout: Duration::from_secs(15),
        gate: GateMode::MethodAware,
    }
);

simple_proxy!(
    EDGE,
    EDGE_SPEC,
    init_edge_proxy,
    edge_proxy_handler,
    ProxySpec {
        name: "Edge",
        upstream_env: "SUPABASE_URL",
        upstream_default: None,
        upstream_suffix: Some("/functions/v1"),
        token_env: Some("SUPABASE_SERVICE_ROLE_KEY"),
        ca_cert_env: None,
        connect_timeout: Duration::from_secs(5),
        timeout: Duration::from_secs(15),
        gate: GateMode::View,
    }
);

static FACTORIO: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_factorio_proxy() -> bool {
    let upstream = std::env::var("FACTORIO_CTL_URL")
        .unwrap_or_else(|_| "http://factorio-ctl.factorio.svc.cluster.local:9002".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for factorio proxy");

    FACTORIO
        .set(ServiceProxy {
            name: "Factorio",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn factorio_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "Factorio").await {
        return resp;
    }

    match FACTORIO.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => not_configured("Factorio"),
    }
}

/// Public read-only proxy for the factorio-ctl OpenAPI document. Mirrors
/// [`firecracker_openapi_handler`]; the operations stay staff-gated through
/// [`factorio_proxy_handler`].
pub async fn factorio_openapi_handler(req: Request<Body>) -> Response {
    match FACTORIO.get() {
        Some(proxy) => {
            proxy
                .handle_preauthorized(Some(Path("openapi.json".to_string())), req)
                .await
        }
        None => not_configured("Factorio"),
    }
}
