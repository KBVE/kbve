use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::{Body},
    extract::{Path, Request},
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::warn;

use super::core::*;

/// One ROWS tenant: a main `/api/*` proxy plus its docs/openapi proxy.
struct ChuckRpgTenant {
    id: String,
    label: String,
    main: ServiceProxy,
    docs: ServiceProxy,
}

/// Registry of all configured ROWS tenants, keyed by id, with insertion order
/// preserved for stable listing and a default for tenant-less requests.
struct ChuckRpgRegistry {
    tenants: HashMap<String, ChuckRpgTenant>,
    order: Vec<String>,
    default_id: String,
}

static CHUCKRPG: OnceLock<ChuckRpgRegistry> = OnceLock::new();

fn build_chuckrpg_client() -> Client {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client for chuckrpg proxy")
}

fn chuckrpg_guid_headers(id: &str, guid: Option<&str>) -> Vec<(HeaderName, HeaderValue)> {
    let mut headers = Vec::new();
    match guid.map(str::trim).filter(|g| !g.is_empty()) {
        Some(g) => match HeaderValue::from_str(g) {
            Ok(val) => headers.push((HeaderName::from_static("x-customerguid"), val)),
            Err(e) => {
                warn!(tenant = %id, error = %e, "invalid ROWS customer guid, header not injected")
            }
        },
        None => warn!(tenant = %id, "no customer guid — ROWS /api/System/* will return 401"),
    }
    headers
}

fn make_chuckrpg_tenant(
    id: String,
    label: String,
    upstream: String,
    docs: String,
    guid: Option<&str>,
) -> ChuckRpgTenant {
    let main = ServiceProxy {
        name: "ChuckRPG",
        client: build_chuckrpg_client(),
        upstream,
        upstream_token: None,
        upstream_headers: chuckrpg_guid_headers(&id, guid),
        iframe_safe: false,
        streaming: false,
    };
    let docs = ServiceProxy {
        name: "ChuckRPG-Docs",
        client: build_chuckrpg_client(),
        upstream: docs,
        upstream_token: None,
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: false,
    };
    ChuckRpgTenant {
        id,
        label,
        main,
        docs,
    }
}

/// Parse `CHUCKRPG_TENANTS` (JSON array of {id,label,upstream,docs,guid_env}),
/// resolving each tenant's customer guid from the env var it names. Falls back
/// to the legacy single-tenant `CHUCKRPG_UPSTREAM_URL` envs when unset.
pub fn init_chuckrpg_proxy() -> bool {
    let raw = match std::env::var("CHUCKRPG_TENANTS") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return init_chuckrpg_proxy_legacy(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "CHUCKRPG_TENANTS is not valid JSON — ROWS proxy disabled");
            return false;
        }
    };
    let arr = match parsed.as_array() {
        Some(a) => a,
        None => {
            warn!("CHUCKRPG_TENANTS must be a JSON array — ROWS proxy disabled");
            return false;
        }
    };

    let mut tenants = HashMap::new();
    let mut order = Vec::new();
    for item in arr {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() {
            warn!("CHUCKRPG_TENANTS entry missing 'id' — skipped");
            continue;
        }
        let label = item
            .get("label")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| id.clone());
        let upstream = item
            .get("upstream")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim_end_matches('/')
            .to_string();
        if upstream.is_empty() {
            warn!(tenant = %id, "CHUCKRPG_TENANTS entry missing 'upstream' — skipped");
            continue;
        }
        let docs = item
            .get("docs")
            .and_then(|v| v.as_str())
            .map(|s| s.trim_end_matches('/').to_string())
            .unwrap_or_else(|| upstream.clone());
        let guid = item
            .get("guid_env")
            .and_then(|v| v.as_str())
            .and_then(|name| std::env::var(name).ok());

        tenants.insert(
            id.clone(),
            make_chuckrpg_tenant(id.clone(), label, upstream, docs, guid.as_deref()),
        );
        order.push(id);
    }

    if tenants.is_empty() {
        warn!("CHUCKRPG_TENANTS produced no valid tenants — ROWS proxy disabled");
        return false;
    }
    let default_id = order[0].clone();
    CHUCKRPG
        .set(ChuckRpgRegistry {
            tenants,
            order,
            default_id,
        })
        .is_ok()
}

fn init_chuckrpg_proxy_legacy() -> bool {
    let upstream = match std::env::var("CHUCKRPG_UPSTREAM_URL") {
        Ok(u) if !u.trim().is_empty() => u.trim_end_matches('/').to_string(),
        _ => return false,
    };
    let docs = std::env::var("CHUCKRPG_DOCS_URL")
        .ok()
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_else(|| upstream.clone());
    let guid = std::env::var("CHUCKRPG_CUSTOMER_GUID").ok();
    let id = "default".to_string();
    let mut tenants = HashMap::new();
    tenants.insert(
        id.clone(),
        make_chuckrpg_tenant(
            id.clone(),
            "ROWS".to_string(),
            upstream,
            docs,
            guid.as_deref(),
        ),
    );
    CHUCKRPG
        .set(ChuckRpgRegistry {
            tenants,
            order: vec![id.clone()],
            default_id: id,
        })
        .is_ok()
}

fn chuckrpg_not_configured() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        axum::Json(json!({"error": "ChuckRPG proxy not configured"})),
    )
        .into_response()
}

fn chuckrpg_unknown_tenant(tenant: &str) -> Response {
    (
        StatusCode::NOT_FOUND,
        axum::Json(json!({"error": format!("unknown ROWS tenant '{tenant}'")})),
    )
        .into_response()
}

/// `/dashboard/chuckrpg/proxy/{tenant}/{*path}` — route to the named tenant's
/// main proxy.
pub async fn chuckrpg_proxy_handler(
    Path((tenant, rest)): Path<(String, String)>,
    req: Request<Body>,
) -> Response {
    match CHUCKRPG.get() {
        Some(reg) => match reg.tenants.get(tenant.trim()) {
            Some(t) => t.main.handle(Some(Path(rest)), req).await,
            None => chuckrpg_unknown_tenant(&tenant),
        },
        None => chuckrpg_not_configured(),
    }
}

/// `/dashboard/chuckrpg/tenants` — list configured tenants for the dashboard
/// selector. Gated by DASHBOARD_VIEW like the proxied endpoints.
pub async fn chuckrpg_tenants_handler(req: Request<Body>) -> Response {
    let req_headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());
    if let Err(resp) =
        require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), "ChuckRPG").await
    {
        return resp;
    }
    match CHUCKRPG.get() {
        Some(reg) => {
            let list: Vec<_> = reg
                .order
                .iter()
                .filter_map(|id| reg.tenants.get(id))
                .map(|t| json!({"id": t.id, "label": t.label, "default": t.id == reg.default_id}))
                .collect();
            axum::Json(json!({"tenants": list, "default": reg.default_id})).into_response()
        }
        None => chuckrpg_not_configured(),
    }
}

pub async fn chuckrpg_openapi_handler(req: Request<Body>) -> Response {
    let tenant = req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|kv| kv.strip_prefix("tenant="))
            .map(|s| s.to_string())
    });
    match CHUCKRPG.get() {
        Some(reg) => {
            let key = tenant
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&reg.default_id);
            match reg.tenants.get(key) {
                Some(t) => {
                    t.docs
                        .handle_preauthorized(Some(Path("api-docs/openapi.json".to_string())), req)
                        .await
                }
                None => chuckrpg_unknown_tenant(key),
            }
        }
        None => chuckrpg_not_configured(),
    }
}
