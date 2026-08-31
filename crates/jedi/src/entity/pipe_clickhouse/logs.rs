// Typed query builders for the observability.logs_distributed table.
//
// These mirror what the supabase edge function at apps/kbve/edge/functions/logs
// used to do — `query` (filtered SELECT) and `stats` (GROUP BY) — but build the
// SQL inside Rust so axum-kbve can hit ClickHouse directly via
// ClickHouseConfig::execute_select. The edge function is no longer in the
// critical path for the dashboard logs view.
//
// Bounds match the edge function exactly so callers cannot expand the query
// surface (defense-in-depth in case the auth gate ever loosens):
//   - minutes:        1..=10080 (7 days)
//   - limit:          1..=500
//   - search length:  <=100 chars
//
// All user-supplied strings go through `escape_clickhouse_string` to neutralize
// `\` and `'` before being inlined into the SQL. ClickHouse parameterized
// queries (`{name:Type}`) only work over the native protocol, not over the
// HTTP+JSONEachRow path ClickHouseConfig::execute_select uses, so escape +
// inline is the simpler approach.

use serde::{Deserialize, Serialize};

use super::super::super::error::JediError;
use super::super::super::state::sidecar::ClickHouseConfig;

pub const MAX_MINUTES: u32 = 10_080; // 7 days
pub const DEFAULT_MINUTES: u32 = 60;
pub const MAX_LIMIT: u32 = 500;
pub const DEFAULT_LIMIT: u32 = 100;
pub const MAX_SEARCH_LENGTH: usize = 100;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogsQueryParams {
    #[serde(default)]
    pub pod_namespace: Option<String>,
    #[serde(default)]
    pub pod_name: Option<String>,
    #[serde(default)]
    pub service: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogsStatsParams {
    #[serde(default)]
    pub minutes: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ErrorGroupsParams {
    #[serde(default)]
    pub pod_namespace: Option<String>,
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogsResult {
    pub rows: Vec<serde_json::Value>,
    pub count: usize,
}

fn escape_clickhouse_string(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 2);
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            c => out.push(c),
        }
    }
    out
}

pub(crate) fn clamped_minutes(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_MINUTES).clamp(1, MAX_MINUTES)
}

/// Time-window condition for the query WHERE clause. `Some(0)` is the ALL
/// sentinel and returns `None` (no timestamp filter), letting the dashboard
/// scan the full retention window.
pub(crate) fn time_condition(raw: Option<u32>) -> Option<String> {
    match raw {
        Some(0) => None,
        other => Some(format!(
            "timestamp > now() - INTERVAL {} MINUTE",
            clamped_minutes(other)
        )),
    }
}

fn clamped_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn clamped_search(raw: &str) -> String {
    let trimmed: String = raw.chars().take(MAX_SEARCH_LENGTH).collect();
    escape_clickhouse_string(&trimmed)
}

/// Level predicate — `warn` and `warning` are stored interchangeably by
/// different emitters, so either input matches both spellings.
fn level_condition(raw: &str) -> String {
    let lvl = raw.to_lowercase();
    if lvl == "warn" || lvl == "warning" {
        "level IN ('warn', 'warning')".to_string()
    } else {
        format!("level = '{}'", escape_clickhouse_string(&lvl))
    }
}

/// Build the `query` SQL — filtered SELECT against logs_distributed,
/// ordered by timestamp DESC.
pub fn build_query_sql(params: &LogsQueryParams) -> String {
    let limit = clamped_limit(params.limit);

    let mut conditions: Vec<String> = Vec::new();
    if let Some(cond) = time_condition(params.minutes) {
        conditions.push(cond);
    }

    if let Some(ns) = params.pod_namespace.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(format!(
            "pod_namespace = '{}'",
            escape_clickhouse_string(ns)
        ));
    }
    if let Some(pn) = params.pod_name.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(format!("pod_name = '{}'", escape_clickhouse_string(pn)));
    }
    if let Some(svc) = params.service.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(format!("service = '{}'", escape_clickhouse_string(svc)));
    }
    if let Some(lvl) = params.level.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(level_condition(lvl));
    }
    if let Some(search) = params.search.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(format!("message ILIKE '%{}%'", clamped_search(search)));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    format!(
        "SELECT timestamp, pod_namespace, service, level, message, pod_name, metadata \
		 FROM logs_distributed \
		 {} \
		 ORDER BY timestamp DESC \
		 LIMIT {}",
        where_clause, limit
    )
}

/// Build the `stats` SQL — GROUP BY namespace+service+level for the last
/// `minutes` minutes.
pub fn build_stats_sql(params: &LogsStatsParams) -> String {
    let where_clause = match time_condition(params.minutes) {
        Some(cond) => format!("WHERE {} ", cond),
        None => String::new(),
    };
    format!(
        "SELECT pod_namespace, service, level, count() AS cnt \
		 FROM logs_distributed \
		 {}\
		 GROUP BY pod_namespace, service, level \
		 ORDER BY cnt DESC \
		 LIMIT 5000",
        where_clause
    )
}

pub async fn run_query(
    config: &ClickHouseConfig,
    params: &LogsQueryParams,
) -> Result<LogsResult, JediError> {
    let sql = build_query_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_stats(
    config: &ClickHouseConfig,
    params: &LogsStatsParams,
) -> Result<LogsResult, JediError> {
    let sql = build_stats_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub const MAX_ERROR_GROUPS: u32 = 100;
pub const DEFAULT_ERROR_GROUPS: u32 = 25;
const ERROR_GROUP_SIGNATURE_LENGTH: u32 = 200;

fn clamped_error_groups(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_ERROR_GROUPS)
        .clamp(1, MAX_ERROR_GROUPS)
}

/// Build the `error_groups` SQL — collapse `level = 'error'` messages into
/// normalized signatures (numbers and long id/hex tokens masked) and aggregate
/// by frequency. Turns a flat error stream into "this error ×1840, last seen
/// 2m ago" so callers can triage the dominant failure first. Optionally scoped
/// to a single namespace.
pub fn build_error_groups_sql(params: &ErrorGroupsParams) -> String {
    let limit = clamped_error_groups(params.limit);

    let mut conditions: Vec<String> = Vec::new();
    if let Some(cond) = time_condition(params.minutes) {
        conditions.push(cond);
    }
    conditions.push("level = 'error'".to_string());
    if let Some(ns) = params.pod_namespace.as_deref().filter(|s| !s.is_empty()) {
        conditions.push(format!(
            "pod_namespace = '{}'",
            escape_clickhouse_string(ns)
        ));
    }
    let where_clause = conditions.join(" AND ");

    // Bracket-class regexes only — no backslash escapes to thread through both
    // the Rust string literal and the ClickHouse SQL literal. Braces in the
    // quantifier are doubled for `format!`.
    format!(
        "SELECT \
            pod_namespace, \
            any(service) AS service, \
            substring(replaceRegexpAll(replaceRegexpAll(message, '[0-9a-fA-F-]{{16,}}', '<id>'), '[0-9]+', 'N'), 1, {sig_len}) AS signature, \
            count() AS cnt, \
            max(timestamp) AS last_seen, \
            any(message) AS sample \
         FROM logs_distributed \
         WHERE {where_clause} \
         GROUP BY pod_namespace, signature \
         ORDER BY cnt DESC \
         LIMIT {limit}",
        sig_len = ERROR_GROUP_SIGNATURE_LENGTH,
        where_clause = where_clause,
        limit = limit,
    )
}

pub async fn run_error_groups(
    config: &ClickHouseConfig,
    params: &ErrorGroupsParams,
) -> Result<LogsResult, JediError> {
    let sql = build_error_groups_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

// ─── ROWS-specific aggregates ─────────────────────────────────────────
//
// The ROWS service emits structured JSON traces into logs_distributed.message
// (target = "rows::trace", fields.message = "request completed", span carrying
// method/path/status/latency_ms/customer/id). These builders extract those
// fields via JSONExtract* and pre-aggregate server-side so the dashboard
// only renders shaped data.
//
// All queries hardcode `pod_namespace = 'rows'` AND
// `JSONExtractString(message, 'fields', 'message') = 'request completed'`
// to keep the surface narrow and self-documenting.

pub const MAX_BUCKET_SECONDS: u32 = 3_600; // 1h buckets max
pub const MIN_BUCKET_SECONDS: u32 = 5;
pub const DEFAULT_BUCKET_SECONDS: u32 = 30;
pub const MAX_TOP_ENDPOINTS: u32 = 50;
pub const DEFAULT_TOP_ENDPOINTS: u32 = 20;
pub const MAX_ERROR_ROWS: u32 = 200;
pub const DEFAULT_ERROR_ROWS: u32 = 50;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RowsRequestRateParams {
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub bucket_seconds: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RowsStatusHistogramParams {
    #[serde(default)]
    pub minutes: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RowsTopEndpointsParams {
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RowsErrorsParams {
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

fn clamped_bucket_seconds(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_BUCKET_SECONDS)
        .clamp(MIN_BUCKET_SECONDS, MAX_BUCKET_SECONDS)
}

fn clamped_top_endpoints(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_TOP_ENDPOINTS)
        .clamp(1, MAX_TOP_ENDPOINTS)
}

fn clamped_error_rows(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_ERROR_ROWS).clamp(1, MAX_ERROR_ROWS)
}

const ROWS_REQUEST_FILTER: &str = "pod_namespace = 'rows' \
     AND JSONExtractString(message, 'target') = 'rows::trace' \
     AND JSONExtractString(message, 'fields', 'message') = 'request completed'";

pub fn build_rows_request_rate_sql(params: &RowsRequestRateParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let bucket = clamped_bucket_seconds(params.bucket_seconds);
    format!(
        "SELECT \
            toStartOfInterval(timestamp, INTERVAL {bucket} SECOND) AS bucket, \
            count() AS reqs \
         FROM logs_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
            AND {ROWS_REQUEST_FILTER} \
         GROUP BY bucket \
         ORDER BY bucket"
    )
}

pub fn build_rows_status_histogram_sql(params: &RowsStatusHistogramParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    format!(
        "SELECT \
            JSONExtractInt(message, 'span', 'status') AS status, \
            count() AS n \
         FROM logs_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
            AND {ROWS_REQUEST_FILTER} \
         GROUP BY status \
         ORDER BY status"
    )
}

pub fn build_rows_top_endpoints_sql(params: &RowsTopEndpointsParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_top_endpoints(params.limit);
    format!(
        "SELECT \
            JSONExtractString(message, 'span', 'path') AS path, \
            count() AS n, \
            quantile(0.5)(JSONExtractInt(message, 'span', 'latency_ms')) AS p50, \
            quantile(0.95)(JSONExtractInt(message, 'span', 'latency_ms')) AS p95, \
            quantile(0.99)(JSONExtractInt(message, 'span', 'latency_ms')) AS p99 \
         FROM logs_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
            AND {ROWS_REQUEST_FILTER} \
         GROUP BY path \
         ORDER BY n DESC \
         LIMIT {limit}"
    )
}

pub fn build_rows_errors_sql(params: &RowsErrorsParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_error_rows(params.limit);
    format!(
        "SELECT \
            timestamp, \
            JSONExtractString(message, 'span', 'method') AS method, \
            JSONExtractString(message, 'span', 'path') AS path, \
            JSONExtractInt(message, 'span', 'status') AS status, \
            JSONExtractInt(message, 'span', 'latency_ms') AS latency_ms, \
            JSONExtractString(message, 'span', 'customer') AS customer, \
            JSONExtractString(message, 'span', 'id') AS request_id \
         FROM logs_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
            AND {ROWS_REQUEST_FILTER} \
            AND JSONExtractInt(message, 'span', 'status') >= 400 \
         ORDER BY timestamp DESC \
         LIMIT {limit}"
    )
}

pub async fn run_rows_request_rate(
    config: &ClickHouseConfig,
    params: &RowsRequestRateParams,
) -> Result<LogsResult, JediError> {
    let sql = build_rows_request_rate_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_rows_status_histogram(
    config: &ClickHouseConfig,
    params: &RowsStatusHistogramParams,
) -> Result<LogsResult, JediError> {
    let sql = build_rows_status_histogram_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_rows_top_endpoints(
    config: &ClickHouseConfig,
    params: &RowsTopEndpointsParams,
) -> Result<LogsResult, JediError> {
    let sql = build_rows_top_endpoints_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_rows_errors(
    config: &ClickHouseConfig,
    params: &RowsErrorsParams,
) -> Result<LogsResult, JediError> {
    let sql = build_rows_errors_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_quotes_and_backslashes() {
        assert_eq!(escape_clickhouse_string("he'llo"), "he\\'llo");
        assert_eq!(escape_clickhouse_string("a\\b"), "a\\\\b");
    }

    #[test]
    fn clamps_minutes_and_limit() {
        assert_eq!(clamped_minutes(None), DEFAULT_MINUTES);
        assert_eq!(clamped_minutes(Some(0)), 1);
        assert_eq!(clamped_minutes(Some(99_999)), MAX_MINUTES);
        assert_eq!(clamped_limit(Some(0)), 1);
        assert_eq!(clamped_limit(Some(9_999)), MAX_LIMIT);
    }

    #[test]
    fn build_query_sql_with_filters() {
        let params = LogsQueryParams {
            pod_namespace: Some("kbve".into()),
            service: Some("axum".into()),
            level: Some("ERROR".into()),
            search: Some("panic".into()),
            minutes: Some(15),
            limit: Some(50),
            ..Default::default()
        };
        let sql = build_query_sql(&params);
        assert!(sql.contains("INTERVAL 15 MINUTE"));
        assert!(sql.contains("pod_namespace = 'kbve'"));
        assert!(sql.contains("service = 'axum'"));
        assert!(sql.contains("level = 'error'"));
        assert!(sql.contains("message ILIKE '%panic%'"));
        assert!(sql.contains("LIMIT 50"));
    }

    #[test]
    fn warn_level_matches_warning_alias() {
        for input in ["warn", "WARNING"] {
            let sql = build_query_sql(&LogsQueryParams {
                level: Some(input.into()),
                ..Default::default()
            });
            assert!(
                sql.contains("level IN ('warn', 'warning')"),
                "level={input} should match both spellings: {sql}"
            );
        }
        let sql = build_query_sql(&LogsQueryParams {
            level: Some("error".into()),
            ..Default::default()
        });
        assert!(sql.contains("level = 'error'"));
    }

    #[test]
    fn build_stats_sql_default_minutes() {
        let sql = build_stats_sql(&LogsStatsParams::default());
        assert!(sql.contains(&format!("INTERVAL {} MINUTE", DEFAULT_MINUTES)));
        assert!(sql.contains("GROUP BY pod_namespace, service, level"));
    }

    #[test]
    fn all_sentinel_drops_time_filter() {
        assert!(time_condition(Some(0)).is_none());
        assert!(time_condition(None).is_some());

        let query = build_query_sql(&LogsQueryParams {
            minutes: Some(0),
            ..Default::default()
        });
        assert!(!query.contains("INTERVAL"));

        let stats = build_stats_sql(&LogsStatsParams { minutes: Some(0) });
        assert!(!stats.contains("INTERVAL"));
        assert!(!stats.contains("WHERE"));
        assert!(stats.contains("GROUP BY pod_namespace, service, level"));

        let groups = build_error_groups_sql(&ErrorGroupsParams {
            pod_namespace: None,
            minutes: Some(0),
            limit: Some(10),
        });
        assert!(!groups.contains("INTERVAL"));
        assert!(groups.contains("level = 'error'"));
    }

    #[test]
    fn build_error_groups_sql_shape() {
        let sql = build_error_groups_sql(&ErrorGroupsParams {
            pod_namespace: Some("kbve".into()),
            minutes: Some(120),
            limit: Some(10),
        });
        assert!(sql.contains("INTERVAL 120 MINUTE"));
        assert!(sql.contains("level = 'error'"));
        assert!(sql.contains("pod_namespace = 'kbve'"));
        assert!(sql.contains("AS signature"));
        assert!(sql.contains("count() AS cnt"));
        assert!(sql.contains("max(timestamp) AS last_seen"));
        assert!(sql.contains("GROUP BY pod_namespace, signature"));
        assert!(sql.contains("'[0-9a-fA-F-]{16,}'"));
        assert!(sql.contains("LIMIT 10"));
    }

    #[test]
    fn build_error_groups_sql_unscoped_clamps_limit() {
        let sql = build_error_groups_sql(&ErrorGroupsParams::default());
        assert!(sql.contains(&format!("INTERVAL {} MINUTE", DEFAULT_MINUTES)));
        assert!(!sql.contains("pod_namespace = '"));
        assert!(sql.contains(&format!("LIMIT {}", DEFAULT_ERROR_GROUPS)));
        assert_eq!(clamped_error_groups(Some(0)), 1);
        assert_eq!(clamped_error_groups(Some(9_999)), MAX_ERROR_GROUPS);
    }

    #[test]
    fn build_query_sql_neutralizes_injection() {
        let params = LogsQueryParams {
            pod_namespace: Some("kbve' OR 1=1 --".into()),
            ..Default::default()
        };
        let sql = build_query_sql(&params);
        // Escaped single quote keeps the injection inside the literal.
        assert!(sql.contains("pod_namespace = 'kbve\\' OR 1=1 --'"));
    }

    #[test]
    fn rows_request_rate_clamps_bucket() {
        assert_eq!(clamped_bucket_seconds(None), DEFAULT_BUCKET_SECONDS);
        assert_eq!(clamped_bucket_seconds(Some(0)), MIN_BUCKET_SECONDS);
        assert_eq!(clamped_bucket_seconds(Some(99_999)), MAX_BUCKET_SECONDS);
    }

    #[test]
    fn rows_request_rate_sql_shape() {
        let sql = build_rows_request_rate_sql(&RowsRequestRateParams {
            minutes: Some(15),
            bucket_seconds: Some(60),
        });
        assert!(sql.contains("INTERVAL 60 SECOND"));
        assert!(sql.contains("INTERVAL 15 MINUTE"));
        assert!(sql.contains("pod_namespace = 'rows'"));
        assert!(sql.contains("rows::trace"));
        assert!(sql.contains("request completed"));
        assert!(sql.contains("GROUP BY bucket"));
    }

    #[test]
    fn rows_status_histogram_sql_shape() {
        let sql = build_rows_status_histogram_sql(&RowsStatusHistogramParams { minutes: Some(30) });
        assert!(sql.contains("INTERVAL 30 MINUTE"));
        assert!(sql.contains("JSONExtractInt(message, 'span', 'status')"));
        assert!(sql.contains("GROUP BY status"));
    }

    #[test]
    fn rows_top_endpoints_sql_shape() {
        let sql = build_rows_top_endpoints_sql(&RowsTopEndpointsParams {
            minutes: Some(60),
            limit: Some(10),
        });
        assert!(sql.contains("JSONExtractString(message, 'span', 'path')"));
        assert!(sql.contains("quantile(0.5)"));
        assert!(sql.contains("quantile(0.95)"));
        assert!(sql.contains("quantile(0.99)"));
        assert!(sql.contains("LIMIT 10"));
    }

    #[test]
    fn rows_top_endpoints_clamps_limit() {
        assert_eq!(clamped_top_endpoints(None), DEFAULT_TOP_ENDPOINTS);
        assert_eq!(clamped_top_endpoints(Some(0)), 1);
        assert_eq!(clamped_top_endpoints(Some(999)), MAX_TOP_ENDPOINTS);
    }

    #[test]
    fn rows_errors_sql_filters_4xx_5xx() {
        let sql = build_rows_errors_sql(&RowsErrorsParams {
            minutes: Some(120),
            limit: Some(25),
        });
        assert!(sql.contains("INTERVAL 120 MINUTE"));
        assert!(sql.contains("JSONExtractInt(message, 'span', 'status') >= 400"));
        assert!(sql.contains("ORDER BY timestamp DESC"));
        assert!(sql.contains("LIMIT 25"));
    }

    #[test]
    fn rows_errors_clamps_limit() {
        assert_eq!(clamped_error_rows(None), DEFAULT_ERROR_ROWS);
        assert_eq!(clamped_error_rows(Some(0)), 1);
        assert_eq!(clamped_error_rows(Some(999)), MAX_ERROR_ROWS);
    }
}
