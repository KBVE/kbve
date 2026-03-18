//! HTTP endpoint for issuing Netcode [`ConnectToken`]s.
//!
//! The client calls `POST /api/v1/auth/game-token` with an optional Supabase
//! JWT. The server verifies the JWT (if present), generates a time-limited
//! `ConnectToken`, and returns it base64-encoded so the client can establish
//! a Netcode connection to the game server.

use axum::Json;
use axum::http::StatusCode;
use lightyear::netcode::ConnectToken;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use bevy_kbve_net::net_config;

/// Default game server address for token generation.
/// Must match the address the game server is listening on.
const DEFAULT_GAME_ADDR: &str = "127.0.0.1:5000";

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
}

/// `POST /api/v1/auth/game-token`
///
/// Validates the optional JWT, generates a Netcode `ConnectToken`, and returns
/// it along with the game server address.
pub async fn game_token_handler(
    Json(req): Json<TokenRequest>,
) -> Result<Json<TokenResponse>, (StatusCode, String)> {
    let private_key = net_config::load_private_key();
    let protocol_id = net_config::KBVE_PROTOCOL_ID;

    // The address embedded in the token — what the client connects to.
    let game_addr: SocketAddr = std::env::var("GAME_WS_ADDR")
        .unwrap_or_else(|_| DEFAULT_GAME_ADDR.to_string())
        .parse()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("bad GAME_WS_ADDR: {e}"),
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

    // Build the WebSocket URL for the client
    let server_url = format!("ws://{game_addr}");

    Ok(Json(TokenResponse {
        token: b64,
        server_url,
    }))
}
