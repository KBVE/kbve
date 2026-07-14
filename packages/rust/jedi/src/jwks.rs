//! Local Supabase JWT verification for the HS256 -> ES256 migration.
//!
//! Verifies a bearer token against BOTH the legacy HS256 shared secret AND the
//! ES256 keys published at GoTrue's JWKS endpoint, so every consumer (kbve-gate,
//! simgrid, axum-kbve) can accept either while the stack rotates its signing key.
//! One tested path instead of a hand-rolled decoder per service.
//!
//! Construct once, `start()` a background refresh, then `verify::<Claims>()` on
//! the hot path. Returns the deserialized claims (not `TokenData`) so callers do
//! not have to share a `jsonwebtoken` version.

use std::sync::{Arc, RwLock};
use std::time::Duration;

use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Header, Validation, decode, decode_header};
use serde::de::DeserializeOwned;

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("token expired")]
    Expired,
    #[error("no verification key for alg {0:?} kid {1:?}")]
    NoKey(Algorithm, Option<String>),
    #[error("invalid token: {0}")]
    Invalid(String),
    #[error("jwks fetch failed: {0}")]
    Fetch(String),
}

/// Verifier config + cached JWKS. Cheap to clone (shares one `Arc`).
#[derive(Clone)]
pub struct JwtVerifier {
    inner: Arc<Inner>,
}

struct Inner {
    hs256: Option<DecodingKey>,
    jwks_uri: String,
    issuer: Option<String>,
    audience: Option<String>,
    http: reqwest::Client,
    jwks: RwLock<Arc<JwkSet>>,
}

impl JwtVerifier {
    /// `hs256_secret` is the legacy symmetric secret (pass `None` once HS256 is
    /// retired). `jwks_uri` is GoTrue's `/.well-known/jwks.json`. Issuer/audience
    /// are validated only when set.
    pub fn new(
        jwks_uri: impl Into<String>,
        hs256_secret: Option<&[u8]>,
        issuer: Option<String>,
        audience: Option<String>,
    ) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("jwt verifier http client");
        Self {
            inner: Arc::new(Inner {
                hs256: hs256_secret
                    .filter(|s| !s.is_empty())
                    .map(DecodingKey::from_secret),
                jwks_uri: jwks_uri.into(),
                issuer: issuer.filter(|s| !s.trim().is_empty()),
                audience: audience.filter(|s| !s.trim().is_empty()),
                http,
                jwks: RwLock::new(Arc::new(JwkSet { keys: Vec::new() })),
            }),
        }
    }

    /// Fetch the JWKS from GoTrue and swap it into the cache.
    pub async fn refresh(&self) -> Result<(), VerifyError> {
        let set: JwkSet = self
            .inner
            .http
            .get(&self.inner.jwks_uri)
            .send()
            .await
            .map_err(|e| VerifyError::Fetch(e.to_string()))?
            .error_for_status()
            .map_err(|e| VerifyError::Fetch(e.to_string()))?
            .json()
            .await
            .map_err(|e| VerifyError::Fetch(e.to_string()))?;
        *self.inner.jwks.write().unwrap() = Arc::new(set);
        Ok(())
    }

    /// Fetch once, then refresh every `interval` in the background. Non-fatal:
    /// a failed initial fetch is logged, not returned — during the HS256->ES256
    /// transition HS256 tokens still verify and ES256 keys are picked up on the
    /// next refresh. Callers needing a guaranteed key should call `refresh`.
    pub async fn start(&self, interval: Duration) {
        if let Err(e) = self.refresh().await {
            tracing::warn!(error = %e, "initial jwks fetch failed; HS256 still verifies, will retry");
        }
        let me = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(interval).await;
                if let Err(e) = me.refresh().await {
                    tracing::warn!(error = %e, "jwks refresh failed; serving cached keys");
                }
            }
        });
    }

    /// Verify and deserialize claims. HS256 uses the shared secret; ES256 selects
    /// the JWKS key by `kid`. Validates exp (+ issuer/audience when configured).
    pub fn verify<T: DeserializeOwned>(&self, token: &str) -> Result<T, VerifyError> {
        let header = decode_header(token).map_err(|e| VerifyError::Invalid(e.to_string()))?;
        let key = self.key_for(&header)?;
        let mut validation = Validation::new(header.alg);
        validation.validate_exp = true;
        validation.validate_aud = self.inner.audience.is_some();
        if let Some(aud) = &self.inner.audience {
            validation.set_audience(&[aud]);
        }
        if let Some(iss) = &self.inner.issuer {
            validation.set_issuer(&[iss]);
        }
        decode::<T>(token, &key, &validation)
            .map(|data| data.claims)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => VerifyError::Expired,
                _ => VerifyError::Invalid(e.to_string()),
            })
    }

    fn key_for(&self, header: &Header) -> Result<DecodingKey, VerifyError> {
        match header.alg {
            Algorithm::HS256 => self
                .inner
                .hs256
                .clone()
                .ok_or_else(|| VerifyError::NoKey(Algorithm::HS256, header.kid.clone())),
            Algorithm::ES256 => {
                let kid = header
                    .kid
                    .clone()
                    .ok_or(VerifyError::NoKey(Algorithm::ES256, None))?;
                let set = self.inner.jwks.read().unwrap().clone();
                let jwk = set
                    .find(&kid)
                    .ok_or_else(|| VerifyError::NoKey(Algorithm::ES256, Some(kid.clone())))?;
                DecodingKey::from_jwk(jwk).map_err(|e| VerifyError::Invalid(e.to_string()))
            }
            other => Err(VerifyError::NoKey(other, header.kid.clone())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct TestClaims {
        sub: String,
        exp: i64,
    }

    const ES256_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgcQKUcXyjWM4V3Gsv
hgr4Y9UmEnfYaHnLNsULig02JTKhRANCAASPauAQkujSBFsB4Du7tolD77HvIP7k
yyfz2pDnPyf9CnGecKIzKxs/kG+/eRJw5squYKKhDR+TX5jIMpMfiiVf
-----END PRIVATE KEY-----
";
    const ES256_JWKS: &str = r#"{"keys":[{"kty":"EC","crv":"P-256","x":"j2rgEJLo0gRbAeA7u7aJQ--x7yD-5Msn89qQ5z8n_Qo","y":"cZ5wojMrGz-Qb795EnDmyq5goqENH5NfmMgykx-KJV8","kid":"test-es256","alg":"ES256","use":"sig"}]}"#;

    fn future() -> i64 {
        chrono::Utc::now().timestamp() + 3600
    }

    fn sign(alg: Algorithm, kid: Option<&str>, key: &EncodingKey, sub: &str) -> String {
        let mut header = Header::new(alg);
        header.kid = kid.map(String::from);
        let claims = TestClaims {
            sub: sub.into(),
            exp: future(),
        };
        encode(&header, &claims, key).unwrap()
    }

    fn with_jwks(v: &JwtVerifier) {
        let set: JwkSet = serde_json::from_str(ES256_JWKS).unwrap();
        *v.inner.jwks.write().unwrap() = Arc::new(set);
    }

    #[test]
    fn hs256_roundtrip() {
        let secret = b"legacy-shared-secret";
        let v = JwtVerifier::new("http://unused", Some(secret), None, None);
        let token = sign(
            Algorithm::HS256,
            None,
            &EncodingKey::from_secret(secret),
            "u1",
        );
        let got: TestClaims = v.verify(&token).unwrap();
        assert_eq!(got.sub, "u1");
    }

    #[test]
    fn es256_roundtrip_via_jwks() {
        let v = JwtVerifier::new("http://unused", None, None, None);
        with_jwks(&v);
        let key = EncodingKey::from_ec_pem(ES256_PEM.as_bytes()).unwrap();
        let token = sign(Algorithm::ES256, Some("test-es256"), &key, "u2");
        let got: TestClaims = v.verify(&token).unwrap();
        assert_eq!(got.sub, "u2");
    }

    #[test]
    fn dual_key_accepts_both() {
        let secret = b"legacy-shared-secret";
        let v = JwtVerifier::new("http://unused", Some(secret), None, None);
        with_jwks(&v);
        let hs = sign(
            Algorithm::HS256,
            None,
            &EncodingKey::from_secret(secret),
            "hs",
        );
        let es = sign(
            Algorithm::ES256,
            Some("test-es256"),
            &EncodingKey::from_ec_pem(ES256_PEM.as_bytes()).unwrap(),
            "es",
        );
        assert_eq!(v.verify::<TestClaims>(&hs).unwrap().sub, "hs");
        assert_eq!(v.verify::<TestClaims>(&es).unwrap().sub, "es");
    }

    #[test]
    fn es256_unknown_kid_rejected() {
        let v = JwtVerifier::new("http://unused", None, None, None);
        let key = EncodingKey::from_ec_pem(ES256_PEM.as_bytes()).unwrap();
        let token = sign(Algorithm::ES256, Some("missing"), &key, "x");
        assert!(matches!(
            v.verify::<TestClaims>(&token),
            Err(VerifyError::NoKey(Algorithm::ES256, _))
        ));
    }

    #[test]
    fn hs256_rejected_when_secret_absent() {
        let v = JwtVerifier::new("http://unused", None, None, None);
        let token = sign(Algorithm::HS256, None, &EncodingKey::from_secret(b"x"), "x");
        assert!(matches!(
            v.verify::<TestClaims>(&token),
            Err(VerifyError::NoKey(Algorithm::HS256, _))
        ));
    }
}
