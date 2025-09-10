pub mod states;
pub mod utils;
pub mod middleware;
pub mod astro;
pub mod static_service;

// Re-export commonly used types
pub use states::AppState;
pub use utils::{Config, Error, Result};
pub use middleware::{cors_layer, compression_layer, tracing_layer};