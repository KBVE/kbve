use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use kbve::entity::client::vault::VaultClient;
use kbve::{CachedIssue, GithubStore, UndeliveredEvent};
use poise::serenity_prelude as serenity;
use serde::Deserialize;
use serenity::builder::{CreateForumPost, CreateMessage, EditThread};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::state::AppState;

const DEFAULT_POLL_SECS: u64 = 30;
const DEFAULT_BATCH: u32 = 10;
const DEFAULT_LEASE_SECS: u32 = 300;
const DEFAULT_MAX_ATTEMPTS: u32 = 25;
const DEFAULT_ROUTING_TTL_SECS: u64 = 300;

#[derive(Debug, Clone)]
pub struct GhSyncConfig {
    pub poll: Duration,
    pub batch: u32,
    pub lease_secs: u32,
    pub max_attempts: u32,
    pub routing_ttl: Duration,
}

impl GhSyncConfig {
    pub fn from_env() -> Self {
        let poll_secs = std::env::var("GH_SYNC_POLL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(DEFAULT_POLL_SECS)
            .max(5);
        let batch = std::env::var("GH_SYNC_BATCH")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(DEFAULT_BATCH)
            .clamp(1, 100);
        let lease_secs = std::env::var("GH_SYNC_LEASE_SECS")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(DEFAULT_LEASE_SECS)
            .max(30);
        let max_attempts = std::env::var("GH_SYNC_MAX_ATTEMPTS")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(DEFAULT_MAX_ATTEMPTS)
            .clamp(1, 1000);
        let routing_ttl_secs = std::env::var("GH_SYNC_ROUTING_TTL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(DEFAULT_ROUTING_TTL_SECS)
            .max(30);

        Self {
            poll: Duration::from_secs(poll_secs),
            batch,
            lease_secs,
            max_attempts,
            routing_ttl: Duration::from_secs(routing_ttl_secs),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
struct DiscordshGuildConfig {
    #[serde(default)]
    default_repo: Option<String>,
    #[serde(default)]
    forum_channel_id: Option<String>,
    #[serde(default)]
    active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GhReposPayload {
    Array(Vec<String>),
    Wrapped { repos: Vec<String> },
}

impl GhReposPayload {
    fn into_vec(self) -> Vec<String> {
        match self {
            GhReposPayload::Array(v) => v,
            GhReposPayload::Wrapped { repos } => repos,
        }
    }
}

#[derive(Debug, Clone)]
struct Route {
    guild_id: serenity::GuildId,
    forum_channel_id: serenity::ChannelId,
}

#[derive(Debug, Default)]
struct RoutingTable {
    map: HashMap<(String, String), Route>,
    refreshed_at: Option<Instant>,
}

impl RoutingTable {
    fn is_fresh(&self, ttl: Duration) -> bool {
        self.refreshed_at
            .map(|t| t.elapsed() < ttl)
            .unwrap_or(false)
    }

    fn lookup(&self, owner: &str, repo: &str) -> Option<Route> {
        let key = (owner.to_ascii_lowercase(), repo.to_ascii_lowercase());
        self.map.get(&key).cloned()
    }
}

pub fn spawn_gh_sync_worker(
    app: Arc<AppState>,
    http: Arc<serenity::Http>,
    cache: Arc<serenity::Cache>,
) {
    if !app.github_store.is_enabled() {
        info!("gh sync: GithubStore not configured, skipping worker");
        return;
    }
    let Some(vault) = VaultClient::from_env() else {
        warn!("gh sync: SUPABASE_URL/SERVICE_ROLE_KEY missing, multi-guild routing disabled");
        return;
    };
    if app
        .gh_sync_worker_started
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::AcqRel,
            std::sync::atomic::Ordering::Acquire,
        )
        .is_err()
    {
        debug!("gh sync worker already running; skipping duplicate spawn");
        return;
    }
    let cfg = GhSyncConfig::from_env();
    info!(
        poll_secs = cfg.poll.as_secs(),
        routing_ttl_secs = cfg.routing_ttl.as_secs(),
        "Spawning multi-guild GitHub event → Discord forum sync worker"
    );
    let store = app.github_store.clone();
    let vault = Arc::new(vault);
    tokio::spawn(async move {
        run_loop(store, http, cache, vault, cfg).await;
    });
}

async fn run_loop(
    store: Arc<GithubStore>,
    http: Arc<serenity::Http>,
    cache: Arc<serenity::Cache>,
    vault: Arc<VaultClient>,
    cfg: GhSyncConfig,
) {
    let routes: Arc<RwLock<RoutingTable>> = Arc::new(RwLock::new(RoutingTable::default()));

    if backfill_on_start_enabled() {
        backfill_closed_threads(&store, &http).await;
    }

    loop {
        tokio::time::sleep(cfg.poll).await;

        if !routes.read().await.is_fresh(cfg.routing_ttl) {
            refresh_routes(&cache, &vault, &routes).await;
        }

        let events = match store.claim_undelivered(cfg.batch, cfg.lease_secs).await {
            Ok(rows) => rows,
            Err(e) => {
                warn!(error = %e, "gh sync: claim_undelivered failed");
                continue;
            }
        };
        if events.is_empty() {
            continue;
        }
        debug!(count = events.len(), "gh sync: processing batch");
        for ev in events {
            handle_event(&store, &http, &cfg, &routes, ev).await;
        }
    }
}

async fn refresh_routes(
    cache: &Arc<serenity::Cache>,
    vault: &Arc<VaultClient>,
    routes: &Arc<RwLock<RoutingTable>>,
) {
    let guild_ids: Vec<serenity::GuildId> = cache.guilds();
    if guild_ids.is_empty() {
        debug!("gh sync: cache has no guilds yet, deferring routing refresh");
        return;
    }
    let mut new_map: HashMap<(String, String), Route> = HashMap::new();
    let mut routed_guilds: u32 = 0;

    for gid in guild_ids {
        let gid_str = gid.get().to_string();
        let cfg_tag = format!("discordsh_config:{gid_str}");
        let cfg_json = match vault.get_secret_by_tag(&cfg_tag).await {
            Ok(s) => s,
            Err(e) => {
                debug!(guild = %gid, error = %e, "gh sync: no discordsh_config (guild not opted in)");
                continue;
            }
        };
        let cfg: DiscordshGuildConfig = match serde_json::from_str(&cfg_json) {
            Ok(c) => c,
            Err(e) => {
                warn!(guild = %gid, error = %e, "gh sync: malformed discordsh_config json");
                continue;
            }
        };
        if !cfg.active {
            debug!(guild = %gid, "gh sync: discordsh_config inactive");
            continue;
        }
        let Some(forum_id) = cfg
            .forum_channel_id
            .as_deref()
            .and_then(|s| s.parse::<u64>().ok())
            .filter(|v| *v != 0)
        else {
            debug!(guild = %gid, "gh sync: no forum_channel_id set");
            continue;
        };
        let route = Route {
            guild_id: gid,
            forum_channel_id: serenity::ChannelId::new(forum_id),
        };

        let mut repos: Vec<String> = Vec::new();
        let repos_tag = format!("github_repos:{gid_str}");
        match vault.get_secret_by_tag(&repos_tag).await {
            Ok(repos_json) => match serde_json::from_str::<GhReposPayload>(&repos_json) {
                Ok(p) => repos = p.into_vec(),
                Err(e) => {
                    warn!(guild = %gid, error = %e, "gh sync: malformed github_repos json");
                }
            },
            Err(e) => {
                debug!(guild = %gid, error = %e, "gh sync: no github_repos allowlist");
            }
        }
        if repos.is_empty()
            && let Some(d) = cfg.default_repo.as_deref()
        {
            repos.push(d.to_owned());
        }
        if repos.is_empty() {
            debug!(guild = %gid, "gh sync: no repos to route");
            continue;
        }
        let mut added = 0u32;
        for spec in repos {
            let Some((owner, repo)) = parse_owner_repo(&spec) else {
                warn!(guild = %gid, spec = %spec, "gh sync: bad repo spec, skipping");
                continue;
            };
            let key = (owner.to_ascii_lowercase(), repo.to_ascii_lowercase());
            if let Some(prev) = new_map.insert(key.clone(), route.clone()) {
                warn!(
                    guild = %gid,
                    prev_guild = %prev.guild_id,
                    owner = %key.0,
                    repo = %key.1,
                    "gh sync: repo claimed by multiple guilds, last writer wins"
                );
            }
            added += 1;
        }
        if added > 0 {
            routed_guilds += 1;
        }
    }

    let total_routes = new_map.len();
    let mut guard = routes.write().await;
    guard.map = new_map;
    guard.refreshed_at = Some(Instant::now());
    info!(
        guilds = routed_guilds,
        repos = total_routes,
        "gh sync: routing table refreshed"
    );
}

fn parse_owner_repo(spec: &str) -> Option<(String, String)> {
    let s = spec.trim().trim_start_matches('@');
    let mut parts = s.splitn(2, '/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_owned(), repo.to_owned()))
}

async fn handle_event(
    store: &Arc<GithubStore>,
    http: &Arc<serenity::Http>,
    cfg: &GhSyncConfig,
    routes: &Arc<RwLock<RoutingTable>>,
    ev: UndeliveredEvent,
) {
    let route = routes.read().await.lookup(&ev.owner, &ev.repo);
    let Some(route) = route else {
        debug!(
            owner = %ev.owner,
            repo = %ev.repo,
            number = ev.number,
            "gh sync: no guild route for repo, draining event"
        );
        if let Err(e) = store.mark_event_delivered(ev.id, ev.claim_token).await {
            warn!(error = %e, id = ev.id, "gh sync: failed to drain unrouted event");
        }
        return;
    };

    match dispatch(store, http, &route, &ev).await {
        Ok(()) => match store.mark_event_delivered(ev.id, ev.claim_token).await {
            Ok(true) => {
                debug!(id = ev.id, event = %ev.event_type, "gh sync: delivered")
            }
            Ok(false) => warn!(
                id = ev.id,
                "gh sync: mark_delivered no-op (token mismatch?)"
            ),
            Err(e) => warn!(error = %e, id = ev.id, "gh sync: mark_delivered failed"),
        },
        Err(err) => {
            let msg = err.to_string();
            warn!(error = %msg, id = ev.id, event = %ev.event_type, "gh sync: dispatch failed");
            match store
                .mark_event_failed(ev.id, ev.claim_token, &msg, cfg.max_attempts)
                .await
            {
                Ok(state) => debug!(id = ev.id, ?state, "gh sync: failure recorded"),
                Err(e) => warn!(error = %e, id = ev.id, "gh sync: mark_failed errored"),
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
enum DispatchError {
    #[error("gh.issue not in cache for #{0}")]
    IssueMissing(u32),
    #[error("store error: {0}")]
    Store(#[from] kbve::GithubStoreError),
    #[error("discord http: {0}")]
    Serenity(#[from] serenity::Error),
}

async fn dispatch(
    store: &Arc<GithubStore>,
    http: &Arc<serenity::Http>,
    route: &Route,
    ev: &UndeliveredEvent,
) -> Result<(), DispatchError> {
    let issue = store
        .get_issue(&ev.owner, &ev.repo, ev.number)
        .await?
        .ok_or(DispatchError::IssueMissing(ev.number))?;

    match ev.event_type.as_str() {
        "opened" => ensure_thread(store, http, route, &issue).await,
        "commented" => {
            if comment_is_mirrored(store, ev).await {
                debug!(
                    number = ev.number,
                    "gh sync: comment originated from reverse sync — skipping echo"
                );
                return Ok(());
            }
            post_into_thread(http, &issue, ev).await
        }
        "closed" => {
            post_into_thread(http, &issue, ev).await?;
            set_thread_archived(http, &issue, true).await;
            Ok(())
        }
        "reopened" => {
            set_thread_archived(http, &issue, false).await;
            post_into_thread(http, &issue, ev).await
        }
        "deleted" | "transferred" => {
            post_into_thread(http, &issue, ev).await?;
            set_thread_archived(http, &issue, true).await;
            Ok(())
        }
        "labeled" | "assigned" | "unassigned" | "unlabeled" | "edited" | "renamed" => {
            post_into_thread(http, &issue, ev).await
        }
        _ => {
            debug!(
                event = %ev.event_type,
                number = ev.number,
                "gh sync: event type not mirrored — dropping"
            );
            Ok(())
        }
    }
}

/// Echo guard: a "commented" event whose GitHub comment id is already mapped in
/// gh.comment_mirror originated from the reverse-sync path; re-posting it would
/// duplicate the user's own thread reply. Fails open (posts) on lookup error.
async fn comment_is_mirrored(store: &Arc<GithubStore>, ev: &UndeliveredEvent) -> bool {
    let Some(comment_id) = ev
        .payload
        .get("comment")
        .and_then(|c| c.get("id"))
        .and_then(|id| id.as_i64())
    else {
        return false;
    };
    match store.is_github_comment_mirrored(comment_id).await {
        Ok(mirrored) => mirrored,
        Err(e) => {
            warn!(error = %e, comment_id, "gh sync: echo-guard lookup failed, posting anyway");
            false
        }
    }
}

fn lock_on_close_enabled() -> bool {
    matches!(
        std::env::var("GH_SYNC_LOCK_ON_CLOSE").ok().as_deref(),
        Some("1") | Some("true") | Some("on")
    )
}

fn backfill_on_start_enabled() -> bool {
    matches!(
        std::env::var("GH_SYNC_BACKFILL_ON_START").ok().as_deref(),
        Some("1") | Some("true") | Some("on")
    )
}

/// One-shot reverse-sync reconcile run at worker start when
/// `GH_SYNC_BACKFILL_ON_START` is set. Archives (and locks, if
/// `GH_SYNC_LOCK_ON_CLOSE`) the threads of issues that are already closed —
/// these closed before VS6 was live so no `closed` webhook will ever fire for
/// them. Idempotent against already-archived threads. Best-effort; unset the
/// env after a clean run so a restart does not re-archive a thread a human has
/// since manually reopened.
async fn backfill_closed_threads(store: &Arc<GithubStore>, http: &Arc<serenity::Http>) {
    const CAP: u32 = 1000;
    let rows = match store.list_closed_issue_threads(CAP).await {
        Ok(r) => r,
        Err(e) => {
            warn!(error = %e, "gh sync: backfill list_closed_issue_threads failed");
            return;
        }
    };
    if rows.is_empty() {
        info!("gh sync: backfill — no closed-issue threads to reconcile");
        return;
    }
    warn!(
        count = rows.len(),
        "gh sync: BACKFILL running — archiving closed-issue threads; unset GH_SYNC_BACKFILL_ON_START after this completes"
    );
    for issue in &rows {
        set_thread_archived(http, issue, true).await;
    }
    if rows.len() as u32 == CAP {
        warn!(
            cap = CAP,
            "gh sync: backfill hit cap — more closed threads may remain, rerun"
        );
    }
    info!(archived = rows.len(), "gh sync: backfill complete");
}

/// Mirror GitHub issue state onto the forum thread (close→archive[+lock],
/// reopen→unarchive+unlock). Event-driven only (never a reconcile loop), so a
/// human who manually re-opens a thread is not repeatedly re-archived.
///
/// Archive and lock are applied in ONE edit: Discord rejects any edit to an
/// already-archived thread ("Thread is archived"), so a separate follow-up lock
/// call can never land. Setting `archived` + `locked` together on the still-open
/// thread locks it atomically. Best-effort — logs and continues on failure.
async fn set_thread_archived(http: &Arc<serenity::Http>, issue: &CachedIssue, archived: bool) {
    let Some(thread_id) = issue.discord_thread_id else {
        return;
    };
    let thread = serenity::ChannelId::new(thread_id as u64);

    if !archived {
        edit_thread_step(
            http,
            thread,
            EditThread::new().archived(false).locked(false),
            issue.number,
            thread_id,
            "unarchive",
        )
        .await;
        return;
    }

    let builder = if lock_on_close_enabled() {
        EditThread::new().archived(true).locked(true)
    } else {
        EditThread::new().archived(true)
    };
    edit_thread_step(http, thread, builder, issue.number, thread_id, "archive").await;
}

async fn edit_thread_step(
    http: &Arc<serenity::Http>,
    thread: serenity::ChannelId,
    builder: EditThread<'_>,
    number: u32,
    thread_id: i64,
    step: &str,
) -> bool {
    match thread.edit_thread(&**http, builder).await {
        Ok(_) => {
            debug!(
                number,
                thread = thread_id,
                step,
                "gh sync: thread lifecycle step ok"
            );
            true
        }
        Err(e) => {
            warn!(
                error = %e,
                number,
                thread = thread_id,
                step,
                "gh sync: thread lifecycle step failed (missing MANAGE_THREADS?)"
            );
            false
        }
    }
}

async fn ensure_thread(
    store: &Arc<GithubStore>,
    http: &Arc<serenity::Http>,
    route: &Route,
    issue: &CachedIssue,
) -> Result<(), DispatchError> {
    if issue.discord_thread_id.is_some() {
        debug!(
            number = issue.number,
            "gh sync: thread already linked, skipping create"
        );
        return Ok(());
    }
    let title = truncate(&format!("#{} · {}", issue.number, issue.title), 96);
    let body = render_issue_body(issue);

    let msg = CreateMessage::new().content(body);
    let builder = CreateForumPost::new(title, msg);
    let thread = route
        .forum_channel_id
        .create_forum_post(&**http, builder)
        .await?;
    let thread_id = thread.id.get() as i64;

    store
        .set_discord_thread(
            &issue.owner,
            &issue.repo,
            issue.number,
            route.guild_id.get() as i64,
            route.forum_channel_id.get() as i64,
            thread_id,
        )
        .await?;
    info!(
        guild = %route.guild_id,
        owner = %issue.owner,
        repo = %issue.repo,
        number = issue.number,
        thread = thread_id,
        "gh sync: forum thread created"
    );
    Ok(())
}

async fn post_into_thread(
    http: &Arc<serenity::Http>,
    issue: &CachedIssue,
    ev: &UndeliveredEvent,
) -> Result<(), DispatchError> {
    let Some(thread_id) = issue.discord_thread_id else {
        debug!(
            number = issue.number,
            event = %ev.event_type,
            "gh sync: no thread linked yet, dropping follow-up event"
        );
        return Ok(());
    };
    let thread = serenity::ChannelId::new(thread_id as u64);
    let content = render_event_message(issue, ev);
    thread.say(&**http, content).await?;
    Ok(())
}

fn render_issue_body(issue: &CachedIssue) -> String {
    let mut out = String::new();
    let labels = issue.label_names();
    let assignees = issue.assignee_logins();
    let author = issue.author.as_deref().unwrap_or("unknown");
    out.push_str(&format!("Opened by `{author}`\n"));
    if !labels.is_empty() {
        out.push_str(&format!("Labels: `{}`\n", labels.join("`, `")));
    }
    if !assignees.is_empty() {
        out.push_str(&format!("Assignees: `{}`\n", assignees.join("`, `")));
    }
    out.push_str(&format!("{}\n\n", issue.html_url));
    if let Some(body) = issue.body.as_deref()
        && !body.is_empty()
    {
        out.push_str(&truncate(body, 1600));
    }
    truncate(&out, 1990)
}

fn render_event_message(issue: &CachedIssue, ev: &UndeliveredEvent) -> String {
    let actor = ev.actor.as_deref().unwrap_or("unknown");
    let base = match ev.event_type.as_str() {
        "closed" => format!("🔒 `{actor}` closed this"),
        "reopened" => format!("🔄 `{actor}` reopened this"),
        "commented" => format!("💬 `{actor}` commented"),
        "labeled" => format!("🏷️ `{actor}` updated labels"),
        "unlabeled" => format!("🏷️ `{actor}` removed a label"),
        "assigned" => format!("👤 `{actor}` updated assignees"),
        "unassigned" => format!("👤 `{actor}` removed an assignee"),
        "edited" => format!("✏️ `{actor}` edited"),
        "renamed" => format!("📝 `{actor}` renamed to {}", issue.title),
        other => format!("`{actor}` {other}"),
    };
    let detail = match ev.event_type.as_str() {
        "commented" => extract_comment_excerpt(&ev.payload),
        "labeled" | "unlabeled" => Some(format!("Now: {}", issue.label_names().join(", "))),
        "assigned" | "unassigned" => Some(format!("Now: {}", issue.assignee_logins().join(", "))),
        _ => None,
    };
    match detail {
        Some(d) if !d.is_empty() => truncate(&format!("{base}\n{}", d), 1900),
        _ => truncate(&base, 1900),
    }
}

fn extract_comment_excerpt(payload: &serde_json::Value) -> Option<String> {
    let body = payload
        .get("comment")
        .and_then(|c| c.get("body"))
        .and_then(|b| b.as_str())?;
    if body.is_empty() {
        return None;
    }
    Some(format!("> {}", truncate(body, 800)))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let cut = s.char_indices().nth(max).map(|(i, _)| i).unwrap_or(max);
    format!("{}…", &s[..cut])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_owner_repo_basic() {
        assert_eq!(
            parse_owner_repo("KBVE/kbve"),
            Some(("KBVE".to_owned(), "kbve".to_owned()))
        );
    }

    #[test]
    fn parse_owner_repo_strips_at_and_whitespace() {
        assert_eq!(
            parse_owner_repo(" @KBVE/kbve "),
            Some(("KBVE".to_owned(), "kbve".to_owned()))
        );
    }

    #[test]
    fn parse_owner_repo_rejects_missing_slash() {
        assert!(parse_owner_repo("kbve").is_none());
    }

    #[test]
    fn parse_owner_repo_rejects_empty_side() {
        assert!(parse_owner_repo("/kbve").is_none());
        assert!(parse_owner_repo("KBVE/").is_none());
    }

    #[test]
    fn routing_lookup_is_case_insensitive() {
        let mut t = RoutingTable::default();
        t.map.insert(
            ("kbve".into(), "kbve".into()),
            Route {
                guild_id: serenity::GuildId::new(123),
                forum_channel_id: serenity::ChannelId::new(456),
            },
        );
        assert!(t.lookup("KBVE", "kbve").is_some());
        assert!(t.lookup("kbve", "KBVE").is_some());
        assert!(t.lookup("other", "kbve").is_none());
    }

    #[test]
    fn repos_payload_accepts_array() {
        let p: GhReposPayload = serde_json::from_str(r#"["KBVE/kbve","foo/bar"]"#).unwrap();
        assert_eq!(p.into_vec(), vec!["KBVE/kbve", "foo/bar"]);
    }

    #[test]
    fn repos_payload_accepts_wrapped() {
        let p: GhReposPayload = serde_json::from_str(r#"{"repos":["KBVE/kbve"]}"#).unwrap();
        assert_eq!(p.into_vec(), vec!["KBVE/kbve"]);
    }
}
