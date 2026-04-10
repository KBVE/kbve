//! Multi-viewer VNC proxy hub.
//!
//! KubeVirt only allows a single VNC client per VMI — the second client to
//! connect evicts the first. This module fans one upstream connection out
//! to any number of viewers, so multiple staff members can watch the same
//! console at the same time.
//!
//! ## Protocol notes
//!
//! RFB is stateful: the server sends ProtocolVersion, a list of security
//! types, a SecurityResult, and a ServerInit (which carries the framebuffer
//! dimensions + pixel format). Only after ServerInit can framebuffer
//! updates flow. A late joiner whose RFB client skips straight to Normal
//! mode will not understand subsequent bytes — it needs the handshake plus
//! an initial full framebuffer.
//!
//! We don't parse RFB. Instead we keep a bounded cache of every byte the
//! upstream has sent since session start; since the very first thing any
//! viewer requests after ServerInit is a full framebuffer update, the
//! cache naturally contains everything a late joiner needs (up to its
//! size cap). Late joiners replay the cache, then subscribe to a broadcast
//! channel of live upstream bytes — their client advances through its RFB
//! state machine using the replayed bytes exactly as if it were the first
//! connection.
//!
//! ## Input arbitration
//!
//! Only one viewer at a time is allowed to write to upstream (the
//! "primary"). Observer input is dropped on the floor — their RFB client's
//! handshake responses go nowhere, which is fine because the upstream is
//! already past handshake. If the primary disconnects, the next observer
//! that sends a message opportunistically becomes the new primary via
//! CAS on the `primary_id` field.
//!
//! ## Cache bound + drift
//!
//! The cache is capped at 4 MiB. For typical KubeVirt consoles that's
//! comfortably enough for handshake (< 1 KB) plus the initial full frame
//! (usually 100-500 KB for 1024x768). If the cap is hit we stop appending
//! to the cache — new joiners may see a stale framebuffer until the next
//! full refresh, but no live bytes are dropped.

use axum::body::Bytes;
use axum::extract::ws::{Message as AxumMsg, WebSocket};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::{Mutex, broadcast};
use tokio_tungstenite::tungstenite::{Message as TungMsg, client::IntoClientRequest};
use tracing::{debug, info, warn};

const MAX_CACHE_BYTES: usize = 4 * 1024 * 1024;
const BROADCAST_CAPACITY: usize = 512;

type UpstreamWs =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type UpstreamSink = futures_util::stream::SplitSink<UpstreamWs, TungMsg>;

/// Per-VM shared VNC session. Lives for as long as at least one viewer is
/// connected; torn down when the last viewer leaves.
pub struct VncSession {
    vm_key: String,
    /// All upstream-side bytes received since session start, bounded by
    /// `MAX_CACHE_BYTES`. Replayed verbatim to each new viewer before they
    /// subscribe to the live broadcast.
    cache: Mutex<Vec<u8>>,
    /// Live upstream bytes broadcast to every connected viewer.
    broadcast: broadcast::Sender<Bytes>,
    /// Write side of the upstream WebSocket. Wrapped so client tasks can
    /// forward input under a mutex. Set to `None` once the upstream closes.
    upstream_sink: Mutex<Option<UpstreamSink>>,
    /// Number of connected viewers. When it drops to zero, the session is
    /// removed from `SESSIONS` and the upstream is torn down.
    clients: AtomicUsize,
    /// Client id of the current input holder (primary). `0` = no primary;
    /// the next client to send input CASes itself in.
    primary_id: AtomicUsize,
}

static SESSIONS: OnceLock<DashMap<String, Arc<VncSession>>> = OnceLock::new();
static NEXT_CLIENT_ID: AtomicUsize = AtomicUsize::new(1);

fn sessions() -> &'static DashMap<String, Arc<VncSession>> {
    SESSIONS.get_or_init(DashMap::new)
}

/// Entry point used by the HTTP handler. Finds or creates the session for
/// this VM key, attaches this browser viewer, and runs the full client
/// lifecycle until the browser disconnects or the session tears down.
pub async fn join_session(
    vm_key: String,
    upstream_url: String,
    upstream_token: Option<String>,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::Relaxed);
    let registry = sessions();

    // Either grab the existing session for this VM or create a new one.
    // We hold a short-lived `entry` borrow to avoid two simultaneous
    // first-client requests both opening an upstream.
    let session = {
        if let Some(existing) = registry.get(&vm_key) {
            existing.clone()
        } else {
            match create_session(vm_key.clone(), upstream_url, upstream_token).await {
                Ok(s) => {
                    registry.insert(vm_key.clone(), s.clone());
                    s
                }
                Err(e) => {
                    warn!("VNC hub: failed to open upstream for {vm_key}: {e}");
                    return Err(e);
                }
            }
        }
    };

    let prior = session.clients.fetch_add(1, Ordering::Relaxed);
    // First-ever viewer becomes the primary. Subsequent joiners start as
    // observers; they can be promoted later if the primary drops.
    if prior == 0 {
        session.primary_id.store(client_id, Ordering::Relaxed);
        info!(
            "VNC hub: {} opened — client {} is primary",
            session.vm_key, client_id
        );
    } else {
        info!(
            "VNC hub: {} client {} joined as observer ({} total)",
            session.vm_key,
            client_id,
            prior + 1
        );
    }

    let result = run_client(session.clone(), client_id, browser_ws).await;

    // Cleanup. If we were the primary, clear the primary_id so the next
    // input from an observer can opportunistically take over.
    if session.primary_id.load(Ordering::Relaxed) == client_id {
        session.primary_id.store(0, Ordering::Relaxed);
    }
    let remaining = session.clients.fetch_sub(1, Ordering::Relaxed) - 1;
    if remaining == 0 {
        info!("VNC hub: {} last viewer left, tearing down", session.vm_key);
        registry.remove(&session.vm_key);
        if let Some(mut sink) = session.upstream_sink.lock().await.take() {
            let _ = sink.close().await;
        }
    }

    result
}

/// Open a fresh upstream WebSocket to KubeVirt's VNC subresource and spawn
/// the background reader task that feeds the cache + broadcast channel.
async fn create_session(
    vm_key: String,
    upstream_url: String,
    upstream_token: Option<String>,
) -> Result<Arc<VncSession>, Box<dyn std::error::Error + Send + Sync>> {
    let ws_url = upstream_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let mut request = ws_url.into_client_request()?;
    if let Some(t) = &upstream_token {
        request
            .headers_mut()
            .insert("Authorization", format!("Bearer {t}").parse()?);
    }

    let tls_connector = build_tls_connector()?;

    let (upstream_ws, _resp) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(tls_connector))
            .await?;

    let (upstream_tx, mut upstream_rx) = upstream_ws.split();
    let (broadcast_tx, _) = broadcast::channel::<Bytes>(BROADCAST_CAPACITY);

    let session = Arc::new(VncSession {
        vm_key: vm_key.clone(),
        cache: Mutex::new(Vec::new()),
        broadcast: broadcast_tx,
        upstream_sink: Mutex::new(Some(upstream_tx)),
        clients: AtomicUsize::new(0),
        primary_id: AtomicUsize::new(0),
    });

    // Upstream reader: for every byte from KubeVirt, append to the cache
    // and broadcast it. Holding the cache lock across the broadcast send
    // means a concurrent `run_client` setup cannot race into a state where
    // its snapshot + subscribe straddles a published byte (no gap, no dup).
    {
        let session = session.clone();
        tokio::spawn(async move {
            loop {
                let msg = match upstream_rx.next().await {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => {
                        warn!("VNC upstream read error for {}: {e}", session.vm_key);
                        break;
                    }
                    None => break,
                };

                let bytes: Bytes = match msg {
                    TungMsg::Binary(b) => b,
                    TungMsg::Text(t) => Bytes::copy_from_slice(t.as_str().as_bytes()),
                    TungMsg::Close(_) => break,
                    _ => continue,
                };

                let mut cache = session.cache.lock().await;
                if cache.len() + bytes.len() <= MAX_CACHE_BYTES {
                    cache.extend_from_slice(&bytes);
                }
                // Send while still holding the lock so client setup either
                // sees this byte in its snapshot OR in its live stream —
                // never both, never neither.
                let _ = session.broadcast.send(bytes);
                drop(cache);
            }
            debug!("VNC upstream reader closed for {}", session.vm_key);
        });
    }

    Ok(session)
}

/// Drive a single browser viewer: replay the handshake cache, then pump
/// bytes in both directions (with primary-only input gating) until one
/// side closes.
async fn run_client(
    session: Arc<VncSession>,
    client_id: usize,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (mut browser_tx, mut browser_rx) = browser_ws.split();

    // Atomic snapshot + subscribe: hold the cache lock across both so the
    // upstream reader cannot interleave a broadcast that we'd miss.
    let (cache_snapshot, mut live_rx) = {
        let cache = session.cache.lock().await;
        let rx = session.broadcast.subscribe();
        (cache.clone(), rx)
    };

    if !cache_snapshot.is_empty() {
        // K8s VNC uses the `binary.k8s.io` subprotocol, so bytes flow as
        // WebSocket Binary frames. Sending the whole cache in one frame is
        // fine — noVNC buffers until it has enough for the next RFB
        // message.
        if browser_tx
            .send(AxumMsg::Binary(Bytes::from(cache_snapshot)))
            .await
            .is_err()
        {
            return Ok(());
        }
    }

    // browser → upstream (primary only; observers are dropped on the floor)
    let session_input = session.clone();
    let input_task = tokio::spawn(async move {
        while let Some(msg) = browser_rx.next().await {
            let out = match msg {
                Ok(AxumMsg::Binary(data)) => TungMsg::Binary(data),
                Ok(AxumMsg::Text(t)) => TungMsg::Text(t.to_string().into()),
                Ok(AxumMsg::Close(_)) | Err(_) => break,
                _ => continue,
            };

            // Opportunistic primary promotion: if there is no current
            // primary, take the slot. Otherwise only the primary may send.
            let primary = session_input.primary_id.load(Ordering::Relaxed);
            let may_write = if primary == client_id {
                true
            } else if primary == 0 {
                session_input
                    .primary_id
                    .compare_exchange(0, client_id, Ordering::Relaxed, Ordering::Relaxed)
                    .is_ok()
            } else {
                false
            };

            if !may_write {
                continue;
            }

            let mut guard = session_input.upstream_sink.lock().await;
            match guard.as_mut() {
                Some(sink) => {
                    if sink.send(out).await.is_err() {
                        break;
                    }
                }
                None => break,
            }
        }
    });

    // upstream → browser (live byte broadcast)
    let output_task = tokio::spawn(async move {
        loop {
            match live_rx.recv().await {
                Ok(bytes) => {
                    if browser_tx.send(AxumMsg::Binary(bytes)).await.is_err() {
                        break;
                    }
                }
                // Lagged: the broadcast queue filled up. Keep going — we
                // can't recover the lost bytes, but continuing is better
                // than killing this viewer.
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(
                        "VNC hub: client {} lagged, skipped {} frames",
                        client_id, skipped
                    );
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
        let _ = browser_tx.close().await;
    });

    tokio::select! {
        _ = input_task => {},
        _ = output_task => {},
    }

    debug!(
        "VNC hub: client {} disconnected from {}",
        client_id, session.vm_key
    );
    Ok(())
}

/// Build a TLS connector that trusts the in-cluster Kubernetes CA so the
/// apiserver's self-signed cert for the VNC subresource validates.
/// Mirrors the setup from the old single-viewer `vnc_bridge`.
fn build_tls_connector()
-> Result<tokio_tungstenite::Connector, Box<dyn std::error::Error + Send + Sync>> {
    let mut root_store = rustls::RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let ca_path = std::env::var("KUBEVIRT_CA_CERT_PATH")
        .unwrap_or_else(|_| "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt".into());
    if let Ok(pem) = std::fs::read(&ca_path) {
        let certs = rustls_pemfile::certs(&mut pem.as_slice())
            .filter_map(|c| c.ok())
            .collect::<Vec<_>>();
        for cert in certs {
            let _ = root_store.add(cert);
        }
        debug!("VNC hub: loaded CA from {ca_path}");
    }
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    Ok(tokio_tungstenite::Connector::Rustls(Arc::new(config)))
}
