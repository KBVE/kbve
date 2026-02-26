use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use poise::serenity_prelude as serenity;
use tokio::sync::{Notify, RwLock};

use kbve::MemberCache;

use crate::discord::game::SessionStore;
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
}

impl AppState {
    pub fn new(health_monitor: Arc<HealthMonitor>, tracker: Option<ShardTracker>) -> Self {
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
        }
    }
}
