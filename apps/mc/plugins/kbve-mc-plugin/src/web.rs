use askama::Template;
use axum::{
    Router,
    extract::Path,
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use dashmap::DashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock};
use tower_http::services::ServeDir;

// ---------------------------------------------------------------------------
// Shared player tracking (written by event handlers, read by web handlers)
// ---------------------------------------------------------------------------

/// Online players: name → () (name is unique in Minecraft)
pub static ONLINE_PLAYERS: LazyLock<DashMap<String, ()>> = LazyLock::new(DashMap::new);

// ---------------------------------------------------------------------------
// Askama templates
// ---------------------------------------------------------------------------

#[derive(Template)]
#[template(path = "askama/index.html")]
pub struct AstroTemplate<'a> {
    pub content: &'a str,
    pub title: &'a str,
    pub description: &'a str,
}

#[derive(Template)]
#[template(path = "askama/players.html")]
pub struct PlayersTemplate {
    pub player_count: usize,
    pub max_players: usize,
    pub players: Vec<String>,
    pub server_online: bool,
}

pub struct TemplateResponse<T: Template>(pub T);

impl<T: Template> IntoResponse for TemplateResponse<T> {
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(_err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to render template",
            )
                .into_response(),
        }
    }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

pub async fn players_handler() -> impl IntoResponse {
    let players: Vec<String> = ONLINE_PLAYERS
        .iter()
        .map(|entry| entry.key().clone())
        .collect();
    let player_count = players.len();
    let max_players = std::env::var("MAX_PLAYERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000u32) as usize;

    let template = PlayersTemplate {
        player_count,
        max_players,
        players,
        server_online: true,
    };

    TemplateResponse(template)
}

// ---------------------------------------------------------------------------
// Mojang API proxy (browser CORS workaround)
// ---------------------------------------------------------------------------

const MOJANG_API: &str = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_SESSION: &str = "https://sessionserver.mojang.com/session/minecraft/profile";

/// GET /api/mojang/profile/{username} → proxies api.mojang.com
pub async fn mojang_profile_proxy(Path(username): Path<String>) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        ureq::get(format!("{MOJANG_API}/{username}"))
            .call()
            .and_then(|resp| resp.into_body().read_to_string())
    })
    .await;

    match result {
        Ok(Ok(body)) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            body,
        )
            .into_response(),
        _ => (StatusCode::BAD_GATEWAY, "Mojang API unavailable").into_response(),
    }
}

/// GET /api/mojang/session/{uuid} → proxies sessionserver.mojang.com
pub async fn mojang_session_proxy(Path(uuid): Path<String>) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        ureq::get(format!("{MOJANG_SESSION}/{uuid}"))
            .call()
            .and_then(|resp| resp.into_body().read_to_string())
    })
    .await;

    match result {
        Ok(Ok(body)) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            body,
        )
            .into_response(),
        _ => (StatusCode::BAD_GATEWAY, "Mojang session API unavailable").into_response(),
    }
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const DEFAULT_STATIC_DIR: &str = "/pumpkin/web";

pub fn static_dir() -> PathBuf {
    std::env::var("STATIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_STATIC_DIR))
}

pub fn build_static_router(base: &PathBuf) -> Router {
    let precompressed = std::env::var("STATIC_PRECOMPRESSED")
        .map(|v| v != "0" && v.to_lowercase() != "false")
        .unwrap_or(true);

    // Read Astro's 404.html at startup for the not-found fallback
    let not_found_html = Arc::new(
        std::fs::read_to_string(base.join("404.html"))
            .unwrap_or_else(|_| "<html><body><h1>404 - Not Found</h1></body></html>".to_string()),
    );

    let serve_dir = |path: PathBuf| {
        let svc = ServeDir::new(path);
        if precompressed {
            svc.precompressed_br().precompressed_gzip()
        } else {
            svc
        }
    };

    // Content-hashed asset directories
    let astro_service = serve_dir(base.join("_astro"));
    let assets_service = serve_dir(base.join("assets"));
    let chunks_service = serve_dir(base.join("chunks"));
    let pagefind_service = serve_dir(base.join("pagefind"));

    // Images are already compressed formats — skip precompression
    let images_service = ServeDir::new(base.join("images"));

    // 404 service: returns Astro's 404.html with proper status code
    let not_found_svc = {
        let html = not_found_html.clone();
        tower::service_fn(move |_req: axum::extract::Request| {
            let html = html.clone();
            async move {
                Ok::<_, Infallible>(
                    (
                        StatusCode::NOT_FOUND,
                        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                        (*html).clone(),
                    )
                        .into_response(),
                )
            }
        })
    };

    // Root fallback: serves pages (/auth → /auth/index.html),
    // falls back to Astro's 404.html for unknown routes
    let fallback_svc = {
        let svc = ServeDir::new(base)
            .append_index_html_on_directories(true)
            .fallback(not_found_svc);
        if precompressed {
            svc.precompressed_br().precompressed_gzip()
        } else {
            svc
        }
    };

    Router::new()
        .nest_service("/_astro", astro_service)
        .nest_service("/assets", assets_service)
        .nest_service("/chunks", chunks_service)
        .nest_service("/images", images_service)
        .nest_service("/pagefind", pagefind_service)
        .fallback_service(fallback_svc)
}
