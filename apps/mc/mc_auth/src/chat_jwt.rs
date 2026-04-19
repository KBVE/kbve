//! Short-lived HS256 JWT minting for the `/minechat` gateway endpoint.
//!
//! Trust model:
//!
//! 1. The MC server is the only component that can prove a session is
//!    Mojang-authenticated (Velocity forwards the verified session; the
//!    backend Fabric server runs offline-mode and trusts that forward).
//! 2. `mc_auth` owns the linking ceremony that writes rows into
//!    `mc.auth_links`. Once the ceremony has run, the (mc_uuid,
//!    mc_username) pair is the ground truth for that player's identity on
//!    our network.
//! 3. This module hands out signed tokens stating "player X is allowed to
//!    speak as `mc_uuid` with `mc_username` until `exp`". The irc-gateway
//!    verifies with the same shared secret and uses the claims to set the
//!    IRC nick without re-running Mojang auth.
//!
//! The signing key is mounted as an env var from a Kubernetes Secret that
//! is itself synced from the canonical `kilobase/mc-chat-jwt` source via
//! ExternalSecrets. Rotating the kilobase secret rotates here on the next
//! Fleet pod restart.

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Env var that holds the HS256 signing key bytes (raw UTF-8, treated as
/// opaque bytes by `jsonwebtoken::EncodingKey::from_secret`).
const SIGNING_KEY_ENV: &str = "MC_CHAT_JWT_SIGNING_KEY";

/// Token lifetime. Short enough that a revoked link propagates quickly;
/// long enough that players don't need to re-request on every reconnect.
const TOKEN_TTL_SECS: u64 = 5 * 60;

/// Issuer claim — identifies the MC server as the originator.
const ISSUER: &str = "mc-auth";

/// Audience claim — consumed by the irc-gateway `/minechat` route. The
/// gateway rejects tokens that were issued for a different audience so a
/// leaked minechat token can't be replayed against an unrelated service.
const AUDIENCE: &str = "minechat";

/// Errors surfaced to the Java caller (and ultimately the player) when a
/// token can't be produced.
#[derive(Debug)]
pub enum MintError {
    /// `MC_CHAT_JWT_SIGNING_KEY` isn't set or is empty. Typical right
    /// after a deploy while the ExternalSecret is still propagating.
    KeyMissing,
    /// The underlying JWT encoder failed. Treated as an internal error.
    Signing(jsonwebtoken::errors::Error),
    /// The system clock is before the UNIX epoch. Something is very
    /// wrong with the node, but we don't want to panic inside a JNI call.
    Clock,
}

impl std::fmt::Display for MintError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::KeyMissing => f.write_str("chat signing key is not configured on this server"),
            Self::Signing(e) => write!(f, "failed to sign chat token: {e}"),
            Self::Clock => f.write_str("system clock is before UNIX epoch"),
        }
    }
}

impl std::error::Error for MintError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Signing(e) => Some(e),
            _ => None,
        }
    }
}

impl From<jsonwebtoken::errors::Error> for MintError {
    fn from(e: jsonwebtoken::errors::Error) -> Self {
        Self::Signing(e)
    }
}

/// Claims payload. Field order mirrors a typical Supabase JWT so the
/// gateway-side validator can share logic if we ever consolidate.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatClaims {
    /// JWT subject — the player's Mojang UUID in canonical hyphenated form.
    pub sub: String,
    /// MC username at the time of mint. Informational — the gateway binds
    /// the session nick to this value.
    pub mc_username: String,
    /// Fixed issuer string so the gateway can disambiguate between
    /// MC-minted and (future) bot-minted tokens.
    pub iss: String,
    /// Fixed audience. Rejected if it doesn't match on the gateway side.
    pub aud: String,
    /// Issued-at, seconds since UNIX epoch.
    pub iat: u64,
    /// Expiry, seconds since UNIX epoch.
    pub exp: u64,
}

/// Mint a fresh HS256 token for a linked player. Returns the compact JWT
/// string ready to be whispered back to the player.
pub fn mint(mc_uuid: &str, mc_username: &str) -> Result<String, MintError> {
    let key = match std::env::var(SIGNING_KEY_ENV) {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return Err(MintError::KeyMissing),
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| MintError::Clock)?
        .as_secs();

    let claims = ChatClaims {
        sub: mc_uuid.to_string(),
        mc_username: mc_username.to_string(),
        iss: ISSUER.to_string(),
        aud: AUDIENCE.to_string(),
        iat: now,
        exp: now + TOKEN_TTL_SECS,
    };

    let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
    let encoding_key = jsonwebtoken::EncodingKey::from_secret(key.as_bytes());
    let token = jsonwebtoken::encode(&header, &claims, &encoding_key)?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    // These tests set a process-global env var, so they can race with any
    // other test that reads or writes the same env. There aren't any
    // today, and cargo's single-threaded `--test-threads=1` keeps it
    // deterministic if there ever are.

    #[test]
    fn mint_fails_without_key() {
        unsafe {
            std::env::remove_var(SIGNING_KEY_ENV);
        }
        let err = mint("00000000-0000-0000-0000-000000000001", "alice").unwrap_err();
        assert!(matches!(err, MintError::KeyMissing));
    }

    #[test]
    fn mint_produces_decodable_token() {
        const KEY: &str = "test-only-do-not-use-in-prod-0123456789abcdef";
        unsafe {
            std::env::set_var(SIGNING_KEY_ENV, KEY);
        }
        let token = mint("00000000-0000-0000-0000-000000000002", "bob").unwrap();
        assert_eq!(token.matches('.').count(), 2, "JWT should have 3 parts");

        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.set_audience(&["minechat"]);
        validation.set_issuer(&["mc-auth"]);
        let decoded = jsonwebtoken::decode::<ChatClaims>(
            &token,
            &jsonwebtoken::DecodingKey::from_secret(KEY.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(decoded.claims.sub, "00000000-0000-0000-0000-000000000002");
        assert_eq!(decoded.claims.mc_username, "bob");
        assert!(decoded.claims.exp > decoded.claims.iat);

        unsafe {
            std::env::remove_var(SIGNING_KEY_ENV);
        }
    }
}
