use jsonwebtoken::{DecodingKey, Validation, decode};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SupabaseClaims {
    #[serde(default)]
    pub kbve_username: String,
}

pub fn verify_supabase_jwt(token: &str, secret: &[u8]) -> Result<SupabaseClaims, String> {
    if secret.is_empty() {
        return Err("SUPABASE_JWT_SECRET is not set".into());
    }
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.validate_aud = false;
    decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map(|d| d.claims)
        .map_err(|e| e.to_string())
}

pub fn bearer_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde::Serialize;

    #[derive(Serialize)]
    struct TestClaims {
        sub: String,
        exp: i64,
        kbve_username: String,
    }

    #[test]
    fn bearer_extraction() {
        let mut h = axum::http::HeaderMap::new();
        h.insert(
            axum::http::header::AUTHORIZATION,
            "Bearer abc.def.ghi".parse().unwrap(),
        );
        assert_eq!(bearer_token(&h), Some("abc.def.ghi"));
        assert_eq!(bearer_token(&axum::http::HeaderMap::new()), None);
    }

    #[test]
    fn verify_round_trip() {
        let secret = b"test-secret";
        let claims = TestClaims {
            sub: "u1".into(),
            exp: 9_999_999_999,
            kbve_username: "h0lybyte".into(),
        };
        let token = encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret),
        )
        .unwrap();
        assert_eq!(
            verify_supabase_jwt(&token, secret).unwrap().kbve_username,
            "h0lybyte"
        );
        assert!(verify_supabase_jwt(&token, b"wrong").is_err());
        assert!(verify_supabase_jwt("garbage", secret).is_err());
        assert!(verify_supabase_jwt(&token, b"").is_err());
    }

    #[test]
    fn expired_token_rejected() {
        let secret = b"test-secret";
        let claims = TestClaims {
            sub: "u1".into(),
            exp: 1, // 1970 — long expired
            kbve_username: "h0lybyte".into(),
        };
        let token = encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret),
        )
        .unwrap();
        assert!(verify_supabase_jwt(&token, secret).is_err());
    }

    #[test]
    fn missing_username_defaults_to_empty() {
        #[derive(Serialize)]
        struct NoName {
            sub: String,
            exp: i64,
        }
        let secret = b"test-secret";
        let token = encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &NoName {
                sub: "u1".into(),
                exp: 9_999_999_999,
            },
            &EncodingKey::from_secret(secret),
        )
        .unwrap();
        assert_eq!(
            verify_supabase_jwt(&token, secret).unwrap().kbve_username,
            ""
        );
    }

    #[test]
    fn bearer_rejects_malformed() {
        let mk = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        // Missing "Bearer " scheme prefix.
        assert_eq!(bearer_token(&mk("token-without-scheme")), None);
        // Lowercase scheme is not accepted (strip_prefix is case-sensitive).
        assert_eq!(bearer_token(&mk("bearer abc")), None);
        // Empty token after the scheme.
        assert_eq!(bearer_token(&mk("Bearer    ")), None);
        // Surrounding whitespace is trimmed.
        assert_eq!(bearer_token(&mk("Bearer  tok ")), Some("tok"));
    }
}
