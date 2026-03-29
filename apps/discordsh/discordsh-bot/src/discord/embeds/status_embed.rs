use poise::serenity_prelude as serenity;
use std::time::Duration;

use super::status_state::StatusState;
use crate::health::HealthSnapshot;

/// Data bag passed into the embed builder, decoupled from poise's Data struct.
pub struct StatusSnapshot {
    pub state: StatusState,
    pub version: &'static str,
    pub guild_count: usize,
    pub shard_id: Option<u32>,
    pub uptime: Duration,
    pub health: Option<HealthSnapshot>,
}

/// Format a `Duration` into a human-friendly string like "2d 5h 32m 10s".
fn format_uptime(d: Duration) -> String {
    let total_secs = d.as_secs();
    let days = total_secs / 86400;
    let hours = (total_secs % 86400) / 3600;
    let minutes = (total_secs % 3600) / 60;
    let seconds = total_secs % 60;

    if days > 0 {
        format!("{days}d {hours}h {minutes}m {seconds}s")
    } else if hours > 0 {
        format!("{hours}h {minutes}m {seconds}s")
    } else if minutes > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{seconds}s")
    }
}

/// Build the status embed from a snapshot of bot state.
///
/// This function is pure — it takes data and returns a `CreateEmbed`.
/// No side effects, no async, easy to test.
pub fn build_status_embed(snap: &StatusSnapshot) -> serenity::CreateEmbed {
    let state = snap.state;

    // Health-based color override: CRITICAL → red, WARNING → orange
    let color = snap
        .health
        .as_ref()
        .and_then(|h| h.health_status.color_override())
        .unwrap_or_else(|| state.color());

    let shard_display = match snap.shard_id {
        Some(id) => format!("Shard {id}"),
        None => "N/A".to_owned(),
    };

    let mut embed = serenity::CreateEmbed::new()
        .title("Bot Status Dashboard")
        .color(color)
        .thumbnail(state.thumbnail_url())
        .field(
            "Status",
            format!("{} {}", state.emoji(), state.label()),
            true,
        )
        .field("Guilds", snap.guild_count.to_string(), true)
        .field("Shard", shard_display, true)
        .field("Uptime", format_uptime(snap.uptime), true);

    if let Some(ref health) = snap.health {
        embed = embed
            .field(
                "Memory",
                format!(
                    "{:.1}MB ({:.1}%)\n{}",
                    health.memory_usage_mb,
                    health.memory_percent,
                    health.memory_bar(10)
                ),
                true,
            )
            .field("CPU", format!("{:.1}%", health.cpu_percent), true)
            .field("Threads", health.thread_count.to_string(), true)
            .field(
                "Health",
                format!(
                    "{} {:?}",
                    health.health_status.emoji(),
                    health.health_status
                ),
                true,
            );
    }

    embed
        .footer(serenity::CreateEmbedFooter::new(format!(
            "axum-discordsh v{}",
            snap.version
        )))
        .timestamp(serenity::Timestamp::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_uptime_seconds_only() {
        assert_eq!(format_uptime(Duration::from_secs(42)), "42s");
    }

    #[test]
    fn format_uptime_minutes() {
        assert_eq!(format_uptime(Duration::from_secs(130)), "2m 10s");
    }

    #[test]
    fn format_uptime_hours() {
        assert_eq!(format_uptime(Duration::from_secs(3661)), "1h 1m 1s");
    }

    #[test]
    fn format_uptime_days() {
        assert_eq!(format_uptime(Duration::from_secs(90061)), "1d 1h 1m 1s");
    }

    #[test]
    fn format_uptime_zero() {
        assert_eq!(format_uptime(Duration::from_secs(0)), "0s");
    }
}
