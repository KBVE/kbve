//! `/wm` interactive component layer — Phase 1 of the interactive-embed epic.
//!
//! Every successful `/wm` embed carries a reroll button whose `custom_id`
//! encodes the command to re-run (`wm|r|<path> <args...>`). Pressing it re-runs
//! the same command and edits the message in place. The embeds are public
//! (non-ephemeral) so anyone in the channel can reroll.

use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{info, warn};

use crate::discord::windmill::DiscordContext;
use crate::discord::windmill_embed;
use crate::state::AppState;

const REROLL_PREFIX: &str = "wm|r|";
/// Discord hard-caps `custom_id` at 100 bytes.
const CUSTOM_ID_MAX: usize = 100;

/// Build the action row for a `/wm` result: a single reroll button whose
/// `custom_id` encodes the command to re-run. Returns `None` when the encoded
/// id would exceed Discord's limit, so the caller omits the row rather than
/// sending an invalid component.
pub fn build_wm_action_row(path: &str, args: &[String]) -> Option<serenity::CreateActionRow> {
    let mut payload = path.to_owned();
    if !args.is_empty() {
        payload.push(' ');
        payload.push_str(&args.join(" "));
    }
    let custom_id = format!("{REROLL_PREFIX}{payload}");
    if custom_id.len() > CUSTOM_ID_MAX {
        return None;
    }
    Some(serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(custom_id)
            .label("Reroll")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode("\u{1F504}".to_owned())),
    ]))
}

/// Decode a `wm|r|` custom_id back into `(path, args)`.
fn decode_reroll(custom_id: &str) -> Option<(String, Vec<String>)> {
    let payload = custom_id.strip_prefix(REROLL_PREFIX)?;
    let mut it = payload.split_whitespace();
    let path = it.next()?.to_owned();
    let args = it.map(str::to_owned).collect();
    Some((path, args))
}

/// Handle a component interaction whose `custom_id` starts with `"wm|"`.
/// Re-runs the encoded command and edits the message in place.
pub async fn handle_windmill_component(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    app: &Arc<AppState>,
) {
    let custom_id = component.data.custom_id.clone();
    let Some((path, args)) = decode_reroll(&custom_id) else {
        warn!(custom_id = %custom_id, "unrecognized wm component id");
        return;
    };

    let Some(cfg) = app.windmill.clone() else {
        warn!("wm reroll pressed but windmill runner not configured");
        return;
    };

    // Deferred message update — acknowledge now, edit the original message
    // once the re-run returns (a few hundred ms).
    if let Err(e) = component
        .create_response(&ctx.http, serenity::CreateInteractionResponse::Acknowledge)
        .await
    {
        warn!(error = %e, "failed to ack wm reroll");
        return;
    }

    let discord = DiscordContext {
        user_id: component.user.id.get().to_string(),
        username: component.user.name.clone(),
        guild_id: component.guild_id.map(|g| g.get().to_string()),
        channel_id: component.channel_id.get().to_string(),
    };

    match cfg.run(&path, &args, &discord).await {
        Ok(value) => {
            let Some(embed) = windmill_embed::embed_from_value(&value) else {
                warn!(path = %path, "wm reroll result had no embed; leaving message unchanged");
                return;
            };
            let mut edit = serenity::EditInteractionResponse::new().embed(embed);
            if let Some(row) = build_wm_action_row(&path, &args) {
                edit = edit.components(vec![row]);
            }
            if let Err(e) = component.edit_response(&ctx.http, edit).await {
                warn!(error = %e, path = %path, "failed to edit message after wm reroll");
            } else {
                info!(path = %path, user = %discord.username, "wm reroll ok");
            }
        }
        Err(e) => {
            // Keep the existing embed intact on failure (rate-limit, upstream);
            // surface a quiet ephemeral follow-up to the presser only.
            let _ = component
                .create_followup(
                    &ctx.http,
                    serenity::CreateInteractionResponseFollowup::new()
                        .content(format!("Reroll failed: {e}"))
                        .ephemeral(true),
                )
                .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_row_none_when_id_too_long() {
        let long = "x".repeat(120);
        assert!(build_wm_action_row(&long, &[]).is_none());
    }

    #[test]
    fn action_row_some_for_normal_command() {
        assert!(build_wm_action_row("joke", &[]).is_some());
        assert!(build_wm_action_row("joke", &["chuck".to_owned()]).is_some());
    }

    #[test]
    fn decode_roundtrip_no_args() {
        let (p, a) = decode_reroll("wm|r|joke").unwrap();
        assert_eq!(p, "joke");
        assert!(a.is_empty());
    }

    #[test]
    fn decode_roundtrip_with_args() {
        let (p, a) = decode_reroll("wm|r|ud yeet street").unwrap();
        assert_eq!(p, "ud");
        assert_eq!(a, vec!["yeet", "street"]);
    }

    #[test]
    fn decode_rejects_foreign_prefix() {
        assert!(decode_reroll("dng|r|joke").is_none());
        assert!(decode_reroll("wm|r|").is_none());
    }
}
