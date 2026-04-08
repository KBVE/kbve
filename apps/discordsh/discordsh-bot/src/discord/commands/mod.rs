mod admin;
mod dungeon;
pub(crate) mod gh;
pub(crate) mod github_board;
mod health;
mod ping;
mod skills;
mod status;

use crate::discord::bot::{Data, Error};

/// Returns all slash commands for registration with Discord.
pub fn all() -> Vec<poise::Command<Data, Error>> {
    vec![
        ping::ping(),
        status::status(),
        health::health(),
        admin::restart(),
        admin::cleanup(),
        dungeon::dungeon(),
        github_board::github(),
        gh::gh(),
        skills::skills(),
    ]
}
