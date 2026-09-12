//! Who is asking to play.
//!
//! Two kinds of player reach this server. A signed-in one arrives with a
//! Supabase access token and keeps their KBVE username; a guest arrives with
//! nothing and is given a name for the session. Both end up as an `Identity`,
//! and nothing downstream needs to care which it was except to badge the name.
//!
//! Shaped after `apps/agones/friendslop/server/src/auth.rs`, including the trap
//! it documents: pinning the issuer to a literal rejects every real account
//! while guests -- who verify nothing -- walk straight in, so the issuer is read
//! from the environment and left unset by default.

use std::time::Duration;

use jedi::auth::jwks::{JwtVerifier, VerifyError};
use serde::Deserialize;

/// Only the claim this server acts on.
#[derive(Deserialize)]
struct Claims {
    #[serde(default)]
    kbve_username: String,
}

/// A player, however they got here.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Identity {
    /// What other players see above the character.
    pub name: String,
    /// True when no account was presented.
    pub guest: bool,
}

impl Identity {
    /// A fresh guest.
    ///
    /// The suffix is the tail of a ULID: short enough to read on a nameplate,
    /// wide enough that two testers in the same session are not both `guest`.
    /// Nothing about a guest is stored -- close the tab and the name is gone --
    /// which is the whole point of letting randoms in to try the build.
    pub fn guest() -> Self {
        let id = ulid::Ulid::new().to_string();
        let tail = &id[id.len() - 6..];
        Self {
            name: format!("guest-{}", tail.to_lowercase()),
            guest: true,
        }
    }
}

/// Verifies Supabase access tokens, when the server is configured to accept any.
pub struct Accounts {
    verifier: JwtVerifier,
}

impl Accounts {
    /// Builds from the environment, or `None` when no issuer is configured --
    /// in which case the server runs guests-only rather than pretending to
    /// check tokens it has no key for.
    pub async fn from_env() -> Option<Self> {
        let jwks_uri = std::env::var("SUPABASE_JWKS_URI").ok().or_else(|| {
            std::env::var("SUPABASE_URL").ok().map(|base| {
                format!(
                    "{}/auth/v1/.well-known/jwks.json",
                    base.trim_end_matches('/')
                )
            })
        })?;

        // Unset by default. GoTrue stamps the project URL as `iss` since the
        // ES256 move, so a hardcoded literal here rejects every signed-in
        // player -- and only signed-in players, because a guest presents no
        // token at all, which makes the break look like an account bug.
        let issuer = std::env::var("SUPABASE_JWT_ISSUER")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let verifier = JwtVerifier::new(
            jwks_uri.clone(),
            std::env::var("SUPABASE_JWT_SECRET")
                .ok()
                .as_deref()
                .map(str::as_bytes),
            issuer.clone(),
            None,
        );
        verifier.start(Duration::from_secs(3600)).await;
        tracing::info!(
            %jwks_uri,
            issuer = issuer.as_deref().unwrap_or("<any>"),
            "[mmorpg-server/auth] account joins enabled"
        );
        Some(Self { verifier })
    }

    /// Resolve a bearer token into an identity.
    pub fn verify(&self, token: &str) -> Result<Identity, String> {
        let claims: Claims = self.verifier.verify(token).map_err(reason_for)?;
        let name = claims.kbve_username.trim();
        if name.is_empty() {
            // A verified account the username hook has not stamped yet. Refused
            // rather than silently demoted to a guest, so the player is told to
            // fix it instead of wondering why their character has no name.
            return Err("this account has no username yet".to_owned());
        }
        Ok(Identity {
            name: name.to_owned(),
            guest: false,
        })
    }
}

/// Resolve whoever is asking, falling back to a guest.
///
/// A bad token is an error rather than a quiet guest login: someone who meant to
/// bring their character wants to know their session expired, not to be handed a
/// stranger's nameplate and their own confusion.
pub fn resolve(accounts: Option<&Accounts>, token: Option<&str>) -> Result<Identity, String> {
    match (accounts, token) {
        (Some(accounts), Some(token)) if !token.trim().is_empty() => accounts.verify(token),
        (None, Some(token)) if !token.trim().is_empty() => {
            Err("this server is not configured to accept accounts".to_owned())
        }
        _ => Ok(Identity::guest()),
    }
}

/// Reasons are read by a player on a screen, so they say what to do about it and
/// nothing about why the signature failed.
fn reason_for(error: VerifyError) -> String {
    match error {
        VerifyError::Expired => "session expired — sign in again".to_owned(),
        other => {
            tracing::debug!(error = %other, "[mmorpg-server/auth] rejected token");
            "sign-in was not accepted".to_owned()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_guest_gets_a_readable_unique_name() {
        let a = Identity::guest();
        let b = Identity::guest();
        assert!(a.guest && b.guest);
        assert!(a.name.starts_with("guest-"), "{}", a.name);
        assert_eq!(a.name.len(), "guest-".len() + 6);
        assert_ne!(a.name, b.name, "two guests in one session must differ");
    }

    #[test]
    fn no_token_is_a_guest_rather_than_a_rejection() {
        let who = resolve(None, None).expect("a player with no token is a guest");
        assert!(who.guest);
    }

    #[test]
    fn an_empty_token_is_a_guest_not_a_failed_account() {
        // The client sends "" when nobody is signed in; that is the guest path,
        // not a malformed credential.
        let who = resolve(None, Some("   ")).expect("blank token is a guest");
        assert!(who.guest);
    }

    #[test]
    fn a_token_against_a_server_with_no_issuer_is_refused() {
        // Silently demoting this to a guest would hand a signed-in player
        // someone else's nameplate and no explanation.
        let err = resolve(None, Some("ey.not.a.real.token")).unwrap_err();
        assert!(err.contains("not configured"), "{err}");
    }
}
