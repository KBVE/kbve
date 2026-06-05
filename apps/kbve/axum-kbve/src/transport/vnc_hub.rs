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
//! Every viewer's RFB client messages — keystrokes, mouse moves, clipboard
//! cuts, SetEncodings, FBUR, etc. — are forwarded to the single upstream
//! connection. The upstream `upstream_sink` mutex serializes concurrent
//! writes so the RFB framing on the wire stays coherent. From KubeVirt's
//! point of view there is still one RFB client; from the staff side every
//! viewer can type and click.
//!
//! Concurrent input (two cursors moving at once) lands on the same shared
//! desktop and will fight on the wire — this is the same model used by
//! shared screen-control tools and is the intended behaviour for pair
//! debug. The `primary_id` field is kept as an informational marker of
//! who joined first (surfaced in the viewer UI) but no longer gates input.
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
use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::{Mutex, broadcast};
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::{Message as TungMsg, client::IntoClientRequest};
use tracing::{debug, info, warn};

const MAX_CACHE_BYTES: usize = 4 * 1024 * 1024;
const BROADCAST_CAPACITY: usize = 512;

type UpstreamWs =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type UpstreamSink = futures_util::stream::SplitSink<UpstreamWs, TungMsg>;

/// Per-VM shared VNC session. Torn down when the last viewer leaves.
pub struct VncSession {
    vm_key: String,
    /// Replay buffer bounded by `MAX_CACHE_BYTES`; new viewers replay this
    /// before subscribing to the live broadcast.
    cache: Mutex<Vec<u8>>,
    broadcast: broadcast::Sender<Bytes>,
    upstream_sink: Mutex<Option<UpstreamSink>>,
    clients: AtomicUsize,
    /// `0` = no primary; the next client to send input CASes itself in.
    primary_id: AtomicUsize,
}

static SESSIONS: OnceLock<DashMap<String, Arc<VncSession>>> = OnceLock::new();
static NEXT_CLIENT_ID: AtomicUsize = AtomicUsize::new(1);

fn sessions() -> &'static DashMap<String, Arc<VncSession>> {
    SESSIONS.get_or_init(DashMap::new)
}

/// Snapshot of a VNC session's state, returned by the info endpoint.
#[derive(Serialize)]
pub struct SessionInfo {
    pub vm_key: String,
    pub viewers: usize,
    pub has_primary: bool,
}

/// Query session info for a specific VM key. Returns `None` if no active
/// session exists (i.e. no one is currently connected to that VM's VNC).
pub fn get_session_info(vm_key: &str) -> Option<SessionInfo> {
    let registry = sessions();
    registry.get(vm_key).map(|session| SessionInfo {
        vm_key: session.vm_key.clone(),
        viewers: session.clients.load(Ordering::Relaxed),
        has_primary: session.primary_id.load(Ordering::Relaxed) != 0,
    })
}

/// List all active VNC sessions with their viewer counts.
pub fn list_sessions() -> Vec<SessionInfo> {
    let registry = sessions();
    registry
        .iter()
        .map(|entry| {
            let session = entry.value();
            SessionInfo {
                vm_key: session.vm_key.clone(),
                viewers: session.clients.load(Ordering::Relaxed),
                has_primary: session.primary_id.load(Ordering::Relaxed) != 0,
            }
        })
        .collect()
}

/// Per-upstream connection knobs supplied by the caller.
pub struct UpstreamConfig {
    pub auth_header: Option<HeaderValue>,
    pub origin: Option<HeaderValue>,
    pub subprotocols: Option<HeaderValue>,
    pub tls_connector: tokio_tungstenite::Connector,
}

impl UpstreamConfig {
    /// KubeVirt VNC subresource defaults.
    pub fn kubevirt(
        bearer_token: Option<String>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let auth_header = match bearer_token {
            Some(t) => Some(HeaderValue::from_str(&format!("Bearer {t}"))?),
            None => None,
        };
        Ok(Self {
            auth_header,
            origin: None,
            subprotocols: None,
            tls_connector: build_kubevirt_tls_connector()?,
        })
    }
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
    let config = UpstreamConfig::kubevirt(upstream_token)?;
    join_session_with_config(vm_key, upstream_url, config, browser_ws).await
}

pub async fn join_session_with_config(
    vm_key: String,
    upstream_url: String,
    config: UpstreamConfig,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::Relaxed);
    let registry = sessions();

    let session = {
        if let Some(existing) = registry.get(&vm_key) {
            existing.clone()
        } else {
            match create_session(vm_key.clone(), upstream_url, config).await {
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

/// Open a fresh upstream WebSocket to the configured backend and spawn
/// the background reader task that feeds the cache + broadcast channel.
async fn create_session(
    vm_key: String,
    upstream_url: String,
    config: UpstreamConfig,
) -> Result<Arc<VncSession>, Box<dyn std::error::Error + Send + Sync>> {
    let ws_url = upstream_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let mut request = ws_url.into_client_request()?;
    let headers = request.headers_mut();
    if let Some(v) = config.auth_header {
        headers.insert("Authorization", v);
    }
    if let Some(v) = config.origin {
        headers.insert("Origin", v);
    }
    if let Some(v) = config.subprotocols {
        headers.insert("Sec-WebSocket-Protocol", v);
    }

    let (upstream_ws, _resp) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(config.tls_connector),
    )
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
                let _ = session.broadcast.send(bytes);
                drop(cache);
            }
            debug!("VNC upstream reader closed for {}", session.vm_key);

            sessions().remove_if(&session.vm_key, |_, s| Arc::ptr_eq(s, &session));
            if let Some(mut sink) = session.upstream_sink.lock().await.take() {
                let _ = sink.close().await;
            }
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
        // K8s VNC uses the binary.k8s.io subprotocol; one Binary frame is
        // fine because noVNC re-frames internally on RFB boundaries.
        if browser_tx
            .send(AxumMsg::Binary(Bytes::from(cache_snapshot)))
            .await
            .is_err()
        {
            return Ok(());
        }
    }

    let session_input = session.clone();
    let input_task = tokio::spawn(async move {
        while let Some(msg) = browser_rx.next().await {
            let out = match msg {
                Ok(AxumMsg::Binary(data)) => TungMsg::Binary(data),
                Ok(AxumMsg::Text(t)) => TungMsg::Text(t.to_string().into()),
                Ok(AxumMsg::Close(_)) | Err(_) => break,
                _ => continue,
            };

            // Multi-master: every viewer's input flows to upstream. The
            // sink mutex serializes concurrent writes so RFB framing on
            // the wire stays intact even when two viewers type at once.
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

    let output_task = tokio::spawn(async move {
        loop {
            match live_rx.recv().await {
                Ok(bytes) => {
                    if browser_tx.send(AxumMsg::Binary(bytes)).await.is_err() {
                        break;
                    }
                }
                // Continuing on lag beats killing the viewer; lost bytes
                // are unrecoverable but the next full refresh resyncs.
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
fn build_kubevirt_tls_connector()
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

/// TLS connector that accepts any cert. Cluster-internal use only.
pub fn build_accept_any_tls_connector()
-> Result<tokio_tungstenite::Connector, Box<dyn std::error::Error + Send + Sync>> {
    use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
    use rustls::{DigitallySignedStruct, Error as TlsError, SignatureScheme};

    #[derive(Debug)]
    struct AcceptAnyCert;

    impl ServerCertVerifier for AcceptAnyCert {
        fn verify_server_cert(
            &self,
            _end_entity: &CertificateDer<'_>,
            _intermediates: &[CertificateDer<'_>],
            _server_name: &ServerName<'_>,
            _ocsp: &[u8],
            _now: UnixTime,
        ) -> Result<ServerCertVerified, TlsError> {
            Ok(ServerCertVerified::assertion())
        }
        fn verify_tls12_signature(
            &self,
            _message: &[u8],
            _cert: &CertificateDer<'_>,
            _dss: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, TlsError> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn verify_tls13_signature(
            &self,
            _message: &[u8],
            _cert: &CertificateDer<'_>,
            _dss: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, TlsError> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            vec![
                SignatureScheme::RSA_PKCS1_SHA256,
                SignatureScheme::RSA_PKCS1_SHA384,
                SignatureScheme::RSA_PKCS1_SHA512,
                SignatureScheme::ECDSA_NISTP256_SHA256,
                SignatureScheme::ECDSA_NISTP384_SHA384,
                SignatureScheme::ECDSA_NISTP521_SHA512,
                SignatureScheme::RSA_PSS_SHA256,
                SignatureScheme::RSA_PSS_SHA384,
                SignatureScheme::RSA_PSS_SHA512,
                SignatureScheme::ED25519,
            ]
        }
    }

    let config = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAnyCert))
        .with_no_client_auth();
    Ok(tokio_tungstenite::Connector::Rustls(Arc::new(config)))
}
