//! Scheduled background tasks — auto-posts GitHub board embeds to a
//! designated Discord thread on a configurable interval.

use std::sync::Arc;
use std::time::Duration;

use jedi::entity::github::GitHubClient;
use poise::serenity_prelude::{ChannelId, CreateMessage};
use tracing::{error, info};

use super::embeds::notice_board_embed::{build_notice_board_summary, notices_from_stale};
use super::embeds::task_board_embed::{build_task_board_embed, tasks_from_issues};
use super::github::resolve_github_token;
use crate::state::AppState;

/// Default interval between scheduled posts (6 hours).
const DEFAULT_INTERVAL_SECS: u64 = 6 * 60 * 60;

/// Default stale threshold for the notice board (3 days).
const DEFAULT_STALE_DAYS: u64 = 3;

/// Configuration for the GitHub board scheduler, read from env vars.
struct SchedulerConfig {
    /// The thread (or channel) to post embeds into.
    thread_id: ChannelId,
    interval: Duration,
    owner: String,
    repo: String,
    stale_days: u64,
}

impl SchedulerConfig {
    /// Try to build config from environment variables.
    ///
    /// Required: `GITHUB_BOARD_THREAD_ID` — the Discord thread to post into
    /// Optional:
    /// - `GITHUB_BOARD_INTERVAL_SECS` (default: 21600 = 6h)
    /// - `GITHUB_BOARD_REPO` (default: "KBVE/kbve")
    /// - `GITHUB_BOARD_STALE_DAYS` (default: 3)
    fn from_env() -> Option<Self> {
        let thread_id = std::env::var("GITHUB_BOARD_THREAD_ID")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .map(ChannelId::new)?;

        let interval_secs = std::env::var("GITHUB_BOARD_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(DEFAULT_INTERVAL_SECS);

        let repo_str =
            std::env::var("GITHUB_BOARD_REPO").unwrap_or_else(|_| "KBVE/kbve".to_string());

        let (owner, repo) = match repo_str.split_once('/') {
            Some((o, r)) => (o.to_string(), r.to_string()),
            None => ("KBVE".to_string(), "kbve".to_string()),
        };

        let stale_days = std::env::var("GITHUB_BOARD_STALE_DAYS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(DEFAULT_STALE_DAYS);

        Some(Self {
            thread_id,
            interval: Duration::from_secs(interval_secs),
            owner,
            repo,
            stale_days,
        })
    }
}

/// Spawn the GitHub board scheduler if `GITHUB_BOARD_CHANNEL_ID` is set.
///
/// Call this from the bot's `Ready` event handler. The task runs until
/// the process shuts down.
pub fn spawn_github_board_scheduler(app: Arc<AppState>) {
    let config = match SchedulerConfig::from_env() {
        Some(c) => c,
        None => {
            info!("GITHUB_BOARD_THREAD_ID not set, GitHub board scheduler disabled");
            return;
        }
    };

    info!(
        thread_id = %config.thread_id,
        interval_secs = config.interval.as_secs(),
        repo = format!("{}/{}", config.owner, config.repo),
        stale_days = config.stale_days,
        "Starting GitHub board scheduler"
    );

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(config.interval);
        // Skip the first immediate tick — let the bot settle after startup.
        interval.tick().await;

        loop {
            interval.tick().await;

            if let Err(e) = post_boards(&app, &config).await {
                error!(error = %e, "Scheduled GitHub board post failed");
            }
        }
    });
}

/// Fetch GitHub data and post notice + task board embeds to the channel.
async fn post_boards(
    app: &AppState,
    config: &SchedulerConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get the bot HTTP client
    let http = app
        .bot_http
        .read()
        .await
        .clone()
        .ok_or("Bot HTTP client not available")?;

    // Resolve GitHub token (env-only, no guild context for scheduled posts)
    let token = resolve_github_token(None)
        .await
        .ok_or("No GitHub token available for scheduled board posts")?;

    let gh = GitHubClient::new(&token);
    let full_name = format!("{}/{}", config.owner, config.repo);

    // Fetch issues and pulls concurrently
    let (issues_result, pulls_result) = tokio::join!(
        gh.list_issues(&config.owner, &config.repo, Some("open"), Some(100)),
        gh.list_pulls(&config.owner, &config.repo, Some("open"), Some(100)),
    );

    let issues = issues_result?;
    let pulls = pulls_result?;

    // Build notice board embed
    let notices = notices_from_stale(&issues, &pulls, config.stale_days);
    let notice_embed = build_notice_board_summary(&notices, &full_name);

    // Build task board embed
    let tasks = tasks_from_issues(&issues);
    let repo_url = format!("https://github.com/{}", full_name);
    let task_embed = build_task_board_embed(&tasks, "Current Phase", "", &repo_url);

    // Post both embeds in a single message
    let message = CreateMessage::new().embed(notice_embed).embed(task_embed);

    config.thread_id.send_message(&*http, message).await?;

    info!(
        thread_id = %config.thread_id,
        notices = notices.len(),
        tasks = tasks.len(),
        "Scheduled GitHub board posted"
    );

    Ok(())
}
