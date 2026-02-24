use crate::discord::bot::{Context, Error};
use poise::serenity_prelude as serenity;

/// Reports detailed system health information.
#[poise::command(slash_command)]
pub async fn health(ctx: Context<'_>) -> Result<(), Error> {
    let data = ctx.data();

    let snap = match data.health_monitor.snapshot().await {
        Some(s) => s,
        None => {
            ctx.say("Health data is not yet available. Please try again in a moment.")
                .await?;
            return Ok(());
        }
    };

    let color = snap.health_status.color_override().unwrap_or(0x57F287);

    let embed = serenity::CreateEmbed::new()
        .title("System Health Report")
        .color(color)
        .field(
            "Health Status",
            format!("{} {:?}", snap.health_status.emoji(), snap.health_status),
            false,
        )
        .field(
            "Process Memory",
            format!(
                "{:.1}MB ({:.1}%)\n{}",
                snap.memory_usage_mb,
                snap.memory_percent,
                snap.memory_bar(10)
            ),
            true,
        )
        .field(
            "System Memory",
            format!(
                "{:.1}GB total, {:.1}% used",
                snap.system_memory_total_gb, snap.system_memory_used_percent
            ),
            true,
        )
        .field("CPU", format!("{:.1}%", snap.cpu_percent), true)
        .field("Threads", snap.thread_count.to_string(), true)
        .field("PID", snap.pid.to_string(), true)
        .field("Uptime", &snap.uptime_formatted, true)
        .footer(serenity::CreateEmbedFooter::new(format!(
            "axum-discordsh v{}",
            env!("CARGO_PKG_VERSION")
        )))
        .timestamp(serenity::Timestamp::now());

    let reply = poise::CreateReply::default().embed(embed);
    ctx.send(reply).await?;
    Ok(())
}
