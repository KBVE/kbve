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

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Header, Validation, decode, decode_header};
use serde::de::DeserializeOwned;

/// Floor between JWKS refetches triggered by an unknown `kid`, so a flood of
/// bad tokens cannot turn the verifier into a GoTrue load generator.
const MISS_REFRESH_INTERVAL: Duration = Duration::from_secs(30);

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
    /// ES256 keys pre-parsed at refresh time so the hot path is a map lookup,
    /// not a JWK -> DecodingKey rebuild per verification.
    es256: RwLock<Arc<HashMap<String, DecodingKey>>>,
    /// Single-flight gate + rate-limit stamp for refresh-on-unknown-kid.
    miss_refresh: tokio::sync::Mutex<Option<Instant>>,
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
                es256: RwLock::new(Arc::new(HashMap::new())),
                miss_refresh: tokio::sync::Mutex::new(None),
            }),
        }
    }

    /// Fetch the JWKS from GoTrue, pre-parse every key, and swap the key map.
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
        *self.inner.es256.write().unwrap() = Arc::new(build_key_map(&set));
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

    /// `verify`, plus seamless key rotation: an unknown ES256 `kid` triggers one
    /// rate-limited, single-flight JWKS refetch and a retry, so a token signed
    /// by a freshly rotated key does not fail until the next timer tick.
    pub async fn verify_or_refresh<T: DeserializeOwned>(
        &self,
        token: &str,
    ) -> Result<T, VerifyError> {
        let kid = match self.verify(token) {
            Err(VerifyError::NoKey(Algorithm::ES256, Some(kid))) => kid,
            other => return other,
        };
        let mut last = self.inner.miss_refresh.lock().await;
        // A concurrent leader may have already fetched the rotated key while
        // this caller waited on the gate.
        if self.inner.es256.read().unwrap().contains_key(&kid) {
            drop(last);
            return self.verify(token);
        }
        if let Some(t) = *last
            && t.elapsed() < MISS_REFRESH_INTERVAL
        {
            return Err(VerifyError::NoKey(Algorithm::ES256, Some(kid)));
        }
        // Stamp before fetching so a failing upstream is also rate-limited.
        *last = Some(Instant::now());
        if let Err(e) = self.refresh().await {
            tracing::warn!(error = %e, kid, "jwks refresh-on-miss failed");
        }
        drop(last);
        self.verify(token)
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
                let keys = self.inner.es256.read().unwrap().clone();
                keys.get(&kid)
                    .cloned()
                    .ok_or(VerifyError::NoKey(Algorithm::ES256, Some(kid)))
            }
            other => Err(VerifyError::NoKey(other, header.kid.clone())),
        }
    }
}

/// Pre-parse a JWKS into per-`kid` decoding keys. Unusable keys (no `kid`, or
/// an algorithm `jsonwebtoken` cannot build) are skipped with a warning rather
/// than poisoning the whole set.
fn build_key_map(set: &JwkSet) -> HashMap<String, DecodingKey> {
    let mut keys = HashMap::with_capacity(set.keys.len());
    for jwk in &set.keys {
        let Some(kid) = jwk.common.key_id.clone() else {
            tracing::warn!("jwks key without kid skipped");
            continue;
        };
        match DecodingKey::from_jwk(jwk) {
            Ok(key) => {
                keys.insert(kid, key);
            }
            Err(e) => {
                tracing::warn!(error = %e, kid, "unparseable jwks key skipped");
            }
        }
    }
    keys
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::{AtomicUsize, Ordering};

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
        *v.inner.es256.write().unwrap() = Arc::new(build_key_map(&set));
    }

    /// Serve `ES256_JWKS` on an ephemeral port, counting requests.
    async fn jwks_server() -> (String, Arc<AtomicUsize>) {
        use axum::{Router, routing::get};
        let hits = Arc::new(AtomicUsize::new(0));
        let h = hits.clone();
        let app = Router::new().route(
            "/jwks",
            get(move || {
                h.fetch_add(1, Ordering::SeqCst);
                async { ES256_JWKS }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{addr}/jwks"), hits)
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

    // Rotation path: the verifier starts with no keys, so a plain verify fails,
    // but verify_or_refresh fetches the JWKS on the kid miss and succeeds.
    #[tokio::test]
    async fn unknown_kid_triggers_refresh_and_verifies() {
        let (uri, hits) = jwks_server().await;
        let v = JwtVerifier::new(uri, None, None, None);
        let key = EncodingKey::from_ec_pem(ES256_PEM.as_bytes()).unwrap();
        let token = sign(Algorithm::ES256, Some("test-es256"), &key, "rotated");
        assert!(v.verify::<TestClaims>(&token).is_err());
        let got: TestClaims = v.verify_or_refresh(&token).await.unwrap();
        assert_eq!(got.sub, "rotated");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    // A kid the upstream does not serve must not refetch more than once per
    // rate-limit window, no matter how many tokens carry it.
    #[tokio::test]
    async fn missing_kid_refetch_is_rate_limited() {
        let (uri, hits) = jwks_server().await;
        let v = JwtVerifier::new(uri, None, None, None);
        let key = EncodingKey::from_ec_pem(ES256_PEM.as_bytes()).unwrap();
        let token = sign(Algorithm::ES256, Some("never-published"), &key, "x");
        for _ in 0..3 {
            assert!(matches!(
                v.verify_or_refresh::<TestClaims>(&token).await,
                Err(VerifyError::NoKey(Algorithm::ES256, _))
            ));
        }
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }
}
