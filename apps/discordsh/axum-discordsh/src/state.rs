use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use poise::serenity_prelude as serenity;
use tokio::sync::{Notify, RwLock};

use kbve::{FontDb, MemberCache};

use crate::api::rate_limit::RateLimiter;
use crate::discord::game::{ProfileStore, SessionStore};
use crate::discord::github_cache::GitHubCache;
use crate::discord::github_permissions::GitHubCommandGuard;
use crate::health::HealthMonitor;
use crate::tracker::ShardTracker;

/// Central application state shared between the HTTP server and Discord bot.
///
/// Wrapped in `Arc` and handed to both subsystems so they can communicate:
/// - HTTP endpoints trigger bot restart/shutdown via `restart_flag` / `shutdown_notify`
/// - Bot stores `shard_manager` and `bot_http` for HTTP-side lifecycle control
/// - Tracker is optional (only present when Supabase env vars are set)
pub struct AppState {
    /// Background health monitor (CPU, memory, threads).
    pub health_monitor: Arc<HealthMonitor>,

    /// Optional shard tracker backed by Supabase.
    pub tracker: Option<ShardTracker>,

    /// Process start time (for uptime calculation).
    pub start_time: Instant,

    // ── Lifecycle control (HTTP → bot) ──────────────────────────────
    /// Notified to trigger graceful shutdown of the entire process.
    pub shutdown_notify: Notify,

    /// Set to `true` before shutting down shards to signal the main loop
    /// should restart the bot rather than exit.
    pub restart_flag: AtomicBool,

    /// The bot's shard manager, stored after client build so HTTP endpoints
    /// can call `shutdown_all()` for restart.
    pub shard_manager: RwLock<Option<Arc<serenity::ShardManager>>>,

    // ── Bot → HTTP bridge ───────────────────────────────────────────
    /// Serenity HTTP client, stored during bot setup so HTTP endpoints
    /// (e.g. `/cleanup-thread`) can make Discord API calls.
    pub bot_http: RwLock<Option<Arc<serenity::Http>>>,

    // ── Game sessions ────────────────────────────────────────────────
    /// In-memory store for Embed Dungeon game sessions.
    pub sessions: Arc<SessionStore>,

    // ── Membership ─────────────────────────────────────────────────
    /// LRU-cached membership lookup (Supabase-backed when available).
    pub members: Arc<MemberCache>,

    // ── Player persistence ──────────────────────────────────────────
    /// LRU-cached dungeon profile store (Supabase-backed when available).
    pub profiles: Arc<ProfileStore>,

    // ── Image rendering ──────────────────────────────────────────
    /// Shared font database for SVG-to-PNG rendering (loaded once at startup).
    pub fontdb: FontDb,

    // ── HTTP client & rate limiting ────────────────────────────────
    /// Shared reqwest client for outbound calls (edge functions, etc.).
    pub http_client: reqwest::Client,

    /// Rate limiter for server submission endpoint (5 req / 60s per IP).
    pub submit_limiter: RateLimiter,

    /// Default GitHub repo (owner, name) resolved once from
    /// `GITHUB_DEFAULT_REPO` → `GH_REPO` → `KBVE/kbve`.
    pub default_repo: (String, String),

    /// GitHub repo access policy (allowlist resolved from `GITHUB_ALLOWED_REPOS`).
    pub github_repo_policy: jedi::entity::github::RepoPolicy,

    /// Discord-level guard for `/github` commands (rate limit + permissions).
    pub github_guard: GitHubCommandGuard,

    /// Cached GitHub labels and issues for reduced API calls.
    pub github_cache: GitHubCache,
}

/// Resolve the default GitHub repo from env vars (checked once at startup).
///
/// Priority: `GITHUB_DEFAULT_REPO` → `GH_REPO` → `KBVE/kbve`.
fn resolve_default_repo() -> (String, String) {
    let raw = std::env::var("GITHUB_DEFAULT_REPO")
        .ok()
        .filter(|s| s.contains('/'))
        .or_else(|| std::env::var("GH_REPO").ok().filter(|s| s.contains('/')))
        .unwrap_or_else(|| "KBVE/kbve".to_owned());

    let (owner, name) = raw.split_once('/').unwrap();
    tracing::info!(repo = %raw, "Default GitHub repo configured");
    (owner.to_owned(), name.to_owned())
}

impl AppState {
    pub fn new(health_monitor: Arc<HealthMonitor>, tracker: Option<ShardTracker>) -> Self {
        let mut fontdb = FontDb::new();

        // Load system fonts first as baseline fallback (sans-serif, etc.)
        fontdb.load_system_fonts();

        // Load custom game font on top
        let font_path = std::env::var("FONT_PATH").unwrap_or_else(|_| "alagard.ttf".to_owned());
        if let Err(e) = fontdb.load_font_file(&font_path) {
            tracing::warn!(
                error = %e,
                path = %font_path,
                "Failed to load game font; falling back to system fonts"
            );
        }

        // Load symbol font for Unicode fallback (covers ⚔☠◆♥⚖⌂♫⚠ etc.)
        let symbol_font_path = std::env::var("SYMBOL_FONT_PATH")
            .unwrap_or_else(|_| "NotoSansSymbols-Regular.ttf".to_owned());
        if let Err(e) = fontdb.load_font_file(&symbol_font_path) {
            tracing::warn!(
                error = %e,
                path = %symbol_font_path,
                "Failed to load symbol font; Unicode symbols may not render"
            );
        }

        tracing::info!(fonts = fontdb.len(), "Font database initialized");

        let http_client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            health_monitor,
            tracker,
            start_time: Instant::now(),
            shutdown_notify: Notify::new(),
            restart_flag: AtomicBool::new(false),
            shard_manager: RwLock::new(None),
            bot_http: RwLock::new(None),
            sessions: Arc::new(SessionStore::new()),
            members: Arc::new(MemberCache::from_env()),
            profiles: Arc::new(ProfileStore::from_env()),
            fontdb,
            http_client,
            submit_limiter: RateLimiter::new(5, 60),
            default_repo: resolve_default_repo(),
            github_repo_policy: jedi::entity::github::RepoPolicy::from_env(),
            github_guard: GitHubCommandGuard::from_env(),
            github_cache: GitHubCache::new(),
        }
    }
}
