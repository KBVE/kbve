use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::{Body},
    extract::{Path, Request},
    http::{StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::warn;
use crate::auth::jwt_cache::staff_perm;

use super::core::*;

static WINDMILL: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_windmill_proxy() -> bool {
    let upstream = std::env::var("WINDMILL_GATE_URL")
        .unwrap_or_else(|_| "http://windmill-gate.windmill.svc.cluster.local:5678".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest client for windmill proxy");

    WINDMILL
        .set(ServiceProxy {
            name: "Windmill",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

/// Proxy for the Windmill dashboard canvas. Staff-gated at axum, then forwards
/// the caller's Supabase token to windmill-gate, whose SSO bridge impersonates
/// the user — so Windmill actions carry per-user attribution.
/// Extract the runnable path from a Windmill job-run proxy path, if the request
/// is an invocation. Returns the script/flow path (e.g. `f/web/poem`) so the
/// proxy can enforce the surface boundary. Reads (poll result, scripts/list)
/// return `None` and stay under the plain DASHBOARD_VIEW gate.
fn windmill_runnable_path(proxy_path: &str) -> Option<&str> {
    const MARKERS: [&str; 4] = [
        "/jobs/run/p/",
        "/jobs/run_wait_result/p/",
        "/jobs/run/f/",
        "/jobs/run_wait_result/f/",
    ];
    for marker in MARKERS {
        if let Some(idx) = proxy_path.find(marker) {
            return Some(&proxy_path[idx + marker.len()..]);
        }
    }
    None
}

pub async fn windmill_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());

    let token_info =
        match require_dashboard_view_with_query(&headers, raw_query.as_deref(), "Windmill").await {
            Ok(info) => info,
            Err(resp) => return resp,
        };

    // The windmill folder is the hardened invocation boundary. A browser may
    // only run scripts under `f/web/*`; `f/web/staff/*` additionally requires
    // DASHBOARD_MANAGE. Everything else (f/discordsh/*, f/shared/*,
    // f/kilobase/*, u/*) is rejected — those surfaces are never browser-invoked.
    if let Some(runnable) = path.as_ref().and_then(|Path(p)| windmill_runnable_path(p)) {
        if !runnable.starts_with("f/web/") {
            warn!(
                user_id = %token_info.user_id,
                runnable,
                "Windmill proxy blocked invoke outside f/web/*"
            );
            return (
                StatusCode::FORBIDDEN,
                axum::Json(json!({
                    "error": "Access restricted",
                    "message": "This workflow is not invocable from the dashboard"
                })),
            )
                .into_response();
        }
        if runnable.starts_with("f/web/staff/")
            && !token_info.has_permission(staff_perm::DASHBOARD_MANAGE)
        {
            warn!(
                user_id = %token_info.user_id,
                runnable,
                "Windmill proxy blocked staff workflow — missing DASHBOARD_MANAGE"
            );
            return (
                StatusCode::FORBIDDEN,
                axum::Json(json!({
                    "error": "Access restricted",
                    "message": "This workflow requires staff access"
                })),
            )
                .into_response();
        }
    }

    let token = match extract_auth_token(&headers, raw_query.as_deref()) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Missing Authorization token for Windmill"})),
            )
                .into_response();
        }
    };

    match WINDMILL.get() {
        Some(proxy) => {
            proxy
                .handle_with_auth(path, req, format!("Bearer {token}"))
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Windmill proxy not configured"})),
        )
            .into_response(),
    }
}

