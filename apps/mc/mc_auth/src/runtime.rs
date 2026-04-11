//! Runtime hosting the Tokio executor + HTTP client used by the auth worker.
//!
//! Unlike `behavior_statetree` (which runs a Bevy ECS tick loop on a dedicated
//! OS thread), the auth runtime is request/response. The JVM side submits
//! `AuthJob`s via `authenticate()` / `verify_link()`, a Tokio worker task
//! services them against the Supabase client, and any resulting
//! `PlayerEvent`s are pushed into an outbound channel that the JVM drains via
//! `pollEvents()` each server tick.
//!
//! This indirection keeps JNI calls non-blocking — the JVM thread never
//! waits on an HTTP round-trip.

use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender, bounded};
use tokio::runtime::Runtime;
use tracing::{debug, warn};

use crate::agones;
use crate::supabase::{LookupOutcome, SupabaseClient, VerifyOutcome};
use crate::types::{AuthJob, AuthResponse, PlayerEvent};

const REQUEST_CHANNEL_SIZE: usize = 256;
const EVENT_CHANNEL_SIZE: usize = 256;

/// Owns the Tokio runtime and the JNI channels.
pub struct AuthRuntime {
    request_tx: Sender<AuthJob>,
    event_rx: Receiver<PlayerEvent>,
    /// Kept alive for the lifetime of the plugin; dropping it shuts the
    /// worker task down.
    #[allow(dead_code)]
    tokio: Runtime,
}

impl AuthRuntime {
    /// Start a multi-threaded Tokio runtime and spawn the worker task.
    pub fn start() -> Self {
        let (request_tx, request_rx) = bounded::<AuthJob>(REQUEST_CHANNEL_SIZE);
        let (event_tx, event_rx) = bounded::<PlayerEvent>(EVENT_CHANNEL_SIZE);

        let tokio = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("mc-auth-worker")
            .enable_all()
            .build()
            .expect("failed to build mc_auth Tokio runtime");

        tokio.spawn(async move {
            worker_loop(request_rx, event_tx).await;
        });

        // Spawn the Agones SDK heartbeat task — Ready() once + Health() loop.
        // Falls through gracefully if no Agones sidecar is reachable (local dev).
        tokio.spawn(agones::run_health_loop());

        debug!("mc_auth Tokio runtime initialized (auth worker + Agones heartbeat)");

        Self {
            request_tx,
            event_rx,
            tokio,
        }
    }

    /// Best-effort graceful shutdown — sends `Shutdown()` to the Agones
    /// sidecar so the Fleet drains the gameserver gracefully. Blocks the
    /// caller for up to ~1s.
    pub fn shutdown_blocking(&self) {
        self.tokio.block_on(async {
            tokio::time::timeout(std::time::Duration::from_secs(1), agones::shutdown())
                .await
                .ok();
        });
    }

    /// Enqueue an inbound auth job. Returns an immediate ack response.
    ///
    /// Back-pressure: if the inbound channel is full we log a warning and
    /// return an error ack — the JVM side can decide whether to retry next
    /// tick. We never block the JVM thread.
    pub fn submit(&self, job: AuthJob) -> AuthResponse {
        if self.request_tx.try_send(job).is_err() {
            warn!("mc_auth request channel full — dropping auth job");
            return AuthResponse::error("request channel full");
        }
        AuthResponse::queued()
    }

    /// Drain all pending outbound events. Called each server tick.
    pub fn poll_events(&self) -> Vec<PlayerEvent> {
        let mut events = Vec::new();
        while let Ok(event) = self.event_rx.try_recv() {
            events.push(event);
        }
        events
    }
}

/// Long-running worker task: pulls jobs off the crossbeam channel and hands
/// them to the Supabase client. Any failure is logged and downgraded to a
/// graceful `Unlinked` / `AuthFailure` event so players are never blocked.
async fn worker_loop(request_rx: Receiver<AuthJob>, event_tx: Sender<PlayerEvent>) {
    let supabase = Arc::new(SupabaseClient::from_env());
    if !supabase.is_enabled() {
        warn!("mc_auth worker: supabase client disabled — all lookups will be treated as Unlinked");
    }

    loop {
        // crossbeam's `recv` is blocking — yield to Tokio via spawn_blocking
        // so the worker thread isn't starved of other async work.
        let recv_result = {
            let rx = request_rx.clone();
            tokio::task::spawn_blocking(move || rx.recv()).await
        };

        let job = match recv_result {
            Ok(Ok(job)) => job,
            Ok(Err(_)) => {
                debug!("mc_auth request channel closed — worker exiting");
                return;
            }
            Err(join_err) => {
                warn!(?join_err, "mc_auth recv task panicked");
                continue;
            }
        };

        // Handle each job in its own spawned task so slow calls don't
        // head-of-line block the worker queue.
        let supabase = Arc::clone(&supabase);
        let tx = event_tx.clone();
        tokio::spawn(async move {
            handle_job(job, supabase.as_ref(), &tx).await;
        });
    }
}

async fn handle_job(job: AuthJob, supabase: &SupabaseClient, event_tx: &Sender<PlayerEvent>) {
    let event = match job {
        AuthJob::Authenticate {
            player_uuid,
            username,
        } => {
            debug!(%player_uuid, %username, "mc_auth: processing authenticate");
            match supabase.lookup_player_link(&player_uuid).await {
                LookupOutcome::Linked { supabase_user_id } => PlayerEvent::AlreadyLinked {
                    player_uuid,
                    supabase_user_id,
                },
                LookupOutcome::Unlinked => PlayerEvent::Unlinked {
                    player_uuid,
                    username,
                },
                LookupOutcome::Failure { reason } => {
                    warn!(%player_uuid, %reason, "mc_auth: lookup failed, treating as unlinked");
                    // Graceful: still emit Unlinked so the player isn't
                    // locked out on transport errors, plus an AuthFailure
                    // so the Java side can log / surface the underlying
                    // cause without impacting the player experience.
                    if event_tx
                        .try_send(PlayerEvent::AuthFailure {
                            player_uuid: player_uuid.clone(),
                            reason,
                        })
                        .is_err()
                    {
                        warn!("mc_auth: event channel full dropping AuthFailure");
                    }
                    PlayerEvent::Unlinked {
                        player_uuid,
                        username,
                    }
                }
            }
        }
        AuthJob::VerifyLink { player_uuid, code } => {
            debug!(%player_uuid, code, "mc_auth: processing verify_link");
            match supabase.verify_link(&player_uuid, code).await {
                VerifyOutcome::Verified { supabase_user_id } => PlayerEvent::LinkVerified {
                    player_uuid,
                    supabase_user_id,
                },
                VerifyOutcome::Rejected => PlayerEvent::LinkRejected {
                    player_uuid,
                    reason: "wrong, expired, or too many attempts".to_string(),
                },
                VerifyOutcome::Failure { reason } => {
                    warn!(%player_uuid, %reason, "mc_auth: verify failed");
                    PlayerEvent::LinkRejected {
                        player_uuid,
                        reason: format!("temporary error — try again in a moment ({reason})"),
                    }
                }
            }
        }
    };

    if event_tx.try_send(event).is_err() {
        warn!("mc_auth: event channel full dropping primary event");
    }
}
