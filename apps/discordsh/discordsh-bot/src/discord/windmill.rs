use std::sync::Arc;
use std::time::Duration;

use anyhow::{Result, anyhow};
use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::Serialize;
use serde_json::Value;
use tracing::info;

use crate::discord::github_permissions::CommandRateLimiter;

const DEFAULT_COOLDOWN_SECS: u64 = 5;
const DEFAULT_MAX_PER_WINDOW: u32 = 1;
const REQUEST_TIMEOUT_SECS: u64 = 30;
const ARG_LIMIT: usize = 16;
const ARG_LEN_LIMIT: usize = 512;

#[derive(Debug, Serialize)]
pub struct DiscordContext {
    pub user_id: String,
    pub username: String,
    pub guild_id: Option<String>,
    pub channel_id: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RunError {
    PathNotAllowed,
    RateLimited,
    TooManyArgs,
    ArgTooLong,
    EmptyPath,
    Upstream(String),
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PathNotAllowed => write!(f, "Path not in allowlist."),
            Self::RateLimited => write!(f, "Rate limit hit. Wait a few seconds."),
            Self::TooManyArgs => write!(f, "Too many args (max {ARG_LIMIT})."),
            Self::ArgTooLong => write!(f, "Single arg too long (max {ARG_LEN_LIMIT})."),
            Self::EmptyPath => write!(f, "Path is empty."),
            Self::Upstream(s) => write!(f, "windmill upstream error: {s}"),
        }
    }
}

impl std::error::Error for RunError {}

pub struct WindmillConfig {
    pub base_url: String,
    pub token: String,
    pub workspace: String,
    pub allowed_paths: GlobSet,
    pub rate_limiter: CommandRateLimiter,
    pub client: reqwest::Client,
}

impl WindmillConfig {
    pub fn from_env() -> Option<Arc<Self>> {
        let base_url = std::env::var("WINDMILL_BASE_URL")
            .ok()
            .filter(|s| !s.is_empty())?;
        let token = std::env::var("WINDMILL_TOKEN")
            .ok()
            .filter(|s| !s.is_empty())?;
        let allowed_raw = std::env::var("WINDMILL_ALLOWED_PATHS")
            .ok()
            .filter(|s| !s.is_empty())?;
        let workspace =
            std::env::var("WINDMILL_WORKSPACE").unwrap_or_else(|_| "kbve".to_owned());

        let allowed_paths = match build_globset(&allowed_raw) {
            Ok(set) => set,
            Err(e) => {
                tracing::error!(error = %e, "WINDMILL_ALLOWED_PATHS invalid; /wm disabled");
                return None;
            }
        };

        let max = std::env::var("WM_RATE_LIMIT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_PER_WINDOW);
        let window = std::env::var("WM_RATE_WINDOW")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_COOLDOWN_SECS);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .ok()?;

        info!(
            base_url = %base_url,
            workspace = %workspace,
            patterns = %allowed_raw,
            cooldown_secs = window,
            max_per_window = max,
            "windmill runner configured"
        );

        Some(Arc::new(Self {
            base_url,
            token,
            workspace,
            allowed_paths,
            rate_limiter: CommandRateLimiter::new(max, window),
            client,
        }))
    }

    pub fn path_allowed(&self, path: &str) -> bool {
        self.allowed_paths.is_match(path)
    }

    pub async fn run(
        &self,
        wm_path: &str,
        args: &[String],
        discord: &DiscordContext,
    ) -> Result<Value, RunError> {
        let raw = wm_path.trim().trim_start_matches('/');
        if raw.is_empty() {
            return Err(RunError::EmptyPath);
        }
        let path = resolve_path(raw);
        if !is_path_safe(&path) {
            return Err(RunError::PathNotAllowed);
        }
        if !path.starts_with(BOT_NAMESPACE) {
            return Err(RunError::PathNotAllowed);
        }
        if !self.path_allowed(&path) {
            return Err(RunError::PathNotAllowed);
        }
        if args.len() > ARG_LIMIT {
            return Err(RunError::TooManyArgs);
        }
        if args.iter().any(|a| a.len() > ARG_LEN_LIMIT) {
            return Err(RunError::ArgTooLong);
        }

        let user_key: u64 = discord.user_id.parse().unwrap_or(0);
        if !self.rate_limiter.check_user(user_key) {
            return Err(RunError::RateLimited);
        }

        let body = serde_json::json!({ "args": args, "discord": discord });
        let url = format!(
            "{}/api/w/{}/jobs/run_wait_result/{RUN_KIND_SCRIPT}/{}",
            self.base_url.trim_end_matches('/'),
            self.workspace,
            path
        );

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await
            .map_err(|e| RunError::Upstream(format!("send: {e}")))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(RunError::Upstream(format!("HTTP {status}: {text}")));
        }
        Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }

    /// Best-effort list of the command leaf names reachable under the bot
    /// namespace (`f/discordsh/*`), pulled live from Windmill's script index.
    /// Used only to power the did-you-mean hint on an unknown command, so any
    /// failure degrades to an empty list rather than surfacing an error.
    pub async fn list_command_names(&self) -> Vec<String> {
        let url = format!(
            "{}/api/w/{}/scripts/list",
            self.base_url.trim_end_matches('/'),
            self.workspace
        );
        let Ok(resp) = self.client.get(&url).bearer_auth(&self.token).send().await else {
            return Vec::new();
        };
        if !resp.status().is_success() {
            return Vec::new();
        }
        let Ok(rows) = resp.json::<Vec<Value>>().await else {
            return Vec::new();
        };
        rows.iter()
            .filter_map(|r| r.get("path").and_then(Value::as_str))
            .filter_map(|p| p.strip_prefix(BOT_NAMESPACE))
            .filter(|leaf| !leaf.is_empty() && !leaf.contains('/'))
            .map(str::to_owned)
            .collect()
    }
}

/// Suggest the closest known command to a mistyped one. Returns `Some(name)`
/// only when a candidate is within a small edit distance, so an unrelated
/// typo yields no misleading suggestion.
pub fn suggest_command(attempted: &str, names: &[String]) -> Option<String> {
    let attempted = attempted.to_lowercase();
    let max_dist = 3usize;
    names
        .iter()
        .map(|n| (levenshtein(&attempted, &n.to_lowercase()), n))
        .filter(|(d, _)| *d <= max_dist && *d < attempted.len().max(1))
        .min_by_key(|(d, _)| *d)
        .map(|(_, n)| n.clone())
}

/// Standard iterative Levenshtein edit distance over Unicode scalar values.
fn levenshtein(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for (i, ca) in a.chars().enumerate() {
        cur[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = if ca == *cb { 0 } else { 1 };
            cur[j + 1] = (prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// The single Windmill folder the bot may ever reach. The trailing slash is
/// load-bearing: it confines the namespace gate to children of the folder and
/// blocks prefix-confusion (`f/discordshEVIL/...`). Bare `/wm` paths collapse
/// into it; explicit paths outside it are rejected.
const BOT_NAMESPACE: &str = "f/discordsh/";

/// Windmill's `run_wait_result/{kind}/{path}` route reads the segment right
/// after `run_wait_result/` as the run-TYPE selector — `p` for a script, `f`
/// for a flow — SEPARATE from the storage path (which itself starts with the
/// `f/` folder root). Every path the bot reaches is a `f/discordsh/*` script,
/// so the selector is always `p`; sending the bare storage path made Windmill
/// read its leading `f/` folder root as "run a flow" and 404 with
/// `flow not found`. Flow support would add an `f` selector variant.
const RUN_KIND_SCRIPT: &str = "p";

/// Collapse a bare path into the bot namespace. A path already carrying an
/// `f/` or `p/` kind prefix is returned unchanged (and later rejected by the
/// namespace gate unless it lives under [`BOT_NAMESPACE`]); anything else is
/// prefixed with `f/discordsh/`. Collapse happens BEFORE [`is_path_safe`], so
/// traversal via a bare path (`../x` → `f/discordsh/../x`) is still rejected.
fn resolve_path(raw: &str) -> String {
    if raw.starts_with("f/") || raw.starts_with("p/") {
        raw.to_owned()
    } else {
        format!("{BOT_NAMESPACE}{raw}")
    }
}

/// Strict validation applied to the *resolved* path before it is glob-matched
/// or interpolated into the Windmill API URL. This is the last line of
/// defense against path-traversal (`..`) and request-injection (`?`, `#`,
/// whitespace, etc.) since `reqwest`/`url` normalize `..` segments *after*
/// the allowlist check would otherwise run.
fn is_path_safe(path: &str) -> bool {
    if !(path.starts_with("f/") || path.starts_with("p/")) {
        return false;
    }
    if path
        .split('/')
        .any(|seg| seg.is_empty() || seg == ".." || seg == ".")
    {
        return false;
    }
    path.bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'.'))
}

fn build_globset(raw: &str) -> Result<GlobSet> {
    let mut builder = GlobSetBuilder::new();
    let mut count = 0;
    for pat in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        builder.add(Glob::new(pat).map_err(|e| anyhow!("glob `{pat}`: {e}"))?);
        count += 1;
    }
    if count == 0 {
        return Err(anyhow!("no glob patterns"));
    }
    builder.build().map_err(|e| anyhow!("globset build: {e}"))
}

pub fn split_args(raw: &str) -> Vec<String> {
    raw.split_whitespace().map(|s| s.to_owned()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levenshtein_basic() {
        assert_eq!(levenshtein("poem", "poem"), 0);
        assert_eq!(levenshtein("pomm", "poem"), 1);
        assert_eq!(levenshtein("", "poem"), 4);
        assert_eq!(levenshtein("npm", "ud"), 3);
    }

    #[test]
    fn suggest_command_matches_close_typo() {
        let names = vec!["poem".to_owned(), "npm".to_owned(), "ud".to_owned()];
        assert_eq!(suggest_command("pomm", &names).as_deref(), Some("poem"));
        assert_eq!(suggest_command("POEM", &names).as_deref(), Some("poem"));
        assert_eq!(suggest_command("nmp", &names).as_deref(), Some("npm"));
    }

    #[test]
    fn suggest_command_rejects_unrelated() {
        let names = vec!["poem".to_owned(), "npm".to_owned(), "ud".to_owned()];
        // Too far from any command, and a miss shorter than its own length.
        assert_eq!(suggest_command("weather", &names), None);
        assert_eq!(suggest_command("xy", &names), None);
    }

    #[test]
    fn suggest_command_empty_list() {
        assert_eq!(suggest_command("poem", &[]), None);
    }

    #[test]
    fn globset_exact_match() {
        let set = build_globset("foo,bar/baz").unwrap();
        assert!(set.is_match("foo"));
        assert!(set.is_match("bar/baz"));
        assert!(!set.is_match("foo/bar"));
        assert!(!set.is_match("qux"));
    }

    #[test]
    fn globset_wildcard() {
        // globset `*` is shell-style and crosses `/` by default; callers who
        // need single-segment scoping should compose explicit patterns.
        let set = build_globset("kbve/*,deploy-*").unwrap();
        assert!(set.is_match("kbve/start"));
        assert!(set.is_match("kbve/start/extra"));
        assert!(set.is_match("deploy-prod"));
        assert!(!set.is_match("random"));
    }

    #[test]
    fn globset_recursive() {
        let set = build_globset("kbve/**").unwrap();
        assert!(set.is_match("kbve/a"));
        assert!(set.is_match("kbve/a/b/c"));
    }

    #[test]
    fn globset_empty_rejected() {
        assert!(build_globset("").is_err());
        assert!(build_globset("   ").is_err());
    }

    #[test]
    fn split_args_basic() {
        assert_eq!(split_args("a b c"), vec!["a", "b", "c"]);
        assert_eq!(split_args("  a   b  "), vec!["a", "b"]);
        assert!(split_args("").is_empty());
    }

    #[test]
    fn resolve_path_collapses_bare_into_namespace() {
        assert_eq!(resolve_path("poem"), "f/discordsh/poem");
        assert_eq!(resolve_path("deploy/restart"), "f/discordsh/deploy/restart");
    }

    #[test]
    fn resolve_path_leaves_explicit_prefixed_unchanged() {
        assert_eq!(resolve_path("f/deploy/x"), "f/deploy/x");
        assert_eq!(resolve_path("p/ops/x"), "p/ops/x");
        assert_eq!(resolve_path("f/discordsh/poem"), "f/discordsh/poem");
    }

    // ── Integration tests against a wiremock'd fake Windmill ────────

    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    fn discord_ctx() -> DiscordContext {
        DiscordContext {
            user_id: "999".to_owned(),
            username: "tester".to_owned(),
            guild_id: Some("42".to_owned()),
            channel_id: "7".to_owned(),
        }
    }

    fn make_cfg(base_url: String, allow: &str, max: u32, window: u64) -> Arc<WindmillConfig> {
        Arc::new(WindmillConfig {
            base_url,
            token: "topsecret".to_owned(),
            workspace: "kbve".to_owned(),
            allowed_paths: build_globset(allow).unwrap(),
            rate_limiter: CommandRateLimiter::new(max, window),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap(),
        })
    }

    #[tokio::test]
    async fn run_success_calls_windmill() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/poem"))
            .and(header("authorization", "Bearer topsecret"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ok": true,
                "echo": "hello",
            })))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/*", 10, 60);
        let args = vec!["alpha".to_owned(), "beta".to_owned()];
        let resp = cfg
            .run("f/discordsh/poem", &args, &discord_ctx())
            .await
            .expect("run ok");

        assert_eq!(resp["ok"], serde_json::Value::Bool(true));
        assert_eq!(resp["echo"], serde_json::Value::String("hello".into()));
    }

    #[tokio::test]
    async fn run_collapses_bare_path_into_namespace() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/poem"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/*", 10, 60);
        cfg.run("poem", &[], &discord_ctx()).await.unwrap();
    }

    #[tokio::test]
    async fn run_rejects_path_outside_allowlist() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/allowed-*", 10, 60);
        let err = cfg
            .run("f/discordsh/blocked", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_rejects_explicit_path_outside_namespace() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        // Permissive allowlist — the namespace gate, not the glob, must reject.
        let cfg = make_cfg(server.uri(), "f/**", 10, 60);
        let err = cfg
            .run("f/deploy/restart", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_rejects_p_scripts_outside_namespace() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "p/**", 10, 60);
        let err = cfg
            .run("p/ops/anything", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_rejects_namespace_prefix_confusion() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/**", 10, 60);
        let err = cfg
            .run("f/discordshEVIL/x", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_strips_leading_slash() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/start"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/**", 10, 60);
        cfg.run("/f/discordsh/start", &[], &discord_ctx())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn run_rate_limited_second_call() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/foo"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/foo", 1, 60);
        cfg.run("f/discordsh/foo", &[], &discord_ctx())
            .await
            .unwrap();
        let err = cfg
            .run("f/discordsh/foo", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::RateLimited);
    }

    #[tokio::test]
    async fn run_upstream_error_propagates() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/foo"))
            .respond_with(ResponseTemplate::new(500).set_body_string("boom"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/foo", 10, 60);
        let err = cfg
            .run("f/discordsh/foo", &[], &discord_ctx())
            .await
            .unwrap_err();
        match err {
            RunError::Upstream(s) => {
                assert!(s.contains("500"));
                assert!(s.contains("boom"));
            }
            other => panic!("expected upstream error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn run_too_many_args_rejected() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/foo", 10, 60);
        let args: Vec<String> = (0..ARG_LIMIT + 1).map(|i| i.to_string()).collect();
        let err = cfg
            .run("f/discordsh/foo", &args, &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::TooManyArgs);
    }

    #[tokio::test]
    async fn run_arg_too_long_rejected() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/foo", 10, 60);
        let big = "x".repeat(ARG_LEN_LIMIT + 1);
        let err = cfg
            .run("f/discordsh/foo", &[big], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::ArgTooLong);
    }

    #[tokio::test]
    async fn run_empty_path_rejected() {
        let server = MockServer::start().await;
        let cfg = make_cfg(server.uri(), "f/discordsh/*", 10, 60);
        let err = cfg.run("   ", &[], &discord_ctx()).await.unwrap_err();
        assert_eq!(err, RunError::EmptyPath);
    }

    #[tokio::test]
    async fn run_body_contains_args_and_discord_context() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/w/kbve/jobs/run_wait_result/p/f/discordsh/echo"))
            .respond_with(|req: &Request| {
                let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
                assert_eq!(body["discord"]["user_id"], "999");
                assert_eq!(body["discord"]["username"], "tester");
                assert_eq!(body["discord"]["guild_id"], "42");
                assert_eq!(body["discord"]["channel_id"], "7");
                assert_eq!(body["args"][0], "hello");
                ResponseTemplate::new(200).set_body_string("{}")
            })
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/echo", 10, 60);
        cfg.run("f/discordsh/echo", &["hello".to_owned()], &discord_ctx())
            .await
            .unwrap();
    }

    // ── Path-traversal / injection regression tests ─────────────────

    #[tokio::test]
    async fn run_rejects_traversal_via_recursive_allowlist() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/**", 10, 60);
        let err = cfg
            .run("f/discordsh/ok/../../p/evil", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_rejects_traversal_via_bare_collapse() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        // Bare path collapses to f/discordsh/../../p/x, then the `..` segment
        // is rejected — the collapse cannot be used to escape the namespace.
        let cfg = make_cfg(server.uri(), "f/discordsh/**", 10, 60);
        let err = cfg
            .run("../../p/x", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }

    #[tokio::test]
    async fn run_rejects_empty_leaf_and_segments() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/**", 10, 60);
        // Folder root (empty leaf) and empty interior segment both rejected.
        assert_eq!(
            cfg.run("f/discordsh/", &[], &discord_ctx()).await.unwrap_err(),
            RunError::PathNotAllowed
        );
        assert_eq!(
            cfg.run("f/discordsh//x", &[], &discord_ctx())
                .await
                .unwrap_err(),
            RunError::PathNotAllowed
        );
    }

    #[tokio::test]
    async fn run_rejects_query_injection_chars() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "f/discordsh/**", 10, 60);
        let err = cfg
            .run("f/discordsh/ok?token=leak", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, RunError::PathNotAllowed);
    }
}
