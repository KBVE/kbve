//! Re-exports of the regex extractors from `jedi`.
//!
//! This module used to hold its own copy: the same nine functions over the
//! same nine patterns, character for character. Two copies of a validator is
//! worse than one in the wrong place, because they drift silently -- a
//! tightened email pattern on one side and not the other is not a compile
//! error, it is a security difference between two crates that callers assume
//! agree.
//!
//! `jedi` is the copy that stays: `kbve` already depends on it, and it also
//! carries zero-copy variants this file never had. Re-exported rather than
//! removed so existing paths through `kbve::utils::sanitization` keep working.
pub use jedi::entity::regex::lazyregex::{
    SANITIZATION_CAPTCHA_TOKEN_REGEX, SANITIZATION_DISCORD_SERVER_EMBED_REGEX,
    SANITIZATION_EMAIL_REGEX, SANITIZATION_GITHUB_USERNAME_REGEX,
    SANITIZATION_INSTAGRAM_USERNAME_REGEX, SANITIZATION_SERVICE_REGEX, SANITIZATION_ULID_REGEX,
    SANITIZATION_UNSPLASH_PHOTO_ID_REGEX, SANITIZATION_USERNAME_REGEX,
    extract_captcha_token_from_regex, extract_discord_server_id_from_regex,
    extract_email_from_regex, extract_github_username_from_regex,
    extract_instagram_username_from_regex, extract_service_from_regex, extract_ulid_from_regex,
    extract_unsplash_photo_id_from_regex, extract_username_from_regex,
};
