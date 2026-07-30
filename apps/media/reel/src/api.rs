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

use crate::util::now_secs;

fn derive_phase(m: &state::Metadata, live: Option<&engine::TorrentLive>) -> &'static str {
    use state::{HlsStatus, TorrentState, TranscodeStatus};
    match m.state {
        TorrentState::Failed => "failed",
        TorrentState::Reaped => "reaped",
        TorrentState::Leeching => match live {
            Some(l) if l.finished => "moving",
            Some(l) if l.total_bytes > 0 && l.progress_bytes > 0 => "downloading",
            Some(l) if l.total_bytes > 0 => "connecting",
            _ => "resolving-metadata",
        },
        TorrentState::Seeding => {
            if matches!(m.hls, HlsStatus::Live) {
                "streaming-hls"
            } else if matches!(
                m.transcode,
                TranscodeStatus::Pending | TranscodeStatus::Remuxing | TranscodeStatus::Encoding
            ) {
                "transcoding"
            } else {
                "ready"
            }
        }
    }
}

#[derive(serde::Serialize)]
struct TorrentView {
    #[serde(flatten)]
    meta: state::Metadata,
    phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    live: Option<engine::TorrentLive>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transcode_progress: Option<transcode::TranscodeProgress>,
}

impl TorrentView {
    fn build(
        meta: state::Metadata,
        live: Option<engine::TorrentLive>,
        transcode_progress: Option<transcode::TranscodeProgress>,
    ) -> Self {
        let phase = derive_phase(&meta, live.as_ref());
        Self {
            meta,
            phase,
            live,
            transcode_progress,
        }
    }
}

#[derive(serde::Serialize, Default)]
struct Counts {
    total: usize,
    leeching: usize,
    seeding: usize,
    failed: usize,
}

#[derive(serde::Serialize)]
struct StatusReport {
    vpn_ok: bool,
    trackers: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    bt_listen_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    forwarded_port: Option<u16>,
    inbound_ready: bool,
    counts: Counts,
    torrents: Vec<TorrentView>,
}

fn inbound_ready(listen: Option<u16>, forwarded: Option<u16>) -> bool {
    matches!((listen, forwarded), (Some(l), Some(f)) if l == f)
}

fn served_bytes(range: Option<&str>, total: u64) -> u64 {
    match crate::stream::parse_range(range, total) {
        Ok(Some(r)) => r.end.saturating_sub(r.start) + 1,
        _ => total,
    }
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

fn check_auth(headers: &HeaderMap, token: &Option<String>) -> bool {
    match token {
        None => true,
        Some(t) => headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .map(|got| ct_eq(got.as_bytes(), t.as_bytes()))
            .unwrap_or(false),
    }
}

fn token_from_query(query: Option<&str>) -> Option<String> {
    query?.split('&').find_map(|pair| {
        let mut it = pair.splitn(2, '=');
        match (it.next(), it.next()) {
            (Some("access_token"), Some(v)) => Some(v.to_string()),
            _ => None,
        }
    })
}

fn check_auth_q(headers: &HeaderMap, query: Option<&str>, token: &Option<String>) -> bool {
    if check_auth(headers, token) {
        return true;
    }
    matches!((token, token_from_query(query)), (Some(t), Some(q)) if ct_eq(q.as_bytes(), t.as_bytes()))
}

async fn list(State(st): State<AppStateStub>, headers: HeaderMap) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    Json(st.store.list()).into_response()
}

async fn live_stats(State(st): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    Json(st.engine.live_stats()).into_response()
}

async fn status(State(st): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut live = st.engine.live_stats_map();
    let mut counts = Counts::default();
    let mut torrents = Vec::new();
    for meta in st.store.list() {
        counts.total += 1;
        match meta.state {
            state::TorrentState::Leeching => counts.leeching += 1,
            state::TorrentState::Seeding => counts.seeding += 1,
            state::TorrentState::Failed => counts.failed += 1,
            state::TorrentState::Reaped => {}
        }
        let l = live.remove(&meta.id);
        let progress = st.transcoder.progress_of(&meta.id);
        torrents.push(TorrentView::build(meta, l, progress));
    }
    let bt_listen_port = st.engine.bt_listen_port();
    let forwarded_port = st.engine.forwarded_port();
    Json(StatusReport {
        vpn_ok: st.engine.vpn_ok(),
        trackers: st.engine.tracker_count(),
        bt_listen_port,
        forwarded_port,
        inbound_ready: inbound_ready(bt_listen_port, forwarded_port),
        counts,
        torrents,
    })
    .into_response()
}

async fn status_one(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_auth(&headers, &st.token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let meta = match st.store.get(&id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let live = st.engine.live_stats_map().remove(&id);
    let progress = st.transcoder.progress_of(&id);
    Json(TorrentView::build(meta, live, progress)).into_response()
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
    if !st.engine.vpn_ok() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "vpn egress unavailable; try again shortly",
        )
            .into_response();
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
    st.transcoder.abort(&id).await;
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
    transcode_core(&headers, &st.token, &st.transcoder, &id).await
}

async fn stream_file(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    axum::extract::RawQuery(query): axum::extract::RawQuery,
    method: axum::http::Method,
) -> impl IntoResponse {
    stream_core(
        &headers,
        query.as_deref(),
        &st.token,
        st.stream_enabled,
        &st.store,
        &st.engine,
        &id,
        &method,
    )
    .await
}

/// The file delivery should probe/serve: the finished transcode when it is
/// Ready, otherwise None (caller falls back to the largest source file). Keeps
/// manifest routing consistent with what `/stream` actually serves.
pub(crate) fn delivery_source(meta: &state::Metadata) -> Option<std::path::PathBuf> {
    if meta.transcode == state::TranscodeStatus::Ready {
        meta.transcode_path.clone().map(std::path::PathBuf::from)
    } else {
        None
    }
}

async fn manifest(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    axum::extract::RawQuery(query): axum::extract::RawQuery,
) -> impl IntoResponse {
    let meta = match manifest_status_core(
        &headers,
        query.as_deref(),
        &st.token,
        st.hls.enabled(),
        st.hls.live_enabled(),
        &st.store,
        &id,
    )
    .await
    {
        ManifestStep::Done(resp) => return resp,
        ManifestStep::Proceed(m) => m,
        ManifestStep::ProceedLive(m) => return live_manifest(&st, &id, m).await,
    };

    let delivery = match st.hls.cached_delivery(&id) {
        Some(d) => d,
        None => {
            let primary = match delivery_source(&meta) {
                Some(p) => p,
                None => match transcode::pick_primary_file_async(std::path::PathBuf::from(&meta.path)).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(id = %id, path = %meta.path, error = %e, "manifest: no primary media file");
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({"error": e.to_string()})),
                        )
                            .into_response();
                    }
                },
            };
            let probe = match transcode::probe(&st.ffprobe_bin, &primary).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!(id = %id, error = %e, "manifest: ffprobe failed");
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error": e.to_string()})),
                    )
                        .into_response();
                }
            };
            let d = transcode::decide_delivery(&probe);
            crate::telemetry::probe_decided(
                &id,
                probe.video_codec.as_deref().unwrap_or("none"),
                probe.audio_codec.as_deref().unwrap_or("none"),
                probe.container.as_deref().unwrap_or("none"),
                match d {
                    transcode::Delivery::RawProgressive => "raw_progressive",
                    transcode::Delivery::RemuxHls => "remux_hls",
                    transcode::Delivery::CopyVideoHls => "copy_video_hls",
                    transcode::Delivery::TranscodeHls => "transcode_hls",
                },
            );
            st.hls.cache_delivery(&id, d);
            d
        }
    };
    if delivery == transcode::Delivery::RawProgressive {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"delivery": "raw_progressive"})),
        )
            .into_response();
    }

    let outcome = st.hls.request(&id, delivery).await;
    hls_outcome_response(&st.store, &id, outcome).await
}

/// Popcorn manifest: begin (or join) a live HLS job for a still-downloading
/// torrent, transcoding from its in-flight librqbit stream.
async fn live_manifest(
    st: &AppState,
    id: &str,
    meta: state::Metadata,
) -> axum::response::Response {
    let out_dir = match meta.active_path {
        Some(d) => std::path::PathBuf::from(d),
        None => return StatusCode::TOO_EARLY.into_response(),
    };
    match st.engine.primary_stream(id) {
        engine::LeechStream::NotReady => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({"status": "resolving"})),
        )
            .into_response(),
        engine::LeechStream::NoMedia => StatusCode::CONFLICT.into_response(),
        engine::LeechStream::Ready { reader, .. } => {
            let outcome = st.hls.request_live(id, reader, out_dir).await;
            hls_outcome_response(&st.store, id, outcome).await
        }
    }
}

async fn serve_manifest_file(dir: &str) -> axum::response::Response {
    let path = std::path::Path::new(dir).join("index.m3u8");
    let body = match tokio::fs::read_to_string(&path).await {
        Ok(s) => s,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "application/vnd.apple.mpegurl",
        )],
        rewrite_manifest_paths(&body),
    )
        .into_response()
}

/// ffmpeg writes segment / child-playlist references as bare basenames, but the
/// top-level manifest is served from `…/torrents/{id}/manifest.m3u8` while the
/// files live under `…/torrents/{id}/hls/`. Prefix every resource reference
/// (segment lines, variant playlists, and `URI="…"` group attributes) with
/// `hls/` so the player resolves them against the segment route. Child
/// playlists are served raw — their basenames already resolve under `hls/`.
fn rewrite_manifest_paths(body: &str) -> String {
    fn needs_prefix(s: &str) -> bool {
        !s.is_empty() && !s.starts_with("hls/") && !s.contains("://") && !s.starts_with('/')
    }
    let mut out = String::with_capacity(body.len() + 64);
    for line in body.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            out.push('\n');
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('#') {
            // Rewrite a URI="…" attribute (subtitle/audio group refs) if present.
            if let Some(start) = rest.find("URI=\"") {
                let uri_start = "#".len() + start + "URI=\"".len();
                if let Some(end_rel) = trimmed[uri_start..].find('"') {
                    let uri = &trimmed[uri_start..uri_start + end_rel];
                    if needs_prefix(uri) {
                        out.push_str(&trimmed[..uri_start]);
                        out.push_str("hls/");
                        out.push_str(&trimmed[uri_start..]);
                        out.push('\n');
                        continue;
                    }
                }
            }
            out.push_str(trimmed);
        } else if needs_prefix(trimmed) {
            out.push_str("hls/");
            out.push_str(trimmed);
        } else {
            out.push_str(trimmed);
        }
        out.push('\n');
    }
    out
}

async fn hls_segment(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path((id, segment)): Path<(String, String)>,
    axum::extract::RawQuery(query): axum::extract::RawQuery,
    method: axum::http::Method,
) -> impl IntoResponse {
    hls_segment_core(
        &headers,
        query.as_deref(),
        &st.token,
        &st.store,
        &id,
        &segment,
        &method,
    )
    .await
}

pub(crate) async fn transcode_core(
    headers: &HeaderMap,
    token: &Option<String>,
    transcoder: &transcode::Transcoder,
    id: &str,
) -> axum::response::Response {
    if !check_auth(headers, token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match transcoder.request(id).await {
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

#[allow(clippy::too_many_arguments)]
pub(crate) async fn stream_core<S: engine::MediaSource>(
    headers: &HeaderMap,
    query: Option<&str>,
    token: &Option<String>,
    stream_enabled: bool,
    store: &state::StateStore,
    source: &S,
    id: &str,
    method: &axum::http::Method,
) -> axum::response::Response {
    if !check_auth_q(headers, query, token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !stream_enabled {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let meta = match store.get(id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let head_only = *method == axum::http::Method::HEAD;
    let range = headers.get("range").and_then(|h| h.to_str().ok());
    let _ = store.touch(id, now_secs());

    match meta.state {
        state::TorrentState::Seeding => {
            let path = if meta.transcode == state::TranscodeStatus::Ready {
                meta.transcode_path.clone().map(std::path::PathBuf::from)
            } else {
                None
            };
            let path = match path {
                Some(p) => p,
                None => match transcode::pick_primary_file_async(std::path::PathBuf::from(&meta.path)).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(id = %id, path = %meta.path, error = %e, "stream: no primary media file");
                        return StatusCode::CONFLICT.into_response();
                    }
                },
            };
            let ct = crate::stream::content_type_for(&path.to_string_lossy());
            if head_only {
                let total = match tokio::fs::metadata(&path).await {
                    Ok(m) => m.len(),
                    Err(e) => {
                        tracing::warn!(id = %id, path = %path.display(), error = %e, "stream: head stat failed");
                        return StatusCode::NOT_FOUND.into_response();
                    }
                };
                return crate::stream::head_response(total, range, ct);
            }
            let file = match tokio::fs::File::open(&path).await {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!(id = %id, path = %path.display(), error = %e, "stream: file open failed");
                    return StatusCode::NOT_FOUND.into_response();
                }
            };
            let total = match file.metadata().await {
                Ok(m) => m.len(),
                Err(e) => {
                    tracing::warn!(id = %id, error = %e, "stream: file stat failed");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            };
            crate::telemetry::stream_served(id, served_bytes(range, total), "progressive", range.is_some());
            crate::stream::serve_range(file, total, range, ct, head_only).await
        }
        state::TorrentState::Leeching => {
            let files = match source.entries(id) {
                Ok(Some(f)) => f,
                Ok(None) => return StatusCode::TOO_EARLY.into_response(),
                Err(e) => {
                    tracing::warn!(id = %id, error = %e, "stream: leech entries unavailable");
                    return StatusCode::TOO_EARLY.into_response();
                }
            };
            let idx = match engine::primary_file_index(&files) {
                Some(i) => i,
                None => {
                    tracing::warn!(id = %id, "stream: no media file in leeching torrent");
                    return StatusCode::CONFLICT.into_response();
                }
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
            let stream = match source.open(id, idx) {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!(id = %id, error = %e, "stream: leech open failed");
                    return StatusCode::TOO_EARLY.into_response();
                }
            };
            crate::telemetry::stream_served(id, served_bytes(range, total), "leeching", range.is_some());
            crate::stream::serve_range(stream, total, range, ct, head_only).await
        }
        state::TorrentState::Failed => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "state": "failed",
                "error": meta.error.unwrap_or_else(|| "torrent failed".into()),
            })),
        )
            .into_response(),
        _ => StatusCode::CONFLICT.into_response(),
    }
}

pub(crate) enum ManifestStep {
    Done(axum::response::Response),
    Proceed(state::Metadata),
    ProceedLive(state::Metadata),
}

pub(crate) async fn manifest_status_core(
    headers: &HeaderMap,
    query: Option<&str>,
    token: &Option<String>,
    hls_enabled: bool,
    live_enabled: bool,
    store: &state::StateStore,
    id: &str,
) -> ManifestStep {
    if !check_auth_q(headers, query, token) {
        return ManifestStep::Done(StatusCode::UNAUTHORIZED.into_response());
    }
    if !hls_enabled {
        return ManifestStep::Done(StatusCode::SERVICE_UNAVAILABLE.into_response());
    }
    let meta = match store.get(id) {
        Some(m) => m,
        None => return ManifestStep::Done(StatusCode::NOT_FOUND.into_response()),
    };
    let _ = store.touch(id, now_secs());

    match meta.hls {
        state::HlsStatus::Live | state::HlsStatus::Ready => {
            return match &meta.hls_dir {
                Some(dir) => ManifestStep::Done(serve_manifest_file(dir).await),
                None => ManifestStep::Done(StatusCode::INTERNAL_SERVER_ERROR.into_response()),
            };
        }
        state::HlsStatus::Starting => {
            return ManifestStep::Done(
                (
                    StatusCode::ACCEPTED,
                    Json(serde_json::json!({"status": "starting"})),
                )
                    .into_response(),
            );
        }
        state::HlsStatus::None | state::HlsStatus::Failed => {}
    }

    match meta.state {
        state::TorrentState::Seeding => ManifestStep::Proceed(meta),
        // Popcorn path: play while the download is still in flight.
        state::TorrentState::Leeching if live_enabled => ManifestStep::ProceedLive(meta),
        state::TorrentState::Failed => ManifestStep::Done(
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "state": "failed",
                    "error": meta.error.clone().unwrap_or_else(|| "torrent failed".into()),
                })),
            )
                .into_response(),
        ),
        _ => ManifestStep::Done(StatusCode::TOO_EARLY.into_response()),
    }
}

/// Map an HLS start outcome to an HTTP response, serving the manifest when the
/// job is already Ready/Live. Shared by the completed and live manifest paths.
async fn hls_outcome_response(
    store: &state::StateStore,
    id: &str,
    outcome: hls::StartOutcome,
) -> axum::response::Response {
    match outcome {
        hls::StartOutcome::Ready(dir) => serve_manifest_file(&dir).await,
        hls::StartOutcome::InProgress(status) => {
            if matches!(status, state::HlsStatus::Ready | state::HlsStatus::Live) {
                if let Some(dir) = store.get(id).and_then(|m| m.hls_dir) {
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

pub(crate) async fn hls_segment_core(
    headers: &HeaderMap,
    query: Option<&str>,
    token: &Option<String>,
    store: &state::StateStore,
    id: &str,
    segment: &str,
    method: &axum::http::Method,
) -> axum::response::Response {
    if !check_auth_q(headers, query, token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !hls::valid_segment_name(segment) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let meta = match store.get(id) {
        Some(m) => m,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let dir = match meta.hls_dir {
        Some(d) => d,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let path = std::path::Path::new(&dir).join(segment);
    let head_only = *method == axum::http::Method::HEAD;
    if !head_only {
        let _ = store.touch(id, now_secs());
    }
    let range = headers.get("range").and_then(|h| h.to_str().ok());
    let ct = if segment.ends_with(".ts") {
        "video/mp2t"
    } else if segment.ends_with(".vtt") {
        "text/vtt"
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
        Err(e) => {
            tracing::warn!(id = %id, segment, path = %path.display(), error = %e, "hls segment open failed");
            return StatusCode::NOT_FOUND.into_response();
        }
    };
    let total = match file.metadata().await {
        Ok(m) => m.len(),
        Err(e) => {
            tracing::warn!(id = %id, segment, error = %e, "hls segment stat failed");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    crate::telemetry::stream_served(id, served_bytes(range, total), "hls", range.is_some());
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
        .route("/stats", get(live_stats))
        .route("/status", get(status))
        .route("/torrents/{id}/status", get(status_one))
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
mod tests {
    use super::*;
    use crate::state::{HlsStatus, Metadata, StateStore, TorrentState, TranscodeStatus};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tempfile::tempdir;
    use tower::ServiceExt;

    use axum::http::Method;

    struct FakeSource {
        entries: Option<Vec<crate::engine::FileEntry>>,
        data: Vec<u8>,
    }

    impl crate::engine::MediaSource for FakeSource {
        fn entries(&self, _id: &str) -> anyhow::Result<Option<Vec<crate::engine::FileEntry>>> {
            Ok(self.entries.clone())
        }
        fn open(
            &self,
            _id: &str,
            _file_id: usize,
        ) -> anyhow::Result<Box<dyn crate::engine::ReadSeek>> {
            Ok(Box::new(std::io::Cursor::new(self.data.clone())))
        }
    }

    fn no_source() -> FakeSource {
        FakeSource { entries: None, data: vec![] }
    }

    fn bearer(token: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("Authorization", format!("Bearer {token}").parse().unwrap());
        h
    }

    fn meta_for(state: TorrentState) -> Metadata {
        Metadata {
            id: "1".into(),
            name: "m".into(),
            path: "/lib/m".into(),
            size: 0,
            completed_at: None,
            last_access: 0,
            state,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        }
    }

    #[test]
    fn rewrite_manifest_prefixes_media_playlist_segments() {
        let src = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.0,\nseg00001.ts\nhls/seg00002.ts\n";
        let out = rewrite_manifest_paths(src);
        assert!(out.contains("\nhls/seg00001.ts\n"), "bare segment prefixed");
        assert!(!out.contains("hls/hls/"), "already-prefixed left alone");
        assert!(out.contains("#EXTINF:4.0,"), "tags untouched");
    }

    #[test]
    fn rewrite_manifest_prefixes_master_variants_and_subs() {
        let src = "#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"subs\",NAME=\"s\",DEFAULT=YES,URI=\"stream_0_vtt.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=1,SUBTITLES=\"subs\"\nstream_0.m3u8\n";
        let out = rewrite_manifest_paths(src);
        assert!(out.contains("URI=\"hls/stream_0_vtt.m3u8\""), "sub URI prefixed");
        assert!(out.contains("\nhls/stream_0.m3u8\n"), "variant playlist prefixed");
        assert!(out.contains("GROUP-ID=\"subs\""), "other attrs preserved");
    }

    #[test]
    fn delivery_source_prefers_ready_transcode() {
        let mut m = meta_for(TorrentState::Seeding);
        assert_eq!(delivery_source(&m), None, "no transcode -> fall back to source");
        m.transcode = TranscodeStatus::Ready;
        m.transcode_path = Some("/lib/m/x.reel.mp4".into());
        assert_eq!(
            delivery_source(&m),
            Some(std::path::PathBuf::from("/lib/m/x.reel.mp4"))
        );
        m.transcode = TranscodeStatus::Ready;
        m.transcode_path = None;
        assert_eq!(delivery_source(&m), None, "ready but no path -> fall back");
    }

    fn live_for(progress: u64, total: u64, finished: bool) -> crate::engine::TorrentLive {
        crate::engine::TorrentLive {
            id: "1".into(),
            progress_bytes: progress,
            total_bytes: total,
            finished,
            download_mbps: 0.0,
            upload_mbps: 0.0,
            peers_live: 0,
            peers_seen: 0,
            peers_connecting: 0,
        }
    }

    #[test]
    fn phase_leeching_reflects_live_progress() {
        let m = meta_for(TorrentState::Leeching);
        assert_eq!(derive_phase(&m, None), "resolving-metadata");
        assert_eq!(derive_phase(&m, Some(&live_for(0, 100, false))), "connecting");
        assert_eq!(derive_phase(&m, Some(&live_for(50, 100, false))), "downloading");
        assert_eq!(derive_phase(&m, Some(&live_for(100, 100, true))), "moving");
    }

    #[test]
    fn phase_seeding_reflects_transcode_and_hls() {
        let mut m = meta_for(TorrentState::Seeding);
        assert_eq!(derive_phase(&m, None), "ready");
        m.transcode = TranscodeStatus::Encoding;
        assert_eq!(derive_phase(&m, None), "transcoding");
        m.transcode = TranscodeStatus::None;
        m.hls = HlsStatus::Live;
        assert_eq!(derive_phase(&m, None), "streaming-hls");
    }

    #[test]
    fn inbound_ready_requires_matching_ports() {
        assert!(inbound_ready(Some(51820), Some(51820)));
        assert!(!inbound_ready(Some(51820), Some(6881)));
        assert!(!inbound_ready(Some(51820), None));
        assert!(!inbound_ready(None, Some(51820)));
        assert!(!inbound_ready(None, None));
    }

    #[test]
    fn phase_failed_and_reaped() {
        assert_eq!(derive_phase(&meta_for(TorrentState::Failed), None), "failed");
        assert_eq!(derive_phase(&meta_for(TorrentState::Reaped), None), "reaped");
    }

    #[test]
    fn ct_eq_matches_only_equal_slices() {
        assert!(ct_eq(b"secret", b"secret"));
        assert!(!ct_eq(b"secret", b"secreu"));
        assert!(!ct_eq(b"secret", b"secre"));
        assert!(!ct_eq(b"", b"x"));
        assert!(ct_eq(b"", b""));
    }

    #[test]
    fn check_auth_accepts_correct_bearer_rejects_wrong() {
        let tok = Some("tok123".to_string());
        assert!(check_auth(&bearer("tok123"), &tok));
        assert!(!check_auth(&bearer("wrong"), &tok));
        assert!(!check_auth(&HeaderMap::new(), &tok));
        assert!(check_auth(&HeaderMap::new(), &None));
    }

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
            error: None,
            active_path: None,
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
        transcode::Transcoder::new(store, 1, 1, "ffmpeg".into(), "ffprobe".into(), true, 1)
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
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let res = transcode_core(&HeaderMap::new(), &None, &transcoder_with(s), "1").await;
        assert_eq!(res.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn transcode_missing_id_is_404() {
        let res =
            transcode_core(&HeaderMap::new(), &None, &transcoder_with(store_with_one()), "999")
                .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn transcode_requires_auth_when_token_set() {
        let res = transcode_core(
            &HeaderMap::new(),
            &Some("secret".into()),
            &transcoder_with(store_with_one()),
            "1",
        )
        .await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
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

    #[test]
    fn token_from_query_extracts_token() {
        assert_eq!(
            token_from_query(Some("access_token=abc")).as_deref(),
            Some("abc")
        );
        assert_eq!(
            token_from_query(Some("foo=1&access_token=abc&bar=2")).as_deref(),
            Some("abc")
        );
        assert_eq!(token_from_query(Some("foo=1")), None);
        assert_eq!(token_from_query(Some("token=abc")), None);
        assert_eq!(token_from_query(None), None);
        assert_eq!(token_from_query(Some("access_token=")).as_deref(), Some(""));
    }

    #[test]
    fn check_auth_q_accepts_header_or_query() {
        let token = Some("secret".to_string());
        let empty = HeaderMap::new();
        let mut hdr = HeaderMap::new();
        hdr.insert("Authorization", "Bearer secret".parse().unwrap());

        assert!(check_auth_q(&hdr, None, &token));
        assert!(check_auth_q(&empty, Some("access_token=secret"), &token));
        assert!(check_auth_q(&empty, Some("x=1&access_token=secret"), &token));
        assert!(!check_auth_q(&empty, Some("access_token=wrong"), &token));
        assert!(!check_auth_q(&empty, None, &token));
        assert!(!check_auth_q(&empty, Some("nope=secret"), &token));
        assert!(check_auth_q(&empty, None, &None));
    }

    #[tokio::test]
    async fn stream_disabled_is_503() {
        let res = stream_core(
            &HeaderMap::new(), None, &None, false,
            &store_with_one(), &no_source(), "1", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn stream_missing_id_is_404() {
        let res = stream_core(
            &HeaderMap::new(), None, &None, true,
            &store_with_one(), &no_source(), "999", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn stream_requires_auth_when_token_set() {
        let res = stream_core(
            &HeaderMap::new(), None, &Some("secret".into()), true,
            &store_with_one(), &no_source(), "1", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn stream_seeding_serves_real_file_200() {
        let dir = tempdir().unwrap();
        let lib = dir.path().join("lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("movie.mp4"), b"hello reel bytes").unwrap();
        let s = StateStore::load(dir.path().join("state.json")).unwrap();
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: lib.display().to_string(),
            size: 16,
            completed_at: Some(10),
            last_access: 10,
            state: TorrentState::Seeding,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        std::mem::forget(dir);
        let res = stream_core(
            &HeaderMap::new(), None, &None, true,
            &s, &no_source(), "1", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let body = res.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"hello reel bytes");
    }

    #[tokio::test]
    async fn stream_leeching_serves_from_source_200() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        std::mem::forget(dir);
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: "/lib/movie.mkv".into(),
            size: 0,
            completed_at: None,
            last_access: 0,
            state: TorrentState::Leeching,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let source = FakeSource {
            entries: Some(vec![crate::engine::FileEntry {
                index: 0,
                name: "movie.mkv".into(),
                len: 5,
            }]),
            data: b"12345".to_vec(),
        };
        let res = stream_core(
            &HeaderMap::new(), None, &None, true,
            &s, &source, "1", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        let body = res.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"12345");
    }

    #[tokio::test]
    async fn stream_failed_state_is_409() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        std::mem::forget(dir);
        s.upsert(Metadata {
            id: "1".into(),
            name: "x".into(),
            path: "/lib/x".into(),
            size: 0,
            completed_at: None,
            last_access: 0,
            state: TorrentState::Failed,
            error: Some("boom".into()),
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let res = stream_core(
            &HeaderMap::new(), None, &None, true,
            &s, &no_source(), "1", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::CONFLICT);
    }

    fn manifest_done(step: ManifestStep) -> axum::response::Response {
        match step {
            ManifestStep::Done(r) => r,
            ManifestStep::Proceed(_) => panic!("expected Done, got Proceed"),
            ManifestStep::ProceedLive(_) => panic!("expected Done, got ProceedLive"),
        }
    }

    #[tokio::test]
    async fn manifest_missing_id_is_404() {
        let res = manifest_done(
            manifest_status_core(&HeaderMap::new(), None, &None, true, false, &store_with_one(), "999").await,
        );
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn manifest_hls_disabled_is_503() {
        let res = manifest_done(
            manifest_status_core(&HeaderMap::new(), None, &None, false, false, &store_with_one(), "1").await,
        );
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn manifest_requires_auth_when_token_set() {
        let res = manifest_done(
            manifest_status_core(
                &HeaderMap::new(), None, &Some("secret".into()), true, false, &store_with_one(), "1",
            )
            .await,
        );
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn manifest_seeding_none_proceeds_to_delivery() {
        let res = manifest_status_core(&HeaderMap::new(), None, &None, true, false, &store_with_one(), "1").await;
        assert!(matches!(res, ManifestStep::Proceed(_)));
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
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let res = manifest_done(
            manifest_status_core(&HeaderMap::new(), None, &None, true, false, &s, "1").await,
        );
        assert_eq!(res.status(), StatusCode::TOO_EARLY);
    }

    #[tokio::test]
    async fn manifest_leeching_with_live_proceeds_live() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        std::mem::forget(dir);
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: String::new(),
            size: 0,
            completed_at: None,
            last_access: 10,
            state: TorrentState::Leeching,
            error: None,
            active_path: Some("/data/active/1".into()),
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })
        .unwrap();
        let step = manifest_status_core(&HeaderMap::new(), None, &None, true, true, &s, "1").await;
        assert!(matches!(step, ManifestStep::ProceedLive(_)));
    }

    #[tokio::test]
    async fn manifest_ready_with_hls_dir_serves_200() {
        let dir = tempdir().unwrap();
        let hls_dir = dir.path().join("hls");
        std::fs::create_dir_all(&hls_dir).unwrap();
        std::fs::write(hls_dir.join("index.m3u8"), b"#EXTM3U\n").unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: "/lib/movie.mp4".into(),
            size: 5,
            completed_at: Some(10),
            last_access: 10,
            state: TorrentState::Seeding,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::Ready,
            hls_dir: Some(hls_dir.display().to_string()),
            hls_error: None,
        })
        .unwrap();
        std::mem::forget(dir);
        let res = manifest_done(
            manifest_status_core(&HeaderMap::new(), None, &None, true, false, &s, "1").await,
        );
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers().get("content-type").unwrap(),
            "application/vnd.apple.mpegurl"
        );
    }

    #[tokio::test]
    async fn hls_segment_rejects_bad_name_is_400() {
        let res = hls_segment_core(
            &HeaderMap::new(), None, &None, &store_with_one(), "1", "seg-1.mp4", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn hls_segment_missing_dir_is_404() {
        let res = hls_segment_core(
            &HeaderMap::new(), None, &None, &store_with_one(), "1", "seg00001.ts", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn hls_segment_serves_real_segment_200() {
        let dir = tempdir().unwrap();
        let hls_dir = dir.path().join("hls");
        std::fs::create_dir_all(&hls_dir).unwrap();
        std::fs::write(hls_dir.join("seg00001.ts"), b"tsdata").unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        s.upsert(Metadata {
            id: "1".into(),
            name: "movie".into(),
            path: "/lib/movie.mp4".into(),
            size: 5,
            completed_at: Some(10),
            last_access: 10,
            state: TorrentState::Seeding,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::Ready,
            hls_dir: Some(hls_dir.display().to_string()),
            hls_error: None,
        })
        .unwrap();
        std::mem::forget(dir);
        let res = hls_segment_core(
            &HeaderMap::new(), None, &None, &s, "1", "seg00001.ts", &Method::GET,
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers().get("content-type").unwrap(), "video/mp2t");
        let body = res.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"tsdata");
    }

    #[tokio::test]
    async fn auth_via_bearer_header_passes_core() {
        let res = transcode_core(
            &bearer("secret"),
            &Some("secret".into()),
            &transcoder_with(store_with_one()),
            "999",
        )
        .await;
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }
}
