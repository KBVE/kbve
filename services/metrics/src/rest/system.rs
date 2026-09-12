use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Redirect};
use serde_json::json;

use crate::state::AppState;

const READINESS_TIMEOUT: Duration = Duration::from_secs(2);
const TELEMETRY_DASHBOARD: &str = "https://kbve.com/dashboard/telemetry";

pub async fn index() -> Html<&'static str> {
    Html(include_str!("index.html"))
}

/// The dashboard lives on kbve.com behind the same staff gate as every other
/// one, so this service shipping a second copy only created a second URL that
/// looks authoritative and answers differently. Permanent, because the old page
/// is gone rather than moved aside.
pub async fn dashboard() -> Redirect {
    Redirect::permanent(TELEMETRY_DASHBOARD)
}

pub async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "service": "metrics",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn readiness(State(app): State<Arc<AppState>>) -> impl IntoResponse {
    // Bounded so a hung ClickHouse fails fast to "degraded" instead of hanging
    // until the kube probe deadline.
    let reachable = matches!(
        tokio::time::timeout(READINESS_TIMEOUT, app.ch.execute_select("SELECT 1")).await,
        Ok(Ok(_))
    );
    // Reachable is not the same as usable. The telemetry schema comes from a
    // one-shot setup job, and when that job has not run the service happily
    // accepts events and drops every one of them on the floor — 202 to the
    // client, an error in a log nobody is reading. Not ready is the honest
    // answer to that, and it is the answer that makes the deployment say so.
    let schema = if reachable {
        matches!(
            tokio::time::timeout(READINESS_TIMEOUT, app.schema_ready()).await,
            Ok(true)
        )
    } else {
        false
    };
    let ready = reachable && schema;
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let body = json!({
        "status": if ready { "ready" } else { "degraded" },
        "service": "metrics",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": app.started_at.elapsed().as_secs(),
        "clickhouse": reachable,
        "errors_table": schema,
    });
    (status, Json(body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use jedi::state::sidecar::ClickHouseConfig;
    use tokio::sync::mpsc;
    use tower::ServiceExt;

    /// A ClickHouse that is up but has no telemetry schema — `SELECT 1` succeeds,
    /// anything touching the errors table does not.
    ///
    /// A stub rather than an unreachable port, because unreachable makes *both*
    /// checks fail and the test then passes whether or not the table check is
    /// wired in at all. This is the only shape that can tell the new verdict
    /// apart from the old one.
    async fn clickhouse_without_the_schema() -> String {
        let app = axum::Router::new().fallback(|body: String| async move {
            if body.contains("errors_distributed") {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Code: 60. DB::Exception: Table telemetry.errors_distributed does not exist",
                )
            } else {
                (StatusCode::OK, "1\n")
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        format!("http://{addr}")
    }

    fn state_against(url: String) -> Arc<AppState> {
        let (tx, _rx) = mpsc::channel(8);
        Arc::new(AppState::new(
            Config::from_env(),
            ClickHouseConfig {
                url,
                user: "test".to_string(),
                password: String::new(),
                database: "telemetry".to_string(),
            },
            tx,
            None,
        ))
    }

    async fn readiness_of(state: Arc<AppState>) -> (StatusCode, serde_json::Value) {
        let resp = crate::rest::router(state)
            .oneshot(
                axum::http::Request::builder()
                    .uri("/readiness")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = resp.status();
        let body = axum::body::to_bytes(resp.into_body(), 64 * 1024)
            .await
            .unwrap();
        (status, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test]
    async fn a_reachable_clickhouse_with_no_errors_table_is_not_ready() {
        let (status, json) =
            readiness_of(state_against(clickhouse_without_the_schema().await)).await;

        // The old probe ran `SELECT 1`, which this stub answers happily, and would
        // have called the service ready while every ingested event was dropped for
        // want of a table to put it in.
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(json["status"], "degraded");
        assert_eq!(json["clickhouse"], true, "the server is up, and says so");
        assert_eq!(json["errors_table"], false, "but the schema is not there");
    }

    #[tokio::test]
    async fn an_unreachable_clickhouse_is_not_ready_either() {
        let (status, json) = readiness_of(state_against("http://127.0.0.1:1".to_string())).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(json["clickhouse"], false);
        assert_eq!(json["errors_table"], false);
    }
}
