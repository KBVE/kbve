use std::collections::HashMap;
use std::sync::LazyLock;
use axum::{
    extract::Request,
    http::{HeaderMap, HeaderValue, StatusCode, Uri},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
};
use tokio::sync::OnceCell;
use tracing::{debug, info};

/// Static redirect mappings for 301 permanent redirects
/// This HashMap is initialized once at startup for maximum performance
static REDIRECT_MAP: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut map = HashMap::new();

    // Tool redirects
    map.insert("/conch", "/tools/conch");

    // // API redirects
    // map.insert("/api/v1", "/api");
    // map.insert("/v1", "/api");

    // Dashboard redirects
    map.insert("/dash", "/dashboard");
    map.insert("/panel", "/dashboard");
    map.insert("/admin", "/dashboard");

    // Project redirects
    map.insert("/projects", "/project");
    map.insert("/proj", "/project");

    // // Analytics redirects
    // map.insert("/analytics", "/analysis");
    // map.insert("/stats", "/analysis");
    // map.insert("/metrics", "/analysis");

    // Support redirects
    map.insert("/help", "/support");
    map.insert("/contact", "/support");
    map.insert("/ticket", "/support");

    // Settings redirects
    map.insert("/config", "/settings");
    map.insert("/preferences", "/settings");
    map.insert("/account", "/settings");

    // Legal redirects
    map.insert("/privacy", "/legal/privacy");
    map.insert("/terms", "/legal/tos");
    map.insert("/tos", "/legal/tos");
    map.insert("/eula", "/legal/eula");

    // // Social redirects
    // map.insert("/github", "https://github.com/kbve");
    // map.insert("/discord", "https://kbve.com/discord");
    // map.insert("/twitch", "https://twitch.tv/kbve");
    // map.insert("/youtube", "https://youtube.com/@kbve");

    // // Blog redirects
    // map.insert("/news", "/blog");
    // map.insert("/updates", "/blog");
    // map.insert("/posts", "/blog");

    // // Other common redirects
    // map.insert("/about", "/");
    // map.insert("/home", "/");

    map
});

/// Redirect configuration for the service
#[derive(Debug, Clone)]
pub struct RedirectConfig {
    /// Whether to enable case-insensitive matching
    pub case_insensitive: bool,
    /// Whether to preserve query parameters
    pub preserve_query: bool,
    /// Whether to log redirects
    pub log_redirects: bool,
}

impl Default for RedirectConfig {
    fn default() -> Self {
        Self {
            case_insensitive: true,
            preserve_query: true,
            log_redirects: true,
        }
    }
}

/// Middleware for handling 301 redirects
pub async fn redirect_middleware(
    request: Request,
    next: Next,
) -> Response {
    redirect_middleware_with_config(request, next, &RedirectConfig::default()).await
}

/// Middleware for handling 301 redirects with custom configuration
pub async fn redirect_middleware_with_config(
    request: Request,
    next: Next,
    config: &RedirectConfig,
) -> Response {
    let uri = request.uri();
    let path = uri.path();

    // Fast lookup in the static HashMap
    let redirect_target = if config.case_insensitive {
        // For case-insensitive lookup, we need to iterate (still very fast for small maps)
        REDIRECT_MAP.iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(path))
            .map(|(_, target)| *target)
    } else {
        REDIRECT_MAP.get(path).copied()
    };

    if let Some(target) = redirect_target {
        let final_url = if config.preserve_query {
            if let Some(query) = uri.query() {
                format!("{}?{}", target, query)
            } else {
                target.to_string()
            }
        } else {
            target.to_string()
        };

        if config.log_redirects {
            debug!("Redirecting {} -> {}", path, final_url);
        }

        // Return 301 Permanent Redirect
        create_redirect_response(&final_url)
    } else {
        // No redirect found, continue to the next middleware/handler
        next.run(request).await
    }
}

/// Create a 301 redirect response
fn create_redirect_response(location: &str) -> Response {
    let mut headers = HeaderMap::new();

    // Set the Location header
    if let Ok(header_value) = HeaderValue::from_str(location) {
        headers.insert("location", header_value);

        // Add cache headers for better performance
        headers.insert("cache-control", HeaderValue::from_static("public, max-age=31536000"));

        // Create the response with 301 status
        (StatusCode::MOVED_PERMANENTLY, headers).into_response()
    } else {
        // Fallback to Axum's Redirect if header creation fails
        Redirect::permanent(location).into_response()
    }
}

/// Helper function to check if a path has a redirect
pub fn has_redirect(path: &str) -> bool {
    REDIRECT_MAP.contains_key(path)
}

/// Helper function to get redirect target
pub fn get_redirect_target(path: &str) -> Option<&'static str> {
    REDIRECT_MAP.get(path).copied()
}

/// Get all redirect mappings (useful for debugging/admin)
pub fn get_all_redirects() -> &'static HashMap<&'static str, &'static str> {
    &REDIRECT_MAP
}

/// Add runtime redirects (for dynamic redirects if needed)
pub struct RuntimeRedirects {
    redirects: HashMap<String, String>,
}

impl RuntimeRedirects {
    pub fn new() -> Self {
        Self {
            redirects: HashMap::new(),
        }
    }

    pub fn add_redirect(&mut self, from: String, to: String) {
        self.redirects.insert(from, to);
    }

    pub fn remove_redirect(&mut self, from: &str) -> Option<String> {
        self.redirects.remove(from)
    }

    pub fn get_redirect(&self, path: &str) -> Option<&str> {
        self.redirects.get(path).map(|s| s.as_str())
    }
}

// ============================================================================
// Async Initialization Pattern with tokio::sync::OnceCell
// ============================================================================

/// Example of async resource initialization using tokio::sync::OnceCell
/// This pattern is useful for database connections, config loading, etc.
pub struct AsyncRedirectService {
    /// Database-backed redirects initialized asynchronously
    db_redirects: OnceCell<HashMap<String, String>>,
}

impl AsyncRedirectService {
    pub fn new() -> Self {
        Self {
            db_redirects: OnceCell::new(),
        }
    }

    /// Initialize database redirects asynchronously (simulated)
    async fn init_db_redirects(&self) -> Result<HashMap<String, String>, Box<dyn std::error::Error + Send + Sync>> {
        info!("Initializing database redirects...");

        // Simulate async database call
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let mut redirects = HashMap::new();
        // In a real implementation, this would query your database
        redirects.insert("/db-redirect-1".to_string(), "/target-1".to_string());
        redirects.insert("/db-redirect-2".to_string(), "/target-2".to_string());

        info!("Database redirects initialized with {} entries", redirects.len());
        Ok(redirects)
    }

    /// Get database redirects, initializing if needed
    pub async fn get_db_redirects(&self) -> Result<&HashMap<String, String>, Box<dyn std::error::Error + Send + Sync>> {
        self.db_redirects
            .get_or_try_init(|| self.init_db_redirects())
            .await
    }

    /// Check for redirect in database-backed redirects
    pub async fn get_db_redirect(&self, path: &str) -> Option<String> {
        if let Ok(redirects) = self.get_db_redirects().await {
            redirects.get(path).cloned()
        } else {
            None
        }
    }
}

/// Global instance for async redirect service
static ASYNC_REDIRECT_SERVICE: OnceCell<AsyncRedirectService> = OnceCell::const_new();

/// Get or initialize the global async redirect service
pub async fn get_async_redirect_service() -> &'static AsyncRedirectService {
    ASYNC_REDIRECT_SERVICE
        .get_or_init(|| async {
            info!("Initializing global async redirect service");
            AsyncRedirectService::new()
        })
        .await
}

/// Enhanced middleware that checks both static and async redirects
pub async fn enhanced_redirect_middleware(
    request: Request,
    next: Next,
) -> Response {
    let uri = request.uri();
    let path = uri.path();

    // First, check static redirects (fastest)
    if let Some(target) = REDIRECT_MAP.get(path) {
        debug!("Static redirect: {} -> {}", path, target);
        return create_redirect_response(target);
    }

    // Then check async/database redirects if static lookup fails
    let async_service = get_async_redirect_service().await;
    if let Some(target) = async_service.get_db_redirect(path).await {
        debug!("Database redirect: {} -> {}", path, target);
        return create_redirect_response(&target);
    }

    // No redirect found, continue to next middleware/handler
    next.run(request).await
}

/// Example handler that uses state with async initialization
/// This demonstrates the pattern you mentioned for state-based redirects
pub async fn redirect_with_state_handler(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<String>>
) -> impl IntoResponse {
    info!("State has been initialized to: {}", state);
    Redirect::permanent("/destination")
}

/// Initialize shared state asynchronously
static SHARED_STATE: OnceCell<std::sync::Arc<String>> = OnceCell::const_new();

pub async fn get_shared_state() -> &'static std::sync::Arc<String> {
    SHARED_STATE
        .get_or_init(|| async {
            info!("Initializing shared state...");
            // Simulate async initialization (could be database, config, etc.)
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            std::sync::Arc::new("Initialized from async source".to_string())
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_static_redirects() {
        assert_eq!(get_redirect_target("/conch"), Some("/tools/conch"));
        assert_eq!(get_redirect_target("/docs"), Some("/documentation"));
        assert_eq!(get_redirect_target("/nonexistent"), None);
    }

    #[test]
    fn test_has_redirect() {
        assert!(has_redirect("/conch"));
        assert!(has_redirect("/docs"));
        assert!(!has_redirect("/nonexistent"));
    }

    #[test]
    fn test_redirect_map_count() {
        // Ensure we have redirects configured
        assert!(!REDIRECT_MAP.is_empty());
        assert!(REDIRECT_MAP.len() > 10); // We should have at least 10 redirects
    }

    #[test]
    fn test_runtime_redirects() {
        let mut runtime = RuntimeRedirects::new();
        runtime.add_redirect("/test".to_string(), "/target".to_string());

        assert_eq!(runtime.get_redirect("/test"), Some("/target"));
        assert_eq!(runtime.remove_redirect("/test"), Some("/target".to_string()));
        assert_eq!(runtime.get_redirect("/test"), None);
    }
}