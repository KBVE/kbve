use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::get,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::service::OWSService;

/// WebSocket adapter — third transport alongside REST and gRPC.
/// Clients send JSON-RPC-style messages, server responds with JSON.
///
/// Protocol:
/// ```json
/// { "method": "login", "id": 1, "params": { "email": "...", "password": "..." } }
/// → { "id": 1, "result": { "authenticated": true, ... } }
/// → { "id": 1, "error": { "code": "NOT_FOUND", "message": "..." } }
/// ```

pub fn router(svc: Arc<OWSService>) -> Router {
    Router::new().route("/ws", get(ws_upgrade)).with_state(svc)
}

async fn ws_upgrade(State(svc): State<Arc<OWSService>>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, svc))
}

#[derive(Deserialize)]
struct WsRequest {
    method: String,
    id: Option<u64>,
    #[serde(default)]
    params: serde_json::Value,
}

#[derive(Serialize)]
struct WsResponse {
    id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WsError>,
}

#[derive(Serialize)]
struct WsError {
    code: String,
    message: String,
}

impl WsResponse {
    fn ok(id: Option<u64>, result: impl Serialize) -> Self {
        Self {
            id,
            result: serde_json::to_value(result).ok(),
            error: None,
        }
    }

    fn err(id: Option<u64>, code: &str, message: impl Into<String>) -> Self {
        Self {
            id,
            result: None,
            error: Some(WsError {
                code: code.to_string(),
                message: message.into(),
            }),
        }
    }
}

async fn handle_ws(mut socket: WebSocket, svc: Arc<OWSService>) {
    info!("WebSocket client connected");

    while let Some(msg) = socket.recv().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) => break,
            Ok(_) => continue, // ignore binary/ping/pong
            Err(e) => {
                warn!(error = %e, "WebSocket receive error");
                break;
            }
        };

        let req: WsRequest = match serde_json::from_str(&msg) {
            Ok(r) => r,
            Err(e) => {
                let resp = WsResponse::err(None, "PARSE_ERROR", format!("Invalid JSON: {e}"));
                let _ = socket
                    .send(Message::Text(serde_json::to_string(&resp).unwrap().into()))
                    .await;
                continue;
            }
        };

        let resp = dispatch(&svc, &req).await;
        let json = serde_json::to_string(&resp).unwrap();
        if socket.send(Message::Text(json.into())).await.is_err() {
            break;
        }
    }

    info!("WebSocket client disconnected");
}

async fn dispatch(svc: &OWSService, req: &WsRequest) -> WsResponse {
    let id = req.id;
    let guid = svc.state().config.customer_guid;

    match req.method.as_str() {
        "login" => {
            let email = req
                .params
                .get("email")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let password = req
                .params
                .get("password")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match svc.login(email, password).await {
                Ok(result) => WsResponse::ok(id, result),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "get_session" => {
            let session_str = req
                .params
                .get("session_guid")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let session_guid = match Uuid::parse_str(session_str) {
                Ok(g) => g,
                Err(_) => return WsResponse::err(id, "BAD_REQUEST", "Invalid session_guid"),
            };
            match svc.get_session(session_guid).await {
                Ok(session) => WsResponse::ok(id, session),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "get_all_characters" => {
            let session_str = req
                .params
                .get("session_guid")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let session_guid = match Uuid::parse_str(session_str) {
                Ok(g) => g,
                Err(_) => return WsResponse::err(id, "BAD_REQUEST", "Invalid session_guid"),
            };
            match svc.get_all_characters(session_guid, guid).await {
                Ok(chars) => WsResponse::ok(id, chars),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "get_character" => {
            let name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match svc.get_character_by_name(guid, name).await {
                Ok(ch) => WsResponse::ok(id, ch),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "update_position" => {
            let name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let x = req.params.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = req.params.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let z = req.params.get("z").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let rx = req.params.get("rx").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let ry = req.params.get("ry").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let rz = req.params.get("rz").and_then(|v| v.as_f64()).unwrap_or(0.0);
            match svc.update_position(guid, name, x, y, z, rx, ry, rz).await {
                Ok(()) => WsResponse::ok(id, serde_json::json!({"success": true})),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "get_global_data" => {
            let key = req.params.get("key").and_then(|v| v.as_str()).unwrap_or("");
            match svc.get_global_data(guid, key).await {
                Ok(data) => WsResponse::ok(id, data),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        "set_global_data" => {
            let key = req.params.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = req
                .params
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match svc.set_global_data(guid, key, value).await {
                Ok(()) => WsResponse::ok(id, serde_json::json!({"success": true})),
                Err(e) => WsResponse::err(id, e.code(), e.to_string()),
            }
        }

        _ => WsResponse::err(
            id,
            "METHOD_NOT_FOUND",
            format!("Unknown method: {}", req.method),
        ),
    }
}
