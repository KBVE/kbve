use axum::{
    Router,
    http::{HeaderName, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;

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

    let astro_service = serve_dir(base.join("_astro"));
    let assets_service = serve_dir(base.join("assets"));
    let chunks_service = serve_dir(base.join("chunks"));

    let images_service = ServeDir::new(base.join("images"));

    // /embed/* — chat.js bundle + example.html.
    // These are designed to be loaded cross-origin from third-party hosts
    // (rareicon.com, kbve.com, anyone's blog). Wire dedicated headers:
    //   * Cross-Origin-Resource-Policy: cross-origin
    //       Lets COEP-isolated host pages load chat.js. Without this,
    //       embedding on a site with `Cross-Origin-Embedder-Policy:
    //       require-corp` (Astro 6+ default in some configs) silently
    //       blocks the script load.
    //   * Access-Control-Allow-Origin: *
    //       Redundant with the global permissive CORS layer, but spelled
    //       out here so the /embed/ surface is independently correct if
    //       global CORS is ever tightened to specific origins.
    //   * Cache-Control: public, max-age=300, must-revalidate
    //       Short cache so embed updates propagate within minutes —
    //       `chat.js` is the evergreen URL, immutable would block fixes.
    let embed_service = ServiceBuilder::new()
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static("*"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=300, must-revalidate"),
        ))
        .service(serve_dir(base.join("embed")));

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
        .nest_service("/embed", embed_service)
        .fallback_service(fallback_svc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, extract::Request, http::StatusCode};
    use serial_test::serial;
    use std::fs;
    use tempfile::TempDir;
    use tower::ServiceExt;

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

    #[tokio::test]
    async fn embed_chat_js_has_cross_origin_headers() {
        let tmp = TempDir::new().unwrap();
        let embed_dir = tmp.path().join("embed");
        fs::create_dir_all(&embed_dir).unwrap();
        fs::write(embed_dir.join("chat.js"), b"console.log('embed');").unwrap();
        fs::write(tmp.path().join("404.html"), b"<h1>404</h1>").unwrap();

        let config = StaticConfig {
            base_dir: tmp.path().to_path_buf(),
            precompressed: false,
        };
        let app = build_static_router(&config);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/embed/chat.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        assert_eq!(
            headers.get("cross-origin-resource-policy").unwrap(),
            "cross-origin",
            "embed needs CORP so COEP-isolated hosts can load the script"
        );
        assert_eq!(
            headers.get("access-control-allow-origin").unwrap(),
            "*",
            "embed is intentionally available from any origin"
        );
        let cache = headers.get("cache-control").unwrap().to_str().unwrap();
        assert!(
            cache.contains("max-age="),
            "embed must set explicit Cache-Control (got {cache:?})"
        );
    }
}
