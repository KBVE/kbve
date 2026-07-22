use crate::{engine, state};
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

#[derive(Clone)]
pub struct AppState {
    pub engine: engine::Engine,
    pub store: state::StateStore,
    pub token: Option<String>,
}

#[derive(Clone)]
pub struct AppStateStub {
    pub store: state::StateStore,
    pub token: Option<String>,
}

impl From<&AppState> for AppStateStub {
    fn from(s: &AppState) -> Self {
        Self { store: s.store.clone(), token: s.token.clone() }
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn check_auth(headers: &HeaderMap, token: &Option<String>) -> bool {
    match token {
        None => true,
        Some(t) => headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .map(|h| h == format!("Bearer {t}"))
            .unwrap_or(false),
    }
}

async fn list(State(st): State<AppStateStub>, headers: HeaderMap) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    Json(st.store.list()).into_response()
}

async fn get_one(
    State(st): State<AppStateStub>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let _ = st.store.touch(&id, now_secs());
    match st.store.get(&id) {
        Some(m) => Json(m).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn touch(
    State(st): State<AppStateStub>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match st.store.touch(&id, now_secs()) {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[derive(serde::Deserialize)]
struct AddReq {
    source: String,
}

async fn add(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AddReq>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match st.engine.add(&req.source).await {
        Ok(id) => Json(serde_json::json!({ "id": id })).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn remove(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match st.engine.delete(&id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

fn store_scoped_router(state: AppStateStub) -> Router {
    Router::new()
        .route("/torrents", get(list))
        .route("/torrents/{id}", get(get_one))
        .route("/torrents/{id}/touch", post(touch))
        .with_state(state)
}

pub fn router(state: AppState) -> Router {
    let stub = AppStateStub::from(&state);
    let engine_router = Router::new()
        .route("/torrents", post(add))
        .route("/torrents/{id}", axum::routing::delete(remove))
        .with_state(state);
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .merge(store_scoped_router(stub))
        .merge(engine_router)
}

#[cfg(test)]
fn store_router(store: state::StateStore, token: Option<String>) -> Router {
    store_scoped_router(AppStateStub { store, token })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Metadata, StateStore, TorrentState, TranscodeStatus};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn store_with_one() -> StateStore {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        std::mem::forget(dir);
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: "/lib/movie.mp4".into(),
            size: 5,
            completed_at: Some(10),
            last_access: 10,
            state: TorrentState::Seeding,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
        })
        .unwrap();
        s
    }

    #[tokio::test]
    async fn list_returns_items() {
        let app = store_router(store_with_one(), None);
        let res = app
            .oneshot(Request::get("/torrents").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = res.into_body().collect().await.unwrap().to_bytes();
        assert!(String::from_utf8_lossy(&body).contains("movie"));
    }

    #[tokio::test]
    async fn get_missing_is_404() {
        let app = store_router(store_with_one(), None);
        let res = app
            .oneshot(Request::get("/torrents/999").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn auth_required_when_token_set() {
        let app = store_router(store_with_one(), Some("secret".into()));
        let res = app
            .clone()
            .oneshot(Request::get("/torrents").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let ok = app
            .oneshot(
                Request::get("/torrents")
                    .header("Authorization", "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ok.status(), StatusCode::OK);
    }
}
