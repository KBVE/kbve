// Database module - Supabase/PostgREST integration

mod cache;
mod discord;
mod forum;
pub mod mc;
mod mc_lot;
mod osrs;
mod profile;
mod referral;
mod rentearth;
mod supabase;
mod twitch;
mod wallet;

/// Parse a URL and require an `https` scheme before transmitting sensitive
/// data. Returns a typed `reqwest::Url` so callers pass it straight to
/// `Client::get` — this also makes the scheme check visible to CodeQL's
/// `rust/cleartext-transmission` query (a string `starts_with` check on a
/// `&str` is not recognized as a sanitizer).
pub(crate) fn ensure_https(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    if parsed.scheme() != "https" {
        return Err(format!(
            "refusing to transmit sensitive data over non-HTTPS URL: {url}"
        ));
    }
    Ok(parsed)
}

pub use cache::{get_profile_cache, init_profile_cache};
pub use discord::{DiscordClient, get_discord_client, get_role_names, init_discord_client};
pub use forum::{
    CommentRow, FeedQuery, FeedRow, SpaceRow, TagRow, ThreadRow, get_forum_service,
    init_forum_service,
};
pub use mc::{extract_texture_hash, get_mc_service, init_mc_service};
pub use mc_lot::{get_lot_client, init_lot_client};
pub use osrs::{get_osrs_cache, init_osrs_cache};
pub use profile::{
    DiscordInfo, GithubInfo, TwitchInfo, UserProfile, UserProvider, get_profile_service,
    init_profile_service, validate_username,
};
pub use referral::{get_referral_client, init_referral_client};
pub use rentearth::{RentEarthProfile, get_rentearth_service, init_rentearth_service};
pub use twitch::{get_twitch_client, init_twitch_client};
pub use wallet::{get_wallet_client, init_wallet_client};
