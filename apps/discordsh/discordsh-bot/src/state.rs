use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use poise::serenity_prelude as serenity;
use tokio::sync::{Notify, RwLock};

use bevy_db::NativeStore;
use kbve::{FontDb, MemberCache};

use bevy_chat::ChatClient;

use crate::discord::game::{ProfileStore, SessionStore};
use crate::discord::github_cache::GitHubCache;
use crate::discord::github_permissions::GitHubCommandGuard;
use crate::health::HealthMonitor;
use crate::tracker::ShardTracker;

/// Central application state for the Discord bot.
pub struct AppState {
    /// Background health monitor (CPU, memory, threads).
    pub health_monitor: Arc<HealthMonitor>,

    /// Optional shard tracker backed by Supabase.
    pub tracker: Option<ShardTracker>,

    /// Process start time (for uptime calculation).
    pub start_time: Instant,

    // ── Lifecycle control ──────────────────────────────────────────
    /// Notified to trigger graceful shutdown.
    pub shutdown_notify: Notify,

    /// Set to `true` before shutting down shards to signal restart.
    pub restart_flag: AtomicBool,

    /// The bot's shard manager, stored after client build.
    pub shard_manager: RwLock<Option<Arc<serenity::ShardManager>>>,

    /// Serenity HTTP client, stored during bot setup.
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

    /// Default GitHub repo (owner, name) resolved once from
    /// `GITHUB_DEFAULT_REPO` → `GH_REPO` → `KBVE/kbve`.
    pub default_repo: (String, String),

    /// GitHub repo access policy (allowlist resolved from `GITHUB_ALLOWED_REPOS`).
    pub github_repo_policy: jedi::entity::github::RepoPolicy,

    /// Discord-level guard for `/github` commands (rate limit + permissions).
    pub github_guard: GitHubCommandGuard,

    /// Cached GitHub labels and issues for reduced API calls.
    pub github_cache: GitHubCache,

    /// Optional IRC client for cross-platform chat and world events.
    /// `None` if IRC is unavailable or not configured.
    pub irc: Option<ChatClient>,

    /// Optional persistent KV store (redb). Opened from `DB_PATH` env var
    /// at startup. `None` when the variable is unset or the file fails to
    /// open — callers must treat persistence as best-effort. Used today
    /// as an L2 cache for [`ProfileStore`]; reserved for future
    /// `SessionStore` snapshot persistence.
    #[allow(dead_code)]
    pub local_db: Option<Arc<NativeStore>>,
}

/// Resolve the local KV store path from `DB_PATH`. Returns `None` when
/// the variable is unset; logs and returns `None` if the file fails to
/// open so the bot can still run with Supabase-only persistence.
fn open_local_db() -> Option<Arc<NativeStore>> {
    let raw = std::env::var("DB_PATH").ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    let path = PathBuf::from(&raw);
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
        && let Err(e) = std::fs::create_dir_all(parent)
    {
        tracing::warn!(error = %e, parent = %parent.display(), "Failed to create local DB parent dir");
        return None;
    }
    match NativeStore::open(path.clone()) {
        Ok(store) => {
            tracing::info!(path = %path.display(), "Local KV store opened (redb)");
            Some(Arc::new(store))
        }
        Err(e) => {
            tracing::warn!(error = %e, path = %path.display(), "Failed to open local KV store; running Supabase-only");
            None
        }
    }
}

/// Resolve the default GitHub repo from env vars (checked once at startup).
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
    pub async fn new(health_monitor: Arc<HealthMonitor>, tracker: Option<ShardTracker>) -> Self {
        let mut fontdb = FontDb::new();

        fontdb.load_system_fonts();

        let font_path = std::env::var("FONT_PATH").unwrap_or_else(|_| "alagard.ttf".to_owned());
        if let Err(e) = fontdb.load_font_file(&font_path) {
            tracing::warn!(
                error = %e,
                path = %font_path,
                "Failed to load game font; falling back to system fonts"
            );
        }

        let symbol_font_path = std::env::var("SYMBOL_FONT_PATH")
            .unwrap_or_else(|_| "NotoSansSymbols-Regular.ttf".to_owned());
        if let Err(e) = fontdb.load_font_file(&symbol_font_path) {
            tracing::warn!(
                error = %e,
                path = %symbol_font_path,
                "Failed to load symbol font; Unicode symbols may not render"
            );
        }

        fontdb.set_generic_families("Alagard");

        tracing::info!(fonts = fontdb.len(), "Font database initialized");

        // Attempt IRC connection (graceful: None if unavailable)
        let irc = if std::env::var("IRC_HOST").is_ok() {
            match ChatClient::from_env().await {
                Ok(client) => {
                    tracing::info!("IRC connected");
                    Some(client)
                }
                Err(e) => {
                    tracing::warn!(error = %e, "IRC connection failed — world events disabled");
                    None
                }
            }
        } else {
            tracing::info!("IRC not configured (set IRC_HOST to enable)");
            None
        };

        let local_db = open_local_db();
        let profiles = Arc::new(ProfileStore::from_env_with_local(local_db.clone()));

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
            profiles,
            fontdb,
            default_repo: resolve_default_repo(),
            github_repo_policy: jedi::entity::github::RepoPolicy::from_env(),
            github_guard: GitHubCommandGuard::from_env(),
            github_cache: GitHubCache::new(),
            irc,
            local_db,
        }
    }
}
