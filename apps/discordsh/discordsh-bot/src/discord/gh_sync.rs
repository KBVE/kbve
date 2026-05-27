use std::sync::Arc;
use std::time::Duration;

use kbve::{CachedIssue, GithubStore, UndeliveredEvent};
use poise::serenity_prelude as serenity;
use serenity::builder::{CreateForumPost, CreateMessage};
use tracing::{debug, error, info, warn};

use crate::state::AppState;

const DEFAULT_OWNER: &str = "KBVE";
const DEFAULT_REPO: &str = "kbve";
const DEFAULT_POLL_SECS: u64 = 30;
const DEFAULT_BATCH: u32 = 10;
const DEFAULT_LEASE_SECS: u32 = 300;
const DEFAULT_MAX_ATTEMPTS: u32 = 25;

#[derive(Debug, Clone)]
pub struct GhSyncConfig {
    pub forum_channel_id: serenity::ChannelId,
    pub guild_id: serenity::GuildId,
    pub owner: String,
    pub repo: String,
    pub poll: Duration,
    pub batch: u32,
    pub lease_secs: u32,
    pub max_attempts: u32,
}

impl GhSyncConfig {
    pub fn from_env() -> Option<Self> {
        let forum = std::env::var("GH_FORUM_CHANNEL_ID")
            .ok()?
            .parse::<u64>()
            .ok()?;
        let guild = std::env::var("GH_SYNC_GUILD_ID")
            .or_else(|_| std::env::var("RELAY_GUILD_ID"))
            .ok()?
            .parse::<u64>()
            .ok()?;
        if forum == 0 || guild == 0 {
            return None;
        }
        let owner = std::env::var("GH_SYNC_OWNER").unwrap_or_else(|_| DEFAULT_OWNER.to_owned());
        let repo = std::env::var("GH_SYNC_REPO").unwrap_or_else(|_| DEFAULT_REPO.to_owned());
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

        Some(Self {
            forum_channel_id: serenity::ChannelId::new(forum),
            guild_id: serenity::GuildId::new(guild),
            owner,
            repo,
            poll: Duration::from_secs(poll_secs),
            batch,
            lease_secs,
            max_attempts,
        })
    }
}

pub fn spawn_gh_sync_worker(app: Arc<AppState>, http: Arc<serenity::Http>) {
    let Some(cfg) = GhSyncConfig::from_env() else {
        info!("gh sync not configured (set GH_FORUM_CHANNEL_ID + GH_SYNC_GUILD_ID to enable)");
        return;
    };
    if !app.github_store.is_enabled() {
        warn!("gh sync configured but GithubStore is not — skipping");
        return;
    }
    info!(
        guild = %cfg.guild_id,
        forum = %cfg.forum_channel_id,
        owner = %cfg.owner,
        repo = %cfg.repo,
        poll_secs = cfg.poll.as_secs(),
        "Spawning GitHub event → Discord forum sync worker"
    );
    let store = app.github_store.clone();
    tokio::spawn(async move {
        run_loop(store, http, cfg).await;
    });
}

async fn run_loop(store: Arc<GithubStore>, http: Arc<serenity::Http>, cfg: GhSyncConfig) {
    loop {
        tokio::time::sleep(cfg.poll).await;
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
            handle_event(&store, &http, &cfg, ev).await;
        }
    }
}

async fn handle_event(
    store: &Arc<GithubStore>,
    http: &Arc<serenity::Http>,
    cfg: &GhSyncConfig,
    ev: UndeliveredEvent,
) {
    if !ev.owner.eq_ignore_ascii_case(&cfg.owner) || !ev.repo.eq_ignore_ascii_case(&cfg.repo) {
        debug!(
            owner = %ev.owner,
            repo = %ev.repo,
            number = ev.number,
            "gh sync: out-of-scope event, dropping"
        );
        if let Err(e) = store.mark_event_delivered(ev.id, ev.claim_token).await {
            warn!(error = %e, id = ev.id, "gh sync: failed to discard out-of-scope event");
        }
        return;
    }

    match dispatch(store, http, cfg, &ev).await {
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
    cfg: &GhSyncConfig,
    ev: &UndeliveredEvent,
) -> Result<(), DispatchError> {
    let issue = store
        .get_issue(&ev.owner, &ev.repo, ev.number)
        .await?
        .ok_or(DispatchError::IssueMissing(ev.number))?;

    match ev.event_type.as_str() {
        "opened" => ensure_thread(store, http, cfg, &issue).await,
        "closed" | "reopened" | "commented" | "labeled" | "assigned" | "unassigned"
        | "unlabeled" | "edited" | "renamed" => post_into_thread(http, cfg, &issue, ev).await,
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

async fn ensure_thread(
    store: &Arc<GithubStore>,
    http: &Arc<serenity::Http>,
    cfg: &GhSyncConfig,
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
    let thread = cfg
        .forum_channel_id
        .create_forum_post(&**http, builder)
        .await?;
    let thread_id = thread.id.get() as i64;

    store
        .set_discord_thread(
            &issue.owner,
            &issue.repo,
            issue.number,
            cfg.guild_id.get() as i64,
            cfg.forum_channel_id.get() as i64,
            thread_id,
        )
        .await?;
    info!(
        number = issue.number,
        thread = thread_id,
        "gh sync: forum thread created for issue"
    );
    Ok(())
}

async fn post_into_thread(
    http: &Arc<serenity::Http>,
    _cfg: &GhSyncConfig,
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
