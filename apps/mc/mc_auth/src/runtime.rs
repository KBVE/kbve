//! Runtime hosting the Tokio executor + HTTP client used by the auth worker.
//!
//! Unlike `behavior_statetree` (which runs a Bevy ECS tick loop on a dedicated
//! OS thread), the auth runtime is request/response. Each `authenticate()`
//! call sends an `AuthRequest` into an inbound channel, a Tokio task services
//! it against the (stub) Supabase client, and any resulting `PlayerEvent`s are
//! pushed into an outbound channel that the JVM drains via `pollEvents()`.
//!
//! This indirection keeps the JNI calls non-blocking — the JVM thread never
//! waits on an HTTP round-trip, even once the real Supabase integration lands.

use crossbeam_channel::{Receiver, Sender, bounded};
use tokio::runtime::Runtime;
use tracing::{debug, warn};

use crate::agones;
use crate::supabase::SupabaseClient;
use crate::types::{AuthRequest, AuthResponse, PlayerEvent};

const REQUEST_CHANNEL_SIZE: usize = 256;
const EVENT_CHANNEL_SIZE: usize = 256;

/// Owns the Tokio runtime and the JNI channels.
pub struct AuthRuntime {
    request_tx: Sender<AuthRequest>,
    event_rx: Receiver<PlayerEvent>,
    /// Kept alive for the lifetime of the plugin; dropping it shuts the
    /// worker task down.
    #[allow(dead_code)]
    tokio: Runtime,
}

impl AuthRuntime {
    /// Start a multi-threaded Tokio runtime and spawn the worker task.
    pub fn start() -> Self {
        let (request_tx, request_rx) = bounded::<AuthRequest>(REQUEST_CHANNEL_SIZE);
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

    /// Enqueue an inbound auth request. Returns an immediate stub response.
    ///
    /// Back-pressure: if the inbound channel is full we still return a
    /// `pending` stub but log a warning — the JVM side can decide whether to
    /// retry next tick.
    pub fn authenticate(&self, request: AuthRequest) -> AuthResponse {
        if self.request_tx.try_send(request).is_err() {
            warn!("mc_auth request channel full — dropping auth request");
            return AuthResponse::error("request channel full");
        }
        AuthResponse::pending_stub()
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

/// Long-running worker task: pulls requests off the crossbeam channel and
/// hands them to the (stub) Supabase client. Real HTTP work lives here once
/// the stub is replaced.
async fn worker_loop(request_rx: Receiver<AuthRequest>, event_tx: Sender<PlayerEvent>) {
    // Placeholder credentials — real values will come from env / config.
    let supabase = SupabaseClient::new(
        "https://stub.supabase.co".to_string(),
        "stub-anon-key".to_string(),
    );

    loop {
        // crossbeam's `recv` is blocking — yield to Tokio via spawn_blocking
        // so the worker thread isn't starved of other async work.
        let recv_result = {
            let rx = request_rx.clone();
            tokio::task::spawn_blocking(move || rx.recv()).await
        };

        let request = match recv_result {
            Ok(Ok(req)) => req,
            Ok(Err(_)) => {
                debug!("mc_auth request channel closed — worker exiting");
                return;
            }
            Err(join_err) => {
                warn!(?join_err, "mc_auth recv task panicked");
                continue;
            }
        };

        let AuthRequest {
            player_uuid,
            username,
        } = request;

        debug!(%player_uuid, %username, "mc_auth worker: processing auth request");

        let lookup = supabase.lookup_player_link(&player_uuid).await;
        let event = match lookup.status.as_str() {
            "linked" => PlayerEvent::AuthSuccess {
                player_uuid: player_uuid.clone(),
                supabase_user_id: lookup
                    .supabase_user_id
                    .unwrap_or_else(|| "unknown".to_string()),
            },
            "error" => PlayerEvent::AuthFailure {
                player_uuid: player_uuid.clone(),
                reason: lookup.error.unwrap_or_else(|| "unknown".to_string()),
            },
            // `pending` / `unlinked` / anything else → issue a new link code.
            _ => {
                let link_code = supabase.create_link_code(&player_uuid).await;
                PlayerEvent::LinkRequested {
                    player_uuid: player_uuid.clone(),
                    username,
                    link_code,
                }
            }
        };

        if event_tx.try_send(event).is_err() {
            warn!(
                %player_uuid,
                "mc_auth event channel full — dropping player event"
            );
        }
    }
}
