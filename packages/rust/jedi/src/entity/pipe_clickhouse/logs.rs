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

fn clamped_minutes(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_MINUTES).clamp(1, MAX_MINUTES)
}

fn clamped_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn clamped_search(raw: &str) -> String {
    let trimmed: String = raw.chars().take(MAX_SEARCH_LENGTH).collect();
    escape_clickhouse_string(&trimmed)
}

/// Build the `query` SQL — filtered SELECT against logs_distributed,
/// ordered by timestamp DESC.
pub fn build_query_sql(params: &LogsQueryParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_limit(params.limit);

    let mut conditions: Vec<String> =
        vec![format!("timestamp > now() - INTERVAL {} MINUTE", minutes)];

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
        conditions.push(format!(
            "level = '{}'",
            escape_clickhouse_string(&lvl.to_lowercase())
        ));
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
    let minutes = clamped_minutes(params.minutes);
    format!(
        "SELECT pod_namespace, service, level, count() AS cnt \
		 FROM logs_distributed \
		 WHERE timestamp > now() - INTERVAL {} MINUTE \
		 GROUP BY pod_namespace, service, level \
		 ORDER BY cnt DESC \
		 LIMIT 5000",
        minutes
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
    fn build_stats_sql_default_minutes() {
        let sql = build_stats_sql(&LogsStatsParams::default());
        assert!(sql.contains(&format!("INTERVAL {} MINUTE", DEFAULT_MINUTES)));
        assert!(sql.contains("GROUP BY pod_namespace, service, level"));
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
}
