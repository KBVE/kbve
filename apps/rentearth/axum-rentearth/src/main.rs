use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Json, Redirect},
    routing::get,
};
use jedi::entity::error::JediError;
use jedi::entity::itch::{ClientVersion, ItchClient, ItchPlatform};
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tower::ServiceExt;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, services::ServeDir, trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

const REFRESH_SECS: u64 = 60;

#[derive(Clone)]
struct DownloadState {
    itch: ItchClient,
    game_id: u64,
    channel: Option<String>,
    snapshot: Arc<RwLock<Vec<ClientVersion>>>,
}

impl DownloadState {
    async fn refresh(&self) {
        match self.itch.client_versions(self.game_id).await {
            Ok(v) => *self.snapshot.write().await = v,
            Err(e) => tracing::warn!("itch client_versions refresh failed: {e}"),
        }
    }
}

fn health_body(clients: Value) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "axum-rentearth",
        "version": env!("CARGO_PKG_VERSION"),
        "clients": clients,
    }))
}

async fn health(State(state): State<Arc<DownloadState>>) -> Json<Value> {
    health_body(json!(*state.snapshot.read().await))
}

async fn health_basic() -> Json<Value> {
    health_body(Value::Null)
}

async fn downloads_json(State(state): State<Arc<DownloadState>>) -> Json<Vec<ClientVersion>> {
    Json(state.snapshot.read().await.clone())
}

async fn download(
    State(state): State<Arc<DownloadState>>,
    Path(platform): Path<String>,
) -> Result<Redirect, JediError> {
    let platform = ItchPlatform::parse(&platform)
        .ok_or_else(|| JediError::BadRequest(format!("unknown platform: {platform}")))?;
    let url = state
        .itch
        .resolve_download(state.game_id, platform, state.channel.as_deref())
        .await?;
    Ok(Redirect::temporary(&url))
}

fn download_state() -> Option<Arc<DownloadState>> {
    let api_key = std::env::var("ITCH_API").ok()?;
    let game_id = std::env::var("ITCH_GAME_ID").ok()?.parse().ok()?;
    let channel = std::env::var("ITCH_CHANNEL").ok().filter(|c| !c.is_empty());
    Some(Arc::new(DownloadState {
        itch: ItchClient::new(api_key),
        game_id,
        channel,
        snapshot: Arc::new(RwLock::new(Vec::new())),
    }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let static_dir = std::env::var("STATIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("templates/dist"));

    tracing::info!("serving static files from {}", static_dir.display());

    // SPA fallback: the web is a TanStack single-page app, so any client-routed
    // path that isn't a real file (deep link / refresh) must serve index.html
    // with 200 rather than 404. Explicit /api + /downloads routes match first.
    let index_html = std::fs::read_to_string(static_dir.join("index.html")).unwrap_or_default();
    let spa_index = tower::service_fn(move |_req: axum::extract::Request| {
        let html = index_html.clone();
        std::future::ready(Ok::<_, std::convert::Infallible>(
            Html(html).into_response(),
        ))
    });
    // not_found_service supplies the index body but tower-http pins the status to
    // 404 (it's meant for 404 pages); rewrite to 200 so the SPA loads cleanly.
    let static_svc = ServeDir::new(&static_dir)
        .precompressed_br()
        .precompressed_gzip()
        .append_index_html_on_directories(true)
        .not_found_service(spa_index)
        .map_response(|mut res| {
            if res.status() == StatusCode::NOT_FOUND {
                *res.status_mut() = StatusCode::OK;
            }
            res
        });

    let app: Router = match download_state() {
        Some(state) => {
            state.refresh().await;
            let bg = state.clone();
            tokio::spawn(async move {
                let mut tick = tokio::time::interval(Duration::from_secs(REFRESH_SECS));
                loop {
                    tick.tick().await;
                    bg.refresh().await;
                }
            });
            tracing::info!("itch downloads enabled for game {}", state.game_id);
            Router::new()
                .route("/health", get(health))
                .route("/api/health", get(health))
                .route("/api/downloads", get(downloads_json))
                .route("/downloads/{platform}", get(download))
                .with_state(state)
        }
        None => {
            tracing::warn!("ITCH_API/ITCH_GAME_ID unset; /downloads disabled");
            Router::new()
                .route("/health", get(health_basic))
                .route("/api/health", get(health_basic))
        }
    };

    let app = app
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .fallback_service(static_svc);

    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "4323".to_string())
        .parse()
        .expect("HTTP_PORT must be a valid port");

    let addr: SocketAddr = format!("{host}:{port}").parse().unwrap();
    tracing::info!("axum-rentearth listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
