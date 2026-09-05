use crate::discord::bot::{Context, Error};
use crate::discord::branding;
use poise::serenity_prelude as serenity;

/// Reports detailed system health information.
#[poise::command(slash_command)]
pub async fn health(ctx: Context<'_>) -> Result<(), Error> {
    let data = ctx.data();

    let snap = match data.app.health_monitor.snapshot().await {
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
        .url(branding::PROJECT_URL)
        .color(color)
        .author(branding::embed_author())
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
        .field(
            "",
            branding::source_link("src/discord/commands/health.rs"),
            false,
        )
        .footer(serenity::CreateEmbedFooter::new(branding::footer_text()))
        .timestamp(serenity::Timestamp::now());

    // Health history chart button
    let chart_row = serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new("chart|health|history")
            .label("History")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode("\u{1F4C8}".to_owned())),
    ]);

    let reply = poise::CreateReply::default()
        .embed(embed)
        .components(vec![chart_row]);
    ctx.send(reply).await?;
    Ok(())
}
