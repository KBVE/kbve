#[cfg(feature = "legacy-sync-db")]
pub mod character_handler;

#[cfg(feature = "legacy-sync-db")]
pub use character_handler::*;
