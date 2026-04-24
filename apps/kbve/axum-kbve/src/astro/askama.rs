// Askama template definitions for server-side rendered pages

use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};

/// Wrapper for rendering Askama templates as HTML responses
pub struct TemplateResponse<T: Template>(pub T);

impl<T: Template> IntoResponse for TemplateResponse<T> {
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => {
                tracing::error!("Template rendering error: {}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Template rendering error",
                )
                    .into_response()
            }
        }
    }
}

/// Base index template (wraps content in Astro-like layout)
#[derive(Template)]
#[template(path = "askama/index.html")]
pub struct IndexTemplate {
    pub title: String,
    pub description: String,
    pub content: String,
    pub path: String,
}

/// Health check page template
#[derive(Template)]
#[template(path = "askama/health.html")]
pub struct HealthTemplate {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
}

/// Error page template
#[derive(Template)]
#[template(path = "askama/error.html")]
pub struct ErrorTemplate {
    pub code: u16,
    pub message: String,
}

/// RentEarth character summary for template display
#[allow(dead_code)]
#[derive(Clone)]
pub struct RentEarthCharacterDisplay {
    pub id: String,
    pub slot: i32,
    pub display_name: String,
    pub first_name: String,
    pub level: i32,
    pub archetype_name: String,
    pub current_zone: String,
    pub health_current: i32,
    pub health_max: i32,
    pub health_percent: i32,
    pub gold: i64,
    pub total_playtime_hours: i64,
    pub last_login_at: Option<String>,
}

/// User profile page template (Astro-built)
#[derive(Template)]
#[template(path = "askama/profile/index.html")]
pub struct ProfileTemplate {
    pub username: String,
    pub username_first_char: String,
    pub profile_description: String,
    pub unsplash_banner_id: String,
    pub bio: Option<String>,
    pub status: Option<String>,
    pub primary_avatar_url: Option<String>,
    pub discord_username: Option<String>,
    pub discord_avatar: Option<String>,
    pub discord_is_guild_member: Option<bool>,
    #[allow(dead_code)]
    pub discord_id: Option<String>,
    #[allow(dead_code)]
    pub discord_guild_nickname: Option<String>,
    #[allow(dead_code)]
    pub discord_joined_at: Option<String>,
    #[allow(dead_code)]
    pub discord_is_boosting: Option<bool>,
    pub discord_role_count: usize,
    pub discord_role_names: Vec<String>,
    pub github_username: Option<String>,
    pub github_avatar: Option<String>,
    pub twitch_username: Option<String>,
    pub twitch_avatar: Option<String>,
    pub twitch_is_live: Option<bool>,
    pub rentearth_characters: Vec<RentEarthCharacterDisplay>,
    pub rentearth_total_playtime_hours: Option<i64>,
    #[allow(dead_code)]
    pub rentearth_last_activity: Option<String>,
}

/// Profile not found template (Astro-built)
#[derive(Template)]
#[template(path = "askama/profile_not_found/index.html")]
pub struct ProfileNotFoundTemplate {
    pub username: String,
}

// ===========================================================================
// FORUM TEMPLATES
// ===========================================================================
// Every string field here is pre-sanitized upstream. Bodies + comments arrive
// as HTML produced by `kbve::markdown::render` — safe to pipe into `|safe`
// inside the templates. Plain-text fields (title, author, timestamps) are
// escaped by askama's default filter.

/// Individual forum thread page served at /forum/t/{slug_or_id}.
#[allow(dead_code)] // fields consumed once the /forum routes wire in
#[derive(Template)]
#[template(path = "askama/forum/thread/index.html")]
pub struct ForumThreadTemplate {
    pub thread_title: String,
    pub thread_slug_or_id: String,
    pub thread_meta_description: String,
    pub space_slug: String,
    pub space_name: String,
    pub author_username: String,
    pub author_avatar_url: String,
    pub created_at_human: String,
    pub last_activity_human: String,
    pub score: i64,
    pub comment_count: i32,
    /// Sanitized HTML — output of `kbve::markdown::render(..).html`.
    pub thread_body_html: String,
    /// Pre-rendered tag chip HTML.
    pub tags_html: String,
    /// Pre-rendered comment tree HTML.
    pub comments_html: String,
}

/// Forum feed / space-index page served at /forum/ and /forum/s/{slug}.
#[allow(dead_code)] // fields consumed once the /forum routes wire in
#[derive(Template)]
#[template(path = "askama/forum/feed/index.html")]
pub struct ForumFeedTemplate {
    pub feed_heading: String,
    pub feed_og_title: String,
    pub feed_meta_description: String,
    pub feed_canonical_suffix: String,
    pub active_sort_label: String,
    /// Pre-rendered list of FeedItem cards.
    pub feed_items_html: String,
    /// Sidebar / top nav of spaces.
    pub spaces_nav_html: String,
    /// Cursor-based pagination controls.
    pub pagination_html: String,
}
