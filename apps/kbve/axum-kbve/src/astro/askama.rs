// Askama template definitions for server-side rendered pages

use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};

// TODO: Improve the string allocation around the askama code, there is definitely way too many allocations then what we need.
/*

1) Literals/Config/requests path fields -> Cow<'a, str> or &'a str.
2) Shrink tiny derived strings like username_first_char -> String -> (char)
3) Double check the pre-rendering partial HTML into String for hot lists, could be done better.
4) DB-Owned fields return as Strings -> investigate the borrow directly from a row/model lifetime.
4A) -
    4A1) Postgres Background Worker -> Function -> returns BYTEA
    4A2) Rust recieves Vec<u8>
    4A3) Parse borrowed views from Vec<u8> via rkyv / postcord / fb / pB
    4A4) Askama -> &Vec<u8>

    For this , we will have to make some changes to the kilobase extension to support the flow, ideally allowing a background worker to mainly handle the Vec<u8>.

*/

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
    // Forum-side stats. `forum_present` = false when the user has no
    // forum activity yet — the template can hide the section entirely.
    // Fields are read by the production AskamaProfileProvider.astro
    // overlay (templates/dist/askama/profile/index.html); the dev stub
    // doesn't reference them yet, so silence cargo's dead-code lint.
    #[allow(dead_code)]
    pub forum_present: bool,
    #[allow(dead_code)]
    pub forum_karma: i64,
    #[allow(dead_code)]
    pub forum_post_count: i64,
    #[allow(dead_code)]
    pub forum_comment_count: i64,
    #[allow(dead_code)]
    pub forum_upvotes_received: i64,
    #[allow(dead_code)]
    pub forum_trust_level: i16,
    #[allow(dead_code)]
    pub forum_signature: Option<String>,
    #[allow(dead_code)]
    pub forum_joined_human: String,
    #[allow(dead_code)]
    pub forum_last_active_human: Option<String>,
    /// Pre-rendered list of recent thread cards (askama partial).
    #[allow(dead_code)]
    pub forum_recent_threads_html: String,
    /// Pre-rendered list of recent comments.
    #[allow(dead_code)]
    pub forum_recent_comments_html: String,
}

/// Profile not found template (Astro-built)
#[derive(Template)]
#[template(path = "askama/profile_not_found/index.html")]
pub struct ProfileNotFoundTemplate {
    pub username: String,
}

/// Per-row partial for "recent forum threads" on the profile page.
#[derive(Template)]
#[template(path = "askama/profile/_forum_thread_row.html")]
pub struct ProfileForumThreadRowPartial {
    pub thread_slug_or_id: String,
    pub title: String,
    pub space_slug: String,
    pub created_at_human: String,
    pub score: i64,
    pub comment_count: i32,
    pub pinned: bool,
}

/// Per-row partial for "recent forum comments" on the profile page.
#[derive(Template)]
#[template(path = "askama/profile/_forum_comment_row.html")]
pub struct ProfileForumCommentRowPartial {
    pub id: String,
    pub thread_id: String,
    pub excerpt: String,
    pub created_at_human: String,
    pub score: i64,
}

// ===========================================================================
// FORUM TEMPLATES
// ===========================================================================
// Every string field here is pre-sanitized upstream. Bodies + comments arrive
// as HTML produced by `kbve::markdown::render` — safe to pipe into `|safe`
// inside the templates. Plain-text fields (title, author, timestamps) are
// escaped by askama's default filter.

/// Individual forum thread page served at /forum/t/{slug_or_id}.
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

/// Per-row partial for forum feed items. Rendered inside
/// `forum_feed_handler` and concatenated into `feed_items_html`.
#[allow(dead_code)] // space_name kept for future "rich space chip" surface
#[derive(Template)]
#[template(path = "askama/forum/feed/_item.html")]
pub struct ForumFeedItemPartial {
    pub thread_slug_or_id: String,
    pub title: String,
    pub space_slug: String,
    pub space_name: String,
    /// Resolved from the author UUID via ProfileService::get_usernames_by_ids.
    /// Falls back to a "deleted-user" sentinel when no row maps — under the
    /// username-required gate this should be vanishingly rare.
    pub author_username: String,
    pub created_at_human: String,
    pub score: i64,
    pub comment_count: i32,
    pub pinned: bool,
    /// Sanitized HTML — output of `kbve::markdown::render(..).html` truncated
    /// to a feed excerpt. Already passes through ammonia.
    pub body_excerpt_html: String,
}

/// 404 page served when a `/forum/s/{slug}` slug doesn't resolve to
/// an active space.
#[derive(Template)]
#[template(path = "askama/forum/space_not_found/index.html")]
pub struct ForumSpaceNotFoundTemplate {
    pub space_slug: String,
}

/// /forum/tags — listing of every active canonical tag.
#[derive(Template)]
#[template(path = "askama/forum/tags/index.html")]
pub struct ForumTagsIndexTemplate {
    pub tags_html: String,
    pub tag_count: usize,
}

/// New-thread compose page served at /forum/compose.
#[derive(Template)]
#[template(path = "askama/forum/compose/index.html")]
pub struct ForumComposeTemplate {
    pub compose_title: String,
    pub compose_meta_description: String,
    /// Pre-filled `?space=<slug>` from query string. Empty when no
    /// preference; the form lets the user pick.
    pub default_space_slug: String,
}

/// Per-row partial for thread comments.
#[derive(Template)]
#[template(path = "askama/forum/thread/_comment.html")]
pub struct ForumCommentPartial {
    pub id: String,
    pub depth: i32,
    /// Author UUID — emitted as `data-author-id` so client-side JS can
    /// compare against the signed-in user and show/hide edit buttons.
    pub author_id: String,
    pub author_username: String,
    pub author_avatar_url: String,
    pub created_at_human: String,
    pub score: i64,
    /// Raw markdown body — emitted in a hidden `<template>` so the
    /// inline edit form can pre-fill the textarea without a roundtrip.
    pub body_raw: String,
    /// Sanitized HTML — output of `kbve::markdown::render(..).html`.
    pub body_html: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn health_template_renders_status_and_version() {
        let template = HealthTemplate {
            status: "Operational".to_string(),
            version: "9.9.9".to_string(),
            uptime_seconds: 123,
        };
        let html = template.render().expect("health template must render");
        assert!(html.contains("Operational"));
        assert!(html.contains("9.9.9"));
    }

    #[test]
    fn error_template_renders_code_and_message() {
        let template = ErrorTemplate {
            code: 404,
            message: "Not Found".to_string(),
        };
        let html = template.render().expect("error template must render");
        assert!(html.contains("404"));
        assert!(html.contains("Not Found"));
    }

    #[tokio::test]
    async fn template_response_serves_html_on_ok() {
        let resp = TemplateResponse(HealthTemplate {
            status: "Operational".to_string(),
            version: "0.0.0".to_string(),
            uptime_seconds: 0,
        })
        .into_response();
        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .expect("html response must set content-type")
            .to_str()
            .unwrap()
            .to_string();
        assert!(ct.starts_with("text/html"), "content-type was {ct}");
    }

    /// Sad-path: feed the renderer empty / boundary values and confirm
    /// the template still produces valid HTML without panicking. Askama
    /// 0.16 catches missing-template paths at compile time, so we test
    /// the runtime branches that can actually fail in CI.
    #[test]
    fn templates_render_with_empty_strings_without_panicking() {
        let h = HealthTemplate {
            status: String::new(),
            version: String::new(),
            uptime_seconds: 0,
        };
        let html = h
            .render()
            .expect("HealthTemplate must accept empty strings");
        assert!(html.contains("html") || html.contains("<"));

        let e = ErrorTemplate {
            code: 0,
            message: String::new(),
        };
        let html = e.render().expect("ErrorTemplate must accept empty strings");
        assert!(html.contains("0"));
    }
}
