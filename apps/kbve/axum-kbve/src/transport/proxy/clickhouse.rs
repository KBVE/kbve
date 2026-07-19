use std::sync::OnceLock;

use axum::{
    body::{Bytes},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;
use tracing::warn;

use super::core::*;

use jedi::entity::pipe_clickhouse::alerts as ch_alerts;
use jedi::entity::pipe_clickhouse::factorio as ch_factorio;
use jedi::entity::pipe_clickhouse::logs as ch_logs;
use jedi::state::sidecar::ClickHouseConfig;

static CLICKHOUSE_DIRECT: OnceLock<ClickHouseConfig> = OnceLock::new();

pub fn init_clickhouse_direct() -> bool {
    let (config, url_explicit) = ClickHouseConfig::from_env_resolved();

    if !url_explicit {
        warn!(
            "ClickHouse direct route refused — set CLICKHOUSE_ENDPOINT (preferred) or \
             CLICKHOUSE_HOST/PORT in the deployment env."
        );
        return false;
    }

    if config.database == "default" && std::env::var("CLICKHOUSE_DATABASE").is_err() {
        warn!(
            "ClickHouse direct route initialized with database=default — set \
             CLICKHOUSE_DATABASE (e.g. observability) so queries hit the right schema."
        );
    }

    CLICKHOUSE_DIRECT.set(config).is_ok()
}

/// Body schema for `POST /dashboard/clickhouse/proxy`. Mirrors the legacy
/// supabase edge function at `/functions/v1/logs` so the dashboard JS in
/// `clickhouseService.ts` doesn't have to change. Bounds are enforced inside
/// jedi (`pipe_clickhouse::logs`):
/// - `minutes` clamped to `1..=10080`
/// - `limit` clamped to `1..=500`
/// - `search` truncated to 100 chars
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
pub struct ClickHouseLogsRequest {
    /// Either `"query"` (filtered SELECT) or `"stats"` (GROUP BY).
    pub command: String,
    /// Filter by Kubernetes namespace (e.g. `"kbve"`, `"kilobase"`).
    #[serde(default)]
    pub pod_namespace: Option<String>,
    /// Filter by exact pod name.
    #[serde(default)]
    pub pod_name: Option<String>,
    /// Filter by `service` label as emitted by Vector (e.g. `"axum-kbve"`).
    #[serde(default)]
    pub service: Option<String>,
    /// Filter by log level (`"error"`, `"warn"`, `"info"`, ...). Lowercased
    /// before matching.
    #[serde(default)]
    pub level: Option<String>,
    /// `ILIKE %search%` against the message body.
    #[serde(default)]
    pub search: Option<String>,
    /// Lookback window in minutes. Defaults to 60, clamped 1..=10080.
    #[serde(default)]
    pub minutes: Option<u32>,
    /// Max rows returned. Defaults to 100, clamped 1..=500. Stats responses
    /// always return up to 200 rows regardless of this value.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Time-bucket width in seconds for `rows_request_rate`. Defaults to 30,
    /// clamped 5..=3600. Ignored by other commands.
    #[serde(default)]
    pub bucket_seconds: Option<u32>,
    /// Filter by Factorio `server_id` for the `factorio_*` commands. Ignored
    /// by log/alert commands.
    #[serde(default)]
    pub server_id: Option<String>,
}

/// Response shape for the ClickHouse logs route. `rows` is the raw
/// `JSONEachRow` output from ClickHouse — one object per record with keys
/// matching `observability.logs_distributed` columns for `"query"`, or
/// `{ pod_namespace, service, level, cnt }` for `"stats"`.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
pub struct ClickHouseLogsResponse {
    /// One JSON object per row. Shape depends on `command`:
    /// - `"query"` → `{ timestamp, pod_namespace, service, level, message, pod_name, metadata }`
    /// - `"stats"` → `{ pod_namespace, service, level, cnt }`
    /// - `"error_groups"` → `{ pod_namespace, service, signature, cnt, last_seen, sample }`
    #[schema(value_type = Vec<serde_json::Value>)]
    pub rows: Vec<serde_json::Value>,
    pub count: usize,
}

#[utoipa::path(
    post,
    path = "/dashboard/clickhouse/proxy",
    tag = "dashboard",
    request_body = ClickHouseLogsRequest,
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Rows from observability.logs_distributed (query) or aggregated counts (stats)", body = ClickHouseLogsResponse),
        (status = 400, description = "Malformed JSON body or unknown `command`"),
        (status = 401, description = "Missing or invalid Bearer token"),
        (status = 403, description = "Token lacks DASHBOARD_VIEW staff permission"),
        (status = 502, description = "ClickHouse cluster returned an error or was unreachable"),
        (status = 503, description = "ClickHouse direct route not configured (CLICKHOUSE_* env vars unset)")
    )
)]
pub async fn clickhouse_logs_proxy_handler(headers: HeaderMap, body: Bytes) -> Response {
    if let Err(resp) = require_dashboard_view(&headers, "ClickHouse Logs").await {
        return resp;
    }

    let config = match CLICKHOUSE_DIRECT.get() {
        Some(c) => c,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "ClickHouse direct route not configured"})),
            )
                .into_response();
        }
    };

    let req: ClickHouseLogsRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": format!("invalid JSON body: {e}")})),
            )
                .into_response();
        }
    };

    let result = match req.command.as_str() {
        "query" => {
            let params = ch_logs::LogsQueryParams {
                pod_namespace: req.pod_namespace,
                pod_name: req.pod_name,
                service: req.service,
                level: req.level,
                search: req.search,
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_query(config, &params).await
        }
        "stats" => {
            let params = ch_logs::LogsStatsParams {
                minutes: req.minutes,
            };
            ch_logs::run_stats(config, &params).await
        }
        "error_groups" => {
            let params = ch_logs::ErrorGroupsParams {
                pod_namespace: req.pod_namespace,
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_error_groups(config, &params).await
        }
        "rows_request_rate" => {
            let params = ch_logs::RowsRequestRateParams {
                minutes: req.minutes,
                bucket_seconds: req.bucket_seconds,
            };
            ch_logs::run_rows_request_rate(config, &params).await
        }
        "rows_status_histogram" => {
            let params = ch_logs::RowsStatusHistogramParams {
                minutes: req.minutes,
            };
            ch_logs::run_rows_status_histogram(config, &params).await
        }
        "rows_top_endpoints" => {
            let params = ch_logs::RowsTopEndpointsParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_rows_top_endpoints(config, &params).await
        }
        "rows_errors" => {
            let params = ch_logs::RowsErrorsParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_rows_errors(config, &params).await
        }
        "alerts_recent" => {
            let params = ch_alerts::AlertsRecentParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_alerts::run_alerts_recent(config, &params).await
        }
        "alerts_firing" => {
            let params = ch_alerts::AlertsFiringParams {
                minutes: req.minutes,
            };
            ch_alerts::run_alerts_firing(config, &params).await
        }
        "alerts_by_severity" => {
            let params = ch_alerts::AlertsBySeverityParams {
                minutes: req.minutes,
            };
            ch_alerts::run_alerts_by_severity(config, &params).await
        }
        "alerts_top" => {
            let params = ch_alerts::AlertsTopParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_alerts::run_alerts_top(config, &params).await
        }
        "factorio_current" | "factorio_snapshots" | "factorio_players" | "factorio_chat"
        | "factorio_rotations" => {
            let params = ch_factorio::FactorioParams {
                server_id: req.server_id,
                minutes: req.minutes,
                limit: req.limit,
            };
            match req.command.as_str() {
                "factorio_current" => ch_factorio::run_current(config, &params).await,
                "factorio_snapshots" => ch_factorio::run_snapshots(config, &params).await,
                "factorio_players" => ch_factorio::run_players(config, &params).await,
                "factorio_chat" => ch_factorio::run_chat(config, &params).await,
                _ => ch_factorio::run_rotations(config, &params).await,
            }
        }
        other => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({
                    "error": format!(
                        "unknown command '{other}', expected one of: \
                         query, stats, error_groups, rows_request_rate, rows_status_histogram, \
                         rows_top_endpoints, rows_errors, \
                         alerts_recent, alerts_firing, alerts_by_severity, alerts_top, \
                         factorio_current, factorio_snapshots, factorio_players, \
                         factorio_chat, factorio_rotations"
                    )
                })),
            )
                .into_response();
        }
    };

    match result {
        Ok(out) => axum::Json(ClickHouseLogsResponse {
            rows: out.rows,
            count: out.count,
        })
        .into_response(),
        Err(e) => {
            warn!("ClickHouse logs query failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("ClickHouse query failed: {e}")})),
            )
                .into_response()
        }
    }
}
