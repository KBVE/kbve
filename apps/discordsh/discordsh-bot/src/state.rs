use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use poise::serenity_prelude as serenity;
use tokio::sync::{Notify, RwLock};

use bevy_db::NativeStore;
use kbve::{FontDb, GithubStore, MemberCache};

use bevy_chat::ChatClient;

#[derive(Debug, Clone)]
pub struct RelayConfig {
    pub guild_id: serenity::GuildId,
    pub channel_id: serenity::ChannelId,
    pub irc_channel: String,
}

impl RelayConfig {
    pub fn from_env() -> Option<Self> {
        let guild = std::env::var("RELAY_GUILD_ID").ok()?.parse::<u64>().ok()?;
        let channel = std::env::var("RELAY_CHANNEL_ID")
            .ok()?
            .parse::<u64>()
            .ok()?;
        let irc_channel = std::env::var("RELAY_IRC_CHANNEL").ok()?;
        if guild == 0 || channel == 0 || irc_channel.trim().is_empty() {
            return None;
        }
        Some(Self {
            guild_id: serenity::GuildId::new(guild),
            channel_id: serenity::ChannelId::new(channel),
            irc_channel,
        })
    }
}

use crate::discord::game::{ProfileStore, SessionStore};
use crate::discord::github_cache::GitHubCache;
use crate::discord::github_permissions::GitHubCommandGuard;
use crate::discord::mention::MentionResolver;
use crate::discord::windmill::WindmillConfig;
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

    /// L2 read-through cache backed by Supabase `gh.issue`. `is_enabled()` is
    /// false when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing.
    pub github_store: Arc<GithubStore>,

    /// Optional IRC client for cross-platform chat and world events.
    /// `None` if IRC is unavailable or not configured.
    pub irc: Option<ChatClient>,

    pub relay: Option<RelayConfig>,

    /// Resolves Discord snowflakes to KBVE usernames for relayed mentions.
    /// `None` when Supabase isn't configured; the relay then falls back to the
    /// Discord display name.
    pub mentions: Option<Arc<MentionResolver>>,

    /// Guards against spawning per-`Ready` background workers more than once.
    /// The `Ready` event fires once per shard, so these ensure a single
    /// instance regardless of shard count (otherwise work duplicates N times).
    pub irc_forwarder_started: AtomicBool,
    pub github_board_scheduler_started: AtomicBool,
    pub gh_sync_worker_started: AtomicBool,

    /// Optional Windmill job runner. `None` when `WINDMILL_BASE_URL`,
    /// `WINDMILL_TOKEN`, or `WINDMILL_ALLOWED_PATHS` are missing — in which
    /// case `/wm` is not registered as a usable command.
    pub windmill: Option<Arc<WindmillConfig>>,

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

        let windmill = WindmillConfig::from_env();
        if windmill.is_none() {
            tracing::info!(
                "windmill runner not configured (set WINDMILL_BASE_URL + WINDMILL_TOKEN + WINDMILL_ALLOWED_PATHS to enable /wm)"
            );
        }

        let relay = RelayConfig::from_env();
        if let Some(ref r) = relay {
            tracing::info!(
                guild = %r.guild_id,
                channel = %r.channel_id,
                irc_channel = %r.irc_channel,
                "Discord ↔ IRC relay configured"
            );
        } else {
            tracing::info!(
                "Relay not configured (set RELAY_GUILD_ID, RELAY_CHANNEL_ID, RELAY_IRC_CHANNEL to enable)"
            );
        }

        // Shared L1+L2 cache (Valkey via KBVE_KV_URL when set, else L1-only) for
        // the gh reverse-sync lookups. Same namespace/Valkey as other services.
        let kv_cache = jedi::state::kv::KvCache::from_env().await;
        let mentions = MentionResolver::from_env(kv_cache.clone()).map(Arc::new);
        if mentions.is_none() {
            tracing::info!(
                "Mention resolver disabled (no Supabase) — relayed mentions use Discord names"
            );
        }

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
            github_store: Arc::new(GithubStore::from_env().with_kv(Some(kv_cache))),
            irc,
            relay,
            mentions,
            irc_forwarder_started: AtomicBool::new(false),
            github_board_scheduler_started: AtomicBool::new(false),
            gh_sync_worker_started: AtomicBool::new(false),
            windmill,
            local_db,
        }
    }
}
