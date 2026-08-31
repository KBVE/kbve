//! Cloud provider integrations (gated behind the `aws` feature).
//!
//! Reusable data-exchange logic for cloud object storage so consumers
//! (axum-kbve HTTP shell, CLI, other services) share one implementation
//! instead of duplicating AWS SDK glue.

pub mod s3;
