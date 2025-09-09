use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Request, State},
    http::{header, StatusCode, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use tower::ServiceExt;
use tower_http::{
    services::{ServeDir, ServeFile},
    compression::CompressionLayer,
    cors::CorsLayer,
};
use tracing::{debug, warn};

use crate::services::{
    states::AppState,
    utils::{Error, Result},
};

// ============================================================================
// Static File Configuration
// ============================================================================

#[derive(Debug, Clone)]
pub struct StaticConfig {
    pub assets_dir: String,
    pub max_age: Duration,
    pub enable_precompression: bool,
    pub enable_directory_listing: bool,
    pub fallback_file: Option<String>,
}

impl Default for StaticConfig {
    fn default() -> Self {
        Self {
            assets_dir: "./dist".to_string(),
            max_age: Duration::from_secs(3600), // 1 hour
            enable_precompression: true,
            enable_directory_listing: false,
            fallback_file: Some("index.html".to_string()),
        }
    }
}

impl StaticConfig {
    pub fn new(assets_dir: impl Into<String>) -> Self {
        Self {
            assets_dir: assets_dir.into(),
            ..Default::default()
        }
    }
    
    pub fn with_max_age(mut self, duration: Duration) -> Self {
        self.max_age = duration;
        self
    }
    
    pub fn with_precompression(mut self, enabled: bool) -> Self {
        self.enable_precompression = enabled;
        self
    }
    
    pub fn with_directory_listing(mut self, enabled: bool) -> Self {
        self.enable_directory_listing = enabled;
        self
    }
    
    pub fn with_fallback(mut self, fallback: Option<String>) -> Self {
        self.fallback_file = fallback;
        self
    }
}

// ============================================================================
// Static File Handlers
// ============================================================================

/// Serve static files with optimized headers
pub async fn serve_static_file(
    config: &StaticConfig,
    request: Request,
) -> impl IntoResponse {
    let path = request.uri().path().to_owned();
    
    debug!("Serving static file: {}", path);
    
    // Build the service for static files
    let mut serve_dir = ServeDir::new(&config.assets_dir)
        .precompressed_gzip()
        .precompressed_br();
    
    if !config.enable_directory_listing {
        serve_dir = serve_dir.append_index_html_on_directories(true);
    }
    
    // If there's a fallback file, set it up
    if let Some(ref _fallback) = config.fallback_file {
        // Note: Fallback handling would need to be implemented differently
        // For now, skip fallback to avoid type mismatch
    }
    
    // Serve the file
    match serve_dir.oneshot(request).await {
        Ok(mut response) => {
            // Add caching headers
            add_cache_headers(response.headers_mut(), &config, &path);
            response.into_response()
        }
        Err(e) => {
            warn!("Error serving static file: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}

/// Add appropriate caching headers based on file type
fn add_cache_headers(headers: &mut HeaderMap, config: &StaticConfig, path: &str) {
    let max_age_seconds = config.max_age.as_secs();
    
    // Determine cache strategy based on file extension
    let (cache_control, _expires) = match get_file_extension(path) {
        // Long cache for assets with hashes or versions
        Some(ext) if (ext == "js" || ext == "css" || ext == "woff2" || ext == "woff") && has_hash_in_filename(path) => {
            ("public, max-age=31536000, immutable".to_string(), Duration::from_secs(31536000))
        },
        
        // Medium cache for regular assets
        Some(ext) if matches!(ext.as_str(), "js" | "css" | "png" | "jpg" | "jpeg" | "gif" | "svg" | "ico" | "woff2" | "woff") => {
            (format!("public, max-age={}", max_age_seconds), config.max_age)
        },
        
        // Short cache for HTML files
        Some(ext) if matches!(ext.as_str(), "html" | "htm") => {
            ("public, max-age=300, must-revalidate".to_string(), Duration::from_secs(300))
        },
        
        // No cache for unknown files
        _ => {
            ("no-cache, no-store, must-revalidate".to_string(), Duration::from_secs(0))
        }
    };
    
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_str(&cache_control).unwrap_or_else(|_| HeaderValue::from_static("no-cache"))
    );
    
    // Add security headers for HTML files
    if let Some(ext) = get_file_extension(path) {
        if matches!(ext.as_str(), "html" | "htm") {
            headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
            headers.insert("x-frame-options", HeaderValue::from_static("SAMEORIGIN"));
        }
    }
}

// ============================================================================
// File Type Utilities
// ============================================================================

fn get_file_extension(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
}

fn has_hash_in_filename(path: &str) -> bool {
    // Check if filename contains a hash (common pattern: name.hash.ext)
    let filename = std::path::Path::new(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    
    // Look for patterns like: bundle.a1b2c3d4.js or style.hash.css
    filename.contains('.') && filename.len() > 10 && 
    filename.chars().any(|c| c.is_ascii_hexdigit())
}

// ============================================================================
// Health Check Handler
// ============================================================================

pub async fn health_check() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "status": "healthy",
        "service": "hyperlane-static",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

// Static middleware removed - using ServeDir directly

// ============================================================================
// Router Configuration
// ============================================================================

/// Create a router for serving static files  
pub fn static_router(config: StaticConfig) -> Router {
    let serve_dir = ServeDir::new(&config.assets_dir)
        .precompressed_gzip()
        .precompressed_br();
    
    Router::new()
        .route("/health", get(health_check))
        .fallback_service(serve_dir)
        .layer(CompressionLayer::new())
}

/// Create a router for static assets with specific configuration
pub fn assets_router(assets_dir: impl Into<String>) -> Router {
    let config = StaticConfig::new(assets_dir)
        .with_max_age(Duration::from_secs(86400)) // 24 hours
        .with_precompression(true)
        .with_directory_listing(false)
        .with_fallback(None); // No fallback for assets
    
    static_router(config)
}

/// Create a router for SPA (Single Page Application) serving
pub fn spa_router(
    build_dir: impl Into<String>, 
    index_file: Option<String>
) -> Router {
    let config = StaticConfig::new(build_dir)
        .with_max_age(Duration::from_secs(300)) // 5 minutes for HTML
        .with_precompression(true)
        .with_directory_listing(false)
        .with_fallback(index_file.or_else(|| Some("index.html".to_string())));
    
    static_router(config)
}

/// Create a development static file router with no caching
pub fn dev_static_router(assets_dir: impl Into<String>) -> Router {
    let config = StaticConfig::new(assets_dir)
        .with_max_age(Duration::from_secs(0)) // No caching
        .with_precompression(false)
        .with_directory_listing(true) // Allow directory browsing in dev
        .with_fallback(Some("index.html".to_string()));
    
    static_router(config)
}

// Integration helpers removed - handled in main.rs

// ============================================================================
// Utility Functions
// ============================================================================

/// Check if a path should be served as static content
pub fn is_static_path(path: &str) -> bool {
    let static_extensions = [
        "js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico",
        "woff", "woff2", "ttf", "eot", "map", "pdf", "txt",
        "xml", "json", "webmanifest"
    ];
    
    if let Some(ext) = get_file_extension(path) {
        static_extensions.contains(&ext.as_str())
    } else {
        // Check for specific static file names
        matches!(path, "/robots.txt" | "/favicon.ico" | "/sitemap.xml")
    }
}

/// Generate appropriate MIME type for file extension
pub fn get_mime_type(path: &str) -> &'static str {
    match get_file_extension(path) {
        Some(ext) => match ext.as_str() {
            "html" | "htm" => "text/html",
            "css" => "text/css",
            "js" => "application/javascript",
            "json" => "application/json",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "ttf" => "font/ttf",
            "eot" => "application/vnd.ms-fontobject",
            "pdf" => "application/pdf",
            "txt" => "text/plain",
            "xml" => "application/xml",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_get_file_extension() {
        assert_eq!(get_file_extension("style.css"), Some("css".to_string()));
        assert_eq!(get_file_extension("script.min.js"), Some("js".to_string()));
        assert_eq!(get_file_extension("image.png"), Some("png".to_string()));
        assert_eq!(get_file_extension("no-extension"), None);
    }
    
    #[test]
    fn test_has_hash_in_filename() {
        assert!(has_hash_in_filename("bundle.a1b2c3d4.js"));
        assert!(has_hash_in_filename("style.f5e6d7c8.css"));
        assert!(!has_hash_in_filename("regular-file.js"));
        assert!(!has_hash_in_filename("style.css"));
    }
    
    #[test]
    fn test_is_static_path() {
        assert!(is_static_path("/assets/style.css"));
        assert!(is_static_path("/images/logo.png"));
        assert!(is_static_path("/robots.txt"));
        assert!(!is_static_path("/api/users"));
        assert!(!is_static_path("/about"));
    }
    
    #[test]
    fn test_get_mime_type() {
        assert_eq!(get_mime_type("style.css"), "text/css");
        assert_eq!(get_mime_type("script.js"), "application/javascript");
        assert_eq!(get_mime_type("image.png"), "image/png");
        assert_eq!(get_mime_type("unknown.xyz"), "application/octet-stream");
    }
}