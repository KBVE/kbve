//! Class-picker component — shown to a player who runs `/dungeon
//! start` without a saved profile (their first run, or a future
//! permadeath wipe). Three buttons, one per class. Clicking a button
//! launches a dungeon session with the chosen class and edits the
//! ephemeral picker into a confirmation.
//!
//! Custom ID format: `dngclass|<class>` where `<class>` is one of
//! `warrior` / `rogue` / `cleric`.

use poise::serenity_prelude as serenity;
use tracing::{error, warn};

use kbve::MemberStatus;

use crate::discord::bot::{Data, Error};
use crate::discord::game::launch;
use crate::discord::game::types::ClassType;

// ── Custom IDs ──────────────────────────────────────────────────────

const ID_WARRIOR: &str = "dngclass|warrior";
const ID_ROGUE: &str = "dngclass|rogue";
const ID_CLERIC: &str = "dngclass|cleric";

// ── Picker UI ───────────────────────────────────────────────────────

/// Embed describing each class and its starting kit. Shown in the
/// ephemeral message that accompanies the picker buttons.
pub fn picker_embed() -> serenity::CreateEmbed {
    serenity::CreateEmbed::new()
        .title("Choose your character")
        .description(
            "You only get one. Pick the class you want to play; this \
             choice persists across runs until your character dies.",
        )
        .field(
            "\u{2694} Warrior",
            "High HP, heavy armor, reliable damage. Starts with a \
             worn longsword and battered chainmail.",
            true,
        )
        .field(
            "\u{1F5E1} Rogue",
            "Low HP, high crit, ambush bonus and flee chance. Starts \
             with a tarnished dagger and leather scraps.",
            true,
        )
        .field(
            "\u{2728} Cleric",
            "Balanced HP, healing access, faction perks. Starts with \
             a cracked mace and woven robes.",
            true,
        )
        .color(0x5865F2)
}

/// Three-button row: Warrior / Rogue / Cleric.
pub fn picker_components() -> Vec<serenity::CreateActionRow> {
    vec![serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(ID_WARRIOR)
            .label("Warrior")
            .style(serenity::ButtonStyle::Primary)
            .emoji(serenity::ReactionType::Unicode("\u{2694}".to_owned())),
        serenity::CreateButton::new(ID_ROGUE)
            .label("Rogue")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode("\u{1F5E1}".to_owned())),
        serenity::CreateButton::new(ID_CLERIC)
            .label("Cleric")
            .style(serenity::ButtonStyle::Success)
            .emoji(serenity::ReactionType::Unicode("\u{2728}".to_owned())),
    ])]
}

/// Parse a `dngclass|<class>` custom id into the picked class.
fn class_from_custom_id(custom_id: &str) -> Option<ClassType> {
    match custom_id {
        ID_WARRIOR => Some(ClassType::Warrior),
        ID_ROGUE => Some(ClassType::Rogue),
        ID_CLERIC => Some(ClassType::Cleric),
        _ => None,
    }
}

// ── Handler ─────────────────────────────────────────────────────────

/// Handle a click on a class-picker button. Builds the dungeon
/// session, posts the public dungeon message in the same channel,
/// then edits the ephemeral picker into a confirmation.
pub async fn handle_class_pick(
    interaction: &serenity::ComponentInteraction,
    ctx: &serenity::Context,
    data: &Data,
) -> Result<(), Error> {
    let custom_id = interaction.data.custom_id.as_str();
    let Some(picked_class) = class_from_custom_id(custom_id) else {
        return Ok(());
    };

    let user = interaction.user.id;
    let channel = interaction.channel_id;
    let app = &data.app;

    // Bail if a session has been started in this channel since the
    // picker was sent (race with another player or an end/start cycle).
    if let Some(existing) = app.sessions.find_by_channel(channel) {
        let _ = interaction
            .create_response(
                &ctx.http,
                serenity::CreateInteractionResponse::UpdateMessage(
                    serenity::CreateInteractionResponseMessage::new()
                        .content(format!(
                            "A session ({}) is already running in this channel — end it first.",
                            existing
                        ))
                        .embeds(Vec::new())
                        .components(Vec::new()),
                ),
            )
            .await;
        return Ok(());
    }

    let user_display_name = interaction.user.name.clone();
    let launched =
        match launch::prepare_launch(app, user, &user_display_name, channel, picked_class).await {
            Ok(l) => l,
            Err(reason) => {
                let _ = interaction
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .content(format!("Cannot start dungeon: {}", reason))
                                .embeds(Vec::new())
                                .components(Vec::new()),
                        ),
                    )
                    .await;
                return Ok(());
            }
        };

    let launch::Launched {
        session_state,
        mode_guard,
        embed,
        components,
        card_png,
        member_status,
        short_id,
        ..
    } = launched;

    // Acknowledge the button click first by rewriting the ephemeral
    // picker into a confirmation. Failing to ack within ~3s leaves the
    // user with a "interaction failed" toast, so do this before the
    // public dungeon message goes out.
    if let Err(e) = interaction
        .create_response(
            &ctx.http,
            serenity::CreateInteractionResponse::UpdateMessage(
                serenity::CreateInteractionResponseMessage::new()
                    .content(format!(
                        "Character created — **{}**. Dungeon starting below.",
                        class_label(picked_class)
                    ))
                    .embeds(Vec::new())
                    .components(Vec::new()),
            ),
        )
        .await
    {
        warn!(error = %e, "Failed to update class-picker ephemeral");
    }

    // Send the public dungeon message in the same channel. This is
    // what `/dungeon join` and the action buttons attach to.
    let mut create_message = serenity::CreateMessage::new()
        .content(format!(
            "**Embed Dungeon** started! (Party mode, session `{}`)",
            short_id
        ))
        .embed(embed)
        .components(components);
    if let Some(png) = card_png {
        create_message =
            create_message.add_file(serenity::CreateAttachment::bytes(png, "game_card.png"));
    }

    let posted = match channel.send_message(&ctx.http, create_message).await {
        Ok(msg) => msg,
        Err(e) => {
            error!(
                error = %e,
                "Failed to post dungeon message after class pick — releasing mode lock"
            );
            // mode_guard's Drop releases the play-mode lock so the
            // user isn't stuck if the message send fails.
            drop(mode_guard);
            return Ok(());
        }
    };

    launch::commit_launch(app, session_state, mode_guard, posted.id);

    if let MemberStatus::Guest { notified } = &member_status
        && !notified
    {
        let _ = interaction
            .create_followup(
                &ctx.http,
                serenity::CreateInteractionResponseFollowup::new()
                    .content(
                        "You're playing as a **Guest**. Link your Discord account at \
                             <https://kbve.com> to unlock Member perks!",
                    )
                    .ephemeral(true),
            )
            .await;
        app.members.mark_notified(user.get());
    }

    Ok(())
}

fn class_label(class: ClassType) -> &'static str {
    match class {
        ClassType::Warrior => "Warrior",
        ClassType::Rogue => "Rogue",
        ClassType::Cleric => "Cleric",
    }
}
