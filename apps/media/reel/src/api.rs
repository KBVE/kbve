use crate::{engine, hls, state, transcode};
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
    pub hls: hls::HlsManager,
    pub ffprobe_bin: String,
}

#[derive(Clone)]
pub struct AppStateStub {
    pub store: state::StateStore,
    pub token: Option<String>,
}

impl From<&AppState> for AppStateStub {
    fn from(s: &AppState) -> Self {
        Self {
            store: s.store.clone(),
            token: s.token.clone(),
        }
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
    st.hls.abort(&id).await;
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
        transcode::RequestOutcome::Ready(p) => (
            StatusCode::OK,
            Json(serde_json::json!({"status":"ready","path":p})),
        )
            .into_response(),
        transcode::RequestOutcome::Started => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({"status":"pending"})),
        )
            .into_response(),
        transcode::RequestOutcome::InProgress(s) => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({"status": format!("{s:?}")})),
        )
            .into_response(),
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
            let ct = crate::stream::content_type_for(&path.to_string_lossy());
            if head_only {
                let total = match tokio::fs::metadata(&path).await {
                    Ok(m) => m.len(),
                    Err(_) => return StatusCode::NOT_FOUND.into_response(),
                };
                return crate::stream::head_response(total, range, ct);
            }
            let file = match tokio::fs::File::open(&path).await {
                Ok(f) => f,
                Err(_) => return StatusCode::NOT_FOUND.into_response(),
            };
            let total = match file.metadata().await {
                Ok(m) => m.len(),
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
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
            let total = files
                .iter()
                .find(|f| f.index == idx)
                .map(|f| f.len)
                .unwrap_or(0);
            let ct = crate::stream::content_type_for(&name);
            if head_only {
                return crate::stream::head_response(total, range, ct);
            }
            let stream = match st.engine.open_stream(&id, idx) {
                Ok(s) => s,
                Err(_) => return StatusCode::TOO_EARLY.into_response(),
            };
            crate::stream::serve_range(stream, total, range, ct, head_only).await
        }
        _ => StatusCode::CONFLICT.into_response(),
    }
}

async fn manifest(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !st.hls.enabled() {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let meta = match st.store.get(&id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let _ = st.store.touch(&id, now_secs());

    if meta.state != state::TorrentState::Seeding {
        return StatusCode::TOO_EARLY.into_response();
    }

    let primary = match transcode::pick_primary_file(std::path::Path::new(&meta.path)) {
        Ok(p) => p,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let probe = match transcode::probe(&st.ffprobe_bin, &primary).await {
        Ok(p) => p,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let delivery = transcode::decide_delivery(&probe);
    if delivery == transcode::Delivery::RawProgressive {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"delivery": "raw_progressive"})),
        )
            .into_response();
    }

    match st.hls.request(&id, delivery).await {
        hls::StartOutcome::Ready(dir) => serve_manifest_file(&dir).await,
        hls::StartOutcome::InProgress(status) => {
            if matches!(status, state::HlsStatus::Ready | state::HlsStatus::Live) {
                if let Some(dir) = st.store.get(&id).and_then(|m| m.hls_dir) {
                    return serve_manifest_file(&dir).await;
                }
            }
            (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({"status": format!("{status:?}")})),
            )
                .into_response()
        }
        hls::StartOutcome::Started => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({"status": "started"})),
        )
            .into_response(),
        hls::StartOutcome::NotFound => StatusCode::NOT_FOUND.into_response(),
        hls::StartOutcome::NotCompleted => StatusCode::TOO_EARLY.into_response(),
        hls::StartOutcome::RawProgressive => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"delivery": "raw_progressive"})),
        )
            .into_response(),
        hls::StartOutcome::Disabled => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn serve_manifest_file(dir: &str) -> axum::response::Response {
    let path = std::path::Path::new(dir).join("index.m3u8");
    let file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let total = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    crate::stream::serve_range(file, total, None, "application/vnd.apple.mpegurl", false).await
}

async fn hls_segment(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path((id, segment)): Path<(String, String)>,
    method: axum::http::Method,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !hls::valid_segment_name(&segment) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let meta = match st.store.get(&id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let dir = match meta.hls_dir {
        Some(d) => d,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let path = std::path::Path::new(&dir).join(&segment);
    let head_only = method == axum::http::Method::HEAD;
    let range = headers.get("range").and_then(|h| h.to_str().ok());
    let ct = if segment.ends_with(".ts") {
        "video/mp2t"
    } else {
        "application/vnd.apple.mpegurl"
    };
    if head_only {
        let total = match tokio::fs::metadata(&path).await {
            Ok(m) => m.len(),
            Err(_) => return StatusCode::NOT_FOUND.into_response(),
        };
        return crate::stream::head_response(total, range, ct);
    }
    let file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let total = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    crate::stream::serve_range(file, total, range, ct, head_only).await
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
        .route("/torrents/{id}/manifest.m3u8", get(manifest))
        .route(
            "/torrents/{id}/hls/{segment}",
            get(hls_segment).head(hls_segment),
        )
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
            transcode::RequestOutcome::Ready(p) => (
                StatusCode::OK,
                Json(serde_json::json!({"status":"ready","path":p})),
            )
                .into_response(),
            transcode::RequestOutcome::Started => (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({"status":"pending"})),
            )
                .into_response(),
            transcode::RequestOutcome::InProgress(s) => (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({"status": format!("{s:?}")})),
            )
                .into_response(),
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
        .with_state(StreamState {
            store,
            token,
            stream_enabled,
        })
}

#[cfg(test)]
fn hls_manifest_router(
    store: state::StateStore,
    token: Option<String>,
    hls: hls::HlsManager,
) -> Router {
    #[derive(Clone)]
    struct ManifestState {
        store: state::StateStore,
        token: Option<String>,
        hls: hls::HlsManager,
    }

    async fn handler(
        State(st): State<ManifestState>,
        headers: HeaderMap,
        Path(id): Path<String>,
    ) -> impl IntoResponse {
        if !check_auth(&headers, &st.token) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        if !st.hls.enabled() {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
        match st.store.get(&id) {
            Some(m) if m.state != state::TorrentState::Seeding => {
                StatusCode::TOO_EARLY.into_response()
            }
            Some(_) => StatusCode::OK.into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        }
    }

    Router::new()
        .route("/torrents/{id}/manifest.m3u8", get(handler))
        .with_state(ManifestState { store, token, hls })
}

#[cfg(test)]
fn hls_segment_router(store: state::StateStore, token: Option<String>) -> Router {
    #[derive(Clone)]
    struct SegmentState {
        store: state::StateStore,
        token: Option<String>,
    }

    async fn handler(
        State(st): State<SegmentState>,
        headers: HeaderMap,
        Path((id, segment)): Path<(String, String)>,
    ) -> impl IntoResponse {
        if !check_auth(&headers, &st.token) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        if !hls::valid_segment_name(&segment) {
            return StatusCode::BAD_REQUEST.into_response();
        }
        let meta = match st.store.get(&id) {
            Some(m) => m,
            None => return StatusCode::NOT_FOUND.into_response(),
        };
        match meta.hls_dir {
            Some(_) => StatusCode::OK.into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        }
    }

    Router::new()
        .route("/torrents/{id}/hls/{segment}", get(handler))
        .with_state(SegmentState { store, token })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{HlsStatus, Metadata, StateStore, TorrentState, TranscodeStatus};
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
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
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
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
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
            .oneshot(
                Request::get("/torrents/1/stream")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn stream_missing_id_is_404() {
        let app = stream_router(store_with_one(), None, true);
        let res = app
            .oneshot(
                Request::get("/torrents/999/stream")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn stream_requires_auth_when_token_set() {
        let app = stream_router(store_with_one(), Some("secret".into()), true);
        let res = app
            .oneshot(
                Request::get("/torrents/1/stream")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    fn hls_manager_with(store: StateStore, enabled: bool) -> crate::hls::HlsManager {
        crate::hls::HlsManager::new(store, 1, "ffmpeg".into(), 4, enabled)
    }

    #[tokio::test]
    async fn manifest_missing_id_is_404() {
        let store = store_with_one();
        let app = hls_manifest_router(store.clone(), None, hls_manager_with(store, true));
        let res = app
            .oneshot(
                Request::get("/torrents/999/manifest.m3u8")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn manifest_hls_disabled_is_503() {
        let store = store_with_one();
        let app = hls_manifest_router(store.clone(), None, hls_manager_with(store, false));
        let res = app
            .oneshot(
                Request::get("/torrents/1/manifest.m3u8")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn manifest_leeching_is_425() {
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
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let app = hls_manifest_router(s.clone(), None, hls_manager_with(s, true));
        let res = app
            .oneshot(
                Request::get("/torrents/1/manifest.m3u8")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::TOO_EARLY);
    }

    #[tokio::test]
    async fn hls_segment_rejects_bad_name_is_400() {
        let app = hls_segment_router(store_with_one(), None);
        let res = app
            .oneshot(
                Request::get("/torrents/1/hls/seg.ts")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn hls_segment_missing_dir_is_404() {
        let app = hls_segment_router(store_with_one(), None);
        let res = app
            .oneshot(
                Request::get("/torrents/1/hls/seg00001.ts")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }
}
