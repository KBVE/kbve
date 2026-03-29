//! Agones GameServer lifecycle management module.
//!
//! Handles the full lifecycle: allocation → tracking → health → deallocation.
//! Uses kube-rs for K8s API access with retry + circuit breaker.

mod allocate;
mod client;
mod deallocate;
mod error;
pub mod fleet;
pub mod pipeline;
pub mod sdk;
pub mod watcher;

pub use allocate::AllocationResult;
pub use client::AgonesClient;
pub use error::AgonesError;
pub use pipeline::AllocationPipeline;
