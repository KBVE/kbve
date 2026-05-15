//! Agones error types and retry policy.

#[derive(Debug, thiserror::Error)]
pub enum AgonesError {
    #[error("circuit breaker open — {consecutive_failures} consecutive failures")]
    CircuitOpen { consecutive_failures: u32 },

    #[error("allocation state: {state} (expected Allocated)")]
    NotAllocated { state: String },

    #[error("K8s API error: {0}")]
    ApiError(#[from] kube::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

impl AgonesError {
    /// Whether this error is transient and the operation should be retried.
    pub fn is_retryable(&self) -> bool {
        matches!(self, AgonesError::ApiError(_))
    }
}
