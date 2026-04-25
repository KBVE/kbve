//! Static-file router for Astro build output, shared across axum-* services.
//!
//! # Shape
//!
//! An Astro `static` build produces:
//!
//! - `dist/index.html` (+ per-route `index.html` under directories)
//! - `dist/_astro/*` — content-hashed Vite bundles (immutable)
//! - `dist/assets/*` — author-controlled assets
//! - `dist/chunks/*` — Vite dynamic-import chunks
//! - `dist/pagefind/*` — Pagefind search index (`pagefind.js` + WASM)
//! - `dist/images/*` — optimized image outputs
//! - `dist/404.html` — Astro 404 page
//!
//! [`build_static_router`] wires each of those prefixes to a tower-http
//! [`ServeDir`] with `precompressed_br` + `precompressed_gzip` fallbacks,
//! hosts the 404 as a 404-statused response, and returns a root `ServeDir`
//! fallback that appends `index.html` on directory requests.
//!
//! # Env
//!
//! - `STATIC_DIR` — absolute or relative path to the Astro `dist/`. Default:
//!   `templates/dist` (matches every axum-* Dockerfile).
//! - `STATIC_PRECOMPRESSED` — `0` / `false` disables br/gzip lookup. Default
//!   on (Astro Dockerfiles ship precompressed assets).
//!
//! # CORP headers
//!
//! [`corp_static_assets`] is a thin middleware that stamps
//! `Cross-Origin-Resource-Policy: same-origin` on any path starting with an
//! asset prefix, and `Cross-Origin-Embedder-Policy: require-corp` on the
//! Vite bundle prefix. Use it in services that need their static assets
//! embeddable from subsites under the same origin.
//!
//! COOP/COEP isolation for `/isometric` (SharedArrayBuffer / WASM threads)
//! is intentionally NOT here — it is a per-service concern.

use axum::{
    Router,
    http::{HeaderValue, StatusCode, header},
    middleware::Next,
    response::IntoResponse,
};
use std::convert::Infallible;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tower_http::services::ServeDir;

/// Asset prefixes that receive `Cross-Origin-Resource-Policy: same-origin`.
/// The Vite-bundle prefix additionally receives `COEP: require-corp` via the
/// [`corp_static_assets`] middleware.
pub const ASSET_PREFIXES: &[&str] = &["/_astro", "/assets", "/chunks", "/pagefind", "/images"];

/// Runtime-configurable static file behavior.
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
    /// Read `STATIC_DIR` / `STATIC_PRECOMPRESSED` from the environment and
    /// return a config. Blank values fall back to defaults.
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

    /// Verify that the configured `base_dir` exists on disk. Call at boot if
    /// the service should fail fast when the Astro build output is missing.
    pub fn validate(&self) -> std::io::Result<()> {
        if self.base_dir.is_dir() {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!(
                    "static base_dir does not exist: {}",
                    self.base_dir.display()
                ),
            ))
        }
    }
}

fn parse_env_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn make_serve_dir(path: PathBuf, precompressed: bool) -> ServeDir {
    let svc = ServeDir::new(path);
    if precompressed {
        svc.precompressed_br().precompressed_gzip()
    } else {
        svc
    }
}

fn load_404_html(base: &Path) -> Arc<String> {
    Arc::new(
        std::fs::read_to_string(base.join("404.html"))
            .unwrap_or_else(|_| "<html><body><h1>404 - Not Found</h1></body></html>".to_string()),
    )
}

/// Build the static-file router for an Astro build. Nests per-prefix
/// `ServeDir` services and falls back to the root with `404.html` as the
/// not-found body (served with a 404 status code).
pub fn build_static_router(config: &StaticConfig) -> Router {
    let base = &config.base_dir;
    let precompressed = config.precompressed;
    let not_found_html = load_404_html(base);

    let astro_service = make_serve_dir(base.join("_astro"), precompressed);
    let assets_service = make_serve_dir(base.join("assets"), precompressed);
    let chunks_service = make_serve_dir(base.join("chunks"), precompressed);
    let pagefind_service = make_serve_dir(base.join("pagefind"), precompressed);

    // Images skip precompression (already compressed formats).
    let images_service = ServeDir::new(base.join("images"));

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

    // Root fallback serves pages (e.g. `/icons/sword` → `/icons/sword/index.html`)
    // and returns the astro 404 page on unknown routes.
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

#[inline]
fn is_asset_path(path: &str) -> bool {
    ASSET_PREFIXES.iter().any(|p| path.starts_with(p))
}

#[inline]
fn is_astro_bundle(path: &str) -> bool {
    path.starts_with("/_astro")
}

/// Middleware that stamps `Cross-Origin-Resource-Policy: same-origin` on
/// every asset-prefix response and `Cross-Origin-Embedder-Policy: require-corp`
/// on the Vite-bundle prefix. Layer it onto the router that
/// [`build_static_router`] returns.
pub async fn corp_static_assets(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let path = req.uri().path().to_owned();
    let mut resp = next.run(req).await;
    if is_asset_path(&path) {
        resp.headers_mut().insert(
            header::HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("same-origin"),
        );
    }
    if is_astro_bundle(&path) {
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
    fn static_config_defaults() {
        std::env::remove_var("STATIC_DIR");
        std::env::remove_var("STATIC_PRECOMPRESSED");

        let config = StaticConfig::from_env();
        assert_eq!(config.base_dir, PathBuf::from("templates/dist"));
        assert!(config.precompressed);
    }

    #[test]
    #[serial]
    fn static_config_custom_dir() {
        std::env::set_var("STATIC_DIR", "/tmp/my-static");
        std::env::remove_var("STATIC_PRECOMPRESSED");

        let config = StaticConfig::from_env();
        assert_eq!(config.base_dir, PathBuf::from("/tmp/my-static"));
        assert!(config.precompressed);

        std::env::remove_var("STATIC_DIR");
    }

    #[test]
    #[serial]
    fn static_config_precompressed_false_variants() {
        std::env::remove_var("STATIC_DIR");
        for v in ["false", "0", "off", "no"] {
            std::env::set_var("STATIC_PRECOMPRESSED", v);
            assert!(!StaticConfig::from_env().precompressed, "value={v}");
        }
        std::env::remove_var("STATIC_PRECOMPRESSED");
    }

    #[test]
    #[serial]
    fn static_config_precompressed_true_variants() {
        for v in ["true", "1", "yes", "on"] {
            std::env::set_var("STATIC_PRECOMPRESSED", v);
            assert!(StaticConfig::from_env().precompressed, "value={v}");
        }
        std::env::remove_var("STATIC_PRECOMPRESSED");
    }

    #[test]
    fn asset_path_detection() {
        assert!(is_asset_path("/_astro/foo.js"));
        assert!(is_asset_path("/assets/logo.png"));
        assert!(is_asset_path("/chunks/0.js"));
        assert!(is_asset_path("/pagefind/pagefind.js"));
        assert!(is_asset_path("/images/hero.webp"));
        assert!(!is_asset_path("/icons/sword/"));
        assert!(!is_asset_path("/"));
    }

    #[test]
    fn astro_bundle_detection() {
        assert!(is_astro_bundle("/_astro/foo.js"));
        assert!(!is_astro_bundle("/assets/logo.png"));
        assert!(!is_astro_bundle("/"));
    }
}
