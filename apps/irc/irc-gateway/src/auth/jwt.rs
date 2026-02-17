use axum::{
    extract::Request,
    http::{header, StatusCode},
    response::IntoResponse,
    middleware::Next,
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
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
            req.uri()
                .query()
                .and_then(|q| {
                    q.split('&')
                        .find_map(|pair| {
                            let (key, value) = pair.split_once('=')?;
                            if key == "token" { Some(value.to_string()) } else { None }
                        })
                })
        })
}

/// Validate JWT and return claims
pub fn validate_token(token: &str) -> Result<Claims, StatusCode> {
    let secret = std::env::var("JWT_SECRET")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
pub async fn require_auth(
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let token = match extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    match validate_token(&token) {
        Ok(_claims) => next.run(req).await.into_response(),
        Err(status) => status.into_response(),
    }
}
