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

use super::core::*;

static GUACAMOLE: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_guacamole_proxy() -> bool {
    let upstream = std::env::var("GUACAMOLE_UPSTREAM_URL")
        .unwrap_or_else(|_| "http://guacamole.angelscript.svc.cluster.local:8080".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest client for guacamole proxy");

    GUACAMOLE
        .set(ServiceProxy {
            name: "Guacamole",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn guacamole_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let proxy = match GUACAMOLE.get() {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Guacamole proxy not configured"})),
            )
                .into_response();
        }
    };

    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Guacamole").await
    {
        return resp;
    }

    proxy.handle_preauthorized(path, req).await
}

/// Bridges the browser WebSocket to `/guacamole/websocket-tunnel`. The
/// generic ServiceProxy can't do this — reqwest is HTTP-only and strips
/// the Upgrade header — so we relay frames directly here (same pattern as
/// `kubevirt_vnc_handler`).
pub async fn guacamole_ws_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Guacamole-WS").await
    {
        return resp;
    }

    let guac = match GUACAMOLE.get() {
        Some(g) => g,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Guacamole proxy not configured"})),
            )
                .into_response();
        }
    };

    // Guacamole needs the query string forwarded — token, GUAC_WIDTH, etc.
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();

    let upstream_url = format!("{}/guacamole/websocket-tunnel{}", guac.upstream, query);

    ws.on_upgrade(move |browser_ws| async move {
        if let Err(e) = guacamole_ws_bridge(browser_ws, &upstream_url).await {
            warn!("Guacamole WS bridge error: {e}");
        }
    })
}

/// Bidirectional WebSocket bridge between the browser and Guacamole servlet.
async fn guacamole_ws_bridge(
    browser_ws: axum::extract::ws::WebSocket,
    upstream_url: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use axum::extract::ws::Message as AxumMsg;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::{Message as TungMsg, client::IntoClientRequest};

    let ws_url = upstream_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let request = ws_url.into_client_request()?;

    // Guacamole is cluster-internal (often plain HTTP), so allow non-TLS.
    let (upstream_ws, _resp) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, None).await?;

    let (mut browser_tx, mut browser_rx) = browser_ws.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_ws.split();

    let browser_to_upstream = async {
        while let Some(msg) = browser_rx.next().await {
            match msg {
                Ok(AxumMsg::Text(text)) => {
                    let s: String = text.to_string();
                    if upstream_tx.send(TungMsg::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(AxumMsg::Binary(data)) => {
                    if upstream_tx.send(TungMsg::Binary(data)).await.is_err() {
                        break;
                    }
                }
                Ok(AxumMsg::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
        let _ = upstream_tx.close().await;
    };

    let upstream_to_browser = async {
        while let Some(msg) = upstream_rx.next().await {
            match msg {
                Ok(TungMsg::Text(text)) => {
                    let s: String = text.to_string();
                    if browser_tx.send(AxumMsg::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(TungMsg::Binary(data)) => {
                    if browser_tx.send(AxumMsg::Binary(data)).await.is_err() {
                        break;
                    }
                }
                Ok(TungMsg::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
        let _ = browser_tx.close().await;
    };

    tokio::select! {
        _ = browser_to_upstream => {},
        _ = upstream_to_browser => {},
    }

    Ok(())
}

