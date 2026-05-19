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
