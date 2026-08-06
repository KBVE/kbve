use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use simgrid::auth::{TokenVerifier, VerifiedUser};

pub const GUEST_PREFIX: &str = "guest-";

/// Accepts Supabase tokens (HS256 + ES256/JWKS) and, when guests are enabled,
/// mints a server-owned identity for an empty token.
pub struct HerbmailVerifier {
    inner: Option<jedi::jwks::JwtVerifier>,
    allow_guests: bool,
    next_guest: AtomicU64,
}

#[async_trait::async_trait]
impl TokenVerifier for HerbmailVerifier {
    async fn verify(&self, token: &str) -> Result<VerifiedUser, String> {
        if token.is_empty() {
            if !self.allow_guests {
                return Err("missing session token".into());
            }
            let n = self.next_guest.fetch_add(1, Ordering::Relaxed);
            return Ok(VerifiedUser {
                sub: String::new(),
                kbve_username: format!("{GUEST_PREFIX}{n:04}"),
            });
        }
        let Some(inner) = &self.inner else {
            return Err("no token verifier configured".into());
        };
        let claims: simgrid::auth::SupabaseClaims =
            inner.verify(token).map_err(|e| e.to_string())?;
        if claims.kbve_username.is_empty() {
            return Err("token missing kbve_username".into());
        }
        if claims.kbve_username.starts_with(GUEST_PREFIX) {
            return Err("account name may not use the guest prefix".into());
        }
        Ok(VerifiedUser {
            sub: claims.sub,
            kbve_username: claims.kbve_username,
        })
    }
}

#[cfg(test)]
impl HerbmailVerifier {
    fn guests_only() -> Self {
        Self {
            inner: None,
            allow_guests: true,
            next_guest: AtomicU64::new(1),
        }
    }

    fn accounts_only() -> Self {
        Self {
            inner: None,
            allow_guests: false,
            next_guest: AtomicU64::new(1),
        }
    }
}

pub fn guests_enabled() -> bool {
    std::env::var("HM_ALLOW_GUESTS")
        .map(|v| !matches!(v.trim(), "0" | "false" | "off"))
        .unwrap_or(true)
}

pub async fn build(allow_guests: bool) -> (Option<Arc<dyn TokenVerifier>>, &'static str) {
    let jwks_uri = std::env::var("SUPABASE_JWKS_URI")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::var("SUPABASE_URL").ok().and_then(|u| {
                let u = u.trim().trim_end_matches('/');
                (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
            })
        });

    let inner = match jwks_uri {
        Some(uri) => {
            let secret = std::env::var("SUPABASE_JWT_SECRET")
                .ok()
                .filter(|s| !s.is_empty());
            let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                .ok()
                .filter(|s| !s.trim().is_empty());
            let v = jedi::jwks::JwtVerifier::new(
                uri,
                secret.as_deref().map(str::as_bytes),
                issuer,
                None,
            );
            v.start(std::time::Duration::from_secs(300)).await;
            Some(v)
        }
        None => None,
    };

    let mode = match (inner.is_some(), allow_guests) {
        (true, true) => "supabase accept-both + guests",
        (true, false) => "supabase accept-both, accounts only",
        (false, true) => "guests only (no JWKS configured)",
        (false, false) => "dev-accept (no JWKS, guests disabled)",
    };

    if inner.is_none() && !allow_guests {
        return (None, mode);
    }

    let verifier: Arc<dyn TokenVerifier> = Arc::new(HerbmailVerifier {
        inner,
        allow_guests,
        next_guest: AtomicU64::new(1),
    });
    (Some(verifier), mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mints_a_distinct_guest_per_empty_token() {
        let v = HerbmailVerifier::guests_only();
        let a = v.verify("").await.expect("guest admitted");
        let b = v.verify("").await.expect("guest admitted");
        assert!(a.kbve_username.starts_with(GUEST_PREFIX));
        assert!(b.kbve_username.starts_with(GUEST_PREFIX));
        assert_ne!(a.kbve_username, b.kbve_username);
    }

    #[tokio::test]
    async fn guest_identity_is_server_owned_not_client_supplied() {
        let v = HerbmailVerifier::guests_only();
        let user = v.verify("").await.expect("guest admitted");
        assert!(user.sub.is_empty());
        assert_eq!(user.kbve_username, format!("{GUEST_PREFIX}0001"));
    }

    #[tokio::test]
    async fn rejects_an_empty_token_when_guests_are_disabled() {
        let v = HerbmailVerifier::accounts_only();
        assert!(v.verify("").await.is_err());
    }

    #[tokio::test]
    async fn rejects_a_real_token_when_no_verifier_is_configured() {
        let v = HerbmailVerifier::guests_only();
        assert!(v.verify("a.b.c").await.is_err());
    }
}
