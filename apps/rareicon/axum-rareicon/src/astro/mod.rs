pub mod askama;

use axum::{
    Router,
    http::{StatusCode, header},
    response::IntoResponse,
};
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::services::ServeDir;

pub struct StaticConfig {
    pub base_dir: PathBuf,
    pub precompressed: bool,
}

impl StaticConfig {
    pub fn from_env() -> Self {
        let base_dir = std::env::var("STATIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("templates/dist"));
        let precompressed = std::env::var("STATIC_PRECOMPRESSED")
            .map(|v| v != "0" && v.to_lowercase() != "false")
            .unwrap_or(true);
        Self {
            base_dir,
            precompressed,
        }
    }
}

pub fn build_static_router(config: &StaticConfig) -> Router {
    let base = &config.base_dir;
    let precompressed = config.precompressed;

    // Read Astro's 404.html at startup for the not-found fallback.
    let not_found_html = Arc::new(
        std::fs::read_to_string(base.join("404.html"))
            .unwrap_or_else(|_| "<html><body><h1>404 — Not Found</h1></body></html>".to_string()),
    );

    let serve_dir = |path: PathBuf| {
        let svc = ServeDir::new(path);
        if precompressed {
            svc.precompressed_br().precompressed_gzip()
        } else {
            svc
        }
    };

    // Content-hashed asset directories.
    let astro_service = serve_dir(base.join("_astro"));
    let assets_service = serve_dir(base.join("assets"));
    let chunks_service = serve_dir(base.join("chunks"));
    let pagefind_service = serve_dir(base.join("pagefind"));

    // Images skip precompression (already compressed formats).
    let images_service = ServeDir::new(base.join("images"));

    // 404 service returns Astro's 404.html with a proper status code.
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

    // Root fallback serves pages (e.g. /icons/sword → /icons/sword/index.html)
    // and falls back to Astro's 404.html for unknown routes.
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
