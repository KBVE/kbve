use axum::{
    extract::Request,
    http::{StatusCode, header},
    middleware::Next,
    response::IntoResponse,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    pub exp: u64,
    pub iat: u64,
}

/// Extract JWT from Authorization header or query param
pub fn extract_token(req: &Request) -> Option<String> {
    // Try Authorization: Bearer <token>
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(String::from)
        .or_else(|| {
            // Try ?token= query param (for WebSocket upgrades)
            req.uri().query().and_then(|q| {
                q.split('&').find_map(|pair| {
                    let (key, value) = pair.split_once('=')?;
                    if key == "token" {
                        Some(value.to_string())
                    } else {
                        None
                    }
                })
            })
        })
}

/// Validate JWT and return claims
pub fn validate_token(token: &str) -> Result<Claims, StatusCode> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["sub", "exp", "iat"]);

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| StatusCode::UNAUTHORIZED)
}

/// Axum middleware that requires valid JWT
pub async fn require_auth(req: Request, next: Next) -> impl IntoResponse {
    let token = match extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    match validate_token(&token) {
        Ok(_claims) => next.run(req).await.into_response(),
        Err(status) => status.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serial_test::serial;
    use std::time::{SystemTime, UNIX_EPOCH};

    const TEST_SECRET: &str = "kbve-jwt-secret-for-tests";

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_secs()
    }

    fn issue(secret: &str, sub: &str, exp_offset: i64) -> String {
        let iat = now_secs();
        let exp = (iat as i64 + exp_offset) as u64;
        let claims = Claims {
            sub: sub.to_string(),
            email: Some(format!("{sub}@example.com")),
            role: Some("authenticated".to_string()),
            exp,
            iat,
        };
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("encode test jwt")
    }

    fn req_with_query(query: &str) -> Request {
        Request::builder()
            .uri(format!("https://chat.kbve.com/ws?{query}"))
            .body(Body::empty())
            .expect("build request")
    }

    fn req_with_bearer(token: &str) -> Request {
        Request::builder()
            .uri("https://chat.kbve.com/ws")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("build request")
    }

    #[test]
    fn extract_token_from_authorization_header() {
        let req = req_with_bearer("abc.def.ghi");
        assert_eq!(extract_token(&req).as_deref(), Some("abc.def.ghi"));
    }

    #[test]
    fn extract_token_falls_back_to_query_param() {
        let req = req_with_query("token=qry.tok.val&other=1");
        assert_eq!(extract_token(&req).as_deref(), Some("qry.tok.val"));
    }

    #[test]
    fn extract_token_prefers_authorization_over_query() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws?token=fromquery")
            .header(header::AUTHORIZATION, "Bearer fromheader")
            .body(Body::empty())
            .expect("build request");
        assert_eq!(extract_token(&req).as_deref(), Some("fromheader"));
    }

    #[test]
    fn extract_token_ignores_other_query_keys() {
        let req = req_with_query("foo=bar&token=tok.123");
        assert_eq!(extract_token(&req).as_deref(), Some("tok.123"));
    }

    #[test]
    fn extract_token_returns_none_when_absent() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws")
            .body(Body::empty())
            .expect("build request");
        assert!(extract_token(&req).is_none());
    }

    #[test]
    fn extract_token_ignores_bearer_without_space() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws")
            .header(header::AUTHORIZATION, "Bearer")
            .body(Body::empty())
            .expect("build request");
        assert!(extract_token(&req).is_none());
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_accepts_valid_token() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue(TEST_SECRET, "user-123", 3600);
        let claims = validate_token(&token).expect("token should validate");
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email.as_deref(), Some("user-123@example.com"));
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_wrong_secret() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue("different-secret", "user-456", 3600);
        let result = validate_token(&token);
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_expired_token() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue(TEST_SECRET, "user-789", -120);
        let result = validate_token(&token);
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_returns_500_when_secret_unset() {
        std::env::remove_var("JWT_SECRET");
        let result = validate_token("anything.at.all");
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_garbage_input() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        assert_eq!(
            validate_token("not-a-jwt").unwrap_err(),
            StatusCode::UNAUTHORIZED,
        );
        assert_eq!(validate_token("").unwrap_err(), StatusCode::UNAUTHORIZED,);
        std::env::remove_var("JWT_SECRET");
    }
}
