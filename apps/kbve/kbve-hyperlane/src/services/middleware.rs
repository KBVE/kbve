use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use tower_http::{
    compression::CompressionLayer,
    cors::{CorsLayer, Any},
    trace::TraceLayer,
};
use tracing::{info, warn, error, debug, Span};
use serde_json::json;
use ulid::Ulid;

use crate::services::{
    states::{AppState, UserSession, SessionFlags},
    utils::{Error, Result, Metrics},
};

// ============================================================================
// Request ID Middleware
// ============================================================================

/// Add a unique request ID to each request
pub async fn request_id_middleware(
    mut request: Request,
    next: Next,
) -> Response {
    let request_id = Ulid::new().to_string();
    
    // Add request ID to headers
    request.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap(),
    );
    
    // Add to tracing span
    Span::current().record("request_id", &request_id);
    
    let mut response = next.run(request).await;
    
    // Add request ID to response headers
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap(),
    );
    
    response
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/// Authentication middleware that validates JWT tokens and loads user sessions
pub async fn auth_middleware(
    State(app_state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response> {
    let auth_header = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());
    
    if let Some(auth_value) = auth_header {
        if let Some(token) = auth_value.strip_prefix("Bearer ") {
            match validate_and_load_session(&app_state, token).await {
                Ok(session) => {
                    // Add session to request extensions
                    request.extensions_mut().insert(session);
                    Ok(next.run(request).await)
                }
                Err(e) => {
                    warn!("Authentication failed: {}", e);
                    Err(Error::AuthenticationFailed("Invalid token".to_string()))
                }
            }
        } else {
            Err(Error::AuthenticationFailed("Invalid authorization header format".to_string()))
        }
    } else {
        Err(Error::AuthenticationFailed("Missing authorization header".to_string()))
    }
}

/// Optional authentication middleware - continues even if auth fails
pub async fn optional_auth_middleware(
    State(app_state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Some(auth_header) = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if let Some(token) = auth_header.strip_prefix("Bearer ") {
            if let Ok(session) = validate_and_load_session(&app_state, token).await {
                request.extensions_mut().insert(session);
            }
        }
    }
    
    next.run(request).await
}

/// Admin authentication middleware - requires admin role
pub async fn admin_auth_middleware(
    State(app_state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response> {
    // First authenticate like normal auth middleware
    let auth_header = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());
    
    if let Some(auth_value) = auth_header {
        if let Some(token) = auth_value.strip_prefix("Bearer ") {
            match validate_and_load_session(&app_state, token).await {
                Ok(session) => {
                    // Check if user is admin
                    if session.is_admin() {
                        // Add session to request extensions
                        request.extensions_mut().insert(session);
                        Ok(next.run(request).await)
                    } else {
                        Err(Error::Forbidden)
                    }
                }
                Err(e) => {
                    warn!("Authentication failed: {}", e);
                    Err(Error::AuthenticationFailed("Invalid token".to_string()))
                }
            }
        } else {
            Err(Error::AuthenticationFailed("Invalid authorization header format".to_string()))
        }
    } else {
        Err(Error::AuthenticationFailed("Missing authorization header".to_string()))
    }
}

async fn validate_and_load_session(
    app_state: &AppState,
    token: &str,
) -> Result<UserSession> {
    // TODO: Implement JWT validation here
    // For now, this is a placeholder that extracts user ID from token
    
    // Extract user ID from token (implement proper JWT validation)
    let user_id = extract_user_id_from_token(token)?;
    
    // Try to get session from cache first
    if let Some(session) = app_state.sessions.get_valid(&user_id) {
        return Ok(session);
    }
    
    // If not in cache, validate with external service (Supabase, etc.)
    let session = validate_token_with_external_service(token).await?;
    
    // Cache the session
    app_state.sessions.insert(user_id.clone(), session.clone());
    
    Ok(session)
}

fn extract_user_id_from_token(token: &str) -> Result<String> {
    // TODO: Implement proper JWT parsing
    // This is a placeholder
    if token.len() < 10 {
        return Err(Error::InvalidToken("Token too short".to_string()));
    }
    
    // Mock implementation - replace with actual JWT parsing
    Ok(format!("user_{}", &token[..8]))
}

async fn validate_token_with_external_service(token: &str) -> Result<UserSession> {
    // TODO: Implement external validation (Supabase, Auth0, etc.)
    // This is a placeholder implementation
    
    let user_id = extract_user_id_from_token(token)?;
    
    // Mock session creation - replace with actual external service call
    let session = UserSession::new(
        user_id,
        "user@example.com".to_string(),
        vec!["user".to_string()],
        chrono::Utc::now() + chrono::Duration::hours(24),
    );
    
    Ok(session)
}

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

use crate::services::states::RateLimit;

pub async fn rate_limit_middleware(
    State(app_state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response> {
    let client_ip = get_client_ip(&request);
    let rate_limit_key = format!("rate_limit:{}", client_ip);
    
    // Get or create rate limit for this IP
    let mut rate_limit = app_state.rate_limits.get(&rate_limit_key)
        .unwrap_or_else(|| RateLimit::new(
            rate_limit_key.clone(),
            100, // 100 requests
            Duration::from_secs(60), // per minute
        ));
    
    if !rate_limit.check_and_increment() {
        return Err(Error::RateLimitExceeded {
            limit: rate_limit.max_requests,
            window: rate_limit.window_duration,
        });
    }
    
    // Update the rate limit in cache
    app_state.rate_limits.insert(rate_limit_key, rate_limit);
    
    Ok(next.run(request).await)
}

fn get_client_ip(request: &Request) -> String {
    // Check for forwarded IP headers first
    if let Some(forwarded) = request.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded.to_str() {
            if let Some(ip) = forwarded_str.split(',').next() {
                return ip.trim().to_string();
            }
        }
    }
    
    if let Some(real_ip) = request.headers().get("x-real-ip") {
        if let Ok(ip_str) = real_ip.to_str() {
            return ip_str.to_string();
        }
    }
    
    // Fallback to connection info (if available)
    "unknown".to_string()
}

// ============================================================================
// Metrics Middleware
// ============================================================================

pub async fn metrics_middleware(
    State(metrics): State<Arc<Metrics>>,
    request: Request,
    next: Next,
) -> Response {
    let start = Instant::now();
    let method = request.method().clone();
    let uri = request.uri().clone();
    
    metrics.increment_requests();
    metrics.add_connection();
    
    let response = next.run(request).await;
    
    let duration = start.elapsed();
    let status = response.status();
    
    // Log request info
    info!(
        method = %method,
        uri = %uri,
        status = %status,
        duration_ms = duration.as_millis(),
        "Request completed"
    );
    
    // Update metrics
    if status.is_server_error() {
        metrics.increment_failed();
    }
    
    metrics.remove_connection();
    
    response
}

// ============================================================================
// Error Handler Middleware
// ============================================================================

pub async fn error_handler_middleware(
    request: Request,
    next: Next,
) -> Response {
    let response = next.run(request).await;
    
    // If the response is an error, convert it to a proper JSON response
    if response.status().is_server_error() {
        let status = response.status();
        
        let error_response = Json(json!({
            "error": {
                "code": status.as_u16(),
                "message": status.canonical_reason().unwrap_or("Internal Server Error"),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        }));
        
        (status, error_response).into_response()
    } else {
        response
    }
}

// ============================================================================
// Security Headers Middleware
// ============================================================================

pub async fn security_headers_middleware(
    request: Request,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    
    let headers = response.headers_mut();
    
    // Security headers
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert("x-xss-protection", HeaderValue::from_static("1; mode=block"));
    headers.insert("referrer-policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    headers.insert("content-security-policy", HeaderValue::from_static(
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    ));
    
    // Remove server header for security
    headers.remove("server");
    
    response
}

// ============================================================================
// CORS Configuration
// ============================================================================

pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any) // Configure this for production
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            "x-request-id".parse().unwrap(),
        ])
        .expose_headers([
            "x-request-id".parse().unwrap(),
        ])
        .max_age(Duration::from_secs(86400)) // 24 hours
}

// ============================================================================
// Compression Layer
// ============================================================================

pub fn compression_layer() -> CompressionLayer {
    CompressionLayer::new()
}

// ============================================================================
// Tracing Layer
// ============================================================================

pub fn tracing_layer() -> TraceLayer<tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>> {
    TraceLayer::new_for_http()
}


// ============================================================================
// Error Response Conversion
// ============================================================================

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status_code = StatusCode::from_u16(self.status_code())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        
        let error_response = Json(json!({
            "error": {
                "code": self.status_code(),
                "message": self.to_string(),
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "retryable": self.is_retryable(),
            }
        }));
        
        (status_code, error_response).into_response()
    }
}

// ============================================================================
// Middleware Builder Utilities
// ============================================================================


// ============================================================================
// Helper Functions
// ============================================================================

/// Extract user session from request extensions
pub fn get_user_session(request: &Request) -> Option<&UserSession> {
    request.extensions().get::<UserSession>()
}

/// Check if user has specific role
pub fn user_has_role(request: &Request, role: &str) -> bool {
    get_user_session(request)
        .map(|session| session.has_role(role))
        .unwrap_or(false)
}

/// Check if user has specific flag
pub fn user_has_flag(request: &Request, flag: SessionFlags) -> bool {
    get_user_session(request)
        .map(|session| session.check(flag))
        .unwrap_or(false)
}