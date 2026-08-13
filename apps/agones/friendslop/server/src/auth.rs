//! Account identity for joining players.

use std::sync::Arc;
use std::time::Duration;

use jedi::jwks::{JwtVerifier, VerifyError};
use q::net::session::TokenAuthority;
use serde::Deserialize;

/// Only the claims this server acts on.
#[derive(Deserialize)]
struct Claims {
    #[serde(default)]
    kbve_username: String,
}

pub struct SupabaseAuthority {
    verifier: JwtVerifier,
}

impl SupabaseAuthority {
    /// Builds from the environment, or `None` when no issuer is configured — in which
    /// case the server runs guests-only rather than pretending to check tokens it has
    /// no key for.
    pub async fn from_env() -> Option<Self> {
        let jwks_uri = std::env::var("SUPABASE_JWKS_URI").ok().or_else(|| {
            std::env::var("SUPABASE_URL").ok().map(|base| {
                format!(
                    "{}/auth/v1/.well-known/jwks.json",
                    base.trim_end_matches('/')
                )
            })
        })?;

        let verifier = JwtVerifier::new(
            jwks_uri.clone(),
            std::env::var("SUPABASE_JWT_SECRET")
                .ok()
                .as_deref()
                .map(str::as_bytes),
            Some("supabase".to_owned()),
            None,
        );
        verifier.start(Duration::from_secs(3600)).await;
        tracing::info!(%jwks_uri, "account joins enabled");
        Some(Self { verifier })
    }

    pub fn shared(self) -> Arc<dyn TokenAuthority> {
        Arc::new(self)
    }
}

impl TokenAuthority for SupabaseAuthority {
    fn verify(&self, token: &str) -> Result<String, String> {
        let claims: Claims = self.verifier.verify(token).map_err(reason_for)?;
        name_in(claims)
    }
}

/// Reasons are read by a player on a HUD, so they say what to do about it and nothing
/// about why the signature failed.
fn reason_for(error: VerifyError) -> String {
    match error {
        VerifyError::Expired => "session expired — sign in again".to_owned(),
        other => {
            tracing::debug!(error = %other, "rejected token");
            "sign-in was not accepted".to_owned()
        }
    }
}

/// An account with no `kbve_username` is a real, verified account that the username
/// hook has not stamped yet.
fn name_in(claims: Claims) -> Result<String, String> {
    if claims.kbve_username.trim().is_empty() {
        return Err("this account has no username yet".to_owned());
    }
    Ok(claims.kbve_username)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(username: &str) -> Claims {
        Claims {
            kbve_username: username.to_owned(),
        }
    }

    #[test]
    fn a_stamped_username_is_the_name() {
        assert_eq!(name_in(claims("h0lybyte")).unwrap(), "h0lybyte");
    }

    #[test]
    fn an_unstamped_account_is_told_what_is_wrong() {
        let reason = name_in(claims("   ")).unwrap_err();
        assert!(reason.contains("username"), "{reason}");
        assert!(
            !reason.contains("not accepted"),
            "reads as a bad password: {reason}"
        );
    }

    /// An expired session is the one failure a player can fix themselves, so it is the
    /// one that does not get the generic answer.
    #[test]
    fn expiry_is_distinguished_from_rejection() {
        assert!(reason_for(VerifyError::Expired).contains("expired"));
        assert_eq!(
            reason_for(VerifyError::Invalid("signature".into())),
            "sign-in was not accepted",
            "nothing about the signature reaches the client"
        );
    }
}
