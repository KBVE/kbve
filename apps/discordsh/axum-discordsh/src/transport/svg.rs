use askama::Template;
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;

use super::HttpState;
use crate::discord::game::card::{self, GameCardTemplate};
use crate::discord::game::types::SessionState;

// ── Query parameters ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RenderQuery {
    /// Output format: "png" (default) or "svg".
    format: Option<String>,
    /// Scale factor for PNG output (default 1.0, clamped 0.5–3.0).
    scale: Option<f32>,
}

// ── Error type ─────────────────────────────────────────────────────

#[derive(Debug)]
enum SvgError {
    NotFound,
    Busy,
    Render(String),
}

impl IntoResponse for SvgError {
    fn into_response(self) -> Response {
        match self {
            SvgError::NotFound => {
                (StatusCode::NOT_FOUND, "Session not found or expired").into_response()
            }
            SvgError::Busy => (
                StatusCode::SERVICE_UNAVAILABLE,
                [(header::RETRY_AFTER, "1")],
                "Session busy, retry shortly",
            )
                .into_response(),
            SvgError::Render(msg) => {
                tracing::error!(error = %msg, "SVG/PNG render failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "Image rendering failed").into_response()
            }
        }
    }
}

// ── Router ─────────────────────────────────────────────────────────

/// Build the `/svg/` sub-router for dynamic image generation.
///
/// Routes:
/// - `GET /svg/game/{session_id}`     — format via `?format=png|svg` (default: png)
/// - `GET /svg/game/png/{session_id}` — always PNG (ideal for OG meta tags)
/// - `GET /svg/game/svg/{session_id}` — always SVG (debug / HTML embedding)
pub fn router() -> Router<HttpState> {
    Router::new()
        .route("/svg/game/{session_id}", get(game_card))
        .route("/svg/game/png/{session_id}", get(game_card_png))
        .route("/svg/game/svg/{session_id}", get(game_card_svg))
        .route("/svg/map/png/{session_id}", get(map_card_png))
        .route("/svg/map/svg/{session_id}", get(map_card_svg))
}

// ── Handlers ───────────────────────────────────────────────────────

/// `GET /svg/game/{session_id}` — format via `?format=png|svg` query param.
async fn game_card(
    State(state): State<HttpState>,
    Path(session_id): Path<String>,
    Query(params): Query<RenderQuery>,
) -> Result<Response, SvgError> {
    match params.format.as_deref().unwrap_or("png") {
        "svg" => render_svg_response(&state, &session_id),
        _ => render_png_response(&state, &session_id, params.scale).await,
    }
}

/// `GET /svg/game/{session_id}.png` — always PNG.
async fn game_card_png(
    State(state): State<HttpState>,
    Path(session_id): Path<String>,
    Query(params): Query<RenderQuery>,
) -> Result<Response, SvgError> {
    render_png_response(&state, &session_id, params.scale).await
}

/// `GET /svg/game/{session_id}.svg` — always SVG.
async fn game_card_svg(
    State(state): State<HttpState>,
    Path(session_id): Path<String>,
) -> Result<Response, SvgError> {
    render_svg_response(&state, &session_id)
}

/// `GET /svg/map/png/{session_id}` — map card as PNG.
async fn map_card_png(
    State(state): State<HttpState>,
    Path(session_id): Path<String>,
) -> Result<Response, SvgError> {
    let session = snapshot_session(&state, &session_id)?;
    let fontdb = state.app.fontdb.clone();

    let png_bytes = tokio::task::spawn_blocking(move || {
        card::render_map_card_blocking(&session, &fontdb)
            .map_err(|e| SvgError::Render(format!("Map PNG render: {e}")))
    })
    .await
    .map_err(|e| SvgError::Render(format!("Task panicked: {e}")))??;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/png"),
            (
                header::CACHE_CONTROL,
                "public, max-age=5, stale-while-revalidate=10",
            ),
        ],
        png_bytes,
    )
        .into_response())
}

/// `GET /svg/map/svg/{session_id}` — map card as SVG.
async fn map_card_svg(
    State(state): State<HttpState>,
    Path(session_id): Path<String>,
) -> Result<Response, SvgError> {
    let session = snapshot_session(&state, &session_id)?;

    let template = card::build_map_card(&session);
    let svg_string = template
        .render()
        .map_err(|e| SvgError::Render(format!("Map SVG template: {e}")))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (
                header::CACHE_CONTROL,
                "public, max-age=5, stale-while-revalidate=10",
            ),
        ],
        svg_string,
    )
        .into_response())
}

// ── Helpers ────────────────────────────────────────────────────────

/// Snapshot the session state (acquires lock briefly, clones, releases).
fn snapshot_session(state: &HttpState, session_id: &str) -> Result<SessionState, SvgError> {
    let handle = state
        .app
        .sessions
        .get(session_id)
        .ok_or(SvgError::NotFound)?;
    let session = handle.try_lock().map_err(|_| SvgError::Busy)?;
    Ok(session.clone())
}

/// Render PNG response via `spawn_blocking`.
async fn render_png_response(
    state: &HttpState,
    session_id: &str,
    scale: Option<f32>,
) -> Result<Response, SvgError> {
    let session = snapshot_session(state, session_id)?;
    let fontdb = state.app.fontdb.clone();
    let scale = scale.unwrap_or(1.0).clamp(0.5, 3.0);

    let png_bytes = tokio::task::spawn_blocking(move || {
        let template = GameCardTemplate::from_session(&session);
        let svg_string = template
            .render()
            .map_err(|e| SvgError::Render(format!("SVG template: {e}")))?;
        kbve::render_svg_to_png_scaled(&svg_string, &fontdb, scale)
            .map_err(|e| SvgError::Render(format!("PNG render: {e}")))
    })
    .await
    .map_err(|e| SvgError::Render(format!("Task panicked: {e}")))??;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/png"),
            (
                header::CACHE_CONTROL,
                "public, max-age=5, stale-while-revalidate=10",
            ),
        ],
        png_bytes,
    )
        .into_response())
}

/// Render SVG response (template render is fast, no spawn_blocking needed).
fn render_svg_response(state: &HttpState, session_id: &str) -> Result<Response, SvgError> {
    let session = snapshot_session(state, session_id)?;

    let template = GameCardTemplate::from_session(&session);
    let svg_string = template
        .render()
        .map_err(|e| SvgError::Render(format!("SVG template: {e}")))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (
                header::CACHE_CONTROL,
                "public, max-age=5, stale-while-revalidate=10",
            ),
        ],
        svg_string,
    )
        .into_response())
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Instant;

    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use poise::serenity_prelude as serenity;
    use tower::ServiceExt;

    use crate::discord::game::types::*;
    use crate::discord::game::{content, new_short_sid};
    use crate::health::HealthMonitor;
    use crate::state::AppState;

    fn test_state() -> HttpState {
        let health_monitor = Arc::new(HealthMonitor::new());
        let app_state = Arc::new(AppState::new(health_monitor, None));
        HttpState { app: app_state }
    }

    fn seed_session(state: &HttpState) -> String {
        let (id, short_id) = new_short_sid();
        let owner = serenity::UserId::new(1);
        let session = SessionState {
            id,
            short_id: short_id.clone(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 1,
            players: std::collections::HashMap::from([(owner, PlayerState::default())]),
            enemies: Vec::new(),
            room: content::generate_room(0),
            log: vec!["Test session".to_owned()],
            show_items: false,
            pending_actions: std::collections::HashMap::new(),
            map: content::generate_initial_map(&id),
            show_map: false,
            pending_destination: None,
        };
        state.app.sessions.create(session);
        short_id
    }

    fn test_app(state: HttpState) -> Router {
        router().with_state(state)
    }

    #[tokio::test]
    async fn test_game_card_png_200() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/game/png/{sid}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );

        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!body.is_empty());
        // PNG magic bytes
        assert_eq!(&body[..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[tokio::test]
    async fn test_game_card_svg_200() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/game/svg/{sid}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/svg+xml; charset=utf-8"
        );

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let svg = String::from_utf8_lossy(&body);
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
    }

    #[tokio::test]
    async fn test_game_card_not_found() {
        let state = test_state();
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/svg/game/png/nonexist")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_cache_control_present() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/game/svg/{sid}"))
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
        assert!(cc.contains("max-age=5"));
        assert!(cc.contains("stale-while-revalidate=10"));
    }

    #[tokio::test]
    async fn test_format_query_svg() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/game/{sid}?format=svg"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/svg+xml; charset=utf-8"
        );
    }

    // ── Map card endpoint tests ──────────────────────────────────

    #[tokio::test]
    async fn test_map_card_png_200() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/map/png/{sid}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );

        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(!body.is_empty());
        // PNG magic bytes
        assert_eq!(&body[..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[tokio::test]
    async fn test_map_card_svg_200() {
        let state = test_state();
        let sid = seed_session(&state);
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/svg/map/svg/{sid}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/svg+xml; charset=utf-8"
        );

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let svg = String::from_utf8_lossy(&body);
        assert!(svg.contains("<svg"), "should be valid SVG");
        assert!(svg.contains("</svg>"));
        // Verify SVG shape icons (not Unicode text)
        assert!(
            svg.contains("stroke-linecap") || svg.contains("stroke-width"),
            "map SVG should contain shape attributes"
        );
    }

    #[tokio::test]
    async fn test_map_card_not_found() {
        let state = test_state();
        let app = test_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/svg/map/png/nonexist")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
