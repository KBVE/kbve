//! Supabase access-token verification.

use serde::{Deserialize, Serialize};

use jsonwebtoken::{DecodingKey, Validation, decode};

/// Claims the server trusts after a successful Supabase JWT verify.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub exp: i64,
    #[serde(default)]
    pub kbve_username: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub aud: String,
}

#[derive(Debug)]
pub enum AuthError {
    /// `SUPABASE_JWT_SECRET` is empty and strict mode was requested.
    MissingSecret,
    /// `jsonwebtoken` rejected the token (signature, expiry, etc.).
    Invalid(String),
    /// JWT decoded but `kbve_username` claim is missing.
    MissingUsername,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingSecret => write!(f, "SUPABASE_JWT_SECRET is not set"),
            AuthError::Invalid(msg) => write!(f, "invalid token: {msg}"),
            AuthError::MissingUsername => write!(f, "token missing kbve_username claim"),
        }
    }
}

impl std::error::Error for AuthError {}

/// Verify a Supabase access token.
pub fn verify_supabase_jwt(token: &str, secret: &[u8]) -> Result<SupabaseClaims, AuthError> {
    if secret.is_empty() {
        return Err(AuthError::MissingSecret);
    }
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.validate_aud = false;
    let data = decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map_err(|e| AuthError::Invalid(e.to_string()))?;
    if data.claims.kbve_username.is_empty() {
        return Err(AuthError::MissingUsername);
    }
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde_json::json;

    const SECRET: &[u8] = b"a-test-secret-that-is-long-enough";

    /// base64url without padding, which is all a JWT segment is.
    fn b64url(bytes: &[u8]) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = u32::from(b[0]) << 16 | u32::from(b[1]) << 8 | u32::from(b[2]);
            let take = chunk.len() + 1;
            for i in 0..take {
                out.push(ALPHABET[(n >> (18 - 6 * i) & 0x3F) as usize] as char);
            }
        }
        out
    }

    fn in_seconds(offset: i64) -> i64 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        now + offset
    }

    fn token_with(claims: serde_json::Value, secret: &[u8]) -> String {
        encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret),
        )
        .expect("sign")
    }

    fn good_claims() -> serde_json::Value {
        json!({
            "sub": "user-1",
            "exp": in_seconds(3600),
            "kbve_username": "someone",
            "role": "authenticated",
            "aud": "authenticated",
        })
    }

    #[test]
    fn a_signed_token_yields_its_claims() {
        let claims = verify_supabase_jwt(&token_with(good_claims(), SECRET), SECRET).unwrap();
        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.kbve_username, "someone");
        assert_eq!(claims.role, "authenticated");
    }

    #[test]
    fn an_empty_secret_is_refused_rather_than_trusted() {
        let token = token_with(good_claims(), SECRET);
        assert!(matches!(
            verify_supabase_jwt(&token, b""),
            Err(AuthError::MissingSecret)
        ));
    }

    #[test]
    fn a_token_signed_with_another_secret_is_refused() {
        let token = token_with(good_claims(), b"some-other-secret-entirely");
        assert!(matches!(
            verify_supabase_jwt(&token, SECRET),
            Err(AuthError::Invalid(_))
        ));
    }

    #[test]
    fn an_expired_token_is_refused() {
        let mut claims = good_claims();
        claims["exp"] = json!(in_seconds(-3600));
        assert!(matches!(
            verify_supabase_jwt(&token_with(claims, SECRET), SECRET),
            Err(AuthError::Invalid(_))
        ));
    }

    #[test]
    fn a_token_without_a_username_is_not_somebody() {
        let mut claims = good_claims();
        claims["kbve_username"] = json!("");
        assert!(matches!(
            verify_supabase_jwt(&token_with(claims, SECRET), SECRET),
            Err(AuthError::MissingUsername)
        ));

        let mut absent = good_claims();
        absent.as_object_mut().unwrap().remove("kbve_username");
        assert!(matches!(
            verify_supabase_jwt(&token_with(absent, SECRET), SECRET),
            Err(AuthError::MissingUsername)
        ));
    }

    /// The classic JWT forgery: strip the signature and declare there is no algorithm.
    #[test]
    fn an_unsigned_token_is_refused() {
        let header = b64url(br#"{"alg":"none","typ":"JWT"}"#);
        let payload = b64url(good_claims().to_string().as_bytes());
        let forged = format!("{header}.{payload}.");
        assert!(
            matches!(
                verify_supabase_jwt(&forged, SECRET),
                Err(AuthError::Invalid(_))
            ),
            "an alg=none token was accepted"
        );
    }

    /// A payload edited after signing keeps a signature that no longer covers it.
    #[test]
    fn a_tampered_payload_is_refused() {
        let token = token_with(good_claims(), SECRET);
        let mut parts = token.split('.');
        let header = parts.next().unwrap();
        let _ = parts.next();
        let signature = parts.next().unwrap();

        let mut claims = good_claims();
        claims["kbve_username"] = json!("someone-else");
        claims["role"] = json!("service_role");
        let payload = b64url(claims.to_string().as_bytes());

        let forged = format!("{header}.{payload}.{signature}");
        assert!(
            matches!(
                verify_supabase_jwt(&forged, SECRET),
                Err(AuthError::Invalid(_))
            ),
            "an edited payload kept its old signature and was accepted"
        );
    }

    #[test]
    fn nonsense_is_refused_without_panicking() {
        for junk in ["", "...", "not-a-token", "a.b.c", "eyJhbGciOiJIUzI1NiJ9"] {
            assert!(matches!(
                verify_supabase_jwt(junk, SECRET),
                Err(AuthError::Invalid(_))
            ));
        }
    }
}
