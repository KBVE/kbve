mod health;
mod ping;
mod status;

use crate::discord::bot::{Data, Error};

/// Returns all slash commands for registration with Discord.
pub fn all() -> Vec<poise::Command<Data, Error>> {
    vec![ping::ping(), status::status(), health::health()]
}
