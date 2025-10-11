use std::sync::Arc;
use std::time::Duration;

use axum::{
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tracing::{info, warn, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Import our services
mod services;
use services::{
    AppState,
    Config, Error, Result,
    cors_layer, compression_layer, tracing_layer,
    utils::GracefulShutdown,
    static_service::{StaticConfig, assets_router, spa_router},
    astro::create_astro_app,
    redirect_middleware,
};

// Optional jemalloc allocator
#[cfg(feature = "jemalloc")]
mod allocator {
    #[cfg(not(target_env = "msvc"))]
    use tikv_jemallocator::Jemalloc;
    #[cfg(not(target_env = "msvc"))]
    #[global_allocator]
    static GLOBAL: Jemalloc = Jemalloc;
}

// ============================================================================
// Application Configuration
// ============================================================================

#[derive(Debug, Clone)]
struct AppConfig {
    pub server: Config,
    pub static_config: StaticConfig,
    pub enable_astro: bool,
    pub enable_metrics: bool,
}

impl AppConfig {
    fn from_env() -> Self {
        let server_config = Config::from_env();
        
        let dist_path = std::env::var("DIST_PATH")
            .unwrap_or_else(|_| "./dist".to_string());
        
        let static_config = StaticConfig::new(dist_path)
            .with_max_age(Duration::from_secs(
                std::env::var("STATIC_MAX_AGE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3600)
            ))
            .with_precompression(
                std::env::var("ENABLE_PRECOMPRESSION")
                    .map(|s| s.to_lowercase() == "true")
                    .unwrap_or(true)
            )
            .with_directory_listing(
                std::env::var("ENABLE_DIRECTORY_LISTING")
                    .map(|s| s.to_lowercase() == "true")
                    .unwrap_or(false)
            );
        
        Self {
            server: server_config,
            static_config,
            enable_astro: std::env::var("ENABLE_ASTRO")
                .map(|s| s.to_lowercase() == "true")
                .unwrap_or(true),
            enable_metrics: std::env::var("ENABLE_METRICS")
                .map(|s| s.to_lowercase() == "true")
                .unwrap_or(true),
        }
    }
}

// ============================================================================
// Health Check and Status Endpoints
// ============================================================================

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "kbve-hyperlane",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

async fn status_handler(
    axum::extract::State(app_state): axum::extract::State<Arc<AppState>>,
) -> Result<impl IntoResponse> {
    let session_count = app_state.sessions.len();
    let cache_count = app_state.content_cache.len();
    let rate_limit_count = app_state.rate_limits.len();
    
    Ok(Json(serde_json::json!({
        "status": "running",
        "stats": {
            "active_sessions": session_count,
            "cached_content": cache_count,
            "rate_limits": rate_limit_count,
        },
        "uptime_seconds": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    })))
}

// ============================================================================
// Router Configuration
// ============================================================================

fn create_api_router(app_state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health_check))
        .route("/status", get(status_handler))
        .with_state(app_state)
}

fn create_app_router(config: &AppConfig) -> Router {
    let app_state = Arc::new(AppState::new());
    
    // Create the main router without state first
    let mut router = Router::new();
    
    // Add API routes with app state
    let api_router = Router::new()
        .route("/health", get(health_check))
        .route("/status", get(status_handler))
        .with_state(app_state.clone());
    
    router = router.nest("/api", api_router);
    
    // Add static asset routes (no state needed)
    router = router.nest("/_astro", assets_router(&format!("{}/_astro", config.static_config.assets_dir)));
    router = router.nest("/assets", assets_router(&format!("{}/assets", config.static_config.assets_dir)));
    router = router.nest("/chunks", assets_router(&format!("{}/chunks", config.static_config.assets_dir)));
    router = router.nest("/pagefind", assets_router(&format!("{}/pagefind", config.static_config.assets_dir)));
    
    // If Astro templates are enabled, add dynamic content routes
    if config.enable_astro {
        info!("Enabling Astro template system");
        router = router.nest("/app", create_astro_app(app_state.clone(), None));
    }
    
    // Fallback to SPA routing for everything else (serves static HTML files from Astro build)
    let spa = spa_router(&config.static_config.assets_dir, Some("index.html".to_string()));
    router = router.fallback_service(spa);
    
    // Add global middleware layers
    router = router.layer(cors_layer())
        .layer(compression_layer())
        .layer(tracing_layer())
        .layer(axum::middleware::from_fn(redirect_middleware));
    
    router
}

// ============================================================================
// Server Startup
// ============================================================================

async fn run_server(config: AppConfig) -> Result<()> {
    info!("Starting KBVE Hyperlane server");
    info!("Configuration: {:#?}", config);
    
    // Create the application router
    let app = create_app_router(&config);
    
    // Setup graceful shutdown
    let shutdown = GracefulShutdown::new();
    let mut shutdown_rx = shutdown.get_receiver();
    
    // Setup cleanup tasks
    let cleanup_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    info!("Running periodic cleanup");
                    // Cleanup would happen here if app_state was available
                }
                _ = shutdown_rx.recv() => {
                    info!("Cleanup task shutting down");
                    break;
                }
            }
        }
    });
    
    // Create TCP listener
    let bind_addr = config.server.bind_address();
    info!("Binding to address: {}", bind_addr);
    
    let listener = TcpListener::bind(&bind_addr).await
        .map_err(|e| Error::Io(e))?;
    
    info!("Server listening on {}", bind_addr);
    info!("Static files served from: {}", config.static_config.assets_dir);
    info!("Health check available at: http://{}/api/health", bind_addr);
    
    // Setup shutdown signal handling
    let shutdown_signal = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C signal handler");
        info!("Received shutdown signal");
    };
    
    // Run the server with graceful shutdown
    tokio::select! {
        result = axum::serve(listener, app) => {
            if let Err(e) = result {
                error!("Server error: {}", e);
                return Err(Error::Runtime(format!("Server failed: {}", e)));
            }
        }
        _ = shutdown_signal => {
            info!("Initiating graceful shutdown");
        }
    }
    
    // Cleanup
    cleanup_task.abort();
    shutdown.shutdown(config.server.shutdown_timeout).await;
    info!("Server shutdown complete");
    
    Ok(())
}

// ============================================================================
// Main Entry Point
// ============================================================================

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
                })
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
    
    // Load configuration
    let config = AppConfig::from_env();
    
    // Print startup banner
    info!("🚀 KBVE Hyperlane v{}", env!("CARGO_PKG_VERSION"));
    info!("📁 Serving static content from: {}", config.static_config.assets_dir);
    info!("🌐 Server will bind to: {}", config.server.bind_address());
    
    // Verify static directory exists
    if !std::path::Path::new(&config.static_config.assets_dir).exists() {
        warn!("Static directory does not exist: {}", config.static_config.assets_dir);
        warn!("Static file serving may not work correctly");
    } else {
        info!("✅ Static directory verified: {}", config.static_config.assets_dir);
    }
    
    // Check if index.html exists
    let index_path = format!("{}/index.html", config.static_config.assets_dir);
    if std::path::Path::new(&index_path).exists() {
        info!("✅ Found index.html at: {}", index_path);
    } else {
        warn!("⚠️ No index.html found at: {}", index_path);
    }
    
    // Run the server
    if let Err(e) = run_server(config).await {
        error!("Server failed to start: {}", e);
        std::process::exit(1);
    }
    
    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Check if running in development mode
fn is_development() -> bool {
    std::env::var("RUST_ENV").unwrap_or_default() == "development" ||
    std::env::var("NODE_ENV").unwrap_or_default() == "development" ||
    cfg!(debug_assertions)
}

/// Get the number of CPU cores for optimal worker configuration
fn get_worker_count() -> usize {
    std::env::var("WORKER_THREADS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(num_cpus::get)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_config_from_env() {
        // Test default configuration
        let config = AppConfig::from_env();
        assert!(config.enable_astro);
        assert!(config.enable_metrics);
        assert_eq!(config.static_config.assets_dir, "./dist");
    }
    
    #[test]
    fn test_is_development() {
        // This will be true in test mode due to cfg!(debug_assertions)
        assert!(is_development());
    }
    
    #[tokio::test]
    async fn test_health_check() {
        let _response = health_check().await;
        // Basic test to ensure the handler doesn't panic
        // In a real test, you'd check the JSON response
    }
}