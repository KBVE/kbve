use std::sync::Arc;
use std::borrow::Cow;
use std::time::Duration;

use askama::Template;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn, error};

use crate::services::{
    states::{AppState, CachedValue},
    utils::{Error, Result, ResultExt},
};

// ============================================================================
// Askama Templates
// ============================================================================

#[derive(Template)]
#[template(path = "index.html")]
pub struct AstroTemplate<'a> {
    pub content: &'a str,
    pub path: &'a str,
    pub title: &'a str,
    pub description: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(
        content: &'a str, 
        path: &'a str, 
        title: &'a str, 
        description: &'a str
    ) -> Self {
        Self { 
            content, 
            path, 
            title, 
            description,
        }
    }
}

// ============================================================================
// Content Management
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentData {
    pub key: String,
    pub content: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content_type: ContentType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentType {
    Html,
    Markdown,
    Text,
}

/// External service interface for content retrieval
#[async_trait::async_trait]
pub trait ContentProvider: Send + Sync {
    async fn get_content(&self, key: &str) -> Result<ContentData>;
    async fn set_content(&self, key: &str, content: ContentData) -> Result<()>;
    async fn delete_content(&self, key: &str) -> Result<()>;
}

/// Enum wrapper for different content providers to make the trait dyn-compatible
#[derive(Clone)]
pub enum ContentProviderType {
    Mock(MockContentProvider),
    Redis(RedisContentProvider),
}

#[async_trait::async_trait]
impl ContentProvider for ContentProviderType {
    async fn get_content(&self, key: &str) -> Result<ContentData> {
        match self {
            ContentProviderType::Mock(provider) => provider.get_content(key).await,
            ContentProviderType::Redis(provider) => provider.get_content(key).await,
        }
    }
    
    async fn set_content(&self, key: &str, content: ContentData) -> Result<()> {
        match self {
            ContentProviderType::Mock(provider) => provider.set_content(key, content).await,
            ContentProviderType::Redis(provider) => provider.set_content(key, content).await,
        }
    }
    
    async fn delete_content(&self, key: &str) -> Result<()> {
        match self {
            ContentProviderType::Mock(provider) => provider.delete_content(key).await,
            ContentProviderType::Redis(provider) => provider.delete_content(key).await,
        }
    }
}

/// Mock content provider for testing
#[derive(Clone)]
pub struct MockContentProvider;

#[async_trait::async_trait]
impl ContentProvider for MockContentProvider {
    async fn get_content(&self, key: &str) -> Result<ContentData> {
        // Simulate external service delay
        tokio::time::sleep(Duration::from_millis(50)).await;
        
        match key {
            "index" | "" => Ok(ContentData {
                key: key.to_string(),
                content: "Welcome to the hyperlane application! This is the home page.".to_string(),
                title: Some("Home - Hyperlane".to_string()),
                description: Some("Welcome to the hyperlane application home page".to_string()),
                content_type: ContentType::Html,
            }),
            "about" => Ok(ContentData {
                key: key.to_string(),
                content: "About our amazing hyperlane application built with Rust and Axum.".to_string(),
                title: Some("About - Hyperlane".to_string()),
                description: Some("Learn more about the hyperlane application".to_string()),
                content_type: ContentType::Html,
            }),
            "docs" => Ok(ContentData {
                key: key.to_string(),
                content: "# Documentation\n\nThis is the documentation for the hyperlane application.".to_string(),
                title: Some("Documentation - Hyperlane".to_string()),
                description: Some("Hyperlane application documentation".to_string()),
                content_type: ContentType::Markdown,
            }),
            _ => Err(Error::NotFound(format!("Content not found for key: {}", key))),
        }
    }
    
    async fn set_content(&self, _key: &str, _content: ContentData) -> Result<()> {
        // Mock implementation - in reality you'd store to Redis/DB
        Ok(())
    }
    
    async fn delete_content(&self, _key: &str) -> Result<()> {
        // Mock implementation
        Ok(())
    }
}

/// Redis content provider (placeholder for actual implementation)
#[derive(Clone)]
pub struct RedisContentProvider {
    // Add Redis client here when implementing
    // redis_client: redis::Client,
}

impl RedisContentProvider {
    pub fn new() -> Self {
        Self {
            // Initialize Redis client
        }
    }
}

#[async_trait::async_trait]
impl ContentProvider for RedisContentProvider {
    async fn get_content(&self, key: &str) -> Result<ContentData> {
        // TODO: Implement actual Redis retrieval using your Jedi envelope system
        // let payload = serde_json::json!({ "key": key });
        // let kind = MessageKind::Redis as i32 | MessageKind::Get as i32;
        // let envelope = wrap_hybrid(kind, PayloadFormat::Json, &payload, None);
        // ... process with your temple/jedi system
        
        Err(Error::NotFound(format!("Redis provider not implemented for key: {}", key)))
    }
    
    async fn set_content(&self, _key: &str, _content: ContentData) -> Result<()> {
        // TODO: Implement Redis storage
        Ok(())
    }
    
    async fn delete_content(&self, _key: &str) -> Result<()> {
        // TODO: Implement Redis deletion
        Ok(())
    }
}

// ============================================================================
// Content App State
// ============================================================================

pub struct ContentAppState {
    pub base: Arc<AppState>,
    pub content_provider: ContentProviderType,
}

impl ContentAppState {
    pub fn new(base: Arc<AppState>, provider: ContentProviderType) -> Self {
        Self {
            base,
            content_provider: provider,
        }
    }
    
    pub fn with_mock_provider(base: Arc<AppState>) -> Self {
        Self::new(base, ContentProviderType::Mock(MockContentProvider))
    }
    
    pub fn with_redis_provider(base: Arc<AppState>) -> Self {
        Self::new(base, ContentProviderType::Redis(RedisContentProvider::new()))
    }
}

// ============================================================================
// Path Sanitization
// ============================================================================

#[inline]
fn sanitize_key(path: &str) -> Option<Cow<'_, str>> {
    if path.is_empty() {
        return Some(Cow::Borrowed("index"));
    }
    
    // Allow alphanumeric, hyphens, underscores, and forward slashes
    if path.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '/') {
        Some(Cow::Borrowed(path))
    } else {
        let mut result = String::with_capacity(path.len());
        for c in path.chars() {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '/' {
                result.push(c);
            }
        }

        if result.is_empty() {
            Some(Cow::Borrowed("index"))
        } else {
            Some(Cow::Owned(result))
        }
    }
}

// ============================================================================
// Content Retrieval with Caching
// ============================================================================

async fn get_content_from_cache(
    app_state: &AppState,
    key: &str,
) -> Option<ContentData> {
    debug!("Attempting to retrieve content from cache for key: {}", key);
    
    app_state.content_cache.get(&key.to_string())
        .and_then(|cached: CachedValue<serde_json::Value>| {
            if cached.is_valid() {
                serde_json::from_value::<ContentData>(cached.value).ok()
            } else {
                None
            }
        })
}

async fn cache_content(
    app_state: &AppState,
    key: &str,
    content: &ContentData,
    ttl: Duration,
) -> Result<()> {
    let json_value = serde_json::to_value(content)
        .map_err(|e| Error::Serialization(format!("Failed to serialize content: {}", e)))?;
    
    let cached = CachedValue::new(json_value, ttl);
    app_state.content_cache.insert(key.to_string(), cached);
    
    debug!("Cached content for key: {} with TTL: {:?}", key, ttl);
    Ok(())
}

async fn get_content(
    content_state: &ContentAppState, 
    path: &str
) -> Result<ContentData> {
    let Some(key) = sanitize_key(path) else {
        return Err(Error::BadRequest("Invalid path characters".to_string()));
    };

    // Try cache first
    if let Some(content) = get_content_from_cache(&content_state.base, &key).await {
        debug!("Content cache hit for key: {}", key);
        return Ok(content);
    }

    // Fetch from external provider
    debug!("Cache miss for key: {}, fetching from provider", key);
    let content = content_state.content_provider
        .get_content(&key)
        .await
        .context_str(&format!("Failed to fetch content for key: {}", key))?;

    // Cache the content with 5 minute TTL
    if let Err(e) = cache_content(&content_state.base, &key, &content, Duration::from_secs(300)).await {
        warn!("Failed to cache content for key {}: {}", key, e);
    }

    Ok(content)
}

// ============================================================================
// Template Rendering
// ============================================================================

fn render_template<T: Template>(template: T) -> Result<Html<String>> {
    template
        .render()
        .map(Html)
        .map_err(|e| {
            error!("Template rendering failed: {}", e);
            Error::Internal("Template rendering failed".to_string())
        })
}

fn process_content(content_data: &ContentData) -> String {
    match content_data.content_type {
        ContentType::Html => content_data.content.clone(),
        ContentType::Markdown => {
            // TODO: Add markdown processing with a crate like comrak
            // For now, just wrap in <pre> tags
            format!("<pre>{}</pre>", html_escape::encode_text(&content_data.content))
        },
        ContentType::Text => {
            format!("<pre>{}</pre>", html_escape::encode_text(&content_data.content))
        },
    }
}

// ============================================================================
// Route Handlers
// ============================================================================

pub async fn home_handler(
    State(content_state): State<Arc<ContentAppState>>,
) -> Result<impl IntoResponse> {
    debug!("Processing home page request");
    
    let content_data = get_content(&content_state, "index").await?;
    let processed_content = process_content(&content_data);
    
    let template = AstroTemplate::new(
        &processed_content,
        "/",
        content_data.title.as_deref().unwrap_or("Hyperlane"),
        content_data.description.as_deref().unwrap_or("Hyperlane application"),
    );
    
    render_template(template)
}

pub async fn askama_handler(
    State(_content_state): State<Arc<ContentAppState>>,
) -> Result<impl IntoResponse> {
    debug!("Processing askama test page request");
    
    let template = AstroTemplate::new(
        "Hello from Astro + Rust! This is a test of the Askama templating system.",
        "/askama",
        "Askama Test - Hyperlane",
        "Testing Askama templates with Hyperlane",
    );
    
    render_template(template)
}

pub async fn catch_all_handler(
    State(content_state): State<Arc<ContentAppState>>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    debug!("Processing catch-all request for path: {}", path);
    
    match get_content(&content_state, &path).await {
        Ok(content_data) => {
            let processed_content = process_content(&content_data);
            
            let default_title = format!("{} - Hyperlane", path);
            let title = content_data.title.as_deref()
                .unwrap_or(&default_title);
            let default_description = format!("Hyperlane page about {}", path);
            let description = content_data.description.as_deref()
                .unwrap_or(&default_description);
            
            let template = AstroTemplate::new(
                &processed_content,
                &path,
                title,
                description,
            );
            
            match render_template(template) {
                Ok(html) => html.into_response(),
                Err(e) => e.into_response(),
            }
        }
        Err(e) => {
            warn!("Failed to get content for path '{}': {}", path, e);
            
            // Create a 404 page
            let error_content = format!("404 - Page not found: {}", path);
            let template = AstroTemplate::new(
                &error_content,
                &path,
                "404 - Not Found",
                "The requested page could not be found",
            );
            
            match render_template(template) {
                Ok(html) => (StatusCode::NOT_FOUND, html).into_response(),
                Err(render_err) => render_err.into_response(),
            }
        }
    }
}

// ============================================================================
// API Handlers for Content Management
// ============================================================================

#[derive(Deserialize)]
pub struct CreateContentRequest {
    pub key: String,
    pub content: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content_type: Option<ContentType>,
}

pub async fn create_content_handler(
    State(content_state): State<Arc<ContentAppState>>,
    axum::Json(request): axum::Json<CreateContentRequest>,
) -> Result<impl IntoResponse> {
    debug!("Creating content for key: {}", request.key);
    
    let Some(sanitized_key) = sanitize_key(&request.key) else {
        return Err(Error::BadRequest("Invalid key characters".to_string()));
    };
    
    let content_data = ContentData {
        key: sanitized_key.to_string(),
        content: request.content,
        title: request.title,
        description: request.description,
        content_type: request.content_type.unwrap_or(ContentType::Html),
    };
    
    // Store in external service
    content_state.content_provider
        .set_content(&sanitized_key, content_data.clone())
        .await?;
    
    // Cache the new content
    cache_content(&content_state.base, &sanitized_key, &content_data, Duration::from_secs(300)).await?;
    
    Ok(axum::Json(serde_json::json!({
        "success": true,
        "message": format!("Content created for key: {}", sanitized_key),
        "data": content_data
    })))
}

pub async fn get_content_api_handler(
    State(content_state): State<Arc<ContentAppState>>,
    Path(key): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("API request for content key: {}", key);
    
    let content_data = get_content(&content_state, &key).await?;
    Ok(axum::Json(content_data))
}

pub async fn delete_content_handler(
    State(content_state): State<Arc<ContentAppState>>,
    Path(key): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("Deleting content for key: {}", key);
    
    let Some(sanitized_key) = sanitize_key(&key) else {
        return Err(Error::BadRequest("Invalid key characters".to_string()));
    };
    
    // Delete from provider
    content_state.content_provider
        .delete_content(&sanitized_key)
        .await?;
    
    // Remove from cache
    content_state.base.content_cache.remove(&sanitized_key.to_string());
    
    Ok(axum::Json(serde_json::json!({
        "success": true,
        "message": format!("Content deleted for key: {}", sanitized_key)
    })))
}

// ============================================================================
// Router Configuration
// ============================================================================

pub fn astro_router(content_state: Arc<ContentAppState>) -> Router<Arc<ContentAppState>> {
    Router::new()
        .route("/", get(home_handler))
        .route("/askama", get(askama_handler))
        .route("/{*path}", get(catch_all_handler))
        .with_state(content_state)
}

pub fn astro_api_router(content_state: Arc<ContentAppState>) -> Router<Arc<ContentAppState>> {
    Router::new()
        .route("/api/content", axum::routing::post(create_content_handler))
        .route("/api/content/{key}", get(get_content_api_handler))
        .route("/api/content/{key}", axum::routing::delete(delete_content_handler))
        .with_state(content_state)
}

pub fn create_astro_app(
    app_state: Arc<AppState>,
    content_provider: Option<ContentProviderType>,
) -> Router {
    let content_state = Arc::new(if let Some(provider) = content_provider {
        ContentAppState::new(app_state, provider)
    } else {
        ContentAppState::with_mock_provider(app_state)
    });
    
    // Create the routers and extract their routes to remove state typing
    let astro_routes = Router::new()
        .route("/", get(home_handler))
        .route("/askama", get(askama_handler))
        .route("/{*path}", get(catch_all_handler))
        .with_state(content_state.clone());
        
    let admin_routes = Router::new()
        .route("/api/content", axum::routing::post(create_content_handler))
        .route("/api/content/{key}", get(get_content_api_handler))
        .route("/api/content/{key}", axum::routing::delete(delete_content_handler))
        .with_state(content_state);
    
    // Build the final app by merging routes
    Router::new()
        .merge(astro_routes)
        .merge(admin_routes)
        .layer(crate::services::middleware::cors_layer())
        .layer(crate::services::middleware::compression_layer())
        .layer(crate::services::middleware::tracing_layer())
}