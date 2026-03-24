use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};

use crate::astro::askama::{SessionViewerTemplate, TemplateResponse};

use super::HttpState;

pub fn router() -> Router<HttpState> {
    Router::new()
        .route("/api/session/{session_id}", get(session_json))
        .route("/session/{session_id}", get(session_page))
}

/// JSON snapshot of a live game session.
async fn session_json(State(state): State<HttpState>, Path(session_id): Path<String>) -> Response {
    if !super::security::is_valid_session_id(&session_id) {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    }

    let handle = match state.app.sessions.get(&session_id) {
        Some(h) => h,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "session not found" })),
            )
                .into_response();
        }
    };

    let snapshot = handle.lock().await.clone();

    let mut resp = Json(snapshot).into_response();
    resp.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    resp
}

/// Server-rendered session viewer page.
async fn session_page(State(state): State<HttpState>, Path(session_id): Path<String>) -> Response {
    if !super::security::is_valid_session_id(&session_id) {
        return (StatusCode::BAD_REQUEST, "invalid session id").into_response();
    }

    if state.app.sessions.get(&session_id).is_none() {
        return (StatusCode::NOT_FOUND, "Session not found").into_response();
    }

    let template = SessionViewerTemplate {
        short_id: &session_id,
    };
    TemplateResponse(template).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use std::sync::Arc;
    use tower::ServiceExt;

    use crate::health::HealthMonitor;

    fn test_router() -> (Router, Arc<crate::state::AppState>) {
        let health_monitor = Arc::new(HealthMonitor::new());
        let app_state = Arc::new(crate::state::AppState::new(health_monitor, None));
        let state = HttpState {
            app: Arc::clone(&app_state),
        };
        let r = router().with_state(state);
        (r, app_state)
    }

    #[tokio::test]
    async fn session_json_404_for_missing() {
        let (app, _) = test_router();
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/session/deadbeef")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let body = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"], "session not found");
    }

    #[tokio::test]
    async fn session_page_404_for_missing() {
        let (app, _) = test_router();
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/session/deadbeef")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn session_json_returns_snapshot() {
        use crate::discord::game::types::*;
        use poise::serenity_prelude as serenity;
        use std::collections::HashMap;
        use std::time::Instant;

        let (app, state) = test_router();

        // Create a session
        let owner = serenity::UserId::new(42);
        let mut players = HashMap::new();
        players.insert(owner, PlayerState::default());
        let session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "abc12345".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 1,
            players,
            enemies: Vec::new(),
            room: crate::discord::game::content::generate_room(0),
            log: vec!["Adventure begins!".to_owned()],
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };
        state.sessions.create(session);

        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/session/abc12345")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );
        let body = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["short_id"], "abc12345");
        assert_eq!(json["turn"], 1);
        assert!(json["players"].is_object());
    }

    #[tokio::test]
    async fn session_page_renders_for_existing() {
        use crate::discord::game::types::*;
        use poise::serenity_prelude as serenity;
        use std::collections::HashMap;
        use std::time::Instant;

        let (app, state) = test_router();

        let owner = serenity::UserId::new(42);
        let mut players = HashMap::new();
        players.insert(owner, PlayerState::default());
        let session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "da6e1234".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 1,
            players,
            enemies: Vec::new(),
            room: crate::discord::game::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };
        state.sessions.create(session);

        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/session/da6e1234")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = resp.into_body().collect().await.unwrap().to_bytes();
        let html = String::from_utf8_lossy(&body);
        assert!(html.contains("da6e1234"));
        assert!(html.contains("Session Viewer"));
    }
}
