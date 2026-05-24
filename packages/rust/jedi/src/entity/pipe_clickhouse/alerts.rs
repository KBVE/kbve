use serde::{Deserialize, Serialize};

use super::super::super::error::JediError;
use super::super::super::state::sidecar::ClickHouseConfig;
use super::logs::{LogsResult, clamped_minutes};

pub const MAX_ALERT_ROWS: u32 = 500;
pub const DEFAULT_ALERT_ROWS: u32 = 100;
pub const MAX_TOP_ALERTNAMES: u32 = 50;
pub const DEFAULT_TOP_ALERTNAMES: u32 = 20;

fn clamped_alert_rows(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_ALERT_ROWS).clamp(1, MAX_ALERT_ROWS)
}

fn clamped_top_alertnames(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_TOP_ALERTNAMES)
        .clamp(1, MAX_TOP_ALERTNAMES)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AlertsRecentParams {
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AlertsFiringParams {
    #[serde(default)]
    pub minutes: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AlertsBySeverityParams {
    #[serde(default)]
    pub minutes: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AlertsTopParams {
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

pub fn build_alerts_recent_sql(params: &AlertsRecentParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_alert_rows(params.limit);
    format!(
        "SELECT \
            timestamp, status, alertname, severity, namespace, pod, service, \
            summary, description, fingerprint, starts_at, ends_at, source \
         FROM alerts_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
         ORDER BY timestamp DESC \
         LIMIT {limit}"
    )
}

pub fn build_alerts_firing_sql(params: &AlertsFiringParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    format!(
        "SELECT \
            last_seen AS timestamp, \
            last_status AS status, \
            last_alertname AS alertname, \
            last_severity AS severity, \
            last_namespace AS namespace, \
            last_pod AS pod, \
            last_service AS service, \
            last_summary AS summary, \
            last_starts_at AS starts_at, \
            fingerprint \
         FROM ( \
            SELECT \
                fingerprint, \
                argMax(timestamp, timestamp) AS last_seen, \
                argMax(status, timestamp) AS last_status, \
                argMax(alertname, timestamp) AS last_alertname, \
                argMax(severity, timestamp) AS last_severity, \
                argMax(namespace, timestamp) AS last_namespace, \
                argMax(pod, timestamp) AS last_pod, \
                argMax(service, timestamp) AS last_service, \
                argMax(summary, timestamp) AS last_summary, \
                argMax(starts_at, timestamp) AS last_starts_at \
             FROM alerts_distributed \
             WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
             GROUP BY fingerprint \
         ) \
         WHERE last_status = 'firing' \
         ORDER BY last_starts_at DESC"
    )
}

pub fn build_alerts_by_severity_sql(params: &AlertsBySeverityParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    format!(
        "SELECT \
            severity, \
            uniqExact(fingerprint) AS distinct_alerts, \
            count() AS total_events, \
            sumIf(1, status = 'firing') AS firing_events, \
            sumIf(1, status = 'resolved') AS resolved_events \
         FROM alerts_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
         GROUP BY severity \
         ORDER BY firing_events DESC, total_events DESC"
    )
}

pub fn build_alerts_top_sql(params: &AlertsTopParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_top_alertnames(params.limit);
    format!(
        "SELECT \
            alertname, \
            uniqExact(fingerprint) AS distinct_instances, \
            count() AS total_events, \
            sumIf(1, status = 'firing') AS firing_events \
         FROM alerts_distributed \
         WHERE timestamp > now() - INTERVAL {minutes} MINUTE \
         GROUP BY alertname \
         ORDER BY total_events DESC \
         LIMIT {limit}"
    )
}

pub async fn run_alerts_recent(
    config: &ClickHouseConfig,
    params: &AlertsRecentParams,
) -> Result<LogsResult, JediError> {
    let sql = build_alerts_recent_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_alerts_firing(
    config: &ClickHouseConfig,
    params: &AlertsFiringParams,
) -> Result<LogsResult, JediError> {
    let sql = build_alerts_firing_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_alerts_by_severity(
    config: &ClickHouseConfig,
    params: &AlertsBySeverityParams,
) -> Result<LogsResult, JediError> {
    let sql = build_alerts_by_severity_sql(params);
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_alerts_top(
    config: &ClickHouseConfig,
    params: &AlertsTopParams,
) -> Result<LogsResult, JediError> {
    let sql = build_alerts_top_sql(params);
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
    fn recent_clamps_limit() {
        assert_eq!(clamped_alert_rows(None), DEFAULT_ALERT_ROWS);
        assert_eq!(clamped_alert_rows(Some(0)), 1);
        assert_eq!(clamped_alert_rows(Some(9999)), MAX_ALERT_ROWS);
    }

    #[test]
    fn top_clamps_limit() {
        assert_eq!(clamped_top_alertnames(None), DEFAULT_TOP_ALERTNAMES);
        assert_eq!(clamped_top_alertnames(Some(0)), 1);
        assert_eq!(clamped_top_alertnames(Some(9999)), MAX_TOP_ALERTNAMES);
    }

    #[test]
    fn recent_sql_shape() {
        let sql = build_alerts_recent_sql(&AlertsRecentParams {
            minutes: Some(30),
            limit: Some(50),
        });
        assert!(sql.contains("INTERVAL 30 MINUTE"));
        assert!(sql.contains("FROM alerts_distributed"));
        assert!(sql.contains("ORDER BY timestamp DESC"));
        assert!(sql.contains("LIMIT 50"));
    }

    #[test]
    fn firing_sql_uses_argmax_dedupe() {
        let sql = build_alerts_firing_sql(&AlertsFiringParams { minutes: Some(60) });
        assert!(sql.contains("INTERVAL 60 MINUTE"));
        assert!(sql.contains("argMax(status, timestamp) AS last_status"));
        assert!(sql.contains("GROUP BY fingerprint"));
        assert!(sql.contains("WHERE last_status = 'firing'"));
        assert!(sql.contains("ORDER BY last_starts_at DESC"));
        assert!(sql.contains("last_seen AS timestamp"));
    }

    #[test]
    fn by_severity_sql_shape() {
        let sql = build_alerts_by_severity_sql(&AlertsBySeverityParams {
            minutes: Some(1440),
        });
        assert!(sql.contains("INTERVAL 1440 MINUTE"));
        assert!(sql.contains("uniqExact(fingerprint)"));
        assert!(sql.contains("GROUP BY severity"));
    }

    #[test]
    fn top_sql_shape() {
        let sql = build_alerts_top_sql(&AlertsTopParams {
            minutes: Some(120),
            limit: Some(15),
        });
        assert!(sql.contains("INTERVAL 120 MINUTE"));
        assert!(sql.contains("GROUP BY alertname"));
        assert!(sql.contains("LIMIT 15"));
    }
}
