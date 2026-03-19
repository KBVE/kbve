use anyhow::Result;
use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, Request, State},
    http::{HeaderName, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use tokio::net::TcpListener;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::{info, warn};

use crate::astro::askama::{MemeNotFoundTemplate, MemeTemplate, TemplateResponse};
use crate::meme::auth::{AuthUser, optional_auth};
use crate::meme::{Meme, MemeCache, MemeSupabaseClient};

#[derive(Clone)]
pub struct AppState {
    pub meme_cache: Arc<MemeCache>,
    pub supabase: Option<Arc<MemeSupabaseClient>>,
}

#[derive(Deserialize)]
pub struct FeedQuery {
    pub cursor: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<i32>,
}

// ── Request bodies for POST endpoints ────────────────────────────────

#[derive(Deserialize)]
pub struct MemeIdBody {
    pub meme_id: String,
}

#[derive(Deserialize)]
pub struct ReactBody {
    pub meme_id: String,
    pub reaction: i32,
}

#[derive(Deserialize)]
pub struct CommentListBody {
    pub meme_id: String,
    pub limit: Option<i32>,
    pub cursor: Option<String>,
}

#[derive(Deserialize)]
pub struct CommentCreateBody {
    pub meme_id: String,
    pub body: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ReportBody {
    pub meme_id: String,
    pub reason: i32,
    pub detail: Option<String>,
}

pub async fn serve(state: AppState) -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4321);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let listener = tuned_listener(addr)?;

    info!("HTTP listening on http://{addr}");

    let app = router(state);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn router(state: AppState) -> Router {
    let max_inflight: usize = num_cpus::get().max(1) * 1024;

    let static_config = crate::astro::StaticConfig::from_env();

    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        // Security headers
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(axum::error_handling::HandleErrorLayer::new(
            |err: tower::BoxError| async move {
                if err.is::<tower::timeout::error::Elapsed>() {
                    (axum::http::StatusCode::REQUEST_TIMEOUT, "request timed out")
                } else if err.is::<tower::load_shed::error::Overloaded>() {
                    (
                        axum::http::StatusCode::SERVICE_UNAVAILABLE,
                        "service overloaded",
                    )
                } else {
                    tracing::warn!(error = %err, "middleware error");
                    (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        "internal server error",
                    )
                }
            },
        ))
        .timeout(Duration::from_secs(10))
        .concurrency_limit(max_inflight)
        .load_shed()
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1024 * 1024));

    let static_router = crate::astro::build_static_router(&static_config)
        .layer(axum::middleware::from_fn(fix_ts_mime))
        .layer(axum::middleware::from_fn(cache_headers));

    let meme_router = Router::new()
        .route("/meme/{id}", get(meme_page_handler))
        .route("/api/v1/meme/{id}", get(meme_api_handler))
        .route("/api/v1/feed", get(feed_api_handler))
        .route("/api/v1/view", post(view_handler))
        .route("/api/v1/share", post(share_handler))
        .route("/api/v1/react", post(react_handler))
        .route("/api/v1/unreact", post(unreact_handler))
        .route("/api/v1/save", post(save_handler))
        .route("/api/v1/unsave", post(unsave_handler))
        .route("/api/v1/comments", post(list_comments_handler))
        .route("/api/v1/comment", post(create_comment_handler))
        .route("/api/v1/report", post(report_handler))
        .layer(middleware::from_fn(optional_auth))
        .with_state(state);

    let public_router = Router::new().route("/health", get(health));

    static_router
        .merge(meme_router)
        .merge(public_router)
        .layer(middleware)
}

async fn health() -> impl IntoResponse {
    "OK"
}

/// Set Cache-Control based on request path.
async fn cache_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    let cache_value = if path.starts_with("/_astro/") {
        // Content-hashed Vite bundles — cache forever
        "public, max-age=31536000, immutable"
    } else if path.starts_with("/pagefind/") || path.starts_with("/images/") {
        // Build-time generated, static until next deploy
        "public, max-age=86400"
    } else if path.ends_with(".html") || path == "/" || !path.contains('.') {
        // Static HTML pages — immutable until next container deploy
        "public, max-age=86400"
    } else {
        "public, max-age=86400"
    };

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(cache_value));

    response
}

/// Vite outputs worker files with `.ts` extensions. `mime_guess` maps `.ts` to
/// `video/mp2t`, which browsers reject for Web Workers. Override to JS.
async fn fix_ts_mime(request: Request, next: Next) -> Response {
    let is_ts = request.uri().path().ends_with(".ts");
    let mut response = next.run(request).await;
    if is_ts {
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/javascript; charset=utf-8"),
        );
    }
    response
}

/// Validate ULID format: 26 alphanumeric characters.
fn is_valid_ulid(id: &str) -> bool {
    id.len() == 26 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Resolve a meme by ID: cache-first, then Supabase fallback.
async fn resolve_meme(state: &AppState, id: &str) -> Result<Option<Meme>, String> {
    if let Some(cached) = state.meme_cache.get_meme(id) {
        return Ok(Some((*cached).clone()));
    }

    let supabase = match &state.supabase {
        Some(s) => s,
        None => return Ok(None),
    };

    let meme = supabase.get_meme_by_id(id).await?;
    if let Some(ref m) = meme {
        state.meme_cache.put_meme(m.clone());
    }
    Ok(meme)
}

/// GET /meme/{id} — server-rendered HTML page with OG meta tags.
async fn meme_page_handler(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    if !is_valid_ulid(&id) {
        return (StatusCode::BAD_REQUEST, "Invalid meme ID").into_response();
    }

    match resolve_meme(&state, &id).await {
        Ok(Some(meme)) => {
            let template = MemeTemplate {
                meme_id: meme.id.clone(),
                title: meme.display_title().to_string(),
                description: meme.og_description(),
                canonical_url: meme.canonical_url(),
                og_image: meme.og_image().to_string(),
                og_width: meme.width.unwrap_or(0),
                og_height: meme.height.unwrap_or(0),
                asset_url: meme.asset_url.clone(),
                format_label: meme.format_label().to_string(),
                width: meme.width.unwrap_or(0),
                height: meme.height.unwrap_or(0),
                author_name: meme.author_name.clone().unwrap_or_default(),
                tags: meme.tags.clone(),
            };
            TemplateResponse(template).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            TemplateResponse(MemeNotFoundTemplate),
        )
            .into_response(),
        Err(e) => {
            warn!(error = %e, meme_id = %id, "failed to fetch meme");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load meme").into_response()
        }
    }
}

/// GET /api/v1/meme/{id} — JSON response for a single meme.
async fn meme_api_handler(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    if !is_valid_ulid(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme ID"})),
        )
            .into_response();
    }

    match resolve_meme(&state, &id).await {
        Ok(Some(meme)) => {
            let mut resp = Json(&meme).into_response();
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=30"),
            );
            resp
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Meme not found"})),
        )
            .into_response(),
        Err(e) => {
            warn!(error = %e, meme_id = %id, "failed to fetch meme");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/feed — paginated meme feed as JSON.
async fn feed_api_handler(
    State(state): State<AppState>,
    Query(params): Query<FeedQuery>,
) -> Response {
    let limit = params.limit.unwrap_or(20).clamp(1, 50);
    let cursor = params.cursor.as_deref();
    let tag = params.tag.as_deref();

    // Check cache first
    if let Some(cached) = state.meme_cache.get_feed(cursor, tag) {
        let mut resp = Json(&*cached).into_response();
        resp.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=10"),
        );
        return resp;
    }

    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Meme service unavailable"})),
            )
                .into_response();
        }
    };

    match supabase.fetch_feed(limit, cursor, tag).await {
        Ok(page) => {
            // Populate individual meme cache from feed results
            for meme in &page.memes {
                state.meme_cache.put_meme(meme.clone());
            }

            // Cache the feed page
            state.meme_cache.put_feed(
                cursor.map(|s| s.to_string()),
                tag.map(|s| s.to_string()),
                page.clone(),
            );

            let mut resp = Json(&page).into_response();
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=10"),
            );
            resp
        }
        Err(e) => {
            warn!(error = %e, "failed to fetch feed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to fetch feed"})),
            )
                .into_response()
        }
    }
}

// ── Anonymous POST handlers ──────────────────────────────────────────

/// POST /api/v1/view — track a meme view (anonymous)
async fn view_handler(State(state): State<AppState>, Json(body): Json<MemeIdBody>) -> Response {
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase.track_view(&body.meme_id).await {
        Ok(()) => Json(serde_json::json!({"success": true})).into_response(),
        Err(e) => {
            warn!(error = %e, "track_view failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/share — track a meme share (anonymous)
async fn share_handler(State(state): State<AppState>, Json(body): Json<MemeIdBody>) -> Response {
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase.track_share(&body.meme_id).await {
        Ok(()) => Json(serde_json::json!({"success": true})).into_response(),
        Err(e) => {
            warn!(error = %e, "track_share failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/comments — list comments for a meme (anonymous)
async fn list_comments_handler(
    State(state): State<AppState>,
    Json(body): Json<CommentListBody>,
) -> Response {
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let limit = body.limit.unwrap_or(20).clamp(1, 50);
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase
        .fetch_comments(&body.meme_id, limit, body.cursor.as_deref())
        .await
    {
        Ok(data) => Json(data).into_response(),
        Err(e) => {
            warn!(error = %e, "fetch_comments failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

// ── Authenticated POST handlers ─────────────────────────────────────

/// POST /api/v1/react — react to a meme (auth required)
async fn react_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<ReactBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    if !(1..=6).contains(&body.reaction) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "reaction must be 1-6"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase
        .react(&user.user_id, &body.meme_id, body.reaction)
        .await
    {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "react failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/unreact — remove reaction from a meme (auth required)
async fn unreact_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<MemeIdBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase.unreact(&user.user_id, &body.meme_id).await {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "unreact failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/save — save/bookmark a meme (auth required)
async fn save_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<MemeIdBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase.save_meme(&user.user_id, &body.meme_id).await {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "save_meme failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/unsave — unsave a meme (auth required)
async fn unsave_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<MemeIdBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase.unsave_meme(&user.user_id, &body.meme_id).await {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "unsave_meme failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/comment — create a comment (auth required)
async fn create_comment_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<CommentCreateBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    let trimmed = body.body.trim();
    if trimmed.is_empty() || trimmed.len() > 500 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "body must be 1-500 characters"})),
        )
            .into_response();
    }
    if let Some(ref pid) = body.parent_id {
        if !is_valid_ulid(pid) {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Invalid parent_id"})),
            )
                .into_response();
        }
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase
        .create_comment(
            &user.user_id,
            &body.meme_id,
            trimmed,
            body.parent_id.as_deref(),
        )
        .await
    {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "create_comment failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/report — report a meme (auth required)
async fn report_handler(
    State(state): State<AppState>,
    auth: Option<Extension<AuthUser>>,
    Json(body): Json<ReportBody>,
) -> Response {
    let user = match auth {
        Some(Extension(u)) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Authentication required"})),
            )
                .into_response();
        }
    };
    if !is_valid_ulid(&body.meme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid meme_id"})),
        )
            .into_response();
    }
    if !(1..=7).contains(&body.reason) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "reason must be 1-7"})),
        )
            .into_response();
    }
    if let Some(ref d) = body.detail {
        if d.len() > 2000 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "detail must be <= 2000 chars"})),
            )
                .into_response();
        }
    }
    let supabase = match &state.supabase {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "Service unavailable"})),
            )
                .into_response();
        }
    };
    match supabase
        .report_meme(
            &user.user_id,
            &body.meme_id,
            body.reason,
            body.detail.as_deref(),
        )
        .await
    {
        Ok(data) => Json(serde_json::json!({"success": true, "data": data})).into_response(),
        Err(e) => {
            warn!(error = %e, "report_meme failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

fn tuned_listener(addr: SocketAddr) -> Result<TcpListener> {
    use socket2::{Domain, Protocol, Socket, Type};

    let domain = match addr {
        SocketAddr::V4(_) => Domain::IPV4,
        SocketAddr::V6(_) => Domain::IPV6,
    };
    let socket = Socket::new(domain, Type::STREAM, Some(Protocol::TCP))?;

    socket.set_reuse_address(true)?;
    socket.set_keepalive(true)?;

    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        use socket2::TcpKeepalive;
        let ka = TcpKeepalive::new()
            .with_time(Duration::from_secs(30))
            .with_interval(Duration::from_secs(10));
        let _ = socket.set_tcp_keepalive(&ka);
    }

    socket.bind(&addr.into())?;
    socket.listen(1024)?;

    let std_listener = std::net::TcpListener::from(socket);
    std_listener.set_nonblocking(true)?;
    Ok(TcpListener::from_std(std_listener)?)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Build a minimal router with just the health endpoint + middleware
    /// (no static file serving, which requires a real directory).
    fn test_router() -> Router {
        let middleware = tower::ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                HeaderName::from_static("referrer-policy"),
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            ));

        Router::new()
            .route("/health", get(health))
            .layer(middleware)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"OK");
    }

    #[tokio::test]
    async fn test_security_headers() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        assert_eq!(response.headers().get("x-frame-options").unwrap(), "DENY");
        assert_eq!(
            response.headers().get("referrer-policy").unwrap(),
            "strict-origin-when-cross-origin"
        );
    }

    #[tokio::test]
    async fn test_cache_headers_astro_path() {
        let app = Router::new()
            .route("/_astro/{*path}", get(|| async { "asset" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/_astro/bundle.abc123.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("immutable"));
        assert!(cc.contains("31536000"));
    }

    #[tokio::test]
    async fn test_cache_headers_html_page() {
        let app = Router::new()
            .route("/", get(|| async { "page" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("86400"));
    }

    #[tokio::test]
    async fn test_fix_ts_mime_rewrites() {
        let app = Router::new()
            .route("/worker.ts", get(|| async { "code" }))
            .route("/script.js", get(|| async { "code" }))
            .layer(axum::middleware::from_fn(fix_ts_mime));

        // .ts file should get JS content-type
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/worker.ts")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/javascript; charset=utf-8"
        );

        // .js file should NOT be rewritten
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/script.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_string());
        assert!(ct.is_none() || !ct.unwrap().contains("application/javascript"));
    }

    #[tokio::test]
    async fn test_cache_headers_pagefind_path() {
        let app = Router::new()
            .route("/pagefind/{*path}", get(|| async { "search" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/pagefind/pagefind.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("86400"));
    }

    #[tokio::test]
    async fn test_cache_headers_extensionless_path() {
        let app = Router::new()
            .route("/feed", get(|| async { "page" }))
            .route("/profile", get(|| async { "page" }))
            .layer(axum::middleware::from_fn(cache_headers));

        for path in ["/feed", "/profile"] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();

            let cc = response
                .headers()
                .get(header::CACHE_CONTROL)
                .unwrap()
                .to_str()
                .unwrap();
            assert!(
                cc.contains("86400"),
                "expected 86400 cache for {path}, got: {cc}"
            );
        }
    }

    #[tokio::test]
    async fn test_cache_headers_images_path() {
        let app = Router::new()
            .route("/images/{*path}", get(|| async { "image" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/images/logo.png")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("86400"));
    }

    #[tokio::test]
    async fn test_fix_ts_mime_ignores_css() {
        let app = Router::new()
            .route("/style.css", get(|| async { "body{}" }))
            .layer(axum::middleware::from_fn(fix_ts_mime));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/style.css")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_string());
        // .css should NOT be rewritten to application/javascript
        assert!(ct.is_none() || !ct.unwrap().contains("application/javascript"),);
    }

    #[tokio::test]
    async fn test_health_returns_plain_text() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let text = std::str::from_utf8(&body).unwrap();
        assert_eq!(text, "OK");
        assert_eq!(text.len(), 2);
    }

    #[tokio::test]
    async fn test_unknown_route_through_middleware() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/nonexistent-path")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Without static file serving, unknown routes return 404
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        // Security headers should still be present
        assert_eq!(
            response.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
    }

    // --- Meme route tests ---

    use crate::meme::{FeedPage, Meme, MemeCache};

    fn test_state() -> AppState {
        AppState {
            meme_cache: Arc::new(MemeCache::new()),
            supabase: None,
        }
    }

    fn make_test_meme(id: &str) -> Meme {
        Meme {
            id: id.to_string(),
            title: Some("Test Meme".into()),
            format: 1,
            asset_url: "https://cdn.meme.sh/m/test.jpg".into(),
            thumbnail_url: Some("https://cdn.meme.sh/t/test.jpg".into()),
            width: Some(800),
            height: Some(600),
            tags: vec!["funny".into()],
            view_count: 42,
            reaction_count: 7,
            comment_count: 3,
            save_count: 1,
            share_count: 2,
            created_at: "2026-03-01T00:00:00Z".into(),
            author_name: Some("TestUser".into()),
            author_avatar: None,
        }
    }

    fn meme_app(state: AppState) -> Router {
        Router::new()
            .route("/meme/{id}", get(meme_page_handler))
            .route("/api/v1/meme/{id}", get(meme_api_handler))
            .route("/api/v1/feed", get(feed_api_handler))
            .with_state(state)
    }

    #[tokio::test]
    async fn test_meme_api_returns_json() {
        let state = test_state();
        let meme_id = "01ABCDEFGHJKMNPQRSTVWXYZ01";
        state.meme_cache.put_meme(make_test_meme(meme_id));

        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/v1/meme/{meme_id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let meme: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(meme["id"], meme_id);
        assert_eq!(meme["title"], "Test Meme");
    }

    #[tokio::test]
    async fn test_meme_api_cache_control() {
        let state = test_state();
        let meme_id = "01ABCDEFGHJKMNPQRSTVWXYZ01";
        state.meme_cache.put_meme(make_test_meme(meme_id));

        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/v1/meme/{meme_id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("max-age=30"));
    }

    #[tokio::test]
    async fn test_meme_page_returns_html_with_og() {
        let state = test_state();
        let meme_id = "01ABCDEFGHJKMNPQRSTVWXYZ01";
        state.meme_cache.put_meme(make_test_meme(meme_id));

        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/meme/{meme_id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let html = std::str::from_utf8(&body).unwrap();
        assert!(html.contains("og:image"));
        assert!(html.contains("https://cdn.meme.sh/t/test.jpg"));
        assert!(html.contains("Test Meme"));
        assert!(html.contains("data-meme-id"));
    }

    #[tokio::test]
    async fn test_meme_api_not_found() {
        let state = test_state();
        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/meme/01ABCDEFGHJKMNPQRSTVWXYZ01")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_meme_api_invalid_ulid() {
        let state = test_state();
        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/meme/short")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_feed_api_with_cached_data() {
        let state = test_state();
        let page = FeedPage {
            memes: vec![make_test_meme("01ABCDEFGHJKMNPQRSTVWXYZ01")],
            next_cursor: Some("01ABCDEFGHJKMNPQRSTVWXYZ01".into()),
        };
        state.meme_cache.put_feed(None, None, page);

        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/feed")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("max-age=10"));

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let feed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(feed["memes"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_feed_api_no_supabase_returns_503() {
        let state = test_state(); // supabase: None
        let app = meme_app(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/feed")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn test_ulid_validation() {
        assert!(is_valid_ulid("01ABCDEFGHJKMNPQRSTVWXYZ01"));
        assert!(!is_valid_ulid("short"));
        assert!(!is_valid_ulid("01ABCDEFGHJKMNPQRSTVWXY!")); // non-alphanumeric
        assert!(!is_valid_ulid("")); // empty
    }
}
