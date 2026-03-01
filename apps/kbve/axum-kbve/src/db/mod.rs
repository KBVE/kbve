// Database module - Supabase/PostgREST integration

mod cache;
mod discord;
mod osrs;
mod profile;
mod rentearth;
mod supabase;
mod twitch;

pub use cache::{ProfileCache, get_profile_cache, init_profile_cache};
pub use discord::{DiscordClient, get_discord_client, get_role_names, init_discord_client};
pub use osrs::{get_osrs_cache, init_osrs_cache};
pub use profile::{UserProfile, get_profile_service, init_profile_service, validate_username};
pub use rentearth::{get_rentearth_service, init_rentearth_service};
pub use twitch::{get_twitch_client, init_twitch_client};
