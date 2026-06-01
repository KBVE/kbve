use std::time::Duration;

use anyhow::Result;
use thiserror::Error;
use tokio::sync::{
    Semaphore, mpsc,
    oneshot::{self, Sender as OneshotSender},
};
use tokio::time::sleep;
use tracing::{debug, info, warn};

use jedi::rcon::{RconClient, RconEndpoint, RconError};

use crate::config::Config;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const RECONNECT_BACKOFF_INITIAL: Duration = Duration::from_secs(1);
const RECONNECT_BACKOFF_MAX: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub enum RconJobError {
    #[error("rcon protocol: {0}")]
    Proto(#[from] RconError),

    #[error("rcon pool shutting down")]
    Shutdown,
}

pub struct RconJob {
    pub command: String,
    pub reply: OneshotSender<Result<String, RconJobError>>,
}

#[derive(Clone)]
pub struct RconPool {
    tx: mpsc::Sender<RconJob>,
    permits: std::sync::Arc<Semaphore>,
}

impl RconPool {
    pub async fn exec(&self, command: impl Into<String>) -> Result<String, RconJobError> {
        let _permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| RconJobError::Shutdown)?;

        let (reply_tx, reply_rx) = oneshot::channel();
        let job = RconJob {
            command: command.into(),
            reply: reply_tx,
        };
        self.tx
            .send(job)
            .await
            .map_err(|_| RconJobError::Shutdown)?;
        reply_rx.await.map_err(|_| RconJobError::Shutdown)?
    }
}

pub fn spawn(cfg: Config) -> (RconPool, tokio::task::JoinHandle<Result<()>>) {
    let (tx, rx) = mpsc::channel::<RconJob>(256);
    let permits = std::sync::Arc::new(Semaphore::new(4));
    let pool = RconPool {
        tx,
        permits: permits.clone(),
    };
    let handle = tokio::spawn(run(cfg, rx));
    (pool, handle)
}

async fn run(cfg: Config, mut rx: mpsc::Receiver<RconJob>) -> Result<()> {
    let endpoint = RconEndpoint::new(
        cfg.rcon_addr.ip().to_string(),
        cfg.rcon_addr.port(),
        cfg.rcon_password.clone(),
    );

    let mut backoff = RECONNECT_BACKOFF_INITIAL;
    let mut client: Option<RconClient> = None;

    while let Some(job) = rx.recv().await {
        if client.is_none() {
            match RconClient::connect(&endpoint, CONNECT_TIMEOUT).await {
                Ok(c) => {
                    info!(rcon = %endpoint.addr(), "rcon_pool connected");
                    client = Some(c);
                    backoff = RECONNECT_BACKOFF_INITIAL;
                }
                Err(e) => {
                    warn!(error = %e, retry_in = ?backoff, "rcon_pool connect failed");
                    let _ = job.reply.send(Err(RconJobError::Proto(e)));
                    sleep(backoff).await;
                    backoff = (backoff * 2).min(RECONNECT_BACKOFF_MAX);
                    continue;
                }
            }
        }

        let result = client.as_mut().unwrap().exec(&job.command).await;
        match &result {
            Ok(body) => debug!(bytes = body.len(), "rcon_pool exec ok"),
            Err(e) => {
                warn!(error = %e, "rcon_pool exec failed; dropping connection");
                client = None;
            }
        }
        let _ = job.reply.send(result.map_err(RconJobError::Proto));
    }

    Ok(())
}
