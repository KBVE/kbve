use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use jedi::entity::pipe_clickhouse::factorio as ch_factorio;
use jedi::state::sidecar::ClickHouseConfig;
use kube::Client;
use serde::Serialize;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::ToSchema;

mod agones;
mod openapi;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct AppState {
    kube: Option<Client>,
    namespace: String,
    gameserver: String,
    server_id: String,
    clickhouse: Option<Arc<ClickHouseConfig>>,
}

fn iso8601_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub timestamp: String,
    /// Whether an in-cluster Kubernetes client was acquired.
    pub kube: bool,
}

/// Combined view of the GameServer (Agones) + latest telemetry snapshot
/// (ClickHouse). Telemetry fields are `None` until the relay has written a
/// recent snapshot or when ClickHouse is not configured.
#[derive(Debug, Serialize, ToSchema)]
pub struct ServerResponse {
    pub name: String,
    pub namespace: String,
    pub server_id: String,
    pub agones: agones::GameServerStatus,
    pub players: Option<u64>,
    pub ups: Option<f64>,
    pub map_age_game_s: Option<u64>,
    pub scenario: Option<String>,
    pub last_snapshot_ts: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[utoipa::path(
    get,
    path = "/factorio/health",
    tag = "system",
    responses((status = 200, description = "Liveness + build identity", body = HealthResponse))
)]
async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        service: "factorio-ctl",
        version: env!("CARGO_PKG_VERSION"),
        timestamp: iso8601_now(),
        kube: state.kube.is_some(),
    })
}

#[utoipa::path(
    get,
    path = "/factorio/server",
    tag = "server",
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "GameServer status + latest telemetry snapshot", body = ServerResponse),
        (status = 502, description = "Agones API unreachable or GameServer not found"),
        (status = 503, description = "In-cluster Kubernetes client unavailable")
    )
)]
async fn server(State(state): State<AppState>) -> Response {
    let Some(client) = state.kube.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "kubernetes client unavailable"})),
        )
            .into_response();
    };

    let agones_status =
        match agones::get_gameserver(client, &state.namespace, &state.gameserver).await {
            Ok(s) => s,
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({"error": format!("agones: {e}")})),
                )
                    .into_response();
            }
        };

    let mut resp = ServerResponse {
        name: state.gameserver.clone(),
        namespace: state.namespace.clone(),
        server_id: state.server_id.clone(),
        agones: agones_status,
        players: None,
        ups: None,
        map_age_game_s: None,
        scenario: None,
        last_snapshot_ts: None,
    };

    if let Some(ch) = state.clickhouse.as_ref() {
        let params = ch_factorio::FactorioParams {
            server_id: Some(state.server_id.clone()),
            minutes: Some(15),
            limit: Some(1),
        };
        match ch_factorio::run_current(ch, &params).await {
            Ok(out) => {
                if let Some(row) = out.rows.first() {
                    resp.players = pluck_u64(row, "players");
                    resp.ups = row.get("ups").and_then(|v| v.as_f64());
                    resp.map_age_game_s = pluck_u64(row, "map_age_game_s");
                    resp.scenario = row
                        .get("scenario")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    resp.last_snapshot_ts =
                        row.get("ts").and_then(|v| v.as_str()).map(str::to_string);
                }
            }
            Err(e) => tracing::warn!(error = %e, "clickhouse snapshot lookup failed"),
        }
    }

    Json(resp).into_response()
}

/// ClickHouse JSONEachRow can serialize UInt64 as a string; accept both.
fn pluck_u64(row: &serde_json::Value, key: &str) -> Option<u64> {
    let v = row.get(key)?;
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    if std::env::args().any(|arg| arg == "--emit-openapi") {
        use utoipa::OpenApi;
        let spec = openapi::ApiDoc::openapi();
        println!("{}", spec.to_pretty_json().expect("serialise OpenAPI"));
        return;
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "factorio_ctl=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port: u16 = std::env::var("FACTORIO_CTL_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9002);

    let namespace = std::env::var("FACTORIO_NAMESPACE").unwrap_or_else(|_| "factorio".into());
    let gameserver = std::env::var("FACTORIO_GAMESERVER").unwrap_or_else(|_| "factorio".into());
    let server_id = std::env::var("FACTORIO_SERVER_ID").unwrap_or_else(|_| "factorio-1".into());

    let kube = match Client::try_default().await {
        Ok(c) => {
            tracing::info!(namespace, gameserver, "kube client ready (in-cluster)");
            Some(c)
        }
        Err(e) => {
            tracing::warn!(error = %e, "kube client unavailable — /factorio/server will 503 (local dev?)");
            None
        }
    };

    let clickhouse = match ClickHouseConfig::from_env_resolved() {
        (cfg, true) => {
            tracing::info!(database = %cfg.database, "clickhouse configured");
            Some(Arc::new(cfg))
        }
        (_, false) => {
            tracing::warn!(
                "clickhouse endpoint unset — telemetry fields omitted from /factorio/server"
            );
            None
        }
    };

    let state = AppState {
        kube,
        namespace,
        gameserver,
        server_id,
        clickhouse,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/factorio/health", get(health))
        .route("/factorio/server", get(server))
        .route("/openapi.json", get(openapi::openapi_json))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("factorio-ctl listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
