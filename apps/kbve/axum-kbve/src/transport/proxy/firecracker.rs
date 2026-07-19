use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::{Body},
    extract::{Path, Request},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::warn;
use crate::auth::jwt_cache::TokenInfo;

use super::core::*;

async fn resolve_account_for_token(token: &TokenInfo) -> Option<uuid::Uuid> {
    let user_id = token.user_id.parse::<uuid::Uuid>().ok()?;
    let wallet = crate::db::get_wallet_client()?;
    match wallet.service_account_for_user(user_id).await {
        Ok(a) => Some(a),
        Err(e) => {
            warn!(%user_id, "fc-billing: account resolution failed: {e}");
            None
        }
    }
}

fn set_account_id_header(req: &mut Request<Body>, account_id: Option<uuid::Uuid>) {
    req.headers_mut().remove("x-kbve-account-id");
    if let Some(acc) = account_id {
        if let Ok(v) = HeaderValue::from_str(&acc.to_string()) {
            req.headers_mut().insert("x-kbve-account-id", v);
        }
    }
}

static FIRECRACKER: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_firecracker_proxy() -> bool {
    let upstream = std::env::var("FIRECRACKER_CTL_URL")
        .unwrap_or_else(|_| "http://firecracker-ctl.firecracker.svc.cluster.local:9001".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for firecracker proxy");

    FIRECRACKER
        .set(ServiceProxy {
            name: "Firecracker",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn firecracker_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "Firecracker").await {
        return resp;
    }

    match FIRECRACKER.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker proxy not configured"})),
        )
            .into_response(),
    }
}

/// Public read-only proxy for the firecracker-ctl OpenAPI document.
///
/// Mounted at `/api/firecracker/openapi.json` so the Scalar viewer at
/// `/dashboard/api/` can fetch the spec without an auth bridge. The
/// document only describes endpoint shapes; the operations themselves
/// remain staff-gated through [`firecracker_proxy_handler`].
pub async fn firecracker_openapi_handler(req: Request<Body>) -> Response {
    match FIRECRACKER.get() {
        Some(proxy) => {
            proxy
                .handle_preauthorized(Some(Path("openapi.json".to_string())), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker proxy not configured"})),
        )
            .into_response(),
    }
}


static FIRECRACKER_NET: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_firecracker_net_proxy() -> bool {
    let upstream = std::env::var("FIRECRACKER_CTL_NET_URL")
        .unwrap_or_else(|_| "http://firecracker-ctl-net.firecracker.svc.cluster.local:9001".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for firecracker-net proxy");

    FIRECRACKER_NET
        .set(ServiceProxy {
            name: "Firecracker-Net",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn firecracker_net_proxy_handler(
    path: Option<Path<String>>,
    mut req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let token =
        match require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-Net")
            .await
        {
            Ok(t) => t,
            Err(resp) => return resp,
        };

    let account_id = resolve_account_for_token(&token).await;
    set_account_id_header(&mut req, account_id);

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

/// Stable `/api/v1/fc/<rest>` → `/fc/<rest>` alias under the staff gate.
pub async fn firecracker_fc_alias_handler(
    Path(rest): Path<String>,
    mut req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let token =
        match require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-FC")
            .await
        {
            Ok(t) => t,
            Err(resp) => return resp,
        };

    let account_id = resolve_account_for_token(&token).await;
    set_account_id_header(&mut req, account_id);

    match FIRECRACKER_NET.get() {
        Some(proxy) => {
            let upstream_path = format!("fc/{rest}");
            proxy
                .handle_preauthorized(Some(Path(upstream_path)), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

pub async fn firecracker_deployments_handler(
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let query: Option<String> = params
        .get("access_token")
        .map(|t| format!("access_token={t}"));
    let token = match require_dashboard_manage_with_query(
        &headers,
        query.as_deref(),
        "Firecracker-Deployments",
    )
    .await
    {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let account_id = match resolve_account_for_token(&token).await {
        Some(a) => a,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "could not resolve wallet account for user"})),
            )
                .into_response();
        }
    };

    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(50)
        .clamp(1, 200);
    let offset = params
        .get("offset")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0)
        .max(0);
    let live_only = params
        .get("live_only")
        .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    let wallet = match crate::db::get_wallet_client() {
        Some(w) => w,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "wallet not configured"})),
            )
                .into_response();
        }
    };

    match wallet
        .firecracker_my_deployments(account_id, limit, offset, live_only)
        .await
    {
        Ok(rows) => (
            StatusCode::OK,
            axum::Json(json!({
                "account_id": account_id,
                "limit": limit,
                "offset": offset,
                "live_only": live_only,
                "deployments": rows,
            })),
        )
            .into_response(),
        Err(e) => {
            warn!(%account_id, "fc-journal: my_deployments query failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "deployment history query failed"})),
            )
                .into_response()
        }
    }
}

pub async fn firecracker_deployment_stats_handler(
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let query: Option<String> = params
        .get("access_token")
        .map(|t| format!("access_token={t}"));
    let token = match require_dashboard_manage_with_query(
        &headers,
        query.as_deref(),
        "Firecracker-Deployment-Stats",
    )
    .await
    {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let account_id = match resolve_account_for_token(&token).await {
        Some(a) => a,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "could not resolve wallet account for user"})),
            )
                .into_response();
        }
    };

    let wallet = match crate::db::get_wallet_client() {
        Some(w) => w,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "wallet not configured"})),
            )
                .into_response();
        }
    };

    match wallet.firecracker_deployment_stats(account_id).await {
        Ok(stats) => (
            StatusCode::OK,
            axum::Json(json!({
                "account_id": account_id,
                "stats": stats,
            })),
        )
            .into_response(),
        Err(e) => {
            warn!(%account_id, "fc-journal: deployment_stats query failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "deployment stats query failed"})),
            )
                .into_response()
        }
    }
}

pub async fn firecracker_fc_handler(
    axum::extract::Path(params): axum::extract::Path<Vec<(String, String)>>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-FC")
            .await
            .map(|_| ())
    {
        return resp;
    }

    let name = params
        .iter()
        .find(|(k, _)| k == "name")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();
    let tail = params
        .iter()
        .find(|(k, _)| k == "path")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid endpoint name"})),
        )
            .into_response();
    }

    let rewritten = if tail.is_empty() {
        format!("proxy/{name}")
    } else {
        format!("proxy/{name}/{tail}")
    };

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(Some(Path(rewritten)), req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

/// Anonymous `/fc/public/<rest>` → ctl-net `/public-proxy/<rest>`. ctl-net
/// 403s when the endpoint wasn't deployed `visibility: "public"`.
///
/// Catch-all (not `{name}` + `{name}/{*path}`) so the trailing-slash form
/// doesn't fall through to staff `/fc/{name}/...`. Upstream prefix is
/// `/public-proxy/` not `/proxy/public/` — the nested form overlapped
/// with `/proxy/{name}/{*path}` and matchit kept picking the staff route.
pub async fn firecracker_fc_public_handler(
    rest: Option<Path<String>>,
    req: Request<Body>,
) -> Response {
    let rest_str = rest.map(|Path(p)| p).unwrap_or_default();
    let trimmed = rest_str.trim_start_matches('/');
    let (name, tail) = match trimmed.split_once('/') {
        Some((n, t)) => (n, t),
        None => (trimmed, ""),
    };

    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid endpoint name"})),
        )
            .into_response();
    }

    let rewritten = if tail.is_empty() {
        format!("public-proxy/{name}")
    } else {
        format!("public-proxy/{name}/{tail}")
    };

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(Some(Path(rewritten)), req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

