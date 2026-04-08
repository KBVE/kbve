use poise::serenity_prelude as serenity;

use crate::discord::bot::{Context, Error};
use crate::discord::game::skills;

/// View your dungeon skill levels (combat, exploration, foraging).
#[poise::command(slash_command)]
pub async fn skills(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author().id;
    let app = &ctx.data().app;

    // Try active session first, then fall back to persisted profile.
    let profile = match active_session_skills(user, app) {
        Some(p) => Some(p),
        None => persisted_skills_async(user, app).await,
    };

    let Some(profile) = profile else {
        ctx.say("No skill data found. Start a `/dungeon` session to begin training!")
            .await?;
        return Ok(());
    };

    let curve = skills::dungeon_xp_curve();
    let mut lines = Vec::new();

    for (ref_name, label, emoji) in [
        (skills::COMBAT_REF, "Combat", "\u{2694}\u{FE0F}"),
        (skills::EXPLORATION_REF, "Exploration", "\u{1F5FA}\u{FE0F}"),
        (skills::FORAGING_REF, "Foraging", "\u{1F33F}"),
    ] {
        let id = bevy_skills::SkillId::from_ref(ref_name);
        let level = profile.level(id);
        let total = profile.total_xp(id);
        let to_next = curve.xp_to_next_level(total);
        let progress = curve.progress(total);
        let bar = progress_bar(progress, 10);

        lines.push(format!(
            "{emoji} **{label}** — Lv. {level}  |  {bar}  {total} XP ({to_next} to next)"
        ));
    }

    let total_level = profile.total_level();
    lines.push(String::new());
    lines.push(format!("**Total Level:** {total_level}"));

    let embed = serenity::CreateEmbed::new()
        .title(format!("{}'s Skills", ctx.author().name))
        .description(lines.join("\n"))
        .color(0x2ECC71);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}

/// Build a text progress bar (e.g. "████░░░░░░").
fn progress_bar(fraction: f32, width: usize) -> String {
    let filled = (fraction * width as f32).round() as usize;
    let empty = width.saturating_sub(filled);
    format!(
        "`{}{}`",
        "\u{2588}".repeat(filled),
        "\u{2591}".repeat(empty)
    )
}

/// Try to read SkillProfile from an active dungeon session.
fn active_session_skills(
    user: serenity::UserId,
    app: &crate::state::AppState,
) -> Option<bevy_skills::SkillProfile> {
    let sid = app.sessions.find_by_user(user)?;
    let session_arc = app.sessions.get(&sid)?;
    let session = session_arc.blocking_lock();
    let player = session.players.get(&user)?;
    Some(player.skills.clone())
}

/// Try to load SkillProfile from the persisted DungeonProfile.
async fn persisted_skills_async(
    user: serenity::UserId,
    app: &crate::state::AppState,
) -> Option<bevy_skills::SkillProfile> {
    let profile = app.profiles.load(user.get()).await?;
    if profile.skills.is_null() || profile.skills == serde_json::json!({}) {
        return None;
    }
    serde_json::from_value(profile.skills).ok()
}
