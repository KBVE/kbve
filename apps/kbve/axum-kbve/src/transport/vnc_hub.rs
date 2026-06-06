use axum::body::Bytes;
use axum::extract::ws::{Message as AxumMsg, WebSocket};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Mutex as StdMutex;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, broadcast};
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::{Message as TungMsg, client::IntoClientRequest};
use tracing::{debug, info, warn};

const MAX_CACHE_BYTES: usize = 4 * 1024 * 1024;
const BROADCAST_CAPACITY: usize = 512;

type UpstreamWs =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type UpstreamSink = futures_util::stream::SplitSink<UpstreamWs, TungMsg>;

pub struct VncSession {
    vm_key: String,
    cache: Mutex<Vec<u8>>,
    broadcast: broadcast::Sender<Bytes>,
    upstream_sink: Mutex<Option<UpstreamSink>>,
    clients: AtomicUsize,
    controller_id: AtomicUsize,
    clients_map: DashMap<usize, String>,
    pending: StdMutex<Option<PendingControl>>,
    pending_gen: AtomicU64,
}

struct PendingControl {
    requester_id: usize,
    requester_viewer_id: String,
    deadline: Instant,
    generation: u64,
}

const CONTROL_GRACE: Duration = Duration::from_secs(5);

static SESSIONS: OnceLock<DashMap<String, Arc<VncSession>>> = OnceLock::new();
static NEXT_CLIENT_ID: AtomicUsize = AtomicUsize::new(1);

fn sessions() -> &'static DashMap<String, Arc<VncSession>> {
    SESSIONS.get_or_init(DashMap::new)
}

#[derive(Serialize)]
pub struct ViewerInfo {
    pub viewer_id: String,
    pub is_controller: bool,
}

#[derive(Serialize)]
pub struct PendingInfo {
    pub requester_viewer_id: String,
    pub seconds_remaining: u64,
}

#[derive(Serialize)]
pub struct SessionInfo {
    pub vm_key: String,
    pub viewers: usize,
    pub controller_viewer_id: Option<String>,
    pub has_primary: bool,
    pub viewers_list: Vec<ViewerInfo>,
    pub pending: Option<PendingInfo>,
}

fn build_session_info(session: &VncSession) -> SessionInfo {
    let controller_id = session.controller_id.load(Ordering::Relaxed);
    let controller_viewer_id = session
        .clients_map
        .get(&controller_id)
        .map(|v| v.value().clone());
    let viewers_list = session
        .clients_map
        .iter()
        .map(|e| ViewerInfo {
            viewer_id: e.value().clone(),
            is_controller: *e.key() == controller_id,
        })
        .collect();
    let pending = session
        .pending
        .lock()
        .expect("vnc pending mutex poisoned")
        .as_ref()
        .map(|pc| PendingInfo {
            requester_viewer_id: pc.requester_viewer_id.clone(),
            seconds_remaining: pc
                .deadline
                .saturating_duration_since(Instant::now())
                .as_secs(),
        });
    SessionInfo {
        vm_key: session.vm_key.clone(),
        viewers: session.clients.load(Ordering::Relaxed),
        controller_viewer_id,
        has_primary: controller_id != 0,
        viewers_list,
        pending,
    }
}

pub fn get_session_info(vm_key: &str) -> Option<SessionInfo> {
    let registry = sessions();
    registry
        .get(vm_key)
        .map(|session| build_session_info(&session))
}

pub fn list_sessions() -> Vec<SessionInfo> {
    let registry = sessions();
    registry
        .iter()
        .map(|entry| build_session_info(entry.value()))
        .collect()
}

pub fn request_control(vm_key: &str, viewer_id: &str) -> bool {
    let Some(session) = sessions().get(vm_key).map(|s| s.clone()) else {
        return false;
    };
    let Some(requester_id) = session
        .clients_map
        .iter()
        .find(|e| e.value() == viewer_id)
        .map(|e| *e.key())
    else {
        return false;
    };

    let current = session.controller_id.load(Ordering::Relaxed);
    if current == 0 || current == requester_id {
        session.controller_id.store(requester_id, Ordering::Relaxed);
        *session.pending.lock().expect("vnc pending mutex poisoned") = None;
        info!(
            "VNC hub: {} control granted immediately to client {}",
            session.vm_key, requester_id
        );
        return true;
    }

    let generation = session.pending_gen.fetch_add(1, Ordering::Relaxed) + 1;
    *session.pending.lock().expect("vnc pending mutex poisoned") = Some(PendingControl {
        requester_id,
        requester_viewer_id: viewer_id.to_string(),
        deadline: Instant::now() + CONTROL_GRACE,
        generation,
    });
    info!(
        "VNC hub: {} client {} requested control — {}s grace",
        session.vm_key,
        requester_id,
        CONTROL_GRACE.as_secs()
    );

    let session_timer = session.clone();
    tokio::spawn(async move {
        tokio::time::sleep(CONTROL_GRACE).await;
        let mut p = session_timer
            .pending
            .lock()
            .expect("vnc pending mutex poisoned");
        if let Some(pc) = p.as_ref() {
            if pc.generation == generation
                && session_timer.clients_map.contains_key(&pc.requester_id)
            {
                session_timer
                    .controller_id
                    .store(pc.requester_id, Ordering::Relaxed);
                info!(
                    "VNC hub: {} control transferred to client {} (grace elapsed)",
                    session_timer.vm_key, pc.requester_id
                );
                *p = None;
            }
        }
    });
    true
}

pub fn deny_control(vm_key: &str, viewer_id: &str) -> bool {
    let Some(session) = sessions().get(vm_key).map(|s| s.clone()) else {
        return false;
    };
    let controller_id = session.controller_id.load(Ordering::Relaxed);
    let is_controller = session
        .clients_map
        .get(&controller_id)
        .map(|v| v.value() == viewer_id)
        .unwrap_or(false);
    if !is_controller {
        return false;
    }
    session.pending_gen.fetch_add(1, Ordering::Relaxed);
    *session.pending.lock().expect("vnc pending mutex poisoned") = None;
    info!("VNC hub: {} pending control request denied", session.vm_key);
    true
}

pub fn release_control(vm_key: &str, viewer_id: &str) -> bool {
    let Some(session) = sessions().get(vm_key).map(|s| s.clone()) else {
        return false;
    };
    let controller_id = session.controller_id.load(Ordering::Relaxed);
    let is_controller = session
        .clients_map
        .get(&controller_id)
        .map(|v| v.value() == viewer_id)
        .unwrap_or(false);
    if !is_controller {
        return false;
    }
    session.controller_id.store(0, Ordering::Relaxed);
    info!("VNC hub: {} controller released control", session.vm_key);
    true
}

pub struct UpstreamConfig {
    pub auth_header: Option<HeaderValue>,
    pub origin: Option<HeaderValue>,
    pub subprotocols: Option<HeaderValue>,
    pub tls_connector: tokio_tungstenite::Connector,
}

impl UpstreamConfig {
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

pub async fn join_session(
    vm_key: String,
    upstream_url: String,
    upstream_token: Option<String>,
    viewer_id: Option<String>,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = UpstreamConfig::kubevirt(upstream_token)?;
    join_session_with_config(vm_key, upstream_url, config, viewer_id, browser_ws).await
}

pub async fn join_session_with_config(
    vm_key: String,
    upstream_url: String,
    config: UpstreamConfig,
    viewer_id: Option<String>,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::Relaxed);
    let viewer_id = viewer_id.unwrap_or_else(|| format!("c{client_id}"));
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

    session.clients_map.insert(client_id, viewer_id.clone());
    let prior = session.clients.fetch_add(1, Ordering::Relaxed);
    if prior == 0 {
        session.controller_id.store(client_id, Ordering::Relaxed);
        info!(
            "VNC hub: {} opened — client {} (viewer {}) is controller",
            session.vm_key, client_id, viewer_id
        );
    } else {
        info!(
            "VNC hub: {} client {} (viewer {}) joined as view-only ({} total)",
            session.vm_key,
            client_id,
            viewer_id,
            prior + 1
        );
    }

    let result = run_client(session.clone(), client_id, browser_ws).await;

    session.clients_map.remove(&client_id);
    if session.controller_id.load(Ordering::Relaxed) == client_id {
        let next = session.clients_map.iter().map(|e| *e.key()).min();
        session
            .controller_id
            .store(next.unwrap_or(0), Ordering::Relaxed);
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
        controller_id: AtomicUsize::new(0),
        clients_map: DashMap::new(),
        pending: StdMutex::new(None),
        pending_gen: AtomicU64::new(0),
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

async fn run_client(
    session: Arc<VncSession>,
    client_id: usize,
    browser_ws: WebSocket,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (mut browser_tx, mut browser_rx) = browser_ws.split();

    let (cache_snapshot, mut live_rx) = {
        let cache = session.cache.lock().await;
        let rx = session.broadcast.subscribe();
        (cache.clone(), rx)
    };

    if !cache_snapshot.is_empty() {
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

            if session_input.controller_id.load(Ordering::Relaxed) != client_id {
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

    let output_task = tokio::spawn(async move {
        loop {
            match live_rx.recv().await {
                Ok(bytes) => {
                    if browser_tx.send(AxumMsg::Binary(bytes)).await.is_err() {
                        break;
                    }
                }
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
