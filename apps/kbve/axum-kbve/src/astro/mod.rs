pub mod askama;

use axum::{
    Router,
    http::{HeaderValue, StatusCode, header},
    middleware::Next,
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

// TODO: Centralize static asset route detection - 04/22/2026 @h0lybyte
/*

const STATIC_PREFIXES: &[&str] = &["/_astro", "/assets", "/chunks", "/pagefind", "/images"];

#[inline]
fn is_static_asset_path(path: &str) -> bool {
    STATIC_PREFIXES.iter().any(|prefix| path.starts_with(prefix))
}

#[inline]
fn is_isometric_path(path: &str) -> bool {
    path.starts_with("/isometric") || path.starts_with("/arcade/isometric")
}

#[inline]
fn is_astro_bundle_path(path: &str) -> bool {
    path.starts_with("/_astro")
}

*/

//  TODO: Tighten up the static configs for envs
/*


#[derive(Debug, Clone)]
pub struct StaticConfig {
    pub base_dir: PathBuf,
    pub precompressed: bool,
}

impl Default for StaticConfig {
    fn default() -> Self {
        Self {
            base_dir: PathBuf::from("templates/dist"),
            precompressed: true,
        }
    }
}

impl StaticConfig {
    pub fn from_env() -> Self {
        let mut config = Self::default();

        if let Ok(dir) = std::env::var("STATIC_DIR") {
            if !dir.trim().is_empty() {
                config.base_dir = PathBuf::from(dir);
            }
        }

        if let Ok(v) = std::env::var("STATIC_PRECOMPRESSED") {
            config.precompressed = parse_env_bool(&v);
        }

        config
    }
}

fn parse_env_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

*/

// TODO: Extraction of headers can be improved
/*


#[inline]
fn insert_if_absent(headers: &mut HeaderMap, name: header::HeaderName, value: &'static str) {
    headers.entry(name).or_insert(HeaderValue::from_static(value));
}

#[inline]
fn apply_cross_origin_isolation(headers: &mut HeaderMap) {
    insert_if_absent(
        headers,
        header::HeaderName::from_static("cross-origin-opener-policy"),
        "same-origin",
    );
    insert_if_absent(
        headers,
        header::HeaderName::from_static("cross-origin-embedder-policy"),
        "require-corp",
    );
    insert_if_absent(
        headers,
        header::HeaderName::from_static("cross-origin-resource-policy"),
        "same-origin",
    );
}

#[inline]
fn apply_corp(headers: &mut HeaderMap) {
    insert_if_absent(
        headers,
        header::HeaderName::from_static("cross-origin-resource-policy"),
        "same-origin",
    );
}

Could also maybe add some helper functions inside of the utils?

async fn coop_coep_isometric(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let is_isometric = is_isometric_path(req.uri().path());
    let mut resp = next.run(req).await;

    if is_isometric {
        apply_cross_origin_isolation(resp.headers_mut());
    }

    resp
}

async fn corp_astro_assets(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let path = req.uri().path();
    let mut resp = next.run(req).await;

    if is_static_asset_path(path) {
        apply_corp(resp.headers_mut());
    }

    if is_astro_bundle_path(path) {
        insert_if_absent(
            resp.headers_mut(),
            header::HeaderName::from_static("cross-origin-embedder-policy"),
            "require-corp",
        );
    }

    resp
}

*/

// TODO: Better ServeDir
/*

fn make_serve_dir(path: PathBuf, precompressed: bool) -> ServeDir {
    let svc = ServeDir::new(path);
    if precompressed {
        svc.precompressed_br().precompressed_gzip()
    } else {
        svc
    }
}

pub fn build_static_router(config: &StaticConfig) -> Router {
    let base = config.base_dir.clone();
    let precompressed = config.precompressed;

    let not_found_html = Arc::new(
        std::fs::read_to_string(base.join("404.html"))
            .unwrap_or_else(|_| "<html><body><h1>404 - Not Found</h1></body></html>".to_string()),
    );

    let astro_service = make_serve_dir(base.join("_astro"), precompressed);
    let assets_service = make_serve_dir(base.join("assets"), precompressed);
    let chunks_service = make_serve_dir(base.join("chunks"), precompressed);
    let pagefind_service = make_serve_dir(base.join("pagefind"), precompressed);
    let images_service = make_serve_dir(base.join("images"), precompressed);

    let not_found_svc = {
        let html = Arc::clone(&not_found_html);
        tower::service_fn(move |_req: axum::extract::Request| {
            let html = Arc::clone(&html);
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
        let svc = ServeDir::new(&base)
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
        .layer(axum::middleware::from_fn(coop_coep_isometric))
        .layer(axum::middleware::from_fn(corp_astro_assets))
}

Then throw maybe

fn load_404_html(base: &std::path::Path) -> Arc<String> {
    Arc::new(
        std::fs::read_to_string(base.join("404.html"))
            .unwrap_or_else(|_| "<html><body><h1>404 - Not Found</h1></body></html>".to_string()),
    )
}

impl StaticConfig {
    pub fn validate(&self) -> std::io::Result<()> {
        if self.base_dir.is_dir() {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("static base_dir does not exist: {}", self.base_dir.display()),
            ))
        }
    }
}
*/

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
    let pagefind_service = serve_dir(base.join("pagefind"));

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

    // Root fallback: serves pages (/auth → /auth/index.html), falls back to Astro's 404.html for unknown routes
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
        .layer(axum::middleware::from_fn(coop_coep_isometric))
        .layer(axum::middleware::from_fn(corp_astro_assets))
}

async fn coop_coep_isometric(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let path = req.uri().path();
    let is_isometric = path.starts_with("/isometric") || path.starts_with("/arcade/isometric");
    let mut resp = next.run(req).await;
    if is_isometric {
        let headers = resp.headers_mut();
        headers.insert(
            header::HeaderName::from_static("cross-origin-opener-policy"),
            HeaderValue::from_static("same-origin"),
        );
        headers.insert(
            header::HeaderName::from_static("cross-origin-embedder-policy"),
            HeaderValue::from_static("require-corp"),
        );
        headers.insert(
            header::HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("same-origin"),
        );
    }
    resp
}

async fn corp_astro_assets(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let path = req.uri().path();
    let needs_corp = path.starts_with("/_astro")
        || path.starts_with("/assets")
        || path.starts_with("/pagefind")
        || path.starts_with("/chunks")
        || path.starts_with("/images");
    let is_astro_bundle = path.starts_with("/_astro");
    let mut resp = next.run(req).await;
    if needs_corp {
        resp.headers_mut().insert(
            header::HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("same-origin"),
        );
    }
    if is_astro_bundle {
        resp.headers_mut().insert(
            header::HeaderName::from_static("cross-origin-embedder-policy"),
            HeaderValue::from_static("require-corp"),
        );
    }
    resp
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

    #[test]
    #[serial]
    fn test_static_config_precompressed_true_variants() {
        std::env::set_var("STATIC_PRECOMPRESSED", "true");
        assert!(StaticConfig::from_env().precompressed);

        std::env::set_var("STATIC_PRECOMPRESSED", "1");
        assert!(StaticConfig::from_env().precompressed);

        std::env::set_var("STATIC_PRECOMPRESSED", "yes");
        assert!(StaticConfig::from_env().precompressed);

        std::env::remove_var("STATIC_PRECOMPRESSED");
    }
}
