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

        // Read rather than hardcoded, and unset by default, which is what every
        // other service that verifies these tokens already does.
        //
        // It used to pin `supabase`, and that was true of the legacy HS256 keys
        // -- the anon key the client still carries decodes to exactly that. The
        // move to ES256 changed what GoTrue stamps: `GOTRUE_JWT_ISSUER` is the
        // project URL now, so every real account token carried an issuer this
        // server refused. The verifier only checks the claim when it is given
        // one, so a stale literal here rejected every signed-in player while
        // guests, who verify nothing, walked straight in.
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
            "account joins enabled"
        );
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

    /// What GoTrue puts in `iss`, from `GOTRUE_JWT_ISSUER` in the auth manifest.
    const GOTRUE_ISSUER: &str = "https://supabase.kbve.com/auth/v1";
    /// What the legacy HS256 keys carried, and what this file used to demand.
    const LEGACY_ISSUER: &str = "supabase";
    const SECRET: &[u8] = b"a-test-secret-that-is-long-enough-for-hs256";

    /// An HS256 token, so the verifier needs neither JWKS nor a network.
    fn token(issuer: &str) -> String {
        #[derive(serde::Serialize)]
        struct Body {
            iss: String,
            exp: i64,
            kbve_username: String,
        }
        jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
            &Body {
                iss: issuer.to_owned(),
                exp: 4_102_444_800,
                kbve_username: "h0lybyte".to_owned(),
            },
            &jsonwebtoken::EncodingKey::from_secret(SECRET),
        )
        .expect("failed to mint a test token")
    }

    fn verifier(issuer: Option<&str>) -> JwtVerifier {
        JwtVerifier::new(
            "https://example.invalid/jwks.json".to_owned(),
            Some(SECRET),
            issuer.map(str::to_owned),
            None,
        )
    }

    /// The bug this file had: a real account token was refused because the issuer
    /// it carries stopped being the one pinned here.
    ///
    /// Guests never reach a verifier, so the whole failure landed on signed-in
    /// players only -- which is what made it read as accounts being unsupported
    /// rather than as a claim mismatch.
    #[test]
    fn pinning_the_legacy_issuer_refuses_a_real_token() {
        let refused = verifier(Some(LEGACY_ISSUER)).verify::<Claims>(&token(GOTRUE_ISSUER));
        assert!(
            refused.is_err(),
            "this is the regression: pinning `{LEGACY_ISSUER}` has to reject a \
             token issued by `{GOTRUE_ISSUER}`, or the test proves nothing"
        );
    }

    /// Unset is the default, and matches every other service that verifies these
    /// tokens.
    #[test]
    fn leaving_the_issuer_unset_accepts_what_gotrue_issues() {
        let got: Claims = verifier(None)
            .verify(&token(GOTRUE_ISSUER))
            .expect("a token GoTrue would issue must verify");
        assert_eq!(got.kbve_username, "h0lybyte");
    }

    /// Pinning still has to work, or the env knob is decoration.
    #[test]
    fn pinning_the_issuer_gotrue_uses_accepts_it() {
        let got: Claims = verifier(Some(GOTRUE_ISSUER))
            .verify(&token(GOTRUE_ISSUER))
            .expect("pinning the issuer GoTrue uses must accept its tokens");
        assert_eq!(got.kbve_username, "h0lybyte");
        assert!(
            verifier(Some(GOTRUE_ISSUER))
                .verify::<Claims>(&token("https://somewhere.else/auth/v1"))
                .is_err(),
            "a pinned issuer that accepts anything is not pinned"
        );
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
