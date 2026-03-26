//! GameServer deallocation (graceful shutdown + K8s resource deletion).

use super::client::AgonesClient;
use super::error::AgonesError;
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;

impl AgonesClient {
    /// Deallocate a GameServer by deleting the K8s resource.
    /// Retries on transient errors.
    #[tracing::instrument(skip(self))]
    pub async fn deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        self.check_circuit()?;

        let start = Instant::now();
        let mut last_err = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1));
                tokio::time::sleep(backoff).await;
            }

            match self.try_deallocate(game_server_name).await {
                Ok(()) => {
                    self.record_success();
                    info!(
                        game_server_name,
                        elapsed_ms = start.elapsed().as_millis() as u64,
                        "Deallocated GameServer"
                    );
                    return Ok(());
                }
                Err(e) => {
                    if !e.is_retryable() {
                        self.record_failure();
                        error!(error = %e, game_server_name, "Deallocation failed (non-retryable)");
                        return Err(e);
                    }
                    warn!(attempt, error = %e, game_server_name, "Deallocation attempt failed (retryable)");
                    last_err = Some(e);
                }
            }
        }

        self.record_failure();
        Err(last_err.unwrap_or_else(|| {
            AgonesError::Other(anyhow::anyhow!(
                "Deallocation failed after {MAX_RETRIES} retries"
            ))
        }))
    }

    /// Single deallocation attempt — deletes the GameServer K8s resource.
    async fn try_deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, game_server_name
        );

        let req = http::Request::delete(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let _: serde_json::Value =
            tokio::time::timeout(std::time::Duration::from_secs(10), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s deallocation request timed out (10s)"))??;
        Ok(())
    }
}
