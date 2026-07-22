use crate::{engine, state, transcode};
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
    pub transcoder: transcode::Transcoder,
    pub stream_enabled: bool,
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

async fn transcode_start(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match st.transcoder.request(&id).await {
        transcode::RequestOutcome::Ready(p) => {
            (StatusCode::OK, Json(serde_json::json!({"status":"ready","path":p}))).into_response()
        }
        transcode::RequestOutcome::Started => {
            (StatusCode::ACCEPTED, Json(serde_json::json!({"status":"pending"}))).into_response()
        }
        transcode::RequestOutcome::InProgress(s) => {
            (StatusCode::ACCEPTED, Json(serde_json::json!({"status": format!("{s:?}")}))).into_response()
        }
        transcode::RequestOutcome::NotFound => StatusCode::NOT_FOUND.into_response(),
        transcode::RequestOutcome::NotCompleted => StatusCode::CONFLICT.into_response(),
        transcode::RequestOutcome::Disabled => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn stream_file(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    method: axum::http::Method,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !st.stream_enabled {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let meta = match st.store.get(&id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let head_only = method == axum::http::Method::HEAD;
    let range = headers.get("range").and_then(|h| h.to_str().ok());
    let _ = st.store.touch(&id, now_secs());

    match meta.state {
        state::TorrentState::Seeding => {
            let path = if meta.transcode == state::TranscodeStatus::Ready {
                meta.transcode_path.clone().map(std::path::PathBuf::from)
            } else {
                None
            };
            let path = match path {
                Some(p) => p,
                None => match transcode::pick_primary_file(std::path::Path::new(&meta.path)) {
                    Ok(p) => p,
                    Err(_) => return StatusCode::CONFLICT.into_response(),
                },
            };
            let file = match tokio::fs::File::open(&path).await {
                Ok(f) => f,
                Err(_) => return StatusCode::NOT_FOUND.into_response(),
            };
            let total = match file.metadata().await {
                Ok(m) => m.len(),
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
            let ct = crate::stream::content_type_for(&path.to_string_lossy());
            crate::stream::serve_range(file, total, range, ct, head_only).await
        }
        state::TorrentState::Leeching => {
            let files = match st.engine.list_files(&id) {
                Ok(Some(f)) => f,
                Ok(None) => return StatusCode::TOO_EARLY.into_response(),
                Err(_) => return StatusCode::TOO_EARLY.into_response(),
            };
            let idx = match engine::primary_file_index(&files) {
                Some(i) => i,
                None => return StatusCode::CONFLICT.into_response(),
            };
            let name = files
                .iter()
                .find(|f| f.index == idx)
                .map(|f| f.name.clone())
                .unwrap_or_default();
            let stream = match st.engine.open_stream(&id, idx) {
                Ok(s) => s,
                Err(_) => return StatusCode::TOO_EARLY.into_response(),
            };
            let total = files.iter().find(|f| f.index == idx).map(|f| f.len).unwrap_or(0);
            let ct = crate::stream::content_type_for(&name);
            crate::stream::serve_range(stream, total, range, ct, head_only).await
        }
        _ => StatusCode::CONFLICT.into_response(),
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
        .route("/torrents/{id}/transcode", post(transcode_start))
        .route("/torrents/{id}/stream", get(stream_file).head(stream_file))
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
fn transcode_router(transcoder: transcode::Transcoder, token: Option<String>) -> Router {
    #[derive(Clone)]
    struct TranscodeState {
        transcoder: transcode::Transcoder,
        token: Option<String>,
    }

    async fn handler(
        State(st): State<TranscodeState>,
        headers: HeaderMap,
        Path(id): Path<String>,
    ) -> impl IntoResponse {
        if !check_auth(&headers, &st.token) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        match st.transcoder.request(&id).await {
            transcode::RequestOutcome::Ready(p) => {
                (StatusCode::OK, Json(serde_json::json!({"status":"ready","path":p}))).into_response()
            }
            transcode::RequestOutcome::Started => {
                (StatusCode::ACCEPTED, Json(serde_json::json!({"status":"pending"}))).into_response()
            }
            transcode::RequestOutcome::InProgress(s) => {
                (StatusCode::ACCEPTED, Json(serde_json::json!({"status": format!("{s:?}")}))).into_response()
            }
            transcode::RequestOutcome::NotFound => StatusCode::NOT_FOUND.into_response(),
            transcode::RequestOutcome::NotCompleted => StatusCode::CONFLICT.into_response(),
            transcode::RequestOutcome::Disabled => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        }
    }

    Router::new()
        .route("/torrents/{id}/transcode", post(handler))
        .with_state(TranscodeState { transcoder, token })
}

#[cfg(test)]
fn stream_router(store: state::StateStore, token: Option<String>, stream_enabled: bool) -> Router {
    #[derive(Clone)]
    struct StreamState {
        store: state::StateStore,
        token: Option<String>,
        stream_enabled: bool,
    }

    async fn handler(
        State(st): State<StreamState>,
        headers: HeaderMap,
        Path(id): Path<String>,
    ) -> impl IntoResponse {
        if !check_auth(&headers, &st.token) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        if !st.stream_enabled {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
        match st.store.get(&id) {
            Some(_) => StatusCode::OK.into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        }
    }

    Router::new()
        .route("/torrents/{id}/stream", get(handler).head(handler))
        .with_state(StreamState { store, token, stream_enabled })
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

    fn transcoder_with(store: StateStore) -> transcode::Transcoder {
        transcode::Transcoder::new(store, 1, 1, "ffmpeg".into(), "ffprobe".into(), true)
    }

    #[tokio::test]
    async fn transcode_not_completed_is_409() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        std::mem::forget(dir);
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: "/lib/movie.mp4".into(),
            size: 5,
            completed_at: None,
            last_access: 10,
            state: TorrentState::Leeching,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
        })
        .unwrap();
        let app = transcode_router(transcoder_with(s), None);
        let res = app
            .oneshot(
                Request::post("/torrents/1/transcode")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn transcode_missing_id_is_404() {
        let app = transcode_router(transcoder_with(store_with_one()), None);
        let res = app
            .oneshot(
                Request::post("/torrents/999/transcode")
                    .body(Body::empty())
                    .unwrap(),
            )
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

    #[tokio::test]
    async fn stream_disabled_is_503() {
        let app = stream_router(store_with_one(), None, false);
        let res = app
            .oneshot(Request::get("/torrents/1/stream").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn stream_missing_id_is_404() {
        let app = stream_router(store_with_one(), None, true);
        let res = app
            .oneshot(Request::get("/torrents/999/stream").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn stream_requires_auth_when_token_set() {
        let app = stream_router(store_with_one(), Some("secret".into()), true);
        let res = app
            .oneshot(Request::get("/torrents/1/stream").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }
}
