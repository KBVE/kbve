use super::client::AgonesClient;
use super::error::AgonesError;
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;

/// A DELETE against an already-gone GameServer (404) is the *desired* end state, not a failure.
/// The reaper exists to catch servers the watcher missed, and those have usually already
/// self-shut (`SDK.Shutdown()`, the primary path) — so 404 is the common case, not an edge.
/// Treating it as an error would (a) retry pointlessly, (b) trip the shared Agones circuit
/// breaker via `record_failure`, denying real player allocations, and (c) leave the row
/// `status>0` to be re-reaped forever. Idempotent delete avoids all three.
fn is_not_found(err: &kube::Error) -> bool {
    matches!(err, kube::Error::Api(resp) if resp.code == 404)
}

impl AgonesClient {
    /// Retries transient K8s errors with exponential backoff up to `MAX_RETRIES`.
    #[tracing::instrument(skip(self))]
    pub async fn deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        self.check_circuit_dealloc()?;

        let start = Instant::now();
        let mut last_err = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1));
                tokio::time::sleep(backoff).await;
            }

            match self.try_deallocate(game_server_name).await {
                Ok(()) => {
                    self.record_dealloc_success();
                    info!(
                        game_server_name,
                        elapsed_ms = start.elapsed().as_millis() as u64,
                        "Deallocated GameServer"
                    );
                    return Ok(());
                }
                Err(e) => {
                    if !e.is_retryable() {
                        self.record_dealloc_failure();
                        error!(error = %e, game_server_name, "Deallocation failed (non-retryable)");
                        return Err(e);
                    }
                    warn!(attempt, error = %e, game_server_name, "Deallocation attempt failed (retryable)");
                    last_err = Some(e);
                }
            }
        }

        self.record_dealloc_failure();
        Err(last_err.unwrap_or_else(|| {
            AgonesError::Other(anyhow::anyhow!(
                "Deallocation failed after {MAX_RETRIES} retries"
            ))
        }))
    }

    async fn try_deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, game_server_name
        );

        let req = http::Request::delete(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let resp = tokio::time::timeout(
            super::client::api_timeout(),
            self.client.request::<serde_json::Value>(req),
        )
        .await
        .map_err(|_| anyhow::anyhow!("K8s deallocation request timed out (10s)"))?;

        match resp {
            Ok(_) => Ok(()),
            // Already gone — idempotent success, not a failure (see `is_not_found`).
            Err(e) if is_not_found(&e) => {
                info!(
                    game_server_name,
                    "Deallocate: GameServer already gone (404) — treating as success"
                );
                Ok(())
            }
            Err(e) => Err(AgonesError::ApiError(e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_err(code: u16) -> kube::Error {
        kube::Error::Api(Box::new(kube::core::Status {
            code,
            ..Default::default()
        }))
    }

    #[test]
    fn not_found_is_detected() {
        assert!(is_not_found(&api_err(404)));
    }

    #[test]
    fn other_api_errors_are_not_treated_as_gone() {
        assert!(!is_not_found(&api_err(409)));
        assert!(!is_not_found(&api_err(500)));
    }
}
