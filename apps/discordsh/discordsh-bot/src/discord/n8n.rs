use std::sync::Arc;
use std::time::Duration;

use anyhow::{Result, anyhow};
use globset::{Glob, GlobSet, GlobSetBuilder};
use hmac::{Hmac, Mac};
use serde::Serialize;
use serde_json::Value;
use sha2::Sha256;
use tracing::info;

use crate::discord::github_permissions::CommandRateLimiter;

type HmacSha256 = Hmac<Sha256>;

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

#[derive(Debug, Serialize)]
pub struct Payload<'a> {
    pub webhook_path: &'a str,
    pub args: &'a [String],
    pub discord: &'a DiscordContext,
    pub ts: i64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ForwardError {
    PathNotAllowed,
    RateLimited,
    TooManyArgs,
    ArgTooLong,
    EmptyPath,
    Upstream(String),
}

impl std::fmt::Display for ForwardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PathNotAllowed => write!(f, "Webhook path not in allowlist."),
            Self::RateLimited => write!(f, "Rate limit hit. Wait a few seconds."),
            Self::TooManyArgs => write!(f, "Too many args (max {ARG_LIMIT})."),
            Self::ArgTooLong => write!(f, "Single arg too long (max {ARG_LEN_LIMIT})."),
            Self::EmptyPath => write!(f, "Webhook path is empty."),
            Self::Upstream(s) => write!(f, "n8n upstream error: {s}"),
        }
    }
}

impl std::error::Error for ForwardError {}

pub struct N8nConfig {
    pub base_url: String,
    pub hmac_secret: String,
    pub allowed_paths: GlobSet,
    pub rate_limiter: CommandRateLimiter,
    pub client: reqwest::Client,
}

impl N8nConfig {
    pub fn from_env() -> Option<Arc<Self>> {
        let base_url = std::env::var("N8N_BASE_URL")
            .ok()
            .filter(|s| !s.is_empty())?;
        let hmac_secret = std::env::var("N8N_HMAC_SECRET")
            .ok()
            .filter(|s| !s.is_empty())?;
        let allowed_raw = std::env::var("N8N_ALLOWED_PATHS")
            .ok()
            .filter(|s| !s.is_empty())?;

        let allowed_paths = match build_globset(&allowed_raw) {
            Ok(set) => set,
            Err(e) => {
                tracing::error!(error = %e, "N8N_ALLOWED_PATHS invalid; /n8n disabled");
                return None;
            }
        };

        let max = std::env::var("N8N_RATE_LIMIT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_PER_WINDOW);
        let window = std::env::var("N8N_RATE_WINDOW")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_COOLDOWN_SECS);

        let base_url = if base_url.ends_with('/') {
            base_url
        } else {
            format!("{base_url}/")
        };

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .ok()?;

        info!(
            base_url = %base_url,
            patterns = %allowed_raw,
            cooldown_secs = window,
            max_per_window = max,
            "n8n forwarder configured"
        );

        Some(Arc::new(Self {
            base_url,
            hmac_secret,
            allowed_paths,
            rate_limiter: CommandRateLimiter::new(max, window),
            client,
        }))
    }

    pub fn path_allowed(&self, path: &str) -> bool {
        self.allowed_paths.is_match(path)
    }

    pub async fn forward(
        &self,
        webhook_path: &str,
        args: &[String],
        discord: &DiscordContext,
    ) -> Result<Value, ForwardError> {
        let path = webhook_path.trim().trim_start_matches('/');
        if path.is_empty() {
            return Err(ForwardError::EmptyPath);
        }
        if !self.path_allowed(path) {
            return Err(ForwardError::PathNotAllowed);
        }
        if args.len() > ARG_LIMIT {
            return Err(ForwardError::TooManyArgs);
        }
        if args.iter().any(|a| a.len() > ARG_LEN_LIMIT) {
            return Err(ForwardError::ArgTooLong);
        }

        let user_key: u64 = discord.user_id.parse().unwrap_or(0);
        if user_key != 0 && !self.rate_limiter.check_user(user_key) {
            return Err(ForwardError::RateLimited);
        }

        let ts = chrono::Utc::now().timestamp();
        let payload = Payload {
            webhook_path: path,
            args,
            discord,
            ts,
        };
        let body = serde_json::to_vec(&payload)
            .map_err(|e| ForwardError::Upstream(format!("encode: {e}")))?;
        let signature = sign(&self.hmac_secret, ts, &body);
        let url = format!("{}{}", self.base_url, path);

        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("X-KBVE-Timestamp", ts.to_string())
            .header("X-KBVE-Signature", format!("sha256={signature}"))
            .body(body)
            .send()
            .await
            .map_err(|e| ForwardError::Upstream(format!("send: {e}")))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(ForwardError::Upstream(format!("HTTP {status}: {text}")));
        }
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::String(text));
        Ok(value)
    }
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

pub fn sign(secret: &str, ts: i64, body: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(ts.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

pub fn split_args(raw: &str) -> Vec<String> {
    raw.split_whitespace().map(|s| s.to_owned()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn sign_stable() {
        let s1 = sign("secret", 1000, b"{\"a\":1}");
        let s2 = sign("secret", 1000, b"{\"a\":1}");
        assert_eq!(s1, s2);
        assert_eq!(s1.len(), 64);
    }

    #[test]
    fn sign_changes_with_inputs() {
        let base = sign("secret", 1000, b"body");
        assert_ne!(base, sign("secret2", 1000, b"body"));
        assert_ne!(base, sign("secret", 1001, b"body"));
        assert_ne!(base, sign("secret", 1000, b"body2"));
    }

    #[test]
    fn split_args_basic() {
        assert_eq!(split_args("a b c"), vec!["a", "b", "c"]);
        assert_eq!(split_args("  a   b  "), vec!["a", "b"]);
        assert!(split_args("").is_empty());
    }

    // ── Integration tests against a wiremock'd fake n8n ────────────

    use wiremock::matchers::{header, header_exists, method, path};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    fn discord_ctx() -> DiscordContext {
        DiscordContext {
            user_id: "999".to_owned(),
            username: "tester".to_owned(),
            guild_id: Some("42".to_owned()),
            channel_id: "7".to_owned(),
        }
    }

    fn make_cfg(base_url: String, allow: &str, max: u32, window: u64) -> Arc<N8nConfig> {
        Arc::new(N8nConfig {
            base_url: if base_url.ends_with('/') {
                base_url
            } else {
                format!("{base_url}/")
            },
            hmac_secret: "topsecret".to_owned(),
            allowed_paths: build_globset(allow).unwrap(),
            rate_limiter: CommandRateLimiter::new(max, window),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap(),
        })
    }

    #[tokio::test]
    async fn forward_success_signs_payload() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/deploy-prod"))
            .and(header("Content-Type", "application/json"))
            .and(header_exists("X-KBVE-Signature"))
            .and(header_exists("X-KBVE-Timestamp"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ok": true,
                "echo": "hello",
            })))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "deploy-*", 10, 60);
        let args = vec!["alpha".to_owned(), "beta".to_owned()];
        let resp = cfg
            .forward("deploy-prod", &args, &discord_ctx())
            .await
            .expect("forward ok");

        assert_eq!(resp["ok"], serde_json::Value::Bool(true));
        assert_eq!(resp["echo"], serde_json::Value::String("hello".into()));
    }

    #[tokio::test]
    async fn forward_signature_matches_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/foo"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "foo", 10, 60);
        cfg.forward("foo", &[], &discord_ctx()).await.unwrap();

        let req = &server.received_requests().await.unwrap()[0];
        let ts = req
            .headers
            .get("X-KBVE-Timestamp")
            .unwrap()
            .to_str()
            .unwrap()
            .parse::<i64>()
            .unwrap();
        let sig_header = req
            .headers
            .get("X-KBVE-Signature")
            .unwrap()
            .to_str()
            .unwrap();
        let sig = sig_header.strip_prefix("sha256=").unwrap();
        let expected = sign("topsecret", ts, &req.body);
        assert_eq!(sig, expected);
    }

    #[tokio::test]
    async fn forward_rejects_path_outside_allowlist() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "allowed-*", 10, 60);
        let err = cfg
            .forward("blocked", &[], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, ForwardError::PathNotAllowed);
    }

    #[tokio::test]
    async fn forward_strips_leading_slash() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/kbve/start"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "kbve/**", 10, 60);
        cfg.forward("/kbve/start", &[], &discord_ctx())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn forward_rate_limited_second_call() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/foo"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "foo", 1, 60);
        cfg.forward("foo", &[], &discord_ctx()).await.unwrap();
        let err = cfg.forward("foo", &[], &discord_ctx()).await.unwrap_err();
        assert_eq!(err, ForwardError::RateLimited);
    }

    #[tokio::test]
    async fn forward_upstream_error_propagates() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/foo"))
            .respond_with(ResponseTemplate::new(500).set_body_string("boom"))
            .expect(1)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "foo", 10, 60);
        let err = cfg.forward("foo", &[], &discord_ctx()).await.unwrap_err();
        match err {
            ForwardError::Upstream(s) => {
                assert!(s.contains("500"));
                assert!(s.contains("boom"));
            }
            other => panic!("expected upstream error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn forward_too_many_args_rejected() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "foo", 10, 60);
        let args: Vec<String> = (0..ARG_LIMIT + 1).map(|i| i.to_string()).collect();
        let err = cfg.forward("foo", &args, &discord_ctx()).await.unwrap_err();
        assert_eq!(err, ForwardError::TooManyArgs);
    }

    #[tokio::test]
    async fn forward_arg_too_long_rejected() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;

        let cfg = make_cfg(server.uri(), "foo", 10, 60);
        let big = "x".repeat(ARG_LEN_LIMIT + 1);
        let err = cfg
            .forward("foo", &[big], &discord_ctx())
            .await
            .unwrap_err();
        assert_eq!(err, ForwardError::ArgTooLong);
    }

    #[tokio::test]
    async fn forward_empty_path_rejected() {
        let server = MockServer::start().await;
        let cfg = make_cfg(server.uri(), "*", 10, 60);
        let err = cfg.forward("   ", &[], &discord_ctx()).await.unwrap_err();
        assert_eq!(err, ForwardError::EmptyPath);
    }

    #[tokio::test]
    async fn forward_body_contains_discord_context() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/echo"))
            .respond_with(|req: &Request| {
                let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
                assert_eq!(body["webhook_path"], "echo");
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

        let cfg = make_cfg(server.uri(), "echo", 10, 60);
        cfg.forward("echo", &["hello".to_owned()], &discord_ctx())
            .await
            .unwrap();
    }
}
