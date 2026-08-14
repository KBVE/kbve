pub use bevy_dungeon::player::PlayerId;
pub use bevy_dungeon::types::*;

use poise::serenity_prelude as serenity;

/// Discord snowflake -> engine player id.
pub fn pid(user: serenity::UserId) -> PlayerId {
    PlayerId::new(user.get())
}

/// Engine player id -> Discord snowflake.
pub fn uid(player: PlayerId) -> serenity::UserId {
    serenity::UserId::new(player.get())
}
