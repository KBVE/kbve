use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// Supabase JWT claims — only the fields we need.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// User UUID (auth.uid())
    pub sub: String,
    /// Role: "authenticated", "anon", "service_role"
    pub role: Option<String>,
    /// Expiration (unix timestamp)
    pub exp: Option<u64>,
}

/// Extension inserted by the auth middleware when a valid JWT is present.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
}

/// Process-wide accept-both verifier (HS256 + ES256/JWKS); `None` when no JWKS URI is configured.
fn shared_verifier() -> Option<&'static jedi::jwks::JwtVerifier> {
    static VERIFIER: OnceLock<Option<jedi::jwks::JwtVerifier>> = OnceLock::new();
    VERIFIER
        .get_or_init(|| {
            let jwks_uri = std::env::var("SUPABASE_JWKS_URI")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    std::env::var("SUPABASE_URL").ok().and_then(|u| {
                        let u = u.trim().trim_end_matches('/');
                        (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
                    })
                })?;
            let secret = std::env::var("SUPABASE_JWT_SECRET")
                .ok()
                .filter(|s| !s.is_empty());
            let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                .ok()
                .filter(|s| !s.trim().is_empty());
            let verifier = jedi::jwks::JwtVerifier::new(
                jwks_uri,
                secret.as_deref().map(str::as_bytes),
                issuer,
                Some("authenticated".to_string()),
            );
            let bg = verifier.clone();
            tokio::spawn(async move {
                bg.start(std::time::Duration::from_secs(300)).await;
            });
            Some(verifier)
        })
        .as_ref()
}

/// Decode a Supabase JWT (HS256 shared secret or ES256 via GoTrue JWKS).
fn decode_supabase_jwt(token: &str, secret: &str) -> Result<Claims, String> {
    if let Some(verifier) = shared_verifier() {
        return verifier.verify::<Claims>(token).map_err(|e| e.to_string());
    }

    let key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["authenticated"]);
    validation.leeway = 30;

    let token_data = decode::<Claims>(token, &key, &validation)
        .map_err(|e| format!("JWT decode failed: {e}"))?;

    Ok(token_data.claims)
}

/// Middleware that extracts and validates a Supabase JWT from the Authorization header.
/// If valid, inserts `AuthUser` as a request extension.
/// If missing or invalid, the request proceeds without `AuthUser` (anonymous).
pub async fn optional_auth(mut request: Request, next: Next) -> Response {
    let secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
    if secret.is_empty() && shared_verifier().is_none() {
        return next.run(request).await;
    }

    if let Some(auth_header) = request.headers().get("authorization") {
        if let Ok(header_str) = auth_header.to_str() {
            if let Some(token) = header_str.strip_prefix("Bearer ") {
                if let Ok(claims) = decode_supabase_jwt(token, &secret) {
                    if claims.role.as_deref() == Some("authenticated") {
                        request.extensions_mut().insert(AuthUser {
                            user_id: claims.sub,
                        });
                    }
                }
            }
        }
    }

    next.run(request).await
}

/// Extract AuthUser from request extensions, returning 401 if not present.
pub fn require_auth(request: &Request) -> Result<AuthUser, Response> {
    request
        .extensions()
        .get::<AuthUser>()
        .cloned()
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response()
        })
}
