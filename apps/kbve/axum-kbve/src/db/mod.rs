// Database module - Supabase/PostgREST integration

mod cache;
mod discord;
pub mod mc;
mod osrs;
mod profile;
mod rentearth;
mod supabase;
mod twitch;

/// Validate that a URL uses HTTPS before transmitting sensitive data.
/// Returns `Err` if the URL does not start with `https://`.
pub(crate) fn ensure_https(url: &str) -> Result<&str, String> {
    if url.starts_with("https://") {
        Ok(url)
    } else {
        Err(format!(
            "refusing to transmit sensitive data over non-HTTPS URL: {url}"
        ))
    }
}

pub use cache::{ProfileCache, get_profile_cache, init_profile_cache};
pub use discord::{DiscordClient, get_discord_client, get_role_names, init_discord_client};
pub use mc::{get_mc_service, init_mc_service};
pub use osrs::{get_osrs_cache, init_osrs_cache};
pub use profile::{UserProfile, get_profile_service, init_profile_service, validate_username};
pub use rentearth::{get_rentearth_service, init_rentearth_service};
pub use twitch::{get_twitch_client, init_twitch_client};
