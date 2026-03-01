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
    // Discord fields
    pub discord_username: Option<String>,
    pub discord_avatar: Option<String>,
    pub discord_is_guild_member: Option<bool>,
    pub discord_id: Option<String>,
    pub discord_guild_nickname: Option<String>,
    pub discord_joined_at: Option<String>,
    pub discord_is_boosting: Option<bool>,
    pub discord_role_count: usize,
    pub discord_role_names: Vec<String>,
    // GitHub fields
    pub github_username: Option<String>,
    pub github_avatar: Option<String>,
    // Twitch fields
    pub twitch_username: Option<String>,
    pub twitch_avatar: Option<String>,
    pub twitch_is_live: Option<bool>,
    // RentEarth fields
    pub rentearth_characters: Vec<RentEarthCharacterDisplay>,
    pub rentearth_total_playtime_hours: Option<i64>,
    pub rentearth_last_activity: Option<String>,
}

/// Profile not found template (Astro-built)
#[derive(Template)]
#[template(path = "askama/profile_not_found/index.html")]
pub struct ProfileNotFoundTemplate {
    pub username: String,
}
