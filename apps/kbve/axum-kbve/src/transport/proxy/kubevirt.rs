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
use tracing::{debug, warn};

use super::core::*;

pub(super) static KUBEVIRT: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_kubevirt_proxy() -> bool {
    let upstream = match std::env::var("KUBEVIRT_API_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let auth_token = match std::env::var("KUBEVIRT_TOKEN") {
        Ok(t) => t,
        Err(_) => {
            match std::fs::read_to_string("/var/run/secrets/kubernetes.io/serviceaccount/token") {
                Ok(t) => t.trim().to_string(),
                Err(_) => return false,
            }
        }
    };

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30));

    if let Ok(ca_path) = std::env::var("KUBEVIRT_CA_CERT_PATH") {
        match std::fs::read(&ca_path) {
            Ok(pem) => match reqwest::Certificate::from_pem(&pem) {
                Ok(cert) => {
                    builder = builder.add_root_certificate(cert);
                    debug!("loaded KubeVirt CA certificate from {ca_path}");
                }
                Err(e) => {
                    warn!("failed to parse KubeVirt CA cert at {ca_path}: {e}");
                    return false;
                }
            },
            Err(e) => {
                warn!("failed to read KubeVirt CA cert at {ca_path}: {e}");
                return false;
            }
        }
    } else {
        let ca_path = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
        if let Ok(pem) = std::fs::read(ca_path) {
            if let Ok(cert) = reqwest::Certificate::from_pem(&pem) {
                builder = builder.add_root_certificate(cert);
                debug!("loaded in-cluster CA certificate from {ca_path}");
            }
        }
    }

    let client = builder
        .build()
        .expect("failed to build reqwest client for kubevirt proxy");

    KUBEVIRT
        .set(ServiceProxy {
            name: "KubeVirt",
            client,
            upstream,
            upstream_token: Some(auth_token),
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn kubevirt_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match KUBEVIRT.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "KubeVirt proxy not configured"})),
        )
            .into_response(),
    }
}

/// Bridges a browser WebSocket to the KubeVirt VNC subresource so the
/// dashboard can run interactive noVNC sessions.
pub async fn kubevirt_vnc_handler(
    Path(vm_name): Path<String>,
    ws: axum::extract::ws::WebSocketUpgrade,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    // Browser WebSocket API cannot set custom headers, so the auth gate
    // also accepts ?access_token= as a fallback.
    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "KubeVirt-VNC").await
    {
        return resp;
    }

    let kubevirt = match KUBEVIRT.get() {
        Some(k) => k,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "KubeVirt proxy not configured"})),
            )
                .into_response();
        }
    };

    if !vm_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid VM name"})),
        )
            .into_response();
    }

    let upstream_url = format!(
        "{}/apis/subresources.kubevirt.io/v1/namespaces/{}/virtualmachineinstances/{}/vnc",
        kubevirt.upstream, VM_NAMESPACE, vm_name
    );
    let upstream_token = kubevirt.upstream_token.clone();
    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    let viewer_id = query_param(query.as_deref(), "viewer_id");

    ws.protocols(["binary.k8s.io", "base64.binary.k8s.io"])
        .on_upgrade(move |browser_ws| async move {
            if let Err(e) = crate::transport::vnc_hub::join_session(
                vm_key,
                upstream_url,
                upstream_token,
                viewer_id,
                browser_ws,
            )
            .await
            {
                warn!("VNC hub error for {vm_name}: {e}");
            }
        })
}

fn query_param(query: Option<&str>, key: &str) -> Option<String> {
    url::form_urlencoded::parse(query?.as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

pub async fn kubevirt_vnc_control_handler(
    Path(vm_name): Path<String>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Control").await
    {
        return resp;
    }

    let body_bytes = match axum::body::to_bytes(req.into_body(), 4096).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "invalid body"})),
            )
                .into_response();
        }
    };
    let payload: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "invalid JSON"})),
            )
                .into_response();
        }
    };

    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let viewer_id = payload
        .get("viewer_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if viewer_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "missing viewer_id"})),
        )
            .into_response();
    }

    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    let ok = match action {
        "take" => crate::transport::vnc_hub::request_control(&vm_key, viewer_id),
        "release" => crate::transport::vnc_hub::release_control(&vm_key, viewer_id),
        "deny" => crate::transport::vnc_hub::deny_control(&vm_key, viewer_id),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "unknown action"})),
            )
                .into_response();
        }
    };

    axum::Json(json!({"ok": ok})).into_response()
}

const VM_NAMESPACE: &str = "angelscript";
pub(super) const KASM_NAMESPACE: &str = "kasm";

/// GET /dashboard/vm/vnc-info/{name} — returns viewer count for a specific VM
pub async fn kubevirt_vnc_info_handler(
    Path(vm_name): Path<String>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Info").await
    {
        return resp;
    }

    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    match crate::transport::vnc_hub::get_session_info(&vm_key) {
        Some(info) => axum::Json(info).into_response(),
        None => axum::Json(json!({
            "vm_key": vm_key,
            "viewers": 0,
            "has_primary": false,
            "controller_viewer_id": null,
            "viewers_list": [],
            "pending": null
        }))
        .into_response(),
    }
}

/// GET /dashboard/vm/vnc-sessions — returns all active VNC sessions
pub async fn kubevirt_vnc_sessions_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Sessions").await
    {
        return resp;
    }

    let sessions = crate::transport::vnc_hub::list_sessions();
    axum::Json(json!({"sessions": sessions})).into_response()
}
