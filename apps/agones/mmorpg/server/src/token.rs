//! The HTTP door: `/healthz`, and `POST /token` for a netcode `ConnectToken`.
//!
//! A browser cannot put an Authorization header on a WebSocket, so admission
//! cannot happen on the socket. It happens here: the client asks for a token,
//! presenting a Supabase access token or nothing at all, and gets back a
//! short-lived credential the game port accepts. The guest path is this path
//! with the account half missing.
//!
//! The identity travels *inside* the token, in netcode's `user_data`, rather
//! than in a map on the side. `user_data` is covered by the token's signature,
//! so a client cannot rename itself, and there is no per-connection state to
//! keep -- which matters because a token minted before a rolling update is
//! presented to the pod that comes after it.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use lightyear::netcode::{ConnectToken, USER_DATA_BYTES};
use serde::{Deserialize, Serialize};

use crate::auth::{Accounts, Identity, resolve};

/// How long a minted token stays usable. Long enough to load a 50 MB wasm
/// bundle on a slow connection, short enough that one copied out of a log is
/// worthless by the time it is read.
const TOKEN_TTL_SECS: u64 = 300;

/// How long netcode waits on a connecting client before dropping it.
const CLIENT_TIMEOUT_SECS: i32 = 15;

/// A guest name is prefixed so the sim can tell the two apart without a second
/// field: `user_data` holds one string, and this keeps it one string.
const GUEST_PREFIX: &str = "guest:";
const ACCOUNT_PREFIX: &str = "user:";

#[derive(Clone)]
pub struct HttpState {
    pub accounts: Option<Arc<Accounts>>,
    pub private_key: [u8; 32],
    /// The address the token says to connect to. Inside the cluster this is the
    /// pod's own game port; netcode checks it against where the packet lands.
    pub game_addr: SocketAddr,
    /// What a browser should open. Behind the gateway that is a public `wss://`
    /// URL, which is not derivable from the address the server binds to.
    pub public_ws_url: String,
}

#[derive(Deserialize, Default)]
pub struct TokenRequest {
    /// A Supabase access token, or absent for a guest.
    #[serde(default)]
    pub jwt: Option<String>,
}

#[derive(Serialize)]
pub struct TokenResponse {
    /// base64 `ConnectToken`, handed straight to lightyear.
    pub token: String,
    /// Where to open the socket.
    pub server_url: String,
    /// The name this player will wear.
    pub name: String,
    /// Whether that name was issued rather than owned.
    pub guest: bool,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub fn router(state: HttpState) -> axum::Router {
    axum::Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/token", post(issue))
        .with_state(state)
}

/// Mint a token for whoever is asking.
///
/// The JWT may arrive in the body or as a bearer header: a browser fetch finds
/// the body easier and a curl finds the header easier, and neither needs to be
/// wrong.
async fn issue(
    State(state): State<HttpState>,
    headers: HeaderMap,
    body: Option<Json<TokenRequest>>,
) -> Result<Json<TokenResponse>, (StatusCode, Json<ErrorResponse>)> {
    let from_header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_owned);
    let presented = from_header.or_else(|| body.and_then(|Json(b)| b.jwt));

    let who = resolve(state.accounts.as_deref(), presented.as_deref()).map_err(|reason| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse { error: reason }),
        )
    })?;

    // netcode refuses client id 0, and two players must never share one: a
    // collision would evict whoever connected first.
    let client_id = rand::random::<u64>().max(1);

    let token = ConnectToken::build(
        &[state.game_addr][..],
        mmorpg_net::MMORPG_PROTOCOL_ID,
        client_id,
        state.private_key,
    )
    .user_data(pack_identity(&who))
    .expire_seconds(TOKEN_TTL_SECS as i32)
    .timeout_seconds(CLIENT_TIMEOUT_SECS)
    .generate()
    .map_err(|e| {
        tracing::error!(error = %e, "[mmorpg-server/token] could not mint a token");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "could not issue a token".to_owned(),
            }),
        )
    })?;

    let token = bevy_kbve_net::net_config::token_to_base64(token).map_err(|e| {
        tracing::error!(error = %e, "[mmorpg-server/token] could not encode a token");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "could not issue a token".to_owned(),
            }),
        )
    })?;

    tracing::info!(
        name = %who.name,
        guest = who.guest,
        client_id,
        "[mmorpg-server/token] admitted"
    );

    Ok(Json(TokenResponse {
        token,
        server_url: state.public_ws_url.clone(),
        name: who.name,
        guest: who.guest,
    }))
}

/// Write an identity into the token's signed `user_data`.
fn pack_identity(who: &Identity) -> [u8; USER_DATA_BYTES] {
    let prefix = if who.guest { GUEST_PREFIX } else { ACCOUNT_PREFIX };
    bevy_kbve_net::net_config::pack_user_data(&format!("{prefix}{}", who.name))
}

/// Read back what `pack_identity` wrote.
///
/// Anything unreadable becomes a fresh guest rather than a refusal: the only
/// ways to get here are a token from an older build or one minted before a
/// rolling update, and neither is the player's fault.
pub fn unpack_identity(user_data: &[u8; USER_DATA_BYTES]) -> Identity {
    let Some(raw) = bevy_kbve_net::net_config::unpack_user_data(user_data) else {
        return Identity::guest();
    };
    if let Some(name) = raw.strip_prefix(ACCOUNT_PREFIX) {
        return Identity {
            name: name.to_owned(),
            guest: false,
        };
    }
    if let Some(name) = raw.strip_prefix(GUEST_PREFIX) {
        return Identity {
            name: name.to_owned(),
            guest: true,
        };
    }
    Identity::guest()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_account_survives_the_round_trip() {
        let who = Identity {
            name: "h0lybyte".to_owned(),
            guest: false,
        };
        assert_eq!(unpack_identity(&pack_identity(&who)), who);
    }

    #[test]
    fn a_guest_survives_the_round_trip_still_flagged() {
        let who = Identity::guest();
        let back = unpack_identity(&pack_identity(&who));
        assert_eq!(back, who);
        assert!(back.guest, "a guest must not come back as an account");
    }

    #[test]
    fn a_name_that_looks_like_the_other_prefix_cannot_promote_itself() {
        // A player whose username is literally "guest:nine" is still an account.
        let who = Identity {
            name: "guest:nine".to_owned(),
            guest: false,
        };
        let back = unpack_identity(&pack_identity(&who));
        assert!(!back.guest, "the outer prefix decides, not the name");
        assert_eq!(back.name, "guest:nine");
    }

    #[test]
    fn empty_user_data_is_a_guest_not_a_crash() {
        let back = unpack_identity(&[0u8; USER_DATA_BYTES]);
        assert!(back.guest);
        assert!(back.name.starts_with("guest-"));
    }
}
