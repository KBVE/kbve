// Database module - Supabase/PostgREST integration

mod cache;
mod discord;
mod osrs;
mod profile;
mod rentearth;
mod supabase;
mod twitch;

pub use cache::{CacheStats, ProfileCache, get_profile_cache, init_profile_cache};
pub use discord::{
    DiscordClient, DiscordGuildMember, get_discord_client, get_role_names, init_discord_client,
};
pub use osrs::{
    OSRSCache, OSRSCacheStats, OSRSItem, OSRSItemWithPrice, OSRSPrice, encode_icon_url,
    get_osrs_cache, init_osrs_cache, item_name_to_url, normalize_item_name,
};
pub use profile::{UserProfile, get_profile_service, init_profile_service, validate_username};
pub use rentearth::{
    RentEarthAppearance, RentEarthCharacterFull, RentEarthCharacterSummary, RentEarthCoreStats,
    RentEarthDerivedStats, RentEarthPosition, RentEarthProfile, RentEarthService,
    get_rentearth_service, init_rentearth_service,
};
pub use twitch::{TwitchClient, get_twitch_client, init_twitch_client};
