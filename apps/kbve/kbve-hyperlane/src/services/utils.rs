use std::time::Duration;
use std::sync::Arc;
use std::future::Future;
use std::pin::Pin;

use tokio::runtime::{Runtime, Builder as RuntimeBuilder};
use tokio::task::JoinHandle;
use tokio::sync::{Semaphore, RwLock};
use tracing::{info, warn, error, debug};
use serde::{Deserialize, Serialize};
use futures_util::future;

// ============================================================================
// Configuration
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub worker_threads: usize,
    pub max_connections: u32,
    pub request_timeout: Duration,
    pub body_limit: usize,
    pub shutdown_timeout: Duration,
    pub keep_alive: Option<Duration>,
    pub tcp_nodelay: bool,
    pub tcp_keepalive: Option<Duration>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 3000,
            worker_threads: num_cpus::get(),
            max_connections: 1000,
            request_timeout: Duration::from_secs(30),
            body_limit: 16 * 1024 * 1024, // 16MB
            shutdown_timeout: Duration::from_secs(30),
            keep_alive: Some(Duration::from_secs(60)),
            tcp_nodelay: true,
            tcp_keepalive: Some(Duration::from_secs(60)),
        }
    }
}

impl Config {
    /// Create config from environment variables
    pub fn from_env() -> Self {
        let mut config = Self::default();
        
        if let Ok(host) = std::env::var("HOST") {
            config.host = host;
        }
        
        if let Ok(port) = std::env::var("PORT") {
            if let Ok(port) = port.parse() {
                config.port = port;
            }
        }
        
        if let Ok(threads) = std::env::var("WORKER_THREADS") {
            if let Ok(threads) = threads.parse() {
                config.worker_threads = threads;
            }
        }
        
        if let Ok(max_conn) = std::env::var("MAX_CONNECTIONS") {
            if let Ok(max_conn) = max_conn.parse() {
                config.max_connections = max_conn;
            }
        }
        
        if let Ok(timeout) = std::env::var("REQUEST_TIMEOUT") {
            if let Ok(timeout) = timeout.parse() {
                config.request_timeout = Duration::from_secs(timeout);
            }
        }
        
        if let Ok(limit) = std::env::var("BODY_LIMIT") {
            if let Ok(limit) = limit.parse() {
                config.body_limit = limit;
            }
        }
        
        config
    }
    
    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

// ============================================================================
// Runtime Utilities
// ============================================================================

/// Build a custom Tokio runtime with the given configuration
pub fn build_runtime(config: &Config) -> std::io::Result<Runtime> {
    RuntimeBuilder::new_multi_thread()
        .worker_threads(config.worker_threads)
        .enable_all()
        .thread_name("hyperlane-worker")
        .thread_stack_size(2 * 1024 * 1024) // 2MB stack
        .build()
}

/// Graceful shutdown handler
pub struct GracefulShutdown {
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
    shutdown_rx: tokio::sync::broadcast::Receiver<()>,
    tasks: Arc<RwLock<Vec<JoinHandle<()>>>>,
}

impl GracefulShutdown {
    pub fn new() -> Self {
        let (shutdown_tx, shutdown_rx) = tokio::sync::broadcast::channel(1);
        Self {
            shutdown_tx,
            shutdown_rx,
            tasks: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    pub fn get_receiver(&self) -> tokio::sync::broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }
    
    pub async fn register_task(&self, task: JoinHandle<()>) {
        self.tasks.write().await.push(task);
    }
    
    pub async fn shutdown(self, timeout: Duration) {
        info!("Initiating graceful shutdown");
        
        // Send shutdown signal
        let _ = self.shutdown_tx.send(());
        
        // Wait for all tasks with timeout - abort remaining tasks after timeout
        let mut tasks = self.tasks.write().await;
        for task in tasks.drain(..) {
            task.abort();
        }
        
        info!("All tasks signaled to shutdown");
    }
}

impl Default for GracefulShutdown {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Connection Management
// ============================================================================

/// Connection pool with semaphore-based limiting
pub struct ConnectionPool {
    semaphore: Arc<Semaphore>,
    max_connections: u32,
}

impl ConnectionPool {
    pub fn new(max_connections: u32) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_connections as usize)),
            max_connections,
        }
    }
    
    pub async fn acquire(&self) -> ConnectionGuard {
        let permit = self.semaphore.clone().acquire_owned().await
            .expect("Semaphore closed unexpectedly");
        ConnectionGuard { _permit: permit }
    }
    
    pub fn available_permits(&self) -> usize {
        self.semaphore.available_permits()
    }
    
    pub fn total_permits(&self) -> u32 {
        self.max_connections
    }
}

pub struct ConnectionGuard {
    _permit: tokio::sync::OwnedSemaphorePermit,
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    // Configuration Errors
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("Invalid configuration: {field} = {value}, reason: {reason}")]
    InvalidConfig {
        field: String,
        value: String,
        reason: String,
    },
    
    // Runtime & System Errors
    #[error("Runtime error: {0}")]
    Runtime(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("System error: {0}")]
    System(String),
    
    // Network & Connection Errors
    #[error("Connection error: {0}")]
    Connection(String),
    
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("Timeout error: operation timed out after {0:?}")]
    Timeout(Duration),
    
    // Capacity & Rate Limiting
    #[error("Capacity error: {0}")]
    Capacity(String),
    
    #[error("Rate limit exceeded: {limit} requests per {window:?}")]
    RateLimitExceeded {
        limit: u32,
        window: Duration,
    },
    
    // Authentication & Authorization
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    
    #[error("Forbidden: insufficient permissions")]
    Forbidden,
    
    #[error("Session expired")]
    SessionExpired,
    
    #[error("Invalid token: {0}")]
    InvalidToken(String),
    
    // Validation Errors
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Invalid input: {field} - {reason}")]
    InvalidInput {
        field: String,
        reason: String,
    },
    
    #[error("Missing required field: {0}")]
    MissingField(String),
    
    // Data & State Errors
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    
    #[error("State error: {0}")]
    State(String),
    
    #[error("Cache error: {0}")]
    Cache(String),
    
    // Serialization Errors
    #[error("Serialization error: {0}")]
    Serialization(String),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    
    // Database Errors (if you add a database later)
    #[error("Database error: {0}")]
    Database(String),
    
    // External Service Errors
    #[error("External service error: {service} - {message}")]
    ExternalService {
        service: String,
        message: String,
    },
    
    // HTTP/Request Errors
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("Method not allowed: {method}")]
    MethodNotAllowed {
        method: String,
    },
    
    #[error("Content type not supported: {content_type}")]
    UnsupportedContentType {
        content_type: String,
    },
    
    #[error("Payload too large: {size} bytes exceeds limit of {limit} bytes")]
    PayloadTooLarge {
        size: usize,
        limit: usize,
    },
    
    // Generic/Catch-all
    #[error("Internal server error: {0}")]
    Internal(String),
    
    #[error("Other error: {0}")]
    Other(String),
    
    // Allow wrapping other error types
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl Error {
    /// Get HTTP status code for the error
    pub fn status_code(&self) -> u16 {
        match self {
            // 400 Bad Request
            Error::BadRequest(_) |
            Error::Validation(_) |
            Error::InvalidInput { .. } |
            Error::MissingField(_) |
            Error::InvalidToken(_) => 400,
            
            // 401 Unauthorized
            Error::AuthenticationFailed(_) |
            Error::Unauthorized(_) |
            Error::SessionExpired => 401,
            
            // 403 Forbidden
            Error::Forbidden => 403,
            
            // 404 Not Found
            Error::NotFound(_) => 404,
            
            // 405 Method Not Allowed
            Error::MethodNotAllowed { .. } => 405,
            
            // 409 Conflict
            Error::AlreadyExists(_) => 409,
            
            // 413 Payload Too Large
            Error::PayloadTooLarge { .. } => 413,
            
            // 415 Unsupported Media Type
            Error::UnsupportedContentType { .. } => 415,
            
            // 429 Too Many Requests
            Error::RateLimitExceeded { .. } => 429,
            
            // 500 Internal Server Error
            Error::Config(_) |
            Error::InvalidConfig { .. } |
            Error::Runtime(_) |
            Error::System(_) |
            Error::Io(_) |
            Error::State(_) |
            Error::Cache(_) |
            Error::Database(_) |
            Error::Internal(_) |
            Error::Serialization(_) |
            Error::Json(_) |
            Error::Anyhow(_) => 500,
            
            // 502 Bad Gateway
            Error::ExternalService { .. } => 502,
            
            // 503 Service Unavailable
            Error::Capacity(_) |
            Error::Connection(_) |
            Error::Network(_) => 503,
            
            // 504 Gateway Timeout
            Error::Timeout(_) => 504,
            
            // Default
            Error::Other(_) => 500,
        }
    }
    
    /// Check if error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Error::Timeout(_) |
            Error::Connection(_) |
            Error::Network(_) |
            Error::ExternalService { .. } |
            Error::Capacity(_) |
            Error::RateLimitExceeded { .. }
        )
    }
    
    /// Check if error is client error (4xx)
    pub fn is_client_error(&self) -> bool {
        let code = self.status_code();
        code >= 400 && code < 500
    }
    
    /// Check if error is server error (5xx)
    pub fn is_server_error(&self) -> bool {
        self.status_code() >= 500
    }
}

/// Extension trait for Result types to add context
pub trait ResultExt<T> {
    fn context_str(self, msg: &str) -> Result<T>;
    fn with_context<F>(self, f: F) -> Result<T>
    where
        F: FnOnce() -> String;
}

impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    fn context_str(self, msg: &str) -> Result<T> {
        self.map_err(|e| Error::Other(format!("{}: {}", msg, e)))
    }
    
    fn with_context<F>(self, f: F) -> Result<T>
    where
        F: FnOnce() -> String,
    {
        self.map_err(|e| Error::Other(format!("{}: {}", f(), e)))
    }
}

// ============================================================================
// Performance Monitoring
// ============================================================================

#[derive(Debug, Clone)]
pub struct Metrics {
    pub requests_total: Arc<std::sync::atomic::AtomicU64>,
    pub requests_failed: Arc<std::sync::atomic::AtomicU64>,
    pub active_connections: Arc<std::sync::atomic::AtomicU32>,
    pub bytes_sent: Arc<std::sync::atomic::AtomicU64>,
    pub bytes_received: Arc<std::sync::atomic::AtomicU64>,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            requests_total: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            requests_failed: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            active_connections: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            bytes_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            bytes_received: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }
    
    pub fn increment_requests(&self) {
        self.requests_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn increment_failed(&self) {
        self.requests_failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn add_connection(&self) {
        self.active_connections.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn remove_connection(&self) {
        self.active_connections.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn add_bytes_sent(&self, bytes: u64) {
        self.bytes_sent.fetch_add(bytes, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn add_bytes_received(&self, bytes: u64) {
        self.bytes_received.fetch_add(bytes, std::sync::atomic::Ordering::Relaxed);
    }
    
    pub fn get_stats(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            requests_total: self.requests_total.load(std::sync::atomic::Ordering::Relaxed),
            requests_failed: self.requests_failed.load(std::sync::atomic::Ordering::Relaxed),
            active_connections: self.active_connections.load(std::sync::atomic::Ordering::Relaxed),
            bytes_sent: self.bytes_sent.load(std::sync::atomic::Ordering::Relaxed),
            bytes_received: self.bytes_received.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricsSnapshot {
    pub requests_total: u64,
    pub requests_failed: u64,
    pub active_connections: u32,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

// ============================================================================
// Task Execution Utilities
// ============================================================================

/// Execute a task with timeout
pub async fn with_timeout<F, T>(duration: Duration, future: F) -> Result<T>
where
    F: Future<Output = T>,
{
    tokio::time::timeout(duration, future)
        .await
        .map_err(|_| Error::Timeout(duration))
}

/// Retry logic with exponential backoff
pub async fn retry_with_backoff<F, Fut, T, E>(
    mut f: F,
    max_retries: u32,
    initial_delay: Duration,
    max_delay: Duration,
) -> std::result::Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = std::result::Result<T, E>>,
    E: std::fmt::Display,
{
    let mut delay = initial_delay;
    let mut attempts = 0;
    
    loop {
        match f().await {
            Ok(value) => return Ok(value),
            Err(err) => {
                attempts += 1;
                if attempts >= max_retries {
                    error!("Max retries ({}) exceeded: {}", max_retries, err);
                    return Err(err);
                }
                
                warn!("Attempt {} failed: {}, retrying in {:?}", attempts, err, delay);
                tokio::time::sleep(delay).await;
                
                // Exponential backoff with cap
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}

/// Spawn a monitored task
pub fn spawn_monitored<F>(name: String, future: F) -> JoinHandle<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        debug!("Task '{}' started", name);
        future.await;
        debug!("Task '{}' completed", name);
    })
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Format bytes as human-readable string
pub fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.2} {}", size, UNITS[unit_index])
}

/// Get current timestamp in milliseconds
pub fn timestamp_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as u64
}

/// Check if a port is available
pub async fn is_port_available(host: &str, port: u16) -> bool {
    tokio::net::TcpListener::bind(format!("{}:{}", host, port))
        .await
        .is_ok()
}

// ============================================================================
// Tests
// ============================================================================

// #[cfg(test)]
// mod tests {
//     use super::*;
    
//     #[test]
//     fn test_config_default() {
//         let config = Config::default();
//         assert_eq!(config.port, 8080);
//         assert_eq!(config.host, "127.0.0.1");
//         assert_eq!(config.bind_address(), "127.0.0.1:8080");
//     }
    
//     #[test]
//     fn test_format_bytes() {
//         assert_eq!(format_bytes(512), "512.00 B");
//         assert_eq!(format_bytes(1024), "1.00 KB");
//         assert_eq!(format_bytes(1536), "1.50 KB");
//         assert_eq!(format_bytes(1048576), "1.00 MB");
//     }
    
//     #[tokio::test]
//     async fn test_with_timeout() {
//         let result = with_timeout(Duration::from_millis(100), async {
//             tokio::time::sleep(Duration::from_millis(50)).await;
//             42
//         }).await;
        
//         assert!(result.is_ok());
//         assert_eq!(result.unwrap(), 42);
        
//         let result = with_timeout(Duration::from_millis(50), async {
//             tokio::time::sleep(Duration::from_millis(100)).await;
//             42
//         }).await;
        
//         assert!(result.is_err());
//     }
    
//     #[tokio::test]
//     async fn test_retry_with_backoff() {
//         let mut attempts = 0;
//         let result = retry_with_backoff(
//             || {
//                 attempts += 1;
//                 async move {
//                     if attempts < 3 {
//                         Err("Failed")
//                     } else {
//                         Ok(42)
//                     }
//                 }
//             },
//             5,
//             Duration::from_millis(10),
//             Duration::from_millis(100),
//         ).await;
        
//         assert!(result.is_ok());
//         assert_eq!(result.unwrap(), 42);
//     }
    
//     #[test]
//     fn test_metrics() {
//         let metrics = Metrics::new();
        
//         metrics.increment_requests();
//         metrics.increment_requests();
//         metrics.increment_failed();
//         metrics.add_connection();
//         metrics.add_bytes_sent(1024);
//         metrics.add_bytes_received(2048);
        
//         let snapshot = metrics.get_stats();
//         assert_eq!(snapshot.requests_total, 2);
//         assert_eq!(snapshot.requests_failed, 1);
//         assert_eq!(snapshot.active_connections, 1);
//         assert_eq!(snapshot.bytes_sent, 1024);
//         assert_eq!(snapshot.bytes_received, 2048);
//     }
// }