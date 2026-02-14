pub mod askama;

use axum::Router;
use tower_http::services::ServeDir;
use std::path::PathBuf;

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
        Self { base_dir, precompressed }
    }
}

pub fn build_static_router(config: &StaticConfig) -> Router {
    let base = &config.base_dir;
    let precompressed = config.precompressed;

    let astro_service = if precompressed {
        ServeDir::new(base.join("_astro")).precompressed_gzip()
    } else {
        ServeDir::new(base.join("_astro"))
    };

    let assets_service = if precompressed {
        ServeDir::new(base.join("assets")).precompressed_gzip()
    } else {
        ServeDir::new(base.join("assets"))
    };

    let chunks_service = if precompressed {
        ServeDir::new(base.join("chunks")).precompressed_gzip()
    } else {
        ServeDir::new(base.join("chunks"))
    };

    let images_service = ServeDir::new(base.join("images"));

    let pagefind_service = if precompressed {
        ServeDir::new(base.join("pagefind")).precompressed_gzip()
    } else {
        ServeDir::new(base.join("pagefind"))
    };

    let fallback_service = if precompressed {
        ServeDir::new(base).precompressed_gzip().append_index_html_on_directories(true)
    } else {
        ServeDir::new(base).append_index_html_on_directories(true)
    };

    Router::new()
        .nest_service("/_astro", astro_service)
        .nest_service("/assets", assets_service)
        .nest_service("/chunks", chunks_service)
        .nest_service("/images", images_service)
        .nest_service("/pagefind", pagefind_service)
        .fallback_service(fallback_service)
}
