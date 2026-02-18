use axum::{
    http::{header, StatusCode},
    response::IntoResponse,
    Router,
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

    let not_found_html = Arc::new(
        std::fs::read_to_string(base.join("404.html")).unwrap_or_else(|_| {
            "<html><body><h1>404 - Not Found</h1></body></html>".to_string()
        }),
    );

    let serve_dir = |path: PathBuf| {
        let svc = ServeDir::new(path);
        if precompressed {
            svc.precompressed_br().precompressed_gzip()
        } else {
            svc
        }
    };

    let astro_service = serve_dir(base.join("_astro"));
    let assets_service = serve_dir(base.join("assets"));
    let chunks_service = serve_dir(base.join("chunks"));

    let images_service = ServeDir::new(base.join("images"));

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
        .fallback_service(fallback_svc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_static_config_defaults() {
        std::env::remove_var("STATIC_DIR");
        std::env::remove_var("STATIC_PRECOMPRESSED");

        let config = StaticConfig::from_env();
        assert_eq!(config.base_dir, PathBuf::from("templates/dist"));
        assert!(config.precompressed);
    }

    #[test]
    #[serial]
    fn test_static_config_custom_dir() {
        std::env::set_var("STATIC_DIR", "/tmp/my-static");
        std::env::remove_var("STATIC_PRECOMPRESSED");

        let config = StaticConfig::from_env();
        assert_eq!(config.base_dir, PathBuf::from("/tmp/my-static"));
        assert!(config.precompressed);

        std::env::remove_var("STATIC_DIR");
    }

    #[test]
    #[serial]
    fn test_static_config_precompressed_false() {
        std::env::remove_var("STATIC_DIR");
        std::env::set_var("STATIC_PRECOMPRESSED", "false");

        let config = StaticConfig::from_env();
        assert!(!config.precompressed);

        std::env::set_var("STATIC_PRECOMPRESSED", "0");
        let config = StaticConfig::from_env();
        assert!(!config.precompressed);

        std::env::remove_var("STATIC_PRECOMPRESSED");
    }
}
