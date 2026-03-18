//! HTTP endpoint for issuing Netcode [`ConnectToken`]s.
//!
//! The client calls `POST /api/v1/auth/game-token` with an optional Supabase
//! JWT. The server verifies the JWT (if present), generates a time-limited
//! `ConnectToken`, and returns it base64-encoded so the client can establish
//! a Netcode connection to the game server.

use axum::Json;
use axum::http::{HeaderMap, StatusCode};
use lightyear::netcode::ConnectToken;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use bevy_kbve_net::net_config;

/// Default WS port (used when deriving URL from Host header).
const DEFAULT_WS_PORT: u16 = 5000;

/// Default WT port (used when deriving URL from Host header).
const DEFAULT_WT_PORT: u16 = 5001;

#[derive(Deserialize)]
pub struct TokenRequest {
    /// Supabase JWT. Empty or absent for guest access.
    pub jwt: Option<String>,
}

#[derive(Serialize)]
pub struct TokenResponse {
    /// Base64-encoded ConnectToken (2048 bytes decoded).
    pub token: String,
    /// The WebSocket URL the client should connect to.
    pub server_url: String,
    /// The WebTransport (HTTPS/QUIC) URL. Empty if WT is not available.
    pub server_wt_url: String,
    /// SHA-256 certificate digest (hex, 64 chars). Empty if using a trusted cert.
    pub cert_digest: String,
}

/// `POST /api/v1/auth/game-token`
///
/// Validates the optional JWT, generates a Netcode `ConnectToken`, and returns
/// it along with the game server address. The returned URLs use the same hostname
/// the client used to reach this endpoint (from the Host header), so they work
/// correctly in both local dev (`localhost`) and production (`kbve.com`).
pub async fn game_token_handler(
    headers: HeaderMap,
    Json(req): Json<TokenRequest>,
) -> Result<Json<TokenResponse>, (StatusCode, String)> {
    let private_key = net_config::load_private_key();
    let protocol_id = net_config::KBVE_PROTOCOL_ID;

    // Extract hostname from the request's Host header so returned URLs
    // match what the client used to reach us (localhost, kbve.com, etc.).
    let request_host = extract_hostname(&headers);

    // Determine WS/WT ports from env or defaults
    let ws_port: u16 = std::env::var("GAME_WS_ADDR")
        .ok()
        .and_then(|s| s.rsplit_once(':').and_then(|(_, p)| p.parse().ok()))
        .unwrap_or(DEFAULT_WS_PORT);
    let wt_port: u16 = std::env::var("GAME_WT_ADDR")
        .ok()
        .and_then(|s| s.rsplit_once(':').and_then(|(_, p)| p.parse().ok()))
        .unwrap_or(DEFAULT_WT_PORT);

    // The address embedded in the ConnectToken — what the Netcode client
    // actually connects to. Must be a reachable address (not 0.0.0.0).
    // Use the request hostname resolved to an IP + the WS port.
    let game_addr: SocketAddr = format!("{request_host}:{ws_port}")
        .parse()
        .or_else(|_| {
            // Hostname might not parse as SocketAddr directly (e.g. "localhost:5000")
            // Resolve it: for localhost, use 127.0.0.1
            use std::net::ToSocketAddrs;
            format!("{request_host}:{ws_port}")
                .to_socket_addrs()
                .ok()
                .and_then(|mut addrs| addrs.next())
                .ok_or("failed to resolve")
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("cannot resolve game address {request_host}:{ws_port}: {e}"),
            )
        })?;

    // Determine client_id and user_data from JWT
    let (client_id, user_data) = match req.jwt.as_deref() {
        Some(jwt) if !jwt.is_empty() => {
            let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
            if jwt_secret.is_empty() {
                // Dev mode: no JWT secret configured, accept anything
                let cid = rand::random::<u64>().max(1);
                (cid, [0u8; 256])
            } else {
                let token_data = crate::auth::validate_token(jwt, &jwt_secret)
                    .map_err(|e| (StatusCode::UNAUTHORIZED, format!("JWT invalid: {e}")))?;
                let user_id = &token_data.claims.sub;
                let cid = net_config::user_id_to_client_id(user_id);
                let ud = net_config::pack_user_data(user_id);
                (cid, ud)
            }
        }
        _ => {
            // Guest: random client_id, empty user_data
            let cid = rand::random::<u64>().max(1);
            (cid, [0u8; 256])
        }
    };

    let token = ConnectToken::build(game_addr, protocol_id, client_id, private_key)
        .user_data(user_data)
        .expire_seconds(120)
        .timeout_seconds(15)
        .generate()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("token generation failed: {e}"),
            )
        })?;

    let b64 =
        net_config::token_to_base64(token).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Build URLs using the request hostname so they work for the client
    let server_url = format!("wss://{request_host}:{ws_port}");

    let cert_digest = super::get_cert_digest().to_owned();
    let server_wt_url = if super::is_wt_enabled() {
        format!("https://{request_host}:{wt_port}")
    } else {
        String::new()
    };

    tracing::info!(
        "[game-token] issuing token: ws_url={server_url} wt_url={} digest_len={} host={request_host}",
        if server_wt_url.is_empty() {
            "<empty>"
        } else {
            &server_wt_url
        },
        cert_digest.len(),
    );

    Ok(Json(TokenResponse {
        token: b64,
        server_url,
        server_wt_url,
        cert_digest,
    }))
}

/// Extract just the hostname (no port) from the request's Host header.
/// Falls back to "localhost" if not present.
fn extract_hostname(headers: &HeaderMap) -> String {
    headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .map(|h| {
            // Strip port if present (e.g., "localhost:3080" → "localhost")
            h.split(':').next().unwrap_or(h).to_string()
        })
        .unwrap_or_else(|| "localhost".to_string())
}
