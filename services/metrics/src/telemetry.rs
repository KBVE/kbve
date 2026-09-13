use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

const MAX_MESSAGE: usize = 4096;
const MAX_STACK: usize = 16384;
const MAX_URL: usize = 1024;
const MAX_EXTRA_KEYS: usize = 32;
const MAX_EXTRA_KEY: usize = 128;
const MAX_EXTRA_VALUE: usize = 1024;

const PLATFORMS: &[&str] = &[
    "web", "ios", "android", "desktop", "server", "node", "unknown",
];
const ENVIRONMENTS: &[&str] = &[
    "production",
    "staging",
    "development",
    "preview",
    "test",
    "local",
];

/// Web Vitals and the handful of navigation timings worth keeping. An unknown
/// metric is DROPPED rather than defaulted: `metric` is a LowCardinality column
/// and the read path groups by it, so coercing junk to "lcp" would quietly
/// poison a quantile rather than lose one row.
const PERF_METRICS: &[&str] = &["lcp", "inp", "cls", "fcp", "ttfb", "fid", "tti", "load"];
/// The browser's own verdict; anything else is recorded as unrated rather than
/// guessed at, since the thresholds move between spec revisions.
const RATINGS: &[&str] = &["good", "needs-improvement", "poor"];
const NAV_TYPES: &[&str] = &["navigate", "reload", "back-forward", "prerender", "restore"];

/// Upper bound on a perf sample, matching the CHECK constraint on perf_raw.
/// An hour is far past anything a real vital reports, so a value above it is a
/// broken client rather than a slow one -- and one such sample drags every
/// quantile it lands in.
const MAX_PERF_VALUE: f64 = 3_600_000.0;
const MAX_EVENT_NAME: usize = 128;

const NOISE: &[&str] = &[
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Script error.",
    "Non-Error promise rejection captured",
];

#[derive(Debug, Deserialize)]
pub struct ErrorBatch {
    pub events: Vec<ErrorEvent>,
}

#[derive(Debug, Deserialize)]
pub struct ErrorEvent {
    pub project: String,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub error_type: Option<String>,
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub handled: Option<bool>,
    #[serde(default)]
    pub extra: Option<Map<String, Value>>,
}

/// Byte-truncate in place without splitting a UTF-8 code point (`String::truncate`
/// panics on a non-boundary index — a multibyte char at the limit would crash
/// the ingest handler). Reuses the buffer rather than allocating a copy.
fn truncate(mut s: String, max: usize) -> String {
    if s.len() > max {
        let mut end = max;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
    }
    s
}

/// Strip null bytes and control characters (incl. ESC, so ANSI escape
/// sequences and terminal/log-injection payloads can't survive), then truncate.
/// Takes the String by value and filters in place (`retain`) so the caller's
/// existing allocation is reused instead of allocating a sanitized copy.
/// `keep_newlines` preserves `\n`/`\t` for multi-line fields like stacks.
fn sanitize(mut s: String, max: usize, keep_newlines: bool) -> String {
    s.retain(|c| {
        if keep_newlines && (c == '\n' || c == '\t') {
            return true;
        }
        !c.is_control()
    });
    truncate(s, max)
}

/// Clamp a free-form dimension to a known allow-list, falling back to a default.
/// Keeps `LowCardinality` columns from exploding on attacker-supplied values.
fn allow_enum(val: Option<String>, allowed: &[&str], default: &str) -> String {
    match val {
        Some(v) => {
            let v = v.trim().to_lowercase();
            if allowed.contains(&v.as_str()) {
                v
            } else {
                default.to_string()
            }
        }
        None => default.to_string(),
    }
}

fn strip_query(mut url: String) -> String {
    if let Some(i) = url.find(['?', '#']) {
        url.truncate(i);
    }
    sanitize(url, MAX_URL, false)
}

fn is_noise(message: &str) -> bool {
    NOISE.iter().any(|n| message.contains(n))
}

fn fingerprint(project: &str, error_type: &str, stack: &str, message: &str) -> String {
    let basis = if stack.is_empty() { message } else { stack };
    let normalized: String = basis
        .lines()
        .take(5)
        .map(|l| l.split(['(', '@']).next().unwrap_or(l).trim())
        .collect::<Vec<_>>()
        .join("|");
    let mut hasher = Sha256::new();
    hasher.update(project.as_bytes());
    hasher.update(b":");
    hasher.update(error_type.as_bytes());
    hasher.update(b":");
    hasher.update(normalized.as_bytes());
    hex::encode(&hasher.finalize()[..16])
}

fn sanitize_extra(extra: Option<Map<String, Value>>) -> String {
    let Some(map) = extra else {
        return "{}".to_string();
    };
    let mut out = Map::new();
    for (k, v) in map.into_iter().take(MAX_EXTRA_KEYS) {
        let key = sanitize(k, MAX_EXTRA_KEY, false);
        if key.is_empty() {
            continue;
        }
        let s = match v {
            Value::String(s) => Value::String(sanitize(s, MAX_EXTRA_VALUE, false)),
            Value::Object(_) | Value::Array(_) => {
                Value::String(sanitize(v.to_string(), MAX_EXTRA_VALUE, false))
            }
            other => other,
        };
        out.insert(key, s);
    }
    serde_json::to_string(&out).unwrap_or_else(|_| "{}".to_string())
}

/// One sanitized telemetry row, shaped to match the `telemetry.errors_raw`
/// columns. Serialized to a JSONEachRow line on the request thread so the
/// flusher never has to walk a `serde_json::Value` again.
#[derive(Serialize)]
struct Row {
    project: String,
    platform: String,
    release: String,
    environment: String,
    fingerprint: String,
    error_type: String,
    message: String,
    stack: String,
    url: String,
    user_id: String,
    session_id: String,
    user_agent: String,
    handled: u8,
    extra: String,
}

/// A row ready for the queue: the pre-serialized JSONEachRow `line` plus the
/// `project` it belongs to (needed for the per-project rate cap without
/// re-parsing the line).
pub struct PreparedRow {
    pub project: String,
    pub line: String,
}

impl ErrorEvent {
    pub fn into_row(self, user_agent: &str) -> Option<PreparedRow> {
        let message = sanitize(self.message, MAX_MESSAGE, true);
        if message.is_empty() || is_noise(&message) {
            return None;
        }
        // Trimmed before the emptiness test: whitespace survives sanitize, and a
        // project of "  " is long enough to satisfy the CHECK constraint on the
        // column. It would become its own LowCardinality value and its own
        // rate-limit bucket, neither of which corresponds to anything.
        let project = sanitize(self.project, 128, false).trim().to_string();
        if project.is_empty() {
            return None;
        }
        let error_type = sanitize(self.error_type.unwrap_or_default(), 128, false);
        let stack = sanitize(self.stack.unwrap_or_default(), MAX_STACK, true);
        let url = self.url.map(strip_query).unwrap_or_default();
        let fingerprint = fingerprint(&project, &error_type, &stack, &message);

        let row = Row {
            project: project.clone(),
            platform: allow_enum(self.platform, PLATFORMS, "web"),
            release: sanitize(self.release.unwrap_or_default(), 64, false),
            environment: allow_enum(self.environment, ENVIRONMENTS, "production"),
            fingerprint,
            error_type,
            message,
            stack,
            url,
            user_id: sanitize(self.user_id.unwrap_or_default(), 128, false),
            session_id: sanitize(self.session_id.unwrap_or_default(), 128, false),
            user_agent: sanitize(user_agent.to_string(), 512, false),
            handled: u8::from(self.handled.unwrap_or(false)),
            extra: sanitize_extra(self.extra),
        };

        let line = serde_json::to_string(&row).ok()?;
        Some(PreparedRow { project, line })
    }
}

/// A Web Vitals sample. Separate from ErrorEvent rather than a variant of it:
/// it shares no required field beyond the routing ones, and folding them into
/// one type would mean a row shape where half the columns are always empty.
#[derive(Debug, Deserialize)]
pub struct PerfEvent {
    pub project: String,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
    pub metric: String,
    pub value: f64,
    #[serde(default)]
    pub rating: Option<String>,
    #[serde(default)]
    pub navigation_type: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub extra: Option<Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
pub struct PerfBatch {
    pub events: Vec<PerfEvent>,
}

#[derive(Serialize)]
struct PerfRow {
    project: String,
    platform: String,
    release: String,
    environment: String,
    metric: String,
    value: f64,
    rating: String,
    navigation_type: String,
    url: String,
    user_id: String,
    session_id: String,
    user_agent: String,
    extra: String,
}

impl PerfEvent {
    pub fn into_row(self, user_agent: &str) -> Option<PreparedRow> {
        // Trimmed before the emptiness test: whitespace survives sanitize, and a
        // project of "  " is long enough to satisfy the CHECK constraint on the
        // column. It would become its own LowCardinality value and its own
        // rate-limit bucket, neither of which corresponds to anything.
        let project = sanitize(self.project, 128, false).trim().to_string();
        if project.is_empty() {
            return None;
        }
        let metric = self.metric.trim().to_lowercase();
        if !PERF_METRICS.contains(&metric.as_str()) {
            return None;
        }
        // NaN and infinity serialize to JSON `null`, which ClickHouse rejects for
        // a Float64 column -- one such sample would fail the whole insert batch
        // it lands in, taking every good row with it.
        if !self.value.is_finite() || self.value < 0.0 || self.value > MAX_PERF_VALUE {
            return None;
        }

        let row = PerfRow {
            project: project.clone(),
            platform: allow_enum(self.platform, PLATFORMS, "web"),
            release: sanitize(self.release.unwrap_or_default(), 64, false),
            environment: allow_enum(self.environment, ENVIRONMENTS, "production"),
            metric,
            value: self.value,
            rating: allow_enum(self.rating, RATINGS, ""),
            navigation_type: allow_enum(self.navigation_type, NAV_TYPES, ""),
            url: self.url.map(strip_query).unwrap_or_default(),
            user_id: sanitize(self.user_id.unwrap_or_default(), 128, false),
            session_id: sanitize(self.session_id.unwrap_or_default(), 128, false),
            user_agent: sanitize(user_agent.to_string(), 512, false),
            extra: sanitize_extra(self.extra),
        };
        let line = serde_json::to_string(&row).ok()?;
        Some(PreparedRow { project, line })
    }
}

/// A named product event. `name` is free-form by necessity but length-capped
/// and lower-cased, so the LowCardinality column sees one spelling per event.
#[derive(Debug, Deserialize)]
pub struct ProductEvent {
    pub project: String,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub extra: Option<Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
pub struct ProductBatch {
    pub events: Vec<ProductEvent>,
}

#[derive(Serialize)]
struct ProductRow {
    project: String,
    platform: String,
    release: String,
    environment: String,
    name: String,
    url: String,
    user_id: String,
    session_id: String,
    user_agent: String,
    extra: String,
}

impl ProductEvent {
    pub fn into_row(self, user_agent: &str) -> Option<PreparedRow> {
        // Trimmed before the emptiness test: whitespace survives sanitize, and a
        // project of "  " is long enough to satisfy the CHECK constraint on the
        // column. It would become its own LowCardinality value and its own
        // rate-limit bucket, neither of which corresponds to anything.
        let project = sanitize(self.project, 128, false).trim().to_string();
        if project.is_empty() {
            return None;
        }
        let name = sanitize(self.name, MAX_EVENT_NAME, false)
            .trim()
            .to_lowercase();
        if name.is_empty() {
            return None;
        }

        let row = ProductRow {
            project: project.clone(),
            platform: allow_enum(self.platform, PLATFORMS, "web"),
            release: sanitize(self.release.unwrap_or_default(), 64, false),
            environment: allow_enum(self.environment, ENVIRONMENTS, "production"),
            name,
            url: self.url.map(strip_query).unwrap_or_default(),
            user_id: sanitize(self.user_id.unwrap_or_default(), 128, false),
            session_id: sanitize(self.session_id.unwrap_or_default(), 128, false),
            user_agent: sanitize(user_agent.to_string(), 512, false),
            extra: sanitize_extra(self.extra),
        };
        let line = serde_json::to_string(&row).ok()?;
        Some(PreparedRow { project, line })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(message: &str) -> ErrorEvent {
        ErrorEvent {
            project: "kbve".into(),
            platform: None,
            release: None,
            environment: None,
            error_type: None,
            message: message.into(),
            stack: None,
            url: None,
            user_id: None,
            session_id: None,
            handled: None,
            extra: None,
        }
    }

    #[test]
    fn truncate_does_not_split_utf8() {
        // "💥" is 4 bytes; truncating to 2 must not panic and yields "".
        let out = truncate("💥".to_string(), 2);
        assert!(out.is_empty());
        // Boundary inside the second char drops it cleanly.
        let out = truncate("a💥".to_string(), 3);
        assert_eq!(out, "a");
    }

    #[test]
    fn sanitize_strips_control_and_ansi() {
        let out = sanitize("a\u{0}b\u{1b}[31mred\u{1b}[0mc\u{7}".to_string(), 64, false);
        assert_eq!(out, "ab[31mred[0mc");
    }

    #[test]
    fn sanitize_keeps_newlines_when_asked() {
        assert_eq!(sanitize("a\nb\tc".to_string(), 64, true), "a\nb\tc");
        assert_eq!(sanitize("a\nb\tc".to_string(), 64, false), "abc");
    }

    #[test]
    fn allow_enum_clamps_unknown() {
        assert_eq!(allow_enum(Some("iOS".into()), PLATFORMS, "web"), "ios");
        assert_eq!(allow_enum(Some("'; DROP".into()), PLATFORMS, "web"), "web");
        assert_eq!(allow_enum(None, ENVIRONMENTS, "production"), "production");
    }

    #[test]
    fn multibyte_message_at_limit_does_not_panic() {
        let msg = "x".repeat(MAX_MESSAGE - 1) + "💥";
        let row = event(&msg).into_row("ua");
        assert!(row.is_some());
    }

    #[test]
    fn empty_and_noise_dropped() {
        assert!(event("").into_row("ua").is_none());
        assert!(event("Script error.").into_row("ua").is_none());
    }

    fn perf(metric: &str, value: f64) -> PerfEvent {
        PerfEvent {
            project: "kbve".into(),
            platform: None,
            release: None,
            environment: None,
            metric: metric.into(),
            value,
            rating: None,
            navigation_type: None,
            url: None,
            user_id: None,
            session_id: None,
            extra: None,
        }
    }

    fn product(name: &str) -> ProductEvent {
        ProductEvent {
            project: "kbve".into(),
            platform: None,
            release: None,
            environment: None,
            name: name.into(),
            url: None,
            user_id: None,
            session_id: None,
            extra: None,
        }
    }

    #[test]
    fn perf_metric_is_normalized_and_unknown_is_dropped() {
        let row = perf("  LCP ", 1200.0).into_row("ua").unwrap();
        let v: Value = serde_json::from_str(&row.line).unwrap();
        assert_eq!(v["metric"], "lcp");
        // Not defaulted to a real metric: a bogus name would poison the quantile
        // of whichever metric it was coerced into.
        assert!(perf("made_up", 1.0).into_row("ua").is_none());
    }

    #[test]
    fn perf_rejects_values_clickhouse_would_choke_on() {
        // NaN and infinity serialize to JSON null, which fails the insert for
        // the whole batch they are in -- not just for the offending row.
        assert!(perf("lcp", f64::NAN).into_row("ua").is_none());
        assert!(perf("lcp", f64::INFINITY).into_row("ua").is_none());
        assert!(perf("lcp", -1.0).into_row("ua").is_none());
        assert!(perf("lcp", MAX_PERF_VALUE + 1.0).into_row("ua").is_none());
        // The bounds themselves are valid; CLS is a ratio, so 0 is a real value.
        assert!(perf("cls", 0.0).into_row("ua").is_some());
        assert!(perf("lcp", MAX_PERF_VALUE).into_row("ua").is_some());
    }

    #[test]
    fn perf_clamps_rating_and_navigation_type() {
        let mut ev = perf("inp", 40.0);
        ev.rating = Some("GOOD".into());
        ev.navigation_type = Some("teleport".into());
        ev.url = Some("https://kbve.com/x?token=secret".into());
        let v: Value = serde_json::from_str(&ev.into_row("ua").unwrap().line).unwrap();
        assert_eq!(v["rating"], "good");
        assert_eq!(
            v["navigation_type"], "",
            "an unknown verdict is left unrated"
        );
        assert_eq!(v["url"], "https://kbve.com/x", "query string is dropped");
    }

    #[test]
    fn a_whitespace_only_project_is_not_a_project() {
        let mut ev = perf("lcp", 1.0);
        ev.project = "   ".into();
        assert!(ev.into_row("ua").is_none());
        // Same rule on the errors lens, which had the same hole: "  " is
        // non-empty after sanitize and passes the column's length CHECK.
        let mut err = event("boom");
        err.project = "  ".into();
        assert!(err.into_row("ua").is_none());
        let mut prod = product("click");
        prod.project = " ".into();
        assert!(prod.into_row("ua").is_none());
    }

    #[test]
    fn product_name_is_normalized_and_required() {
        let row = product("  Signup_Completed ").into_row("ua").unwrap();
        let v: Value = serde_json::from_str(&row.line).unwrap();
        assert_eq!(v["name"], "signup_completed");
        assert!(product("").into_row("ua").is_none());
        assert!(product("\u{0}\u{1}").into_row("ua").is_none());
    }

    #[test]
    fn product_name_is_length_capped() {
        let row = product(&"n".repeat(MAX_EVENT_NAME * 2))
            .into_row("ua")
            .unwrap();
        let v: Value = serde_json::from_str(&row.line).unwrap();
        assert_eq!(v["name"].as_str().unwrap().len(), MAX_EVENT_NAME);
    }

    #[test]
    fn product_carries_the_same_sanitizing_as_errors() {
        let mut ev = product("click");
        ev.platform = Some("HACKER".into());
        let mut map = Map::new();
        map.insert("k\u{0}".into(), Value::String("v\u{1b}".into()));
        ev.extra = Some(map);
        let v: Value = serde_json::from_str(&ev.into_row("ua\u{0}").unwrap().line).unwrap();
        assert_eq!(v["platform"], "web", "unknown platform falls back");
        assert_eq!(v["user_agent"], "ua");
        let extra: Value = serde_json::from_str(v["extra"].as_str().unwrap()).unwrap();
        assert_eq!(extra["k"], "v");
    }

    #[test]
    fn enum_and_extra_sanitized_in_row() {
        let mut ev = event("boom");
        ev.platform = Some("android".into());
        ev.environment = Some("hacker".into());
        let mut map = Map::new();
        map.insert("ok\u{0}key".into(), Value::String("va\u{1b}lue".into()));
        ev.extra = Some(map);
        let prepared = ev.into_row("agent\u{0}x").unwrap();
        assert_eq!(prepared.project, "kbve");
        let row: Value = serde_json::from_str(&prepared.line).unwrap();
        assert_eq!(row["platform"], "android");
        assert_eq!(row["environment"], "production");
        assert_eq!(row["user_agent"], "agentx");
        let extra: Value = serde_json::from_str(row["extra"].as_str().unwrap()).unwrap();
        assert_eq!(extra["okkey"], "value");
    }
}
