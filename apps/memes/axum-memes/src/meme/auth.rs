use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};

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

/// Decode a Supabase JWT using the JWT secret.
/// Returns the claims if valid, or an error string.
fn decode_supabase_jwt(token: &str, secret: &str) -> Result<Claims, String> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    // Supabase JWTs use "authenticated" as the audience
    validation.set_audience(&["authenticated"]);
    // Allow some clock skew
    validation.leeway = 30;

    let token_data = decode::<Claims>(token, &key, &validation)
        .map_err(|e| format!("JWT decode failed: {e}"))?;

    Ok(token_data.claims)
}

/// Middleware that extracts and validates a Supabase JWT from the Authorization header.
/// If valid, inserts `AuthUser` as a request extension.
/// If missing or invalid, the request proceeds without `AuthUser` (anonymous).
pub async fn optional_auth(mut request: Request, next: Next) -> Response {
    let secret = match std::env::var("SUPABASE_JWT_SECRET") {
        Ok(s) => s,
        Err(_) => return next.run(request).await,
    };

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
