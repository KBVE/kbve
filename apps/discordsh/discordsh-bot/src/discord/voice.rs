//! Persistent voice-channel presence.
//!
//! The bot parks itself in a fixed voice channel — self-muted and
//! self-deafened — so it shows as "in voice" without songbird or any audio
//! plumbing. Discord keeps the bot listed in the channel purely from the
//! gateway voice-state, so a raw Voice State Update (gateway opcode 4) is all
//! that's required; we never open a voice websocket.
//!
//! Robustness:
//! - The join is (re)issued from the `GuildCreate` handler, which re-fires on
//!   every gateway (re)connect for the owning shard — so the presence survives
//!   reconnects and resumes automatically.
//! - If the bot is dragged out, moved, or disconnected, the `VoiceStateUpdate`
//!   handler puts it back in the target channel.
//!
//! Voice ops only take effect on the shard that owns the guild, which is
//! exactly the shard those two events are delivered on — so no cross-shard
//! routing is needed.

use poise::serenity_prelude as serenity;
use serenity::{ChannelId, GuildId};
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

/// Guild the bot parks its voice presence in. Override with `VOICE_GUILD_ID`.
const DEFAULT_VOICE_GUILD_ID: u64 = 342732838598082562;
/// Voice channel the bot joins on boot. Override with `VOICE_CHANNEL_ID`.
const DEFAULT_VOICE_CHANNEL_ID: u64 = 733345228471140445;

/// Resolve the `(guild, channel)` the bot should stay parked in.
///
/// Both IDs are overridable via the `VOICE_GUILD_ID` / `VOICE_CHANNEL_ID` env
/// vars. Setting `VOICE_CHANNEL_ID` to `0`, `off`, or `disabled` turns the
/// voice presence off entirely (returns `None`).
pub fn target() -> Option<(GuildId, ChannelId)> {
    let channel_raw =
        std::env::var("VOICE_CHANNEL_ID").unwrap_or_else(|_| DEFAULT_VOICE_CHANNEL_ID.to_string());
    let channel_raw = channel_raw.trim();
    if matches!(channel_raw, "0" | "off" | "disabled" | "") {
        return None;
    }
    let channel: u64 = channel_raw.parse().ok()?;

    let guild = std::env::var("VOICE_GUILD_ID")
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_VOICE_GUILD_ID);

    Some((GuildId::new(guild), ChannelId::new(channel)))
}

/// Send a gateway Voice State Update (opcode 4) parking the bot in `channel`,
/// self-muted and self-deafened.
///
/// Must run on the shard that owns `guild`; voice ops are ignored elsewhere.
fn send_join(shard: &serenity::ShardMessenger, guild: GuildId, channel: ChannelId) {
    // Snowflakes are serialized as strings on the gateway.
    let payload = serde_json::json!({
        "op": 4,
        "d": {
            "guild_id": guild.get().to_string(),
            "channel_id": channel.get().to_string(),
            "self_mute": true,
            "self_deaf": true,
        }
    });
    shard.websocket_message(Message::Text(payload.to_string()));
}

/// Park the bot in the configured voice channel, if voice presence is enabled.
///
/// Called from `GuildCreate`, so it re-runs on every (re)connect.
pub fn park(ctx: &serenity::Context) {
    let Some((guild, channel)) = target() else {
        return;
    };
    send_join(&ctx.shard, guild, channel);
    info!(%guild, %channel, "Parked bot in voice channel (self-mute + self-deaf)");
}

/// Re-park the bot if its own voice state drifted away from the target channel
/// (dragged out, moved, or disconnected). No-op for every other voice update.
pub fn handle_voice_state_update(ctx: &serenity::Context, new: &serenity::VoiceState) {
    let Some((guild, channel)) = target() else {
        return;
    };

    // Only react to the bot's own voice state, and only in the target guild.
    if new.user_id != ctx.cache.current_user().id || new.guild_id != Some(guild) {
        return;
    }

    // Already parked where we want it — nothing to do (this is also the event
    // our own join produces, so the guard prevents a rejoin loop).
    if new.channel_id == Some(channel) {
        return;
    }

    warn!(
        current = ?new.channel_id,
        %channel,
        "Bot voice state drifted from parked channel; rejoining"
    );
    send_join(&ctx.shard, guild, channel);
}
