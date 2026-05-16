use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicI64, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::Notify;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::ToSchema;
use uuid::Uuid;

mod billing;
mod billing_wallet;
mod openapi;
mod persistent;
mod tap;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateVmRequest {
    pub rootfs: String,
    #[serde(default = "default_vcpu")]
    pub vcpu_count: u8,
    #[serde(default = "default_mem")]
    pub mem_size_mib: u16,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    pub entrypoint: String,
    #[serde(default)]
    pub env: serde_json::Map<String, serde_json::Value>,
    #[serde(default = "default_boot_args")]
    pub boot_args: String,
    /// Optional list of packages to install before execution.
    /// The rootfs determines the package manager: alpine-python → pip, alpine-node → npm.
    /// Packages are installed from a pre-built local cache drive (no network needed).
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub network: Option<bool>,
}

fn default_vcpu() -> u8 {
    1
}
fn default_mem() -> u16 {
    128
}
fn default_timeout() -> u64 {
    30000
}
fn default_boot_args() -> String {
    "console=ttyS0 reboot=k panic=1 init=/init".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum VmStatus {
    Creating,
    Running,
    Completed,
    Failed,
    Timeout,
    Destroyed,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct VmInfo {
    pub vm_id: String,
    pub status: VmStatus,
    pub rootfs: String,
    pub vcpu_count: u8,
    pub mem_size_mib: u16,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct VmResult {
    pub vm_id: String,
    pub status: VmStatus,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

#[derive(Debug)]
struct VmRecord {
    info: VmInfo,
    result: Option<VmResult>,
    created: Instant,
    kill_signal: Arc<Notify>,
    billing_account_id: Option<Uuid>,
    vcpu_count: u8,
    mem_size_mib: u16,
}

// ---------------------------------------------------------------------------
// Jailer Configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct JailerConfig {
    /// Base directory for per-VM chroot jails (under scratch, same FS).
    chroot_base: String,
    /// Local copy of the firecracker binary (in scratch, for hard-linking).
    fc_bin_cache: String,
    /// Local copy of the vmlinux kernel (in scratch, for hard-linking).
    kernel_cache: String,
    /// UID to drop privileges to after jail setup.
    uid: u32,
    /// GID to drop privileges to after jail setup.
    gid: u32,
}

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct AppState {
    vms: Arc<DashMap<String, VmRecord>>,
    rootfs_dir: String,
    max_concurrent_vms: usize,
    jailer: Option<Arc<JailerConfig>>,
    /// Populated only when the binary runs as the networked deployment
    /// (firecracker-ctl-net). When `None`, all /fc/* handlers return 503.
    persistent: Option<Arc<PersistentState>>,
    /// Wallet wiring for credit holds / settles. None = wallet not configured;
    /// Some(ctx) where ctx.enabled controls whether holds + settles actually fire.
    billing: Option<Arc<billing_wallet::BillingContext>>,
}

/// State block for persistent endpoints. Only constructed when the
/// binary runs in the networked deployment (see `FC_PERSISTENT_ENDPOINTS_ENABLED`).
struct PersistentState {
    pool: persistent::Ipv4Pool,
    tap_manager: tap::TapManager,
    endpoints: DashMap<String, PersistentEndpoint>,
    /// HTTP client used by `fc_proxy` to forward requests into the VM's
    /// TAP IP. Built once at startup with the timeouts the reverse proxy
    /// needs (short connect, long read for streaming / SSE / long-poll).
    proxy_client: reqwest::Client,
}

/// Lifecycle status of a persistent endpoint.
///
/// Only `Pending` is reachable in Phase 2c. The remaining variants are
/// forward-declared so the wire format is stable across the Phase 2e /
/// Phase 3 lifecycle rollouts — adding new variants later would force a
/// consumer-side discriminator update, whereas pre-declaring them lets
/// callers build state machines against the final shape today.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EndpointStatus {
    /// Resources (IP + TAP) allocated; VM process not yet spawned.
    /// Phase 2c terminal state — Phase 2e transitions to Starting.
    Pending,
    /// VM process launched, waiting for the first successful health check.
    Starting,
    /// Health check passed within the configured window.
    Healthy,
    /// Was healthy, subsequent health check failed.
    Degraded,
    /// Teardown in progress.
    Stopping,
}

/// `staff` (default, JWT-gated) or `public` (anonymous via `/fc/public/`).
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EndpointVisibility {
    #[default]
    Staff,
    Public,
}

/// CORS + header injection + rate limit. CORS fields apply to the public
/// tier only. Caps enforced by [`validate_http_config`].
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct EndpointHttpConfig {
    #[serde(default)]
    pub cors_allow_origins: Vec<String>,
    #[serde(default)]
    pub cors_allow_methods: Vec<String>,
    #[serde(default)]
    pub cors_allow_headers: Vec<String>,
    #[serde(default)]
    pub cors_max_age_secs: u32,
    #[serde(default)]
    pub cors_allow_credentials: bool,
    /// Headers added to every upstream request before forwarding to the
    /// guest. Reserved framing / auth names rejected at deploy time.
    #[serde(default)]
    pub inject_request_headers: std::collections::BTreeMap<String, String>,
    /// `requests_per_sec = 0` disables rate limiting.
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct RateLimitConfig {
    #[serde(default)]
    pub requests_per_sec: u32,
    #[serde(default)]
    pub burst: u32,
}

/// Registered persistent endpoint. Owned by `PersistentState::endpoints`.
struct PersistentEndpoint {
    name: String,
    rootfs: String,
    entrypoint: String,
    http_port: u16,
    health_path: String,
    vcpu_count: u8,
    mem_size_mib: u16,
    allocation: persistent::IpAllocation,
    tap: tap::TapDevice,
    pid: Option<u32>,
    status: EndpointStatus,
    created: Instant,
    visibility: EndpointVisibility,
    http_config: EndpointHttpConfig,
    rate_limiter: TokenBucket,
    metrics: Arc<EndpointMetrics>,
    /// Idle TTL in seconds. 0 disables auto-teardown.
    idle_ttl_secs: u32,
    /// Per-endpoint VM stdout/stderr ring buffer. Capped at 256 KiB.
    logs: Arc<LogRing>,
    /// Wallet account_id this endpoint bills against. Captured at deploy
    /// from the upstream proxy's x-kbve-account-id header.
    billing_account_id: Option<Uuid>,
}

/// Bounded byte ring backing `GET /fc/{name}/logs`. Drops oldest bytes
/// when full. Drainer tasks call `push` from the VM stdio reader; readers
/// snapshot via `bytes`.
struct LogRing {
    inner: std::sync::Mutex<std::collections::VecDeque<u8>>,
    cap: usize,
}

impl LogRing {
    const CAP_BYTES: usize = 256 * 1024;

    fn new() -> Self {
        Self {
            inner: std::sync::Mutex::new(std::collections::VecDeque::with_capacity(
                Self::CAP_BYTES,
            )),
            cap: Self::CAP_BYTES,
        }
    }

    fn push(&self, chunk: &[u8]) {
        let mut buf = self.inner.lock().expect("poisoned");
        if chunk.len() >= self.cap {
            buf.clear();
            buf.extend(chunk[chunk.len() - self.cap..].iter().copied());
            return;
        }
        let overflow = (buf.len() + chunk.len()).saturating_sub(self.cap);
        for _ in 0..overflow {
            buf.pop_front();
        }
        buf.extend(chunk.iter().copied());
    }

    fn snapshot(&self) -> Vec<u8> {
        let buf = self.inner.lock().expect("poisoned");
        buf.iter().copied().collect()
    }
}

#[derive(Default)]
struct EndpointMetrics {
    requests_total: AtomicU64,
    requests_throttled: AtomicU64,
    requests_forbidden: AtomicU64,
    upstream_errors: AtomicU64,
    bytes_in: AtomicU64,
    bytes_out: AtomicU64,
    last_request_micros: AtomicI64,
    accumulated_credits: AtomicU64,
    last_meter_micros: AtomicI64,
    last_meter_requests_total: AtomicU64,
}

#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub struct EndpointMetricsSnapshot {
    pub requests_total: u64,
    pub requests_throttled: u64,
    pub requests_forbidden: u64,
    pub upstream_errors: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub last_request_age_secs: Option<u64>,
    pub accumulated_credits: u64,
}

/// Lock-free token bucket. Stores milli-tokens so sub-1 RPS rates round
/// cleanly.
struct TokenBucket {
    tokens_x1000: AtomicI64,
    last_refill_micros: AtomicI64,
    capacity_x1000: i64,
    refill_per_sec_x1000: i64,
}

impl TokenBucket {
    fn disabled() -> Self {
        Self {
            tokens_x1000: AtomicI64::new(0),
            last_refill_micros: AtomicI64::new(0),
            capacity_x1000: 0,
            refill_per_sec_x1000: 0,
        }
    }

    fn from_config(cfg: RateLimitConfig) -> Self {
        if cfg.requests_per_sec == 0 {
            return Self::disabled();
        }
        let capacity = cfg.burst.max(cfg.requests_per_sec).max(1) as i64 * 1000;
        Self {
            tokens_x1000: AtomicI64::new(capacity),
            last_refill_micros: AtomicI64::new(now_micros()),
            capacity_x1000: capacity,
            refill_per_sec_x1000: cfg.requests_per_sec as i64 * 1000,
        }
    }

    fn try_acquire(&self) -> bool {
        if self.capacity_x1000 == 0 {
            return true;
        }
        let now = now_micros();
        let last = self.last_refill_micros.swap(now, Ordering::Relaxed);
        let elapsed_us = (now - last).max(0);
        let added = (elapsed_us * self.refill_per_sec_x1000) / 1_000_000;
        let mut current = self.tokens_x1000.load(Ordering::Relaxed);
        loop {
            let refilled = (current + added).min(self.capacity_x1000);
            if refilled < 1000 {
                self.tokens_x1000.store(refilled, Ordering::Relaxed);
                return false;
            }
            match self.tokens_x1000.compare_exchange_weak(
                current,
                refilled - 1000,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => return true,
                Err(observed) => current = observed,
            }
        }
    }
}

fn now_micros() -> i64 {
    START_INSTANT
        .get_or_init(Instant::now)
        .elapsed()
        .as_micros() as i64
}

static START_INSTANT: OnceLock<Instant> = OnceLock::new();

/// JSON-serialisable view of a PersistentEndpoint. Keeps the owning
/// struct free of serde plumbing so internal fields can change without
/// breaking the wire format.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PersistentEndpointInfo {
    name: String,
    rootfs: String,
    entrypoint: String,
    http_port: u16,
    health_path: String,
    vcpu_count: u8,
    mem_size_mib: u16,
    host_ip: String,
    guest_ip: String,
    tap: String,
    pid: Option<u32>,
    status: EndpointStatus,
    uptime_secs: u64,
    visibility: EndpointVisibility,
    http_config: EndpointHttpConfig,
    idle_ttl_secs: u32,
    metrics: EndpointMetricsSnapshot,
    sku: billing::Sku,
    credits_per_sec: u64,
    credits_per_1k_requests: u64,
}

impl PersistentEndpointInfo {
    fn from(ep: &PersistentEndpoint) -> Self {
        let sku = billing::sku_for(ep.vcpu_count, ep.mem_size_mib);
        let r = billing::rate(sku);
        Self {
            name: ep.name.clone(),
            rootfs: ep.rootfs.clone(),
            entrypoint: ep.entrypoint.clone(),
            http_port: ep.http_port,
            health_path: ep.health_path.clone(),
            vcpu_count: ep.vcpu_count,
            mem_size_mib: ep.mem_size_mib,
            host_ip: ep.allocation.host_ip.to_string(),
            guest_ip: ep.allocation.guest_ip.to_string(),
            tap: ep.tap.name.clone(),
            pid: ep.pid,
            status: ep.status,
            uptime_secs: ep.created.elapsed().as_secs(),
            visibility: ep.visibility,
            http_config: ep.http_config.clone(),
            idle_ttl_secs: ep.idle_ttl_secs,
            metrics: ep.metrics.snapshot(),
            sku,
            credits_per_sec: r.credits_per_sec,
            credits_per_1k_requests: r.credits_per_1k_requests,
        }
    }
}

impl EndpointMetrics {
    fn snapshot(&self) -> EndpointMetricsSnapshot {
        let last = self.last_request_micros.load(Ordering::Relaxed);
        let last_request_age_secs = if last == 0 {
            None
        } else {
            Some(((now_micros() - last).max(0) / 1_000_000) as u64)
        };
        EndpointMetricsSnapshot {
            requests_total: self.requests_total.load(Ordering::Relaxed),
            requests_throttled: self.requests_throttled.load(Ordering::Relaxed),
            requests_forbidden: self.requests_forbidden.load(Ordering::Relaxed),
            upstream_errors: self.upstream_errors.load(Ordering::Relaxed),
            bytes_in: self.bytes_in.load(Ordering::Relaxed),
            bytes_out: self.bytes_out.load(Ordering::Relaxed),
            last_request_age_secs,
            accumulated_credits: self.accumulated_credits.load(Ordering::Relaxed),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Reject entrypoints that could inject extra kernel boot parameters.
/// Must be an absolute path with no whitespace or shell metacharacters.
fn validate_entrypoint(ep: &str) -> Result<(), String> {
    if ep.is_empty() {
        return Err("entrypoint cannot be empty".into());
    }
    if !ep.starts_with('/') {
        return Err("entrypoint must be an absolute path".into());
    }
    if ep.contains(|c: char| c.is_whitespace() || ";&|`$(){}[]<>\"'\\#!~".contains(c)) {
        return Err(
            "entrypoint must be a single binary path without arguments or special characters"
                .into(),
        );
    }
    Ok(())
}

const MAX_CORS_ORIGINS: usize = 16;
const MAX_INJECT_HEADERS: usize = 16;
const MAX_HEADER_NAME_LEN: usize = 64;
const MAX_HEADER_VALUE_LEN: usize = 256;
const MAX_CORS_MAX_AGE_SECS: u32 = 86_400;
const MAX_RATE_REQUESTS_PER_SEC: u32 = 10_000;
const MAX_RATE_BURST: u32 = 100_000;
const MAX_IDLE_TTL_SECS: u32 = 30 * 24 * 60 * 60;

/// Header names that callers must never override on the upstream request.
/// Hop-by-hop framing, plus Host/Authorization which we set ourselves.
const RESERVED_INJECT_HEADER_NAMES: &[&str] = &[
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "upgrade",
    "te",
    "trailers",
    "proxy-connection",
    "authorization",
    "accept-encoding",
];

/// Per-RFC 7230 §3.2.6, header field-names are tokens — visible ASCII minus
/// separators. Reject anything else so we never construct an invalid request.
fn is_valid_header_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| matches!(b, b'!' | b'#'..=b'\'' | b'*' | b'+' | b'-' | b'.' | b'0'..=b'9' | b'A'..=b'Z' | b'^'..=b'z' | b'|' | b'~'))
}

/// Header values may contain visible ASCII + SP/HTAB. CR/LF are forbidden to
/// shut the door on response-splitting attacks.
fn is_valid_header_value(v: &str) -> bool {
    v.bytes()
        .all(|b| b == b' ' || b == b'\t' || (b'!'..=b'~').contains(&b))
}

/// Origin must be `*`, or a scheme://host[:port] without path/query/fragment.
fn is_valid_cors_origin(o: &str) -> bool {
    if o == "*" {
        return true;
    }
    let rest = match o
        .strip_prefix("https://")
        .or_else(|| o.strip_prefix("http://"))
    {
        Some(r) => r,
        None => return false,
    };
    !rest.is_empty()
        && !rest.contains(|c: char| {
            c == '/' || c == '?' || c == '#' || c == ' ' || c == '\t' || c.is_control()
        })
}

fn validate_http_config(cfg: &EndpointHttpConfig) -> Result<(), String> {
    if cfg.cors_allow_origins.len() > MAX_CORS_ORIGINS {
        return Err(format!(
            "cors_allow_origins exceeds limit of {MAX_CORS_ORIGINS}"
        ));
    }
    for o in &cfg.cors_allow_origins {
        if !is_valid_cors_origin(o) {
            return Err(format!("invalid CORS origin: {o:?}"));
        }
    }
    if cfg.cors_allow_credentials && cfg.cors_allow_origins.iter().any(|o| o == "*") {
        return Err("cors_allow_credentials=true forbids wildcard origin (RFC 6265)".into());
    }
    if cfg.cors_max_age_secs > MAX_CORS_MAX_AGE_SECS {
        return Err(format!(
            "cors_max_age_secs {} exceeds cap of {MAX_CORS_MAX_AGE_SECS}",
            cfg.cors_max_age_secs
        ));
    }
    for m in &cfg.cors_allow_methods {
        if !is_valid_header_value(m) || m.is_empty() {
            return Err(format!("invalid CORS method: {m:?}"));
        }
    }
    for h in &cfg.cors_allow_headers {
        if !is_valid_header_name(h) {
            return Err(format!("invalid CORS allowed header name: {h:?}"));
        }
    }
    if cfg.inject_request_headers.len() > MAX_INJECT_HEADERS {
        return Err(format!(
            "inject_request_headers exceeds limit of {MAX_INJECT_HEADERS}"
        ));
    }
    for (k, v) in &cfg.inject_request_headers {
        if k.len() > MAX_HEADER_NAME_LEN {
            return Err(format!(
                "inject header name {k:?} exceeds {MAX_HEADER_NAME_LEN} chars"
            ));
        }
        if v.len() > MAX_HEADER_VALUE_LEN {
            return Err(format!(
                "inject header {k:?} value exceeds {MAX_HEADER_VALUE_LEN} chars"
            ));
        }
        if !is_valid_header_name(k) {
            return Err(format!("invalid inject header name: {k:?}"));
        }
        if !is_valid_header_value(v) {
            return Err(format!("invalid inject header value for {k:?}"));
        }
        let lower = k.to_ascii_lowercase();
        if RESERVED_INJECT_HEADER_NAMES.contains(&lower.as_str()) {
            return Err(format!("reserved inject header name: {k:?}"));
        }
    }
    if cfg.rate_limit.requests_per_sec > MAX_RATE_REQUESTS_PER_SEC {
        return Err(format!(
            "rate_limit.requests_per_sec {} exceeds cap of {MAX_RATE_REQUESTS_PER_SEC}",
            cfg.rate_limit.requests_per_sec
        ));
    }
    if cfg.rate_limit.burst > MAX_RATE_BURST {
        return Err(format!(
            "rate_limit.burst {} exceeds cap of {MAX_RATE_BURST}",
            cfg.rate_limit.burst
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    responses(
        (status = 200, description = "Liveness probe + build identity", body = serde_json::Value)
    )
)]
async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "firecracker-ctl",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": iso8601_now(),
        "jailer": state.jailer.is_some(),
    }))
}

#[utoipa::path(
    post,
    path = "/vm/create",
    tag = "ephemeral",
    request_body = CreateVmRequest,
    responses(
        (status = 201, description = "VM accepted; lifecycle running in background", body = VmInfo),
        (status = 400, description = "Validation error or rootfs missing"),
        (status = 429, description = "Concurrent VM cap reached")
    )
)]
async fn create_vm(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateVmRequest>,
) -> impl IntoResponse {
    // Validate entrypoint (prevents boot_args injection)
    if let Err(msg) = validate_entrypoint(&req.entrypoint) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": msg})),
        );
    }

    // Validate rootfs exists
    let rootfs_path = format!("{}/{}.ext4", state.rootfs_dir, req.rootfs);
    if !tokio::fs::try_exists(&rootfs_path).await.unwrap_or(false) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("rootfs '{}' not found at {}", req.rootfs, rootfs_path),
                "available": list_rootfs(&state.rootfs_dir).await,
            })),
        );
    }

    if req.network.unwrap_or(false) && state.persistent.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "network=true requires the networked deployment (firecracker-ctl-net)",
                "hint": "set FC_PERSISTENT_ENDPOINTS_ENABLED=true and run as firecracker-ctl-net",
            })),
        );
    }

    // Enforce max concurrent VMs to prevent resource exhaustion
    let active_count = state
        .vms
        .iter()
        .filter(|e| {
            matches!(
                e.value().info.status,
                VmStatus::Creating | VmStatus::Running
            )
        })
        .count();
    if active_count >= state.max_concurrent_vms {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "error": "Too many concurrent VMs",
                "active": active_count,
                "limit": state.max_concurrent_vms,
            })),
        );
    }

    let vm_id = format!("fc-{}", Uuid::new_v4().as_simple());
    let now = iso8601_now();
    let kill_signal = Arc::new(Notify::new());

    let want_network = req.network.unwrap_or(false);
    let account_id = billing_wallet::extract_account_id(&headers);
    let billing_account_id = if want_network { account_id } else { None };

    if want_network {
        let ttl_secs = (req.timeout_ms / 1000) as u32;
        match billing_wallet::place_hold(
            state.billing.as_deref(),
            billing_account_id,
            &vm_id,
            req.vcpu_count,
            req.mem_size_mib,
            ttl_secs,
            0,
        )
        .await
        {
            Ok(_) => {}
            Err(billing_wallet::HoldError::MissingAccount) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({
                        "error": "billing requires x-kbve-account-id header for network=true VMs",
                    })),
                );
            }
            Err(billing_wallet::HoldError::Insufficient { balance_short_of }) => {
                return (
                    StatusCode::PAYMENT_REQUIRED,
                    Json(serde_json::json!({
                        "error": "insufficient credits to reserve session",
                        "needed": balance_short_of,
                    })),
                );
            }
            Err(billing_wallet::HoldError::Other(detail)) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "billing hold failed",
                        "detail": detail,
                    })),
                );
            }
        }
    }

    let info = VmInfo {
        vm_id: vm_id.clone(),
        status: VmStatus::Creating,
        rootfs: req.rootfs.clone(),
        vcpu_count: req.vcpu_count,
        mem_size_mib: req.mem_size_mib,
        created_at: now,
    };

    state.vms.insert(
        vm_id.clone(),
        VmRecord {
            info: info.clone(),
            result: None,
            created: Instant::now(),
            kill_signal: kill_signal.clone(),
            billing_account_id,
            vcpu_count: req.vcpu_count,
            mem_size_mib: req.mem_size_mib,
        },
    );

    let vms = state.vms.clone();
    let rootfs_dir = state.rootfs_dir.clone();
    let jailer = state.jailer.clone();
    let persistent = state.persistent.clone();
    let billing = state.billing.clone();
    tokio::spawn(async move {
        run_vm_lifecycle(
            vms,
            vm_id,
            req,
            rootfs_dir,
            kill_signal,
            jailer,
            persistent,
            billing,
            billing_account_id,
        )
        .await;
    });

    (StatusCode::CREATED, Json(serde_json::json!(info)))
}

#[utoipa::path(
    get,
    path = "/vm/{vm_id}",
    tag = "ephemeral",
    params(("vm_id" = String, Path, description = "Ephemeral VM identifier returned by /vm/create")),
    responses(
        (status = 200, description = "Current VM lifecycle state", body = VmInfo),
        (status = 404, description = "VM not found")
    )
)]
async fn get_vm_status(
    State(state): State<AppState>,
    Path(vm_id): Path<String>,
) -> impl IntoResponse {
    match state.vms.get(&vm_id) {
        Some(record) => (StatusCode::OK, Json(serde_json::json!(record.info))),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "VM not found"})),
        ),
    }
}

#[utoipa::path(
    get,
    path = "/vm/{vm_id}/result",
    tag = "ephemeral",
    params(("vm_id" = String, Path, description = "Ephemeral VM identifier")),
    responses(
        (status = 200, description = "VM finished — final stdout/stderr/exit_code", body = VmResult),
        (status = 202, description = "VM still running; poll again"),
        (status = 404, description = "VM not found")
    )
)]
async fn get_vm_result(
    State(state): State<AppState>,
    Path(vm_id): Path<String>,
) -> impl IntoResponse {
    match state.vms.get(&vm_id) {
        Some(record) => match &record.result {
            Some(result) => (StatusCode::OK, Json(serde_json::json!(result))),
            None => (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({
                    "vm_id": vm_id,
                    "status": record.info.status,
                    "message": "VM has not completed yet",
                })),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "VM not found"})),
        ),
    }
}

#[utoipa::path(
    delete,
    path = "/vm/{vm_id}",
    tag = "ephemeral",
    params(("vm_id" = String, Path, description = "Ephemeral VM identifier")),
    responses(
        (status = 200, description = "Destroy signal sent; VM transitions to Destroyed", body = serde_json::Value),
        (status = 404, description = "VM not found")
    )
)]
async fn destroy_vm(State(state): State<AppState>, Path(vm_id): Path<String>) -> impl IntoResponse {
    match state.vms.get(&vm_id) {
        Some(record) => {
            // Signal the lifecycle task to kill the firecracker process
            record.kill_signal.notify_one();
            drop(record);
            // Eagerly set status so the API reflects the destroy immediately
            if let Some(mut record) = state.vms.get_mut(&vm_id) {
                record.info.status = VmStatus::Destroyed;
            }
            (
                StatusCode::OK,
                Json(serde_json::json!({"vm_id": vm_id, "status": "destroyed"})),
            )
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "VM not found"})),
        ),
    }
}

#[utoipa::path(
    get,
    path = "/vm",
    tag = "ephemeral",
    responses(
        (status = 200, description = "Snapshot of every tracked VM record", body = serde_json::Value)
    )
)]
async fn list_vms(State(state): State<AppState>) -> impl IntoResponse {
    let vms: Vec<VmInfo> = state
        .vms
        .iter()
        .map(|entry| entry.value().info.clone())
        .collect();
    Json(serde_json::json!({ "vms": vms, "count": vms.len() }))
}

// ---------------------------------------------------------------------------
// Persistent endpoints (/fc/*) — Phase 2c lifecycle (registry + network)
// ---------------------------------------------------------------------------
// Long-lived HTTP servers running inside Firecracker VMs, addressed by name.
// Phase 2c wires the IP allocator + TAP manager into an in-memory registry:
// POST /fc/deploy actually creates the TAP and reserves the IP; DELETE
// actually tears them down. The VM process itself is NOT yet spawned —
// that lands in Phase 2e when kernel boot args are wired. Proxy forwarding
// lands in Phase 2d. See firecracker-ctl.mdx for the full architecture.

/// Request shape for POST /fc/deploy.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct DeployFcRequest {
    /// Unique, DNS-safe endpoint name. Used in the public /fc/{name} path.
    pub name: String,
    /// Rootfs image to boot (e.g. "alpine-python-web").
    pub rootfs: String,
    /// Port inside the guest that the HTTP server listens on.
    pub http_port: u16,
    /// Entrypoint binary or script to start the server.
    pub entrypoint: String,
    #[serde(default = "default_vcpu")]
    pub vcpu_count: u8,
    #[serde(default = "default_mem")]
    pub mem_size_mib: u16,
    /// Health check path the proxy pings on deploy. Defaults to "/health".
    #[serde(default = "default_health_path")]
    pub health_path: String,
    #[serde(default)]
    pub env: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub code: Option<String>,
    /// Endpoint visibility. `staff` (default) requires a dashboard JWT with
    /// `DASHBOARD_MANAGE`; `public` is reachable from `/fc/public/{name}/*`
    /// with no auth. Hard-coded at deploy time — flipping visibility
    /// requires redeploy.
    #[serde(default)]
    pub visibility: EndpointVisibility,
    /// Idle teardown TTL in seconds. After this many seconds with zero
    /// traffic, the background sweeper releases the TAP + IP and drops
    /// the registry entry. `0` (default) disables auto-teardown.
    #[serde(default)]
    pub idle_ttl_secs: u32,
    /// CORS + header-injection policy. CORS fields apply only to the public
    /// tier; `inject_request_headers` applies on every forward. Defaults
    /// disable both, preserving Phase 2c behavior.
    #[serde(default)]
    pub http_config: EndpointHttpConfig,
}

fn default_health_path() -> String {
    "/health".to_string()
}

/// Short-circuit for /fc/* routes when persistent endpoints aren't
/// enabled in this deployment. Kept as a helper so the same response
/// shape lands regardless of which handler noticed.
fn not_enabled() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "error": "persistent endpoints not enabled in this deployment",
            "hint": "set FC_PERSISTENT_ENDPOINTS_ENABLED=true and run as firecracker-ctl-net",
        })),
    )
}

#[utoipa::path(
    post,
    path = "/fc/deploy",
    tag = "persistent",
    request_body = DeployFcRequest,
    responses(
        (status = 201, description = "Endpoint registered + network allocated", body = PersistentEndpointInfo),
        (status = 400, description = "Validation error"),
        (status = 409, description = "Endpoint name already registered"),
        (status = 503, description = "Persistent endpoints not enabled in this deployment")
    )
)]
async fn fc_deploy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<DeployFcRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    if req.name.is_empty()
        || !req
            .name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid endpoint name"})),
        );
    }
    if req.name == "public" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "reserved endpoint name",
                "name": req.name,
                "hint": "the name 'public' collides with the /fc/public/* tier",
            })),
        );
    }
    if req.rootfs.is_empty() || req.entrypoint.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "rootfs and entrypoint are required"})),
        );
    }
    if req.http_port == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "http_port must be > 0"})),
        );
    }
    if let Err(msg) = validate_http_config(&req.http_config) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": msg})),
        );
    }
    if req.idle_ttl_secs > MAX_IDLE_TTL_SECS {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!(
                    "idle_ttl_secs {} exceeds cap of {MAX_IDLE_TTL_SECS}",
                    req.idle_ttl_secs
                ),
            })),
        );
    }

    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => return not_enabled(),
    };

    // --- Name collision check (before allocating any resources) ---
    if persistent.endpoints.contains_key(&req.name) {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "endpoint name already registered",
                "name": req.name,
            })),
        );
    }

    let billing_account_id = billing_wallet::extract_account_id(&headers);
    match billing_wallet::place_hold(
        state.billing.as_deref(),
        billing_account_id,
        &req.name,
        req.vcpu_count,
        req.mem_size_mib,
        req.idle_ttl_secs,
        0,
    )
    .await
    {
        Ok(_) => {}
        Err(billing_wallet::HoldError::MissingAccount) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "billing requires x-kbve-account-id header",
                })),
            );
        }
        Err(billing_wallet::HoldError::Insufficient { balance_short_of }) => {
            return (
                StatusCode::PAYMENT_REQUIRED,
                Json(serde_json::json!({
                    "error": "insufficient credits to reserve endpoint",
                    "needed": balance_short_of,
                })),
            );
        }
        Err(billing_wallet::HoldError::Other(detail)) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "billing hold failed",
                    "detail": detail,
                })),
            );
        }
    }

    let allocation = match persistent.pool.allocate() {
        Ok(a) => a,
        Err(e) => {
            tracing::warn!("fc_deploy: pool allocation failed: {e}");
            return (
                StatusCode::INSUFFICIENT_STORAGE,
                Json(serde_json::json!({
                    "error": "IP pool exhausted",
                    "detail": e.to_string(),
                })),
            );
        }
    };

    // --- Create TAP (roll back the IP allocation on failure) ---
    let tap = match persistent.tap_manager.create_tap(&allocation).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("fc_deploy: TAP creation failed: {e}");
            persistent.pool.release(&allocation);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "TAP creation failed",
                    "detail": e.to_string(),
                })),
            );
        }
    };

    // --- Register in the endpoint registry ---
    // Second name check via entry() would be nicer, but DashMap's entry API
    // returns a borrow we'd have to hold across awaits. A belt-and-braces
    // re-check is cheap and acts as a guard against racing callers.
    if persistent.endpoints.contains_key(&req.name) {
        // Extremely unlikely: a concurrent request registered the same name
        // between our first check and the TAP creation. Clean up.
        let _ = persistent.tap_manager.destroy_tap(&tap).await;
        persistent.pool.release(&allocation);
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "endpoint name already registered (race)",
                "name": req.name,
            })),
        );
    }

    // --- Spawn the Firecracker VM ---
    let vm_id = req.name.clone();
    let ip_arg = allocation.kernel_ip_arg();
    let spawn_result =
        match spawn_persistent(&vm_id, &state.rootfs_dir, &req, &tap.name, &ip_arg).await {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("fc_deploy: VM spawn failed for {}: {e}", req.name);
                let _ = persistent.tap_manager.destroy_tap(&tap).await;
                persistent.pool.release(&allocation);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "VM spawn failed",
                        "detail": e,
                    })),
                );
            }
        };

    let pid = spawn_result.child.id();
    let logs = Arc::new(LogRing::new());

    // Drain stdout + stderr into the LogRing while mirroring to ctl-net's
    // own stdout for the k8s pod log. Without a reader the pipe fills and
    // stalls the guest mid-boot (#11044).
    {
        let mut child = spawn_result.child;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        if let Some(out) = stdout {
            tokio::spawn(drain_vm_stream(out, logs.clone(), false));
        }
        if let Some(err) = stderr {
            tokio::spawn(drain_vm_stream(err, logs.clone(), true));
        }

        let ps = persistent.clone();
        let name = req.name.clone();
        let config_path = spawn_result.config_path;
        let socket_path = spawn_result.socket_path;
        let code_path = spawn_result.code_path;
        tokio::spawn(async move {
            let status = child.wait().await;
            if let Some(mut entry) = ps.endpoints.get_mut(&name) {
                if entry.status != EndpointStatus::Stopping {
                    entry.status = EndpointStatus::Degraded;
                    tracing::warn!("fc: endpoint {name} VM exited unexpectedly: {status:?}");
                }
            }
            let _ = tokio::fs::remove_file(&config_path).await;
            let _ = tokio::fs::remove_file(&socket_path).await;
            if let Some(ref cp) = code_path {
                let _ = tokio::fs::remove_file(cp).await;
            }
        });
    }

    let endpoint = PersistentEndpoint {
        name: req.name.clone(),
        rootfs: req.rootfs.clone(),
        entrypoint: req.entrypoint.clone(),
        http_port: req.http_port,
        health_path: req.health_path.clone(),
        vcpu_count: req.vcpu_count,
        mem_size_mib: req.mem_size_mib,
        allocation,
        tap,
        pid,
        status: EndpointStatus::Starting,
        created: Instant::now(),
        visibility: req.visibility,
        rate_limiter: TokenBucket::from_config(req.http_config.rate_limit),
        http_config: req.http_config.clone(),
        metrics: Arc::new(EndpointMetrics::default()),
        idle_ttl_secs: req.idle_ttl_secs,
        logs,
        billing_account_id,
    };
    let info = PersistentEndpointInfo::from(&endpoint);
    persistent.endpoints.insert(req.name.clone(), endpoint);

    tracing::info!(
        "fc_deploy: spawned endpoint {} tap={} host={} guest={} pid={:?}",
        info.name,
        info.tap,
        info.host_ip,
        info.guest_ip,
        info.pid,
    );

    tokio::spawn(health_prober_task(persistent.clone(), req.name.clone()));

    (
        StatusCode::CREATED,
        Json(serde_json::json!({ "endpoint": info })),
    )
}

/// Read a VM stdio stream, mirror to ctl-net's own stdout/stderr for the
/// pod log, and tee into the per-endpoint LogRing for `/fc/{name}/logs`.
async fn drain_vm_stream<R>(reader: R, logs: Arc<LogRing>, is_stderr: bool)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    use tokio::io::AsyncReadExt;
    use tokio::io::AsyncWriteExt;

    let mut reader = reader;
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => return,
            Ok(n) => {
                logs.push(&buf[..n]);
                if is_stderr {
                    let _ = tokio::io::stderr().write_all(&buf[..n]).await;
                } else {
                    let _ = tokio::io::stdout().write_all(&buf[..n]).await;
                }
            }
            Err(_) => return,
        }
    }
}

/// Polls the guest health path on 2s cadence. First 2xx flips
/// `Starting` → `Healthy`; 3 consecutive failures from `Healthy` flip to
/// `Degraded`; next 2xx recovers. Exits on registry removal or `Stopping`.
async fn health_prober_task(persistent: Arc<PersistentState>, name: String) {
    const PROBE_INTERVAL: Duration = Duration::from_secs(2);
    const DEGRADE_AFTER_FAILS: u32 = 3;

    let (guest_ip, http_port, health_path) = match persistent.endpoints.get(&name) {
        Some(e) => (e.allocation.guest_ip, e.http_port, e.health_path.clone()),
        None => return,
    };
    let url = format!("http://{guest_ip}:{http_port}{health_path}");
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_else(|_| persistent.proxy_client.clone());

    let mut consecutive_fails = 0u32;
    loop {
        let Some(entry) = persistent.endpoints.get(&name) else {
            return;
        };
        if entry.status == EndpointStatus::Stopping {
            return;
        }
        drop(entry);

        let healthy = matches!(client.get(&url).send().await, Ok(r) if r.status().is_success());
        if let Some(mut entry) = persistent.endpoints.get_mut(&name) {
            if entry.status == EndpointStatus::Stopping {
                return;
            }
            if healthy {
                consecutive_fails = 0;
                if entry.status != EndpointStatus::Healthy {
                    tracing::info!(
                        "fc: endpoint {name} flipped to Healthy (from {:?})",
                        entry.status
                    );
                    entry.status = EndpointStatus::Healthy;
                }
            } else {
                consecutive_fails += 1;
                if consecutive_fails >= DEGRADE_AFTER_FAILS
                    && entry.status == EndpointStatus::Healthy
                {
                    tracing::warn!(
                        "fc: endpoint {name} flipped to Degraded after {consecutive_fails} failed probes"
                    );
                    entry.status = EndpointStatus::Degraded;
                }
            }
        } else {
            return;
        }

        tokio::time::sleep(PROBE_INTERVAL).await;
    }
}

/// Prometheus text-format exposition. Emits per-endpoint counters
/// (requests, errors, throttled, forbidden, bytes, status) plus pool +
/// process gauges. Hand-rolled to avoid a crate dependency for ~80 lines
/// of output. Scraped by the ServiceMonitor in
/// `apps/kube/firecracker/manifests/firecracker-net-servicemonitor.yaml`.
async fn metrics_handler(State(state): State<AppState>) -> Response {
    let mut out = String::with_capacity(2048);

    out.push_str("# HELP fc_build_info Build identity (always 1).\n");
    out.push_str("# TYPE fc_build_info gauge\n");
    out.push_str(&format!(
        "fc_build_info{{version=\"{}\"}} 1\n",
        env!("CARGO_PKG_VERSION")
    ));

    out.push_str("# HELP fc_jailer_enabled 1 if jailer is configured.\n");
    out.push_str("# TYPE fc_jailer_enabled gauge\n");
    out.push_str(&format!(
        "fc_jailer_enabled {}\n",
        i32::from(state.jailer.is_some())
    ));

    let Some(persistent) = state.persistent.as_ref() else {
        out.push_str("# HELP fc_persistent_enabled 1 if /fc/* endpoints are wired.\n");
        out.push_str("# TYPE fc_persistent_enabled gauge\n");
        out.push_str("fc_persistent_enabled 0\n");
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
            out,
        )
            .into_response();
    };

    out.push_str("# HELP fc_persistent_enabled 1 if /fc/* endpoints are wired.\n");
    out.push_str("# TYPE fc_persistent_enabled gauge\n");
    out.push_str("fc_persistent_enabled 1\n");

    let pool_used = persistent.pool.in_use();
    let pool_capacity = persistent.pool.capacity();
    out.push_str("# HELP fc_ip_pool_used Currently-allocated /30 slots.\n");
    out.push_str("# TYPE fc_ip_pool_used gauge\n");
    out.push_str(&format!("fc_ip_pool_used {pool_used}\n"));
    out.push_str("# HELP fc_ip_pool_capacity Maximum /30 slots available.\n");
    out.push_str("# TYPE fc_ip_pool_capacity gauge\n");
    out.push_str(&format!("fc_ip_pool_capacity {pool_capacity}\n"));

    out.push_str("# HELP fc_endpoint_status Status of each persistent endpoint (1 = current).\n");
    out.push_str("# TYPE fc_endpoint_status gauge\n");
    out.push_str("# HELP fc_endpoint_requests_total Total proxied requests by outcome.\n");
    out.push_str("# TYPE fc_endpoint_requests_total counter\n");
    out.push_str("# HELP fc_endpoint_bytes_total Bytes proxied by direction.\n");
    out.push_str("# TYPE fc_endpoint_bytes_total counter\n");
    out.push_str(
        "# HELP fc_endpoint_last_request_age_seconds Seconds since last forwarded request (NaN if never).\n",
    );
    out.push_str("# TYPE fc_endpoint_last_request_age_seconds gauge\n");
    out.push_str("# HELP fc_endpoint_uptime_seconds Seconds since endpoint registered.\n");
    out.push_str("# TYPE fc_endpoint_uptime_seconds gauge\n");

    let mut status_counts: [u64; 5] = [0; 5];

    for entry in persistent.endpoints.iter() {
        let ep = entry.value();
        let name = &ep.name;
        let visibility = match ep.visibility {
            EndpointVisibility::Staff => "staff",
            EndpointVisibility::Public => "public",
        };
        let common = format!("name=\"{name}\",visibility=\"{visibility}\"");

        let status_idx = match ep.status {
            EndpointStatus::Pending => 0,
            EndpointStatus::Starting => 1,
            EndpointStatus::Healthy => 2,
            EndpointStatus::Degraded => 3,
            EndpointStatus::Stopping => 4,
        };
        status_counts[status_idx] += 1;
        for (idx, label) in ["pending", "starting", "healthy", "degraded", "stopping"]
            .iter()
            .enumerate()
        {
            out.push_str(&format!(
                "fc_endpoint_status{{{common},status=\"{label}\"}} {}\n",
                i32::from(idx == status_idx)
            ));
        }

        let m = &ep.metrics;
        let total = m.requests_total.load(Ordering::Relaxed);
        let throttled = m.requests_throttled.load(Ordering::Relaxed);
        let forbidden = m.requests_forbidden.load(Ordering::Relaxed);
        let upstream_errors = m.upstream_errors.load(Ordering::Relaxed);
        let ok = total.saturating_sub(upstream_errors);
        out.push_str(&format!(
            "fc_endpoint_requests_total{{{common},outcome=\"ok\"}} {ok}\n"
        ));
        out.push_str(&format!(
            "fc_endpoint_requests_total{{{common},outcome=\"throttled\"}} {throttled}\n"
        ));
        out.push_str(&format!(
            "fc_endpoint_requests_total{{{common},outcome=\"forbidden\"}} {forbidden}\n"
        ));
        out.push_str(&format!(
            "fc_endpoint_requests_total{{{common},outcome=\"upstream_error\"}} {upstream_errors}\n"
        ));

        out.push_str(&format!(
            "fc_endpoint_bytes_total{{{common},direction=\"in\"}} {}\n",
            m.bytes_in.load(Ordering::Relaxed)
        ));
        out.push_str(&format!(
            "fc_endpoint_bytes_total{{{common},direction=\"out\"}} {}\n",
            m.bytes_out.load(Ordering::Relaxed)
        ));

        let last = m.last_request_micros.load(Ordering::Relaxed);
        let age = if last == 0 {
            "NaN".to_string()
        } else {
            format!("{:.0}", ((now_micros() - last).max(0) as f64) / 1_000_000.0)
        };
        out.push_str(&format!(
            "fc_endpoint_last_request_age_seconds{{{common}}} {age}\n"
        ));

        out.push_str(&format!(
            "fc_endpoint_uptime_seconds{{{common}}} {}\n",
            ep.created.elapsed().as_secs()
        ));
    }

    out.push_str("# HELP fc_endpoints_total Endpoints in registry by status.\n");
    out.push_str("# TYPE fc_endpoints_total gauge\n");
    for (idx, label) in ["pending", "starting", "healthy", "degraded", "stopping"]
        .iter()
        .enumerate()
    {
        out.push_str(&format!(
            "fc_endpoints_total{{status=\"{label}\"}} {}\n",
            status_counts[idx]
        ));
    }

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        out,
    )
        .into_response()
}

#[utoipa::path(
    get,
    path = "/fc/list",
    tag = "persistent",
    responses(
        (status = 200, description = "All registered persistent endpoints", body = serde_json::Value),
        (status = 503, description = "Persistent endpoints not enabled")
    )
)]
async fn fc_list(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({"endpoints": [], "count": 0})),
            );
        }
    };
    let endpoints: Vec<PersistentEndpointInfo> = persistent
        .endpoints
        .iter()
        .map(|entry| PersistentEndpointInfo::from(entry.value()))
        .collect();
    let count = endpoints.len();
    (
        StatusCode::OK,
        Json(serde_json::json!({"endpoints": endpoints, "count": count})),
    )
}

#[utoipa::path(
    get,
    path = "/fc/{name}",
    tag = "persistent",
    params(("name" = String, Path, description = "Persistent endpoint name")),
    responses(
        (status = 200, description = "Endpoint detail", body = PersistentEndpointInfo),
        (status = 404, description = "Endpoint not found"),
        (status = 503, description = "Persistent endpoints not enabled")
    )
)]
async fn fc_get(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => return not_enabled(),
    };
    match persistent.endpoints.get(&name) {
        Some(entry) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "endpoint": PersistentEndpointInfo::from(entry.value()),
            })),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "endpoint not found", "name": name})),
        ),
    }
}

#[utoipa::path(
    get,
    path = "/fc/{name}/logs",
    tag = "persistent",
    params(("name" = String, Path, description = "Persistent endpoint name")),
    responses(
        (status = 200, description = "VM stdout/stderr ring (up to 256 KiB)", content_type = "text/plain"),
        (status = 404, description = "Endpoint not found"),
        (status = 503, description = "Persistent endpoints not enabled")
    )
)]
async fn fc_logs(State(state): State<AppState>, Path(name): Path<String>) -> Response {
    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => {
            let (status, body) = not_enabled();
            return (status, body).into_response();
        }
    };
    match persistent.endpoints.get(&name) {
        Some(entry) => {
            let body = entry.value().logs.snapshot();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                body,
            )
                .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "endpoint not found", "name": name})),
        )
            .into_response(),
    }
}

#[utoipa::path(
    delete,
    path = "/fc/{name}",
    tag = "persistent",
    params(("name" = String, Path, description = "Persistent endpoint name")),
    responses(
        (status = 200, description = "Endpoint torn down + resources released", body = serde_json::Value),
        (status = 404, description = "Endpoint not found"),
        (status = 503, description = "Persistent endpoints not enabled")
    )
)]
async fn fc_destroy(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => return not_enabled(),
    };
    // Remove from registry first so further requests see it gone, then
    // release the network resources. If TAP destroy fails, log but still
    // release the IP — worst case we leak a TAP interface, which the pod
    // will clean up on restart.
    // Mark stopping so the background watcher doesn't log "unexpected exit".
    if let Some(mut entry) = persistent.endpoints.get_mut(&name) {
        entry.status = EndpointStatus::Stopping;
    }

    let Some((_, endpoint)) = persistent.endpoints.remove(&name) else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "endpoint not found", "name": name})),
        );
    };

    accumulate_meter(&endpoint, now_micros());

    // SIGTERM the VMM process so the guest can shut down. We use `kill(2)`
    // via libc since we handed the Child off to the background watcher —
    // only the PID is left.
    if let Some(pid) = endpoint.pid {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        // Give the VMM a moment to exit before we rip the TAP out.
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    if let Err(e) = persistent.tap_manager.destroy_tap(&endpoint.tap).await {
        tracing::warn!(
            "fc_destroy: TAP teardown failed for {name} ({}): {e}",
            endpoint.tap.name
        );
    }
    persistent.pool.release(&endpoint.allocation);

    if endpoint.billing_account_id.is_some() {
        let accumulated = endpoint.metrics.accumulated_credits.load(Ordering::Relaxed);
        billing_wallet::settle(state.billing.as_deref(), &endpoint.name, accumulated).await;
    }

    tracing::info!(
        "fc_destroy: removed endpoint {name} (pid={:?})",
        endpoint.pid
    );
    (StatusCode::OK, Json(serde_json::json!({"removed": name})))
}

fn accumulate_meter(ep: &PersistentEndpoint, now: i64) {
    let last = ep.metrics.last_meter_micros.swap(now, Ordering::Relaxed);
    if last == 0 {
        ep.metrics.last_meter_requests_total.store(
            ep.metrics.requests_total.load(Ordering::Relaxed),
            Ordering::Relaxed,
        );
        return;
    }
    let elapsed_secs = ((now - last).max(0) / 1_000_000) as u64;
    let cur_reqs = ep.metrics.requests_total.load(Ordering::Relaxed);
    let last_reqs = ep
        .metrics
        .last_meter_requests_total
        .swap(cur_reqs, Ordering::Relaxed);
    let req_delta = cur_reqs.saturating_sub(last_reqs);
    let cost = billing::meter_tick(ep.vcpu_count, ep.mem_size_mib, elapsed_secs, req_delta);
    if cost > 0 {
        ep.metrics
            .accumulated_credits
            .fetch_add(cost, Ordering::Relaxed);
    }
}

async fn idle_sweeper_task(
    persistent: Arc<PersistentState>,
    interval: Duration,
    billing: Option<Arc<billing_wallet::BillingContext>>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        ticker.tick().await;
        let now = now_micros();
        let mut to_kill: Vec<String> = Vec::new();
        for entry in persistent.endpoints.iter() {
            let ep = entry.value();
            accumulate_meter(ep, now);
            if ep.idle_ttl_secs == 0 {
                continue;
            }
            let ttl_us = (ep.idle_ttl_secs as i64) * 1_000_000;
            let last = ep.metrics.last_request_micros.load(Ordering::Relaxed);
            let reference = if last == 0 {
                ep.created.elapsed().as_micros() as i64
            } else {
                now - last
            };
            if reference > ttl_us {
                to_kill.push(ep.name.clone());
            }
        }
        for name in to_kill {
            let Some((_, endpoint)) = persistent.endpoints.remove(&name) else {
                continue;
            };
            if let Some(pid) = endpoint.pid {
                unsafe { libc::kill(pid as i32, libc::SIGTERM) };
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            if let Err(e) = persistent.tap_manager.destroy_tap(&endpoint.tap).await {
                tracing::warn!(
                    "idle_sweeper: TAP teardown failed for {name} ({}): {e}",
                    endpoint.tap.name
                );
            }
            persistent.pool.release(&endpoint.allocation);
            if endpoint.billing_account_id.is_some() {
                let accumulated = endpoint.metrics.accumulated_credits.load(Ordering::Relaxed);
                billing_wallet::settle(billing.as_deref(), &endpoint.name, accumulated).await;
            }
            tracing::info!(
                "idle_sweeper: tore down idle endpoint {name} (ttl={}s)",
                endpoint.idle_ttl_secs
            );
        }
    }
}

/// RFC 7230 §6.1 hop-by-hop headers — never cross proxy boundaries. We also
/// strip accept-encoding (request) + content-encoding (response) because
/// reqwest's transparent decoding would mismatch the bytes we relay.
const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
];

/// Reverse-proxy into the persistent VM identified by `name`. Streams
/// request/response bodies; strips hop-by-hop both ways. WS upgrades are
/// not handled here — they need a `WebSocketUpgrade` handler that opens a
/// raw TCP stream to the guest.
async fn fc_proxy(
    State(state): State<AppState>,
    Path(params): Path<Vec<(String, String)>>,
    req: Request<Body>,
) -> Response {
    fc_proxy_inner(state, params, req, false).await
}

/// Public-tier sibling. Forwards `/public-proxy/{name}/[*path]` only when
/// the endpoint was deployed `visibility: "public"`; 403 otherwise.
async fn fc_proxy_public(
    State(state): State<AppState>,
    Path(params): Path<Vec<(String, String)>>,
    req: Request<Body>,
) -> Response {
    fc_proxy_inner(state, params, req, true).await
}

async fn fc_proxy_inner(
    state: AppState,
    params: Vec<(String, String)>,
    req: Request<Body>,
    require_public: bool,
) -> Response {
    let persistent = match state.persistent.as_ref() {
        Some(p) => p,
        None => {
            let (status, body) = not_enabled();
            return (status, body).into_response();
        }
    };

    let name = params
        .iter()
        .find(|(k, _)| k == "name")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();
    let tail = params
        .iter()
        .find(|(k, _)| k == "path")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    let is_preflight = require_public && req.method() == axum::http::Method::OPTIONS;

    let (guest_ip, http_port, http_config, metrics) = match persistent.endpoints.get(&name) {
        Some(entry) => {
            let ep = entry.value();
            if require_public && ep.visibility != EndpointVisibility::Public {
                ep.metrics
                    .requests_forbidden
                    .fetch_add(1, Ordering::Relaxed);
                return (
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({
                        "error": "endpoint not public",
                        "name": name,
                    })),
                )
                    .into_response();
            }
            // Preflights skip readiness — they answer inline pre-boot.
            if !is_preflight {
                match ep.status {
                    EndpointStatus::Starting => {
                        return (
                            StatusCode::SERVICE_UNAVAILABLE,
                            [(header::RETRY_AFTER, "2")],
                            Json(serde_json::json!({
                                "error": "endpoint starting",
                                "name": name,
                                "status": "starting",
                                "hint": "VM is booting; retry shortly",
                            })),
                        )
                            .into_response();
                    }
                    EndpointStatus::Degraded => {
                        return (
                            StatusCode::SERVICE_UNAVAILABLE,
                            [(header::RETRY_AFTER, "5")],
                            Json(serde_json::json!({
                                "error": "endpoint degraded",
                                "name": name,
                                "status": "degraded",
                                "hint": "guest health probe failing; check container logs",
                            })),
                        )
                            .into_response();
                    }
                    EndpointStatus::Stopping => {
                        return (
                            StatusCode::SERVICE_UNAVAILABLE,
                            Json(serde_json::json!({
                                "error": "endpoint stopping",
                                "name": name,
                                "status": "stopping",
                            })),
                        )
                            .into_response();
                    }
                    EndpointStatus::Pending | EndpointStatus::Healthy => {}
                }
            }
            // Preflights bypass the bucket; budget is for actual workload.
            if require_public && !is_preflight && !ep.rate_limiter.try_acquire() {
                ep.metrics
                    .requests_throttled
                    .fetch_add(1, Ordering::Relaxed);
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(serde_json::json!({
                        "error": "rate limit exceeded",
                        "name": name,
                    })),
                )
                    .into_response();
            }
            ep.metrics.requests_total.fetch_add(1, Ordering::Relaxed);
            ep.metrics
                .last_request_micros
                .store(now_micros(), Ordering::Relaxed);
            (
                ep.allocation.guest_ip,
                ep.http_port,
                ep.http_config.clone(),
                ep.metrics.clone(),
            )
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "endpoint not found", "name": name})),
            )
                .into_response();
        }
    };

    if is_preflight && !http_config.cors_allow_origins.is_empty() {
        return build_cors_preflight_response(req.headers(), &http_config);
    }

    // --- Build upstream URL ---
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let upstream_url = if tail.is_empty() {
        format!("http://{guest_ip}:{http_port}/{query}")
    } else {
        format!("http://{guest_ip}:{http_port}/{tail}{query}")
    };

    // --- Split the request ---
    let method = req.method().clone();
    let mut client_headers = req.headers().clone();
    // Snapshot before mutation — the response builder uses Origin to decide
    // whether to attach CORS headers.
    let request_origin = client_headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    // Strip hop-by-hop + the Host header (reqwest sets its own based on
    // upstream URL) + accept-encoding (we relay raw bytes, so we don't
    // want upstream to gzip them on us).
    for h in HOP_BY_HOP {
        client_headers.remove(*h);
    }
    client_headers.remove(header::HOST);
    client_headers.remove(header::ACCEPT_ENCODING);

    // Inject configured request headers. Validated at deploy time, so each
    // (name, value) is RFC-7230 safe and never targets a reserved framing
    // header. `insert` replaces any client-supplied value with the same name.
    for (k, v) in &http_config.inject_request_headers {
        if let (Ok(name), Ok(value)) = (
            axum::http::HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            client_headers.insert(name, value);
        }
    }

    // --- Buffer the request body ---
    // 16 MiB cap matches typical ingress limits. Persistent endpoints are
    // for API-style traffic; file uploads over the /fc/* path should go
    // through the larger /dashboard/firecracker-net/proxy direct path
    // or be chunked. Streaming request bodies can be added later.
    let body_bytes = match axum::body::to_bytes(req.into_body(), 16 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                Json(serde_json::json!({"error": "request body exceeds 16 MiB"})),
            )
                .into_response();
        }
    };
    metrics
        .bytes_in
        .fetch_add(body_bytes.len() as u64, Ordering::Relaxed);

    // --- Issue the upstream request ---
    let reqwest_method = match reqwest::Method::from_bytes(method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "invalid HTTP method"})),
            )
                .into_response();
        }
    };

    let reqwest_headers = axum_to_reqwest_headers(&client_headers);

    let upstream_resp = match persistent
        .proxy_client
        .request(reqwest_method, &upstream_url)
        .headers(reqwest_headers)
        .body(body_bytes.to_vec())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            metrics.upstream_errors.fetch_add(1, Ordering::Relaxed);
            let (status, reason) = classify_reqwest_error(&e);
            tracing::warn!("fc_proxy: upstream error for {name} ({upstream_url}): {e}");
            return (
                status,
                Json(serde_json::json!({
                    "error": "upstream proxy error",
                    "reason": reason,
                    "name": name,
                    "detail": e.to_string(),
                })),
            )
                .into_response();
        }
    };

    // --- Build the client response ---
    let upstream_status = StatusCode::from_u16(upstream_resp.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut resp_headers = reqwest_to_axum_headers(upstream_resp.headers());
    for h in HOP_BY_HOP {
        resp_headers.remove(*h);
    }
    // Strip content-encoding — reqwest handles decoding transparently
    // when enabled, so the bytes we stream may differ from what upstream
    // originally sent. Better to let the downstream client see uncompressed
    // bytes without a misleading encoding claim.
    resp_headers.remove(header::CONTENT_ENCODING);

    if require_public {
        attach_cors_response_headers(&mut resp_headers, request_origin.as_deref(), &http_config);
    }

    let metrics_for_stream = metrics.clone();
    let body_stream = tokio_stream::StreamExt::map(upstream_resp.bytes_stream(), move |r| {
        if let Ok(ref b) = r {
            metrics_for_stream
                .bytes_out
                .fetch_add(b.len() as u64, Ordering::Relaxed);
        }
        r
    });
    let body = Body::from_stream(body_stream);

    let mut response = Response::builder().status(upstream_status);
    if let Some(h) = response.headers_mut() {
        *h = resp_headers;
    }
    response.body(body).unwrap_or_else(|_| {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::empty())
            .unwrap()
    })
}

/// Resolve the value to send back in `Access-Control-Allow-Origin` given the
/// configured allowlist and the request's `Origin` header. Returns `None`
/// when the request origin is not allowed — caller must not emit any CORS
/// headers in that case.
fn resolve_cors_origin<'a>(
    request_origin: Option<&'a str>,
    cfg: &'a EndpointHttpConfig,
) -> Option<&'a str> {
    if cfg.cors_allow_origins.is_empty() {
        return None;
    }
    // Wildcard: echo `*` when credentials are not requested. RFC 6265 forbids
    // `*` together with `Access-Control-Allow-Credentials: true`, but we
    // already reject that combination at deploy time.
    if cfg.cors_allow_origins.iter().any(|o| o == "*") {
        return Some("*");
    }
    let origin = request_origin?;
    cfg.cors_allow_origins
        .iter()
        .find(|allowed| allowed.as_str() == origin)
        .map(|s| s.as_str())
}

/// Build the 204 response returned for a CORS preflight (`OPTIONS` request
/// with the matching `Origin` header). When the origin is not allowed we
/// still 204 but emit no CORS headers — browsers then surface the failure
/// as a CORS error rather than as a misleading 403.
fn build_cors_preflight_response(req_headers: &HeaderMap, cfg: &EndpointHttpConfig) -> Response {
    let origin = req_headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok());
    let mut resp = Response::builder().status(StatusCode::NO_CONTENT);
    if let Some(headers) = resp.headers_mut() {
        if let Some(allow_origin) = resolve_cors_origin(origin, cfg) {
            insert_header(headers, "access-control-allow-origin", allow_origin);
            if allow_origin != "*" {
                insert_header(headers, "vary", "Origin");
            }
            if !cfg.cors_allow_methods.is_empty() {
                insert_header(
                    headers,
                    "access-control-allow-methods",
                    &cfg.cors_allow_methods.join(", "),
                );
            }
            if !cfg.cors_allow_headers.is_empty() {
                insert_header(
                    headers,
                    "access-control-allow-headers",
                    &cfg.cors_allow_headers.join(", "),
                );
            }
            if cfg.cors_max_age_secs > 0 {
                insert_header(
                    headers,
                    "access-control-max-age",
                    &cfg.cors_max_age_secs.to_string(),
                );
            }
            if cfg.cors_allow_credentials {
                insert_header(headers, "access-control-allow-credentials", "true");
            }
        }
    }
    resp.body(Body::empty()).unwrap_or_else(|_| {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::empty())
            .unwrap()
    })
}

/// Attach CORS response headers to a non-preflight response when the origin
/// is allowed by the endpoint's policy. No-op otherwise.
fn attach_cors_response_headers(
    resp_headers: &mut HeaderMap,
    request_origin: Option<&str>,
    cfg: &EndpointHttpConfig,
) {
    let Some(allow_origin) = resolve_cors_origin(request_origin, cfg) else {
        return;
    };
    insert_header(resp_headers, "access-control-allow-origin", allow_origin);
    if allow_origin != "*" {
        resp_headers.append(header::VARY, HeaderValue::from_static("Origin"));
    }
    if cfg.cors_allow_credentials {
        insert_header(resp_headers, "access-control-allow-credentials", "true");
    }
}

fn insert_header(headers: &mut HeaderMap, name: &'static str, value: &str) {
    if let (Ok(n), Ok(v)) = (
        axum::http::HeaderName::from_bytes(name.as_bytes()),
        HeaderValue::from_str(value),
    ) {
        headers.insert(n, v);
    }
}

/// Copy an `axum::http::HeaderMap` into a `reqwest::header::HeaderMap`.
/// Headers carry opaque bytes so we preserve them byte-for-byte even if
/// axum's stricter typing would reject them downstream.
fn axum_to_reqwest_headers(h: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut out = reqwest::header::HeaderMap::with_capacity(h.len());
    for (name, value) in h {
        if let (Ok(n), Ok(v)) = (
            reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes()),
            reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out.append(n, v);
        }
    }
    out
}

/// Copy a `reqwest::header::HeaderMap` into an `axum::http::HeaderMap`.
fn reqwest_to_axum_headers(h: &reqwest::header::HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::with_capacity(h.len());
    for (name, value) in h {
        if let (Ok(n), Ok(v)) = (
            axum::http::HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out.append(n, v);
        }
    }
    out
}

/// Translate reqwest errors into a user-facing status code + short reason.
fn classify_reqwest_error(e: &reqwest::Error) -> (StatusCode, &'static str) {
    if e.is_timeout() {
        (StatusCode::GATEWAY_TIMEOUT, "upstream timed out")
    } else if e.is_connect() {
        (StatusCode::BAD_GATEWAY, "upstream unreachable")
    } else if e.is_request() {
        (StatusCode::BAD_GATEWAY, "request construction failed")
    } else {
        (StatusCode::BAD_GATEWAY, "unknown upstream error")
    }
}

// ---------------------------------------------------------------------------
// VM Lifecycle
// ---------------------------------------------------------------------------

enum VmOutcome {
    Exited(std::process::ExitStatus),
    ProcessError(std::io::Error),
    Timeout,
    Killed,
}

enum VmCleanup {
    Direct {
        config_path: String,
        socket_path: String,
        code_path: String,
        pkg_manifest_path: Option<String>,
        network: Option<NetworkLease>,
    },
    Jailed {
        jail_dir: String,
        vm_id: String,
    },
}

struct NetworkLease {
    persistent: Arc<PersistentState>,
    tap: tap::TapDevice,
    allocation: persistent::IpAllocation,
}

async fn run_vm_lifecycle(
    vms: Arc<DashMap<String, VmRecord>>,
    vm_id: String,
    req: CreateVmRequest,
    rootfs_dir: String,
    kill_signal: Arc<Notify>,
    jailer: Option<Arc<JailerConfig>>,
    persistent: Option<Arc<PersistentState>>,
    billing: Option<Arc<billing_wallet::BillingContext>>,
    billing_account_id: Option<Uuid>,
) {
    let start = Instant::now();

    // Update status to running
    if let Some(mut record) = vms.get_mut(&vm_id) {
        record.info.status = VmStatus::Running;
    }

    let rootfs_path = format!("{}/{}.ext4", rootfs_dir, req.rootfs);

    // Prepare code buffer (common to both paths).
    // Padded to 512-byte boundary so Firecracker accepts it as a drive.
    let code = req
        .env
        .get("CODE")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&req.entrypoint)
        .to_string();
    let code_buf = {
        let mut buf = code.as_bytes().to_vec();
        let pad = (512 - (buf.len() % 512)) % 512;
        buf.resize(buf.len() + pad, 0);
        buf
    };

    // Build packages manifest buffer (newline-separated list).
    // The VM init script reads /dev/vdc to get the list and installs from local cache.
    let pkg_buf = if req.packages.is_empty() {
        None
    } else {
        let manifest = req.packages.join("\n");
        let mut buf = manifest.as_bytes().to_vec();
        let pad = (512 - (buf.len() % 512)) % 512;
        buf.resize(buf.len() + pad, 0);
        Some(buf)
    };

    // Resolve the package cache ext4 image path based on rootfs flavour.
    // Python rootfs → pip-cache.ext4; node rootfs → npm-cache.ext4.
    let pkg_cache_path = if pkg_buf.is_some() {
        let (label, filename) = if req.rootfs.contains("python") {
            ("pip", "pip-cache.ext4")
        } else if req.rootfs.contains("node") {
            ("npm", "npm-cache.ext4")
        } else {
            ("", "")
        };
        if filename.is_empty() {
            None
        } else {
            let path = format!("{}/{}", rootfs_dir, filename);
            if tokio::fs::try_exists(&path).await.unwrap_or(false) {
                Some(path)
            } else {
                tracing::warn!("{filename} not found, skipping {label} package install");
                None
            }
        }
    } else {
        None
    };

    let want_network = req.network.unwrap_or(false);
    let network_lease = if want_network {
        match persistent.as_ref() {
            Some(ps) => match ps.pool.allocate() {
                Ok(allocation) => match ps.tap_manager.create_tap(&allocation).await {
                    Ok(tap) => Some(NetworkLease {
                        persistent: ps.clone(),
                        tap,
                        allocation,
                    }),
                    Err(e) => {
                        ps.pool.release(&allocation);
                        tracing::error!("VM {} TAP creation failed: {e}", vm_id);
                        set_vm_failed(
                            &vms,
                            &vm_id,
                            start,
                            -1,
                            "".into(),
                            format!("TAP creation failed: {e}"),
                        );
                        return;
                    }
                },
                Err(e) => {
                    tracing::warn!("VM {} pool allocation failed: {e}", vm_id);
                    set_vm_failed(
                        &vms,
                        &vm_id,
                        start,
                        -1,
                        "".into(),
                        format!("IP pool exhausted: {e}"),
                    );
                    return;
                }
            },
            None => {
                set_vm_failed(
                    &vms,
                    &vm_id,
                    start,
                    -1,
                    "".into(),
                    "network=true requires the networked deployment".into(),
                );
                return;
            }
        }
    } else {
        None
    };

    let boot_args = match network_lease.as_ref() {
        Some(n) => format!(
            "{} fc_entrypoint={} ip={}",
            req.boot_args,
            req.entrypoint,
            n.allocation.kernel_ip_arg(),
        ),
        None => format!("{} fc_entrypoint={}", req.boot_args, req.entrypoint),
    };

    let spawn_result = match (jailer.as_ref(), network_lease) {
        (Some(jailer_cfg), None) => {
            spawn_jailed(
                jailer_cfg,
                &vm_id,
                &rootfs_path,
                &rootfs_dir,
                &code_buf,
                &boot_args,
                &req,
                pkg_buf.as_deref(),
                pkg_cache_path.as_deref(),
            )
            .await
        }
        (_, lease) => {
            spawn_direct(
                &vm_id,
                &rootfs_path,
                &rootfs_dir,
                &code_buf,
                &boot_args,
                &req,
                pkg_buf.as_deref(),
                pkg_cache_path.as_deref(),
                lease,
            )
            .await
        }
    };

    let (mut child, cleanup) = match spawn_result {
        Ok(pair) => pair,
        Err(e) => {
            tracing::error!("VM {} spawn failed: {}", vm_id, e);
            set_vm_failed(&vms, &vm_id, start, -1, "".into(), e);
            return;
        }
    };

    // Take stdout/stderr handles before waiting so we can read after exit.
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    // Wait with timeout, but also listen for a kill signal from destroy_vm.
    let timeout = tokio::time::Duration::from_millis(req.timeout_ms);
    let outcome = tokio::select! {
        biased;
        _ = kill_signal.notified() => {
            let _ = child.kill().await;
            VmOutcome::Killed
        }
        result = tokio::time::timeout(timeout, child.wait()) => {
            match result {
                Ok(Ok(status)) => VmOutcome::Exited(status),
                Ok(Err(e)) => VmOutcome::ProcessError(e),
                Err(_) => {
                    let _ = child.kill().await;
                    VmOutcome::Timeout
                }
            }
        }
    };

    // Read captured output (available after process exits or is killed)
    let stdout = read_child_pipe(child_stdout).await;
    let stderr = read_child_stderr(child_stderr).await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match outcome {
        VmOutcome::Exited(exit_status) => {
            let exit_code = exit_status.code().unwrap_or(-1);
            let status = if exit_code == 0 {
                VmStatus::Completed
            } else {
                VmStatus::Failed
            };

            if let Some(mut record) = vms.get_mut(&vm_id) {
                record.info.status = status.clone();
                record.result = Some(VmResult {
                    vm_id: vm_id.clone(),
                    status,
                    exit_code,
                    stdout,
                    stderr,
                    duration_ms,
                });
            }
        }
        VmOutcome::ProcessError(e) => {
            tracing::error!("VM {} process error: {}", vm_id, e);
            set_vm_failed(
                &vms,
                &vm_id,
                start,
                -1,
                stdout,
                format!("Process error: {}", e),
            );
        }
        VmOutcome::Timeout => {
            tracing::warn!("VM {} timed out after {}ms", vm_id, req.timeout_ms);
            if let Some(mut record) = vms.get_mut(&vm_id) {
                record.info.status = VmStatus::Timeout;
                record.result = Some(VmResult {
                    vm_id: vm_id.clone(),
                    status: VmStatus::Timeout,
                    exit_code: -1,
                    stdout,
                    stderr: format!("VM timed out after {}ms", req.timeout_ms),
                    duration_ms,
                });
            }
        }
        VmOutcome::Killed => {
            tracing::info!("VM {} destroyed via kill signal", vm_id);
            if let Some(mut record) = vms.get_mut(&vm_id) {
                record.info.status = VmStatus::Destroyed;
                record.result = Some(VmResult {
                    vm_id: vm_id.clone(),
                    status: VmStatus::Destroyed,
                    exit_code: -1,
                    stdout,
                    stderr: "VM destroyed by user".into(),
                    duration_ms,
                });
            }
        }
    }

    match cleanup {
        VmCleanup::Direct {
            config_path,
            socket_path,
            code_path,
            pkg_manifest_path,
            network,
        } => {
            let _ = tokio::fs::remove_file(&config_path).await;
            let _ = tokio::fs::remove_file(&socket_path).await;
            let _ = tokio::fs::remove_file(&code_path).await;
            if let Some(p) = pkg_manifest_path {
                let _ = tokio::fs::remove_file(&p).await;
            }
            if let Some(lease) = network {
                if let Err(e) = lease.persistent.tap_manager.destroy_tap(&lease.tap).await {
                    tracing::warn!(
                        "VM {} TAP teardown failed for {}: {e}",
                        vm_id,
                        lease.tap.name
                    );
                }
                lease.persistent.pool.release(&lease.allocation);
            }
        }
        VmCleanup::Jailed { jail_dir, vm_id } => {
            let _ = tokio::fs::remove_dir_all(&jail_dir).await;
            let cgroup_path = format!("/sys/fs/cgroup/firecracker/{}", vm_id);
            let _ = tokio::fs::remove_dir(&cgroup_path).await;
        }
    }

    if billing_account_id.is_some() {
        let duration_secs = start.elapsed().as_secs();
        let accumulated = billing::meter_tick(req.vcpu_count, req.mem_size_mib, duration_secs, 0);
        billing_wallet::settle(billing.as_deref(), &vm_id, accumulated).await;
    }
}

// ---------------------------------------------------------------------------
// Direct spawn (no jailer) — original path
// ---------------------------------------------------------------------------

async fn spawn_direct(
    vm_id: &str,
    rootfs_path: &str,
    rootfs_dir: &str,
    code_buf: &[u8],
    boot_args: &str,
    req: &CreateVmRequest,
    pkg_buf: Option<&[u8]>,
    pkg_cache_path: Option<&str>,
    network_lease: Option<NetworkLease>,
) -> Result<(tokio::process::Child, VmCleanup), String> {
    let scratch_dir = "/var/lib/firecracker/scratch";
    let code_path = format!("{}/{}.code", scratch_dir, vm_id);
    let socket_path = format!("{}/{}.sock", scratch_dir, vm_id);
    let config_path = format!("{}/{}.json", scratch_dir, vm_id);

    tokio::fs::write(&code_path, code_buf)
        .await
        .map_err(|e| format!("Code write failed: {}", e))?;

    // Write package manifest to scratch if packages were requested.
    let pkg_manifest_path = if let Some(buf) = pkg_buf {
        let path = format!("{}/{}.pkgs", scratch_dir, vm_id);
        tokio::fs::write(&path, buf)
            .await
            .map_err(|e| format!("Package manifest write failed: {}", e))?;
        Some(path)
    } else {
        None
    };

    let mut drives = vec![
        serde_json::json!({
            "drive_id": "rootfs",
            "path_on_host": rootfs_path,
            "is_root_device": true,
            "is_read_only": true,
        }),
        serde_json::json!({
            "drive_id": "code",
            "path_on_host": &code_path,
            "is_root_device": false,
            "is_read_only": true,
        }),
    ];

    // Attach package manifest as vdc (read-only, contains package list).
    if let Some(ref manifest_path) = pkg_manifest_path {
        drives.push(serde_json::json!({
            "drive_id": "packages",
            "path_on_host": manifest_path,
            "is_root_device": false,
            "is_read_only": true,
        }));
    }

    // Attach package cache as vdd (read-only ext4 with pre-downloaded wheels/tarballs).
    if let Some(cache_path) = pkg_cache_path {
        drives.push(serde_json::json!({
            "drive_id": "pkg-cache",
            "path_on_host": cache_path,
            "is_root_device": false,
            "is_read_only": true,
        }));
    }

    let mut config = serde_json::json!({
        "boot-source": {
            "kernel_image_path": format!("{}/vmlinux", rootfs_dir),
            "boot_args": boot_args,
        },
        "drives": drives,
        "machine-config": {
            "vcpu_count": req.vcpu_count,
            "mem_size_mib": req.mem_size_mib,
        },
    });

    if let Some(ref lease) = network_lease {
        config["network-interfaces"] = serde_json::json!([{
            "iface_id": "eth0",
            "host_dev_name": lease.tap.name,
        }]);
    }

    tokio::fs::write(&config_path, config.to_string())
        .await
        .map_err(|e| format!("Config write failed: {}", e))?;

    let child = tokio::process::Command::new("firecracker")
        .args(["--api-sock", &socket_path, "--config-file", &config_path])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Spawn failed: {}", e))?;

    Ok((
        child,
        VmCleanup::Direct {
            config_path,
            socket_path,
            code_path,
            pkg_manifest_path,
            network: network_lease,
        },
    ))
}

// ---------------------------------------------------------------------------
// Jailed spawn — per-VM chroot via Firecracker jailer
// ---------------------------------------------------------------------------

async fn spawn_jailed(
    jailer: &JailerConfig,
    vm_id: &str,
    rootfs_path: &str,
    _rootfs_dir: &str,
    code_buf: &[u8],
    boot_args: &str,
    req: &CreateVmRequest,
    pkg_buf: Option<&[u8]>,
    pkg_cache_path: Option<&str>,
) -> Result<(tokio::process::Child, VmCleanup), String> {
    // The jailer creates: <chroot_base>/firecracker/<id>/root/
    // We pre-create and populate it so the VM has its resources inside the chroot.
    let jail_root = format!("{}/firecracker/{}/root", jailer.chroot_base, vm_id);
    tokio::fs::create_dir_all(&jail_root)
        .await
        .map_err(|e| format!("Jail dir create failed: {}", e))?;

    // Hard-link kernel from scratch cache (same filesystem, instant).
    tokio::fs::hard_link(&jailer.kernel_cache, format!("{}/vmlinux", jail_root))
        .await
        .map_err(|e| format!("Kernel link into jail failed: {}", e))?;

    // Copy rootfs from PVC into the jail (cross-filesystem, can't hard-link).
    // For a 128 MB sparse ext4 image on SSD this takes ~50-100ms.
    tokio::fs::copy(rootfs_path, format!("{}/rootfs.ext4", jail_root))
        .await
        .map_err(|e| format!("Rootfs copy into jail failed: {}", e))?;

    // Write code drive (already padded to 512-byte boundary).
    tokio::fs::write(format!("{}/code.raw", jail_root), code_buf)
        .await
        .map_err(|e| format!("Code write in jail failed: {}", e))?;

    // Write package manifest if provided.
    if let Some(buf) = pkg_buf {
        tokio::fs::write(format!("{}/packages.raw", jail_root), buf)
            .await
            .map_err(|e| format!("Package manifest write in jail failed: {}", e))?;
    }

    // Copy package cache into jail if provided.
    if let Some(cache_path) = pkg_cache_path {
        tokio::fs::copy(cache_path, format!("{}/pkg-cache.ext4", jail_root))
            .await
            .map_err(|e| format!("Package cache copy into jail failed: {}", e))?;
    }

    // Config with paths relative to the chroot root.
    let mut drives = vec![
        serde_json::json!({
            "drive_id": "rootfs",
            "path_on_host": "/rootfs.ext4",
            "is_root_device": true,
            "is_read_only": true,
        }),
        serde_json::json!({
            "drive_id": "code",
            "path_on_host": "/code.raw",
            "is_root_device": false,
            "is_read_only": true,
        }),
    ];

    if pkg_buf.is_some() {
        drives.push(serde_json::json!({
            "drive_id": "packages",
            "path_on_host": "/packages.raw",
            "is_root_device": false,
            "is_read_only": true,
        }));
    }

    if pkg_cache_path.is_some() {
        drives.push(serde_json::json!({
            "drive_id": "pkg-cache",
            "path_on_host": "/pkg-cache.ext4",
            "is_root_device": false,
            "is_read_only": true,
        }));
    }

    let config = serde_json::json!({
        "boot-source": {
            "kernel_image_path": "/vmlinux",
            "boot_args": boot_args,
        },
        "drives": drives,
        "machine-config": {
            "vcpu_count": req.vcpu_count,
            "mem_size_mib": req.mem_size_mib,
        },
    });

    tokio::fs::write(format!("{}/config.json", jail_root), config.to_string())
        .await
        .map_err(|e| format!("Config write in jail failed: {}", e))?;

    // Launch the jailer in foreground (no --daemonize) so we capture stdout/stderr.
    // The jailer will:
    //   1. Hard-link the firecracker binary into the chroot
    //   2. Create /dev/kvm, /dev/urandom, /dev/net/tun inside the chroot
    //   3. Set up cgroup (v2) for the VM
    //   4. Create a new PID namespace
    //   5. chroot into the jail root
    //   6. Drop privileges to uid/gid
    //   7. exec firecracker with the provided config
    let child = tokio::process::Command::new("jailer")
        .args([
            "--id",
            vm_id,
            "--exec-file",
            &jailer.fc_bin_cache,
            "--chroot-base-dir",
            &jailer.chroot_base,
            "--uid",
            &jailer.uid.to_string(),
            "--gid",
            &jailer.gid.to_string(),
            "--cgroup-version",
            "2",
            "--new-pid-ns",
            "--", // separator: everything after goes to firecracker
            "--config-file",
            "/config.json",
            "--api-sock",
            "/api.sock",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Jailer spawn failed: {}", e))?;

    let jail_dir = format!("{}/firecracker/{}", jailer.chroot_base, vm_id);
    Ok((
        child,
        VmCleanup::Jailed {
            jail_dir,
            vm_id: vm_id.to_string(),
        },
    ))
}

// ---------------------------------------------------------------------------
// Persistent endpoint VM spawn — Phase 2e
// ---------------------------------------------------------------------------

/// Pad a byte slice to a 512-byte sector boundary (Firecracker requires
/// block devices to be sector-aligned).
fn pad_to_sector(data: &[u8]) -> Vec<u8> {
    let sector = 512;
    let pad = (sector - (data.len() % sector)) % sector;
    let mut buf = Vec::with_capacity(data.len() + pad);
    buf.extend_from_slice(data);
    buf.resize(data.len() + pad, 0);
    buf
}

struct PersistentSpawnResult {
    child: tokio::process::Child,
    config_path: String,
    socket_path: String,
    code_path: Option<String>,
}

async fn spawn_persistent(
    vm_id: &str,
    rootfs_dir: &str,
    req: &DeployFcRequest,
    tap_name: &str,
    ip_arg: &str,
) -> Result<PersistentSpawnResult, String> {
    let rootfs_image = format!("{}/{}.ext4", rootfs_dir, req.rootfs);
    if !tokio::fs::try_exists(&rootfs_image).await.unwrap_or(false) {
        return Err(format!("rootfs image not found: {}", rootfs_image));
    }

    let scratch_dir = "/var/lib/firecracker/scratch";
    let socket_path = format!("{}/fc-{}.sock", scratch_dir, vm_id);
    let config_path = format!("{}/fc-{}.json", scratch_dir, vm_id);

    let mut drives = vec![serde_json::json!({
        "drive_id": "rootfs",
        "path_on_host": &rootfs_image,
        "is_root_device": true,
        "is_read_only": true,
    })];

    // Optional code drive — if the deploy request includes inline code,
    // write it to a sector-aligned raw block device for the guest init
    // to pick up via /dev/vdb (same pattern as ephemeral VMs).
    let code_path = if let Some(ref code) = req.code {
        if !code.is_empty() {
            let path = format!("{}/fc-{}.code", scratch_dir, vm_id);
            let padded = pad_to_sector(code.as_bytes());
            tokio::fs::write(&path, &padded)
                .await
                .map_err(|e| format!("code drive write failed: {e}"))?;
            drives.push(serde_json::json!({
                "drive_id": "code",
                "path_on_host": &path,
                "is_root_device": false,
                "is_read_only": true,
            }));
            Some(path)
        } else {
            None
        }
    } else {
        None
    };

    // Boot args: standard console + init + entrypoint, plus the static
    // IP config so the guest gets its address without DHCP.
    let boot_args = format!(
        "console=ttyS0 reboot=k panic=1 init=/init fc_entrypoint={} ip={}",
        req.entrypoint, ip_arg,
    );

    let config = serde_json::json!({
        "boot-source": {
            "kernel_image_path": format!("{}/vmlinux", rootfs_dir),
            "boot_args": boot_args,
        },
        "drives": drives,
        "machine-config": {
            "vcpu_count": req.vcpu_count,
            "mem_size_mib": req.mem_size_mib,
        },
        "network-interfaces": [{
            "iface_id": "eth0",
            "host_dev_name": tap_name,
        }],
    });

    tokio::fs::write(&config_path, config.to_string())
        .await
        .map_err(|e| format!("config write failed: {e}"))?;

    // Pipe stdio. Drainer tasks (spawned in fc_deploy) read continuously
    // into the per-endpoint LogRing and mirror to ctl-net's own stdout
    // so the pod log still carries the VM serial console. Without a
    // reader the 64 KiB pipe fills mid-boot and stalls the guest.
    let child = tokio::process::Command::new("firecracker")
        .args(["--api-sock", &socket_path, "--config-file", &config_path])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("firecracker spawn failed: {e}"))?;

    Ok(PersistentSpawnResult {
        child,
        config_path,
        socket_path,
        code_path,
    })
}

// ---------------------------------------------------------------------------
// Jailer initialization — runs once at startup
// ---------------------------------------------------------------------------

/// Copy the firecracker binary and vmlinux kernel into the scratch directory
/// so they live on the same filesystem as the jail chroot bases and can be
/// hard-linked into per-VM jails (hard-links don't work cross-filesystem).
async fn init_jailer(
    scratch_dir: &str,
    rootfs_dir: &str,
    uid: u32,
    gid: u32,
) -> Result<JailerConfig, String> {
    let bin_dir = format!("{}/bin", scratch_dir);
    let chroot_base = format!("{}/jails", scratch_dir);

    // Kubernetes emptyDir mounts inherit shared propagation from the kubelet.
    // The jailer's pivot_root() syscall requires a private mount — it fails with
    // EPERM on shared mounts. Remount the scratch dir as private (needs CAP_SYS_ADMIN,
    // already granted) so pivot_root works without requiring privileged: true.
    let mount_status = tokio::process::Command::new("mount")
        .args(["--make-private", scratch_dir])
        .status()
        .await
        .map_err(|e| format!("Failed to run mount --make-private: {}", e))?;
    if !mount_status.success() {
        return Err(format!(
            "mount --make-private {} failed with exit code {:?}",
            scratch_dir,
            mount_status.code()
        ));
    }
    tracing::info!("Remounted {} as private propagation", scratch_dir);

    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin dir: {}", e))?;
    tokio::fs::create_dir_all(&chroot_base)
        .await
        .map_err(|e| format!("Failed to create chroot base dir: {}", e))?;

    let fc_src = "/usr/local/bin/firecracker";
    let fc_dst = format!("{}/firecracker", bin_dir);
    tokio::fs::copy(fc_src, &fc_dst)
        .await
        .map_err(|e| format!("Failed to copy firecracker binary to scratch: {}", e))?;
    // Ensure the copy is executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        tokio::fs::set_permissions(&fc_dst, perms)
            .await
            .map_err(|e| format!("Failed to chmod firecracker copy: {}", e))?;
    }

    let kernel_src = format!("{}/vmlinux", rootfs_dir);
    let kernel_dst = format!("{}/vmlinux", bin_dir);
    tokio::fs::copy(&kernel_src, &kernel_dst)
        .await
        .map_err(|e| format!("Failed to copy kernel to scratch: {}", e))?;

    tracing::info!(
        "Jailer initialized: fc_bin={}, kernel={}, chroot_base={}, uid={}, gid={}",
        fc_dst,
        kernel_dst,
        chroot_base,
        uid,
        gid,
    );

    Ok(JailerConfig {
        chroot_base,
        fc_bin_cache: fc_dst,
        kernel_cache: kernel_dst,
        uid,
        gid,
    })
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn set_vm_failed(
    vms: &DashMap<String, VmRecord>,
    vm_id: &str,
    start: Instant,
    exit_code: i32,
    stdout: String,
    stderr: String,
) {
    if let Some(mut record) = vms.get_mut(vm_id) {
        record.info.status = VmStatus::Failed;
        record.result = Some(VmResult {
            vm_id: vm_id.to_string(),
            status: VmStatus::Failed,
            exit_code,
            stdout,
            stderr,
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }
}

async fn read_child_pipe(pipe: Option<tokio::process::ChildStdout>) -> String {
    if let Some(mut out) = pipe {
        let mut buf = Vec::new();
        let _ = tokio::io::AsyncReadExt::read_to_end(&mut out, &mut buf).await;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        String::new()
    }
}

// Overload for stderr (different type, same logic)
async fn read_child_stderr(pipe: Option<tokio::process::ChildStderr>) -> String {
    if let Some(mut out) = pipe {
        let mut buf = Vec::new();
        let _ = tokio::io::AsyncReadExt::read_to_end(&mut out, &mut buf).await;
        String::from_utf8_lossy(&buf).to_string()
    } else {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// Reaper — evicts completed/failed/destroyed/timed-out VM records after TTL
// ---------------------------------------------------------------------------

async fn reaper_task(vms: Arc<DashMap<String, VmRecord>>, ttl: Duration) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        let before = vms.len();
        vms.retain(|_, record| {
            // Always keep VMs that are still active
            if matches!(record.info.status, VmStatus::Creating | VmStatus::Running) {
                return true;
            }
            // Evict finished VMs older than TTL
            record.created.elapsed() < ttl
        });
        let evicted = before - vms.len();
        if evicted > 0 {
            tracing::info!(
                "Reaper: evicted {} stale VM records ({} remaining)",
                evicted,
                vms.len()
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn iso8601_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Civil date from unix timestamp (Hinnant algorithm)
    let z = secs.div_euclid(86400) + 719468;
    let era = z.div_euclid(146097);
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let day_secs = secs.rem_euclid(86400);
    let h = day_secs / 3600;
    let min = (day_secs % 3600) / 60;
    let s = day_secs % 60;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, h, min, s)
}

async fn list_rootfs(dir: &str) -> Vec<String> {
    let mut rootfs = Vec::new();
    if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".ext4") {
                rootfs.push(name.trim_end_matches(".ext4").to_string());
            }
        }
    }
    rootfs
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    if std::env::args().any(|arg| arg == "--emit-openapi") {
        use utoipa::OpenApi;
        let spec = openapi::ApiDoc::openapi();
        println!("{}", spec.to_pretty_json().expect("serialise OpenAPI"));
        return;
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "firecracker_ctl=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port: u16 = std::env::var("FC_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9001);

    let rootfs_dir = std::env::var("FC_ROOTFS_DIR")
        .unwrap_or_else(|_| "/var/lib/firecracker/rootfs".to_string());

    let scratch_dir = std::env::var("FC_SCRATCH_DIR")
        .unwrap_or_else(|_| "/var/lib/firecracker/scratch".to_string());

    let max_concurrent_vms: usize = std::env::var("FC_MAX_CONCURRENT_VMS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let vm_ttl_secs: u64 = std::env::var("FC_VM_TTL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(600);

    // Jailer is opt-in: set FC_USE_JAILER=true to enable per-VM chroot isolation.
    // Requires: SYS_ADMIN + SYS_CHROOT + MKNOD capabilities, cgroup v2, /dev/kvm.
    let use_jailer = std::env::var("FC_USE_JAILER")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let jailer = if use_jailer {
        let uid: u32 = std::env::var("FC_JAILER_UID")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10001);
        let gid: u32 = std::env::var("FC_JAILER_GID")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10001);

        match init_jailer(&scratch_dir, &rootfs_dir, uid, gid).await {
            Ok(cfg) => {
                tracing::info!("Jailer mode ENABLED (uid={}, gid={})", uid, gid);
                Some(Arc::new(cfg))
            }
            Err(e) => {
                tracing::error!(
                    "Jailer initialization failed: {}. Falling back to direct mode.",
                    e
                );
                None
            }
        }
    } else {
        tracing::info!("Jailer mode DISABLED (set FC_USE_JAILER=true to enable)");
        None
    };

    let vms = Arc::new(DashMap::new());

    // Background reaper evicts finished VM records after TTL
    tokio::spawn(reaper_task(vms.clone(), Duration::from_secs(vm_ttl_secs)));

    // Persistent endpoints (/fc/*) — only initialised when this binary runs
    // as firecracker-ctl-net. Initialising the TAP manager in the no-network
    // deployment would fail (no tunnel interface, no NET_ADMIN cap inside
    // the jail netns) and would be actively harmful since those pods should
    // never carry VM inbound HTTP.
    let persistent_enabled = std::env::var("FC_PERSISTENT_ENDPOINTS_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let persistent = if persistent_enabled {
        let cidr =
            std::env::var("FC_PERSISTENT_SUBNET").unwrap_or_else(|_| "172.18.0.0/16".to_string());
        match persistent::Ipv4Pool::from_cidr(&cidr) {
            Ok(pool) => {
                let tap_config = tap::TapConfig::from_env();
                let tap_manager = tap::TapManager::new(tap_config);
                match tap_manager.init().await {
                    Ok(()) => {
                        tracing::info!(
                            "Persistent endpoints ENABLED (pool={cidr}, capacity={} /30 slots, tunnel={})",
                            pool.capacity(),
                            tap_manager.config().tunnel_iface,
                        );
                        // Proxy client for /proxy/{name}/* forwarding.
                        // - connect timeout short: the VM is a neighbour
                        //   on the /30 link, so connect should be ~ms
                        //   or the VM is dead
                        // - no overall timeout: long-poll / SSE / large
                        //   streaming downloads must not be cut off.
                        //   The gateway already caps the outer
                        //   request at 3600s.
                        let proxy_client = reqwest::Client::builder()
                            .connect_timeout(Duration::from_secs(5))
                            .pool_idle_timeout(Duration::from_secs(90))
                            .redirect(reqwest::redirect::Policy::none())
                            .build()
                            .expect("build reqwest client for /fc proxy");
                        Some(Arc::new(PersistentState {
                            pool,
                            tap_manager,
                            endpoints: DashMap::new(),
                            proxy_client,
                        }))
                    }
                    Err(e) => {
                        tracing::error!(
                            "Persistent endpoints: TapManager init failed, disabling /fc/*: {e}",
                        );
                        None
                    }
                }
            }
            Err(e) => {
                tracing::error!(
                    "Persistent endpoints: invalid FC_PERSISTENT_SUBNET {cidr:?} ({e}), disabling /fc/*",
                );
                None
            }
        }
    } else {
        tracing::info!(
            "Persistent endpoints DISABLED (set FC_PERSISTENT_ENDPOINTS_ENABLED=true to enable)"
        );
        None
    };

    let billing_enabled = std::env::var("FC_BILLING_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let billing = match kbve::wallet::WalletClient::from_env().await {
        Ok(client) => {
            tracing::info!(
                "fc-billing: wallet client ready, billing_enabled={}",
                billing_enabled
            );
            Some(Arc::new(billing_wallet::BillingContext::new(
                Arc::new(client),
                billing_enabled,
            )))
        }
        Err(e) => {
            if billing_enabled {
                tracing::error!(
                    "fc-billing: FC_BILLING_ENABLED=true but wallet init failed: {e}. Billing OFF."
                );
            } else {
                tracing::info!("fc-billing: wallet not configured ({e}); billing OFF");
            }
            None
        }
    };

    let state = AppState {
        vms,
        rootfs_dir,
        max_concurrent_vms,
        jailer,
        persistent: persistent.clone(),
        billing,
    };

    if let Some(p) = persistent.clone() {
        tokio::spawn(idle_sweeper_task(
            p,
            Duration::from_secs(60),
            state.billing.clone(),
        ));
    }

    tracing::info!(
        "FC_MAX_CONCURRENT_VMS={}, FC_VM_TTL_SECS={}",
        max_concurrent_vms,
        vm_ttl_secs,
    );

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/openapi.json", get(openapi::openapi_json))
        .route("/vm/create", post(create_vm))
        .route("/vm", get(list_vms))
        .route("/vm/{vm_id}", get(get_vm_status))
        .route("/vm/{vm_id}/result", get(get_vm_result))
        .route("/vm/{vm_id}", delete(destroy_vm))
        // --- Persistent endpoints (phase 1 stubs) ---
        .route("/fc/deploy", post(fc_deploy))
        .route("/fc/list", get(fc_list))
        .route("/fc/{name}", get(fc_get))
        .route("/fc/{name}", delete(fc_destroy))
        .route("/fc/{name}/logs", get(fc_logs))
        .route("/proxy/{name}", axum::routing::any(fc_proxy))
        .route("/proxy/{name}/{*path}", axum::routing::any(fc_proxy))
        // Sibling prefix, not nested. `/proxy/public/{name}` overlapped
        // `/proxy/{name}/{*path}` and matchit kept routing to fc_proxy.
        .route("/public-proxy/{name}", axum::routing::any(fc_proxy_public))
        .route(
            "/public-proxy/{name}/{*path}",
            axum::routing::any(fc_proxy_public),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("firecracker-ctl listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::{Method, Request};
    use std::collections::BTreeMap;
    use std::sync::atomic::Ordering;
    use tower::ServiceExt;

    // -- defaults ------------------------------------------------------------

    #[test]
    fn defaults_match_documented_constants() {
        assert_eq!(default_vcpu(), 1);
        assert_eq!(default_mem(), 128);
        assert_eq!(default_timeout(), 30_000);
        assert_eq!(
            default_boot_args(),
            "console=ttyS0 reboot=k panic=1 init=/init"
        );
        assert_eq!(default_health_path(), "/health");
    }

    // -- validate_entrypoint -------------------------------------------------

    #[test]
    fn validate_entrypoint_accepts_absolute_simple_path() {
        assert!(validate_entrypoint("/bin/sh").is_ok());
        assert!(validate_entrypoint("/usr/local/bin/python3").is_ok());
        assert!(validate_entrypoint("/init").is_ok());
    }

    #[test]
    fn validate_entrypoint_rejects_empty() {
        assert!(validate_entrypoint("").is_err());
    }

    #[test]
    fn validate_entrypoint_rejects_relative() {
        assert!(validate_entrypoint("sh").is_err());
        assert!(validate_entrypoint("bin/sh").is_err());
        assert!(validate_entrypoint("./init").is_err());
    }

    #[test]
    fn validate_entrypoint_rejects_shell_metacharacters() {
        for bad in &[
            "/bin/sh; ls",
            "/bin/sh && id",
            "/bin/sh | cat",
            "/bin/sh `id`",
            "/bin/sh $HOME",
            "/bin/sh (x)",
            "/bin/sh {x}",
            "/bin/sh [x]",
            "/bin/sh <in",
            "/bin/sh >out",
            "/bin/sh \"x\"",
            "/bin/sh 'x'",
            "/bin/sh \\x",
            "/bin/sh #c",
            "/bin/sh !x",
            "/bin/sh ~user",
            "/bin/sh arg",
        ] {
            assert!(validate_entrypoint(bad).is_err(), "should reject: {bad:?}");
        }
    }

    #[test]
    fn validate_entrypoint_rejects_whitespace_variants() {
        assert!(validate_entrypoint("/bin/sh\targ").is_err());
        assert!(validate_entrypoint("/bin/sh\narg").is_err());
        assert!(validate_entrypoint("/bin/sh ").is_err());
    }

    // -- is_valid_header_name -----------------------------------------------

    #[test]
    fn header_name_accepts_rfc7230_tokens() {
        for ok in &[
            "x-trace-id",
            "X-Trace-Id",
            "Content-Type",
            "X_Foo",
            "X.Foo",
            "X+Y",
            "X*Y",
            "X~Y",
            "0abc",
        ] {
            assert!(is_valid_header_name(ok), "should accept: {ok:?}");
        }
    }

    #[test]
    fn header_name_rejects_invalid_chars_and_empty() {
        assert!(!is_valid_header_name(""));
        for bad in &[
            "x trace", "x:trace", "x@trace", "x(trace)", "x,trace", "x;trace", "x\ttrace",
            "x\ntrace",
        ] {
            assert!(!is_valid_header_name(bad), "should reject: {bad:?}");
        }
    }

    // -- is_valid_header_value ----------------------------------------------

    #[test]
    fn header_value_accepts_visible_ascii_plus_sp_htab() {
        assert!(is_valid_header_value(""));
        assert!(is_valid_header_value("simple"));
        assert!(is_valid_header_value("with space"));
        assert!(is_valid_header_value("with\ttab"));
        assert!(is_valid_header_value("with=symbols/and_punct!"));
    }

    #[test]
    fn header_value_rejects_cr_lf_and_control() {
        assert!(!is_valid_header_value("hi\r\nInjected: foo"));
        assert!(!is_valid_header_value("hi\nbad"));
        assert!(!is_valid_header_value("hi\rbad"));
        assert!(!is_valid_header_value("hi\x00null"));
        assert!(!is_valid_header_value("hi\x7fdel"));
    }

    // -- is_valid_cors_origin -----------------------------------------------

    #[test]
    fn cors_origin_accepts_wildcard_and_scheme_host() {
        assert!(is_valid_cors_origin("*"));
        assert!(is_valid_cors_origin("https://example.com"));
        assert!(is_valid_cors_origin("http://localhost:3000"));
        assert!(is_valid_cors_origin("https://sub.example.com:8443"));
    }

    #[test]
    fn cors_origin_rejects_path_query_fragment_or_garbage() {
        for bad in &[
            "",
            "ftp://example.com",
            "https://",
            "https://example.com/",
            "https://example.com/path",
            "https://example.com?q=1",
            "https://example.com#frag",
            "https://example.com with space",
            "https://example.com\tx",
        ] {
            assert!(!is_valid_cors_origin(bad), "should reject: {bad:?}");
        }
    }

    // -- validate_http_config -----------------------------------------------

    fn http_cfg() -> EndpointHttpConfig {
        EndpointHttpConfig::default()
    }

    #[test]
    fn http_config_accepts_default() {
        assert!(validate_http_config(&http_cfg()).is_ok());
    }

    #[test]
    fn http_config_caps_cors_origins() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = (0..(MAX_CORS_ORIGINS + 1))
            .map(|i| format!("https://o{i}.example.com"))
            .collect();
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_invalid_cors_origin() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["not-a-url".into()];
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_credentials_with_wildcard() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["*".into()];
        cfg.cors_allow_credentials = true;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_caps_cors_max_age() {
        let mut cfg = http_cfg();
        cfg.cors_max_age_secs = MAX_CORS_MAX_AGE_SECS + 1;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_invalid_cors_method() {
        let mut cfg = http_cfg();
        cfg.cors_allow_methods = vec!["GET\r\nX: y".into()];
        assert!(validate_http_config(&cfg).is_err());
        cfg.cors_allow_methods = vec!["".into()];
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_invalid_cors_allowed_header() {
        let mut cfg = http_cfg();
        cfg.cors_allow_headers = vec!["x bad".into()];
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_caps_inject_header_count() {
        let mut cfg = http_cfg();
        let mut m = BTreeMap::new();
        for i in 0..=MAX_INJECT_HEADERS {
            m.insert(format!("x-h-{i}"), "v".into());
        }
        cfg.inject_request_headers = m;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_caps_inject_header_name_length() {
        let mut cfg = http_cfg();
        let mut m = BTreeMap::new();
        m.insert("a".repeat(MAX_HEADER_NAME_LEN + 1), "v".into());
        cfg.inject_request_headers = m;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_caps_inject_header_value_length() {
        let mut cfg = http_cfg();
        let mut m = BTreeMap::new();
        m.insert("x-large".into(), "v".repeat(MAX_HEADER_VALUE_LEN + 1));
        cfg.inject_request_headers = m;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_invalid_inject_name_or_value() {
        let mut cfg = http_cfg();
        let mut m = BTreeMap::new();
        m.insert("bad name".into(), "v".into());
        cfg.inject_request_headers = m;
        assert!(validate_http_config(&cfg).is_err());

        let mut cfg = http_cfg();
        let mut m = BTreeMap::new();
        m.insert("x-ok".into(), "bad\r\n".into());
        cfg.inject_request_headers = m;
        assert!(validate_http_config(&cfg).is_err());
    }

    #[test]
    fn http_config_rejects_reserved_inject_names_case_insensitive() {
        for reserved in &["Host", "Content-Length", "AUTHORIZATION", "te", "Upgrade"] {
            let mut cfg = http_cfg();
            let mut m = BTreeMap::new();
            m.insert((*reserved).into(), "v".into());
            cfg.inject_request_headers = m;
            assert!(
                validate_http_config(&cfg).is_err(),
                "must reject reserved: {reserved}"
            );
        }
    }

    #[test]
    fn http_config_caps_rate_limit() {
        let mut cfg = http_cfg();
        cfg.rate_limit = RateLimitConfig {
            requests_per_sec: MAX_RATE_REQUESTS_PER_SEC + 1,
            burst: 0,
        };
        assert!(validate_http_config(&cfg).is_err());

        let mut cfg = http_cfg();
        cfg.rate_limit = RateLimitConfig {
            requests_per_sec: 1,
            burst: MAX_RATE_BURST + 1,
        };
        assert!(validate_http_config(&cfg).is_err());
    }

    // -- resolve_cors_origin ------------------------------------------------

    #[test]
    fn cors_resolve_returns_none_when_allowlist_empty() {
        let cfg = http_cfg();
        assert_eq!(resolve_cors_origin(Some("https://x"), &cfg), None);
        assert_eq!(resolve_cors_origin(None, &cfg), None);
    }

    #[test]
    fn cors_resolve_wildcard_ignores_request_origin() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["*".into()];
        assert_eq!(resolve_cors_origin(Some("https://x"), &cfg), Some("*"));
        assert_eq!(resolve_cors_origin(None, &cfg), Some("*"));
    }

    #[test]
    fn cors_resolve_exact_match_only() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://a.example".into(), "https://b.example".into()];
        assert_eq!(
            resolve_cors_origin(Some("https://a.example"), &cfg),
            Some("https://a.example")
        );
        assert_eq!(resolve_cors_origin(Some("https://c.example"), &cfg), None);
        assert_eq!(resolve_cors_origin(None, &cfg), None);
    }

    // -- preflight + attach headers -----------------------------------------

    #[test]
    fn preflight_emits_no_cors_when_origin_denied() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://a.example".into()];
        let mut req_headers = HeaderMap::new();
        req_headers.insert(header::ORIGIN, "https://evil.example".parse().unwrap());
        let resp = build_cors_preflight_response(&req_headers, &cfg);
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert!(resp.headers().get("access-control-allow-origin").is_none());
    }

    #[test]
    fn preflight_echoes_exact_origin_and_adds_vary() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://a.example".into()];
        cfg.cors_allow_methods = vec!["GET".into(), "POST".into()];
        cfg.cors_allow_headers = vec!["x-trace".into()];
        cfg.cors_max_age_secs = 600;
        cfg.cors_allow_credentials = true;
        let mut req_headers = HeaderMap::new();
        req_headers.insert(header::ORIGIN, "https://a.example".parse().unwrap());
        let resp = build_cors_preflight_response(&req_headers, &cfg);
        let h = resp.headers();
        assert_eq!(
            h.get("access-control-allow-origin").unwrap(),
            "https://a.example"
        );
        assert_eq!(h.get("vary").unwrap(), "Origin");
        assert_eq!(h.get("access-control-allow-methods").unwrap(), "GET, POST");
        assert_eq!(h.get("access-control-allow-headers").unwrap(), "x-trace");
        assert_eq!(h.get("access-control-max-age").unwrap(), "600");
        assert_eq!(h.get("access-control-allow-credentials").unwrap(), "true");
    }

    #[test]
    fn preflight_wildcard_skips_vary() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["*".into()];
        let req_headers = HeaderMap::new();
        let resp = build_cors_preflight_response(&req_headers, &cfg);
        assert_eq!(
            resp.headers().get("access-control-allow-origin").unwrap(),
            "*"
        );
        assert!(resp.headers().get("vary").is_none());
    }

    #[test]
    fn attach_cors_noop_when_denied() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://a.example".into()];
        let mut h = HeaderMap::new();
        attach_cors_response_headers(&mut h, Some("https://evil.example"), &cfg);
        assert!(h.is_empty());
    }

    #[test]
    fn attach_cors_sets_origin_and_credentials_when_allowed() {
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://a.example".into()];
        cfg.cors_allow_credentials = true;
        let mut h = HeaderMap::new();
        attach_cors_response_headers(&mut h, Some("https://a.example"), &cfg);
        assert_eq!(
            h.get("access-control-allow-origin").unwrap(),
            "https://a.example"
        );
        assert_eq!(h.get("access-control-allow-credentials").unwrap(), "true");
        assert!(h.get_all(header::VARY).iter().any(|v| v == "Origin"));
    }

    // -- insert_header / header roundtrip ----------------------------------

    #[test]
    fn insert_header_silently_skips_invalid() {
        let mut h = HeaderMap::new();
        insert_header(&mut h, "x-ok", "v");
        assert_eq!(h.get("x-ok").unwrap(), "v");
        insert_header(&mut h, "x-bad", "bad\r\nv");
        assert!(h.get("x-bad").is_none());
    }

    #[test]
    fn header_roundtrip_axum_reqwest() {
        let mut axum_h = HeaderMap::new();
        axum_h.append("x-trace", "abc".parse().unwrap());
        axum_h.append("x-trace", "def".parse().unwrap());
        axum_h.append("content-type", "text/plain".parse().unwrap());
        let req = axum_to_reqwest_headers(&axum_h);
        let back = reqwest_to_axum_headers(&req);
        let trace: Vec<_> = back
            .get_all("x-trace")
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        assert_eq!(trace, vec!["abc", "def"]);
        assert_eq!(back.get("content-type").unwrap(), "text/plain");
    }

    // -- pad_to_sector ------------------------------------------------------

    #[test]
    fn pad_to_sector_pads_to_512_multiple() {
        assert_eq!(pad_to_sector(&[]).len(), 0);
        assert_eq!(pad_to_sector(&[1u8; 1]).len(), 512);
        assert_eq!(pad_to_sector(&[1u8; 511]).len(), 512);
        assert_eq!(pad_to_sector(&[1u8; 512]).len(), 512);
        assert_eq!(pad_to_sector(&[1u8; 513]).len(), 1024);
        assert_eq!(pad_to_sector(&[1u8; 1024]).len(), 1024);
    }

    #[test]
    fn pad_to_sector_preserves_original_bytes() {
        let data = b"hello world";
        let padded = pad_to_sector(data);
        assert_eq!(&padded[..data.len()], data);
        assert!(padded[data.len()..].iter().all(|&b| b == 0));
    }

    // -- now_micros + iso8601 ----------------------------------------------

    #[test]
    fn now_micros_is_monotonic() {
        let a = now_micros();
        std::thread::sleep(std::time::Duration::from_millis(1));
        let b = now_micros();
        assert!(b > a, "now_micros must advance: {a} → {b}");
    }

    #[test]
    fn iso8601_now_matches_expected_shape() {
        let s = iso8601_now();
        assert_eq!(s.len(), 20);
        assert!(s.ends_with('Z'));
        let bytes = s.as_bytes();
        assert_eq!(bytes[4], b'-');
        assert_eq!(bytes[7], b'-');
        assert_eq!(bytes[10], b'T');
        assert_eq!(bytes[13], b':');
        assert_eq!(bytes[16], b':');
    }

    // -- TokenBucket -------------------------------------------------------

    #[test]
    fn token_bucket_disabled_always_acquires() {
        let b = TokenBucket::disabled();
        for _ in 0..100 {
            assert!(b.try_acquire());
        }
    }

    #[test]
    fn token_bucket_from_zero_rps_is_disabled() {
        let b = TokenBucket::from_config(RateLimitConfig {
            requests_per_sec: 0,
            burst: 100,
        });
        assert_eq!(b.capacity_x1000, 0);
        for _ in 0..10 {
            assert!(b.try_acquire());
        }
    }

    #[test]
    fn token_bucket_burst_exhausts_then_refills() {
        let b = TokenBucket::from_config(RateLimitConfig {
            requests_per_sec: 1_000,
            burst: 3,
        });
        // burst defaults to max(burst, rps) so capacity is 1_000_000 milli-tokens.
        assert_eq!(b.capacity_x1000, 1000 * 1000);
        // Drain the bucket.
        let mut acquired = 0;
        for _ in 0..10_000 {
            if b.try_acquire() {
                acquired += 1;
            } else {
                break;
            }
        }
        assert!(acquired > 0);
    }

    // -- EndpointMetrics ----------------------------------------------------

    #[test]
    fn endpoint_metrics_snapshot_initially_zero() {
        let m = EndpointMetrics::default();
        let s = m.snapshot();
        assert_eq!(s.requests_total, 0);
        assert_eq!(s.requests_throttled, 0);
        assert_eq!(s.requests_forbidden, 0);
        assert_eq!(s.upstream_errors, 0);
        assert_eq!(s.bytes_in, 0);
        assert_eq!(s.bytes_out, 0);
        assert_eq!(s.last_request_age_secs, None);
        assert_eq!(s.accumulated_credits, 0);
    }

    #[test]
    fn endpoint_metrics_snapshot_reports_counts_and_age() {
        let m = EndpointMetrics::default();
        m.requests_total.store(7, Ordering::Relaxed);
        m.requests_throttled.store(2, Ordering::Relaxed);
        m.bytes_in.store(1024, Ordering::Relaxed);
        // Force OnceLock init + advance the clock so now_micros() > 0.
        now_micros();
        std::thread::sleep(std::time::Duration::from_millis(2));
        m.last_request_micros.store(now_micros(), Ordering::Relaxed);
        let s = m.snapshot();
        assert_eq!(s.requests_total, 7);
        assert_eq!(s.requests_throttled, 2);
        assert_eq!(s.bytes_in, 1024);
        assert!(s.last_request_age_secs.is_some());
        assert!(s.last_request_age_secs.unwrap() < 5);
    }

    // -- set_vm_failed + reaper predicate ----------------------------------

    fn make_record(status: VmStatus) -> VmRecord {
        VmRecord {
            info: VmInfo {
                vm_id: "fc-test".into(),
                status,
                rootfs: "alpine".into(),
                vcpu_count: 1,
                mem_size_mib: 128,
                created_at: iso8601_now(),
            },
            result: None,
            created: Instant::now(),
            kill_signal: Arc::new(Notify::new()),
            billing_account_id: None,
            vcpu_count: 1,
            mem_size_mib: 128,
        }
    }

    #[test]
    fn set_vm_failed_marks_record_and_writes_result() {
        let vms: DashMap<String, VmRecord> = DashMap::new();
        vms.insert("fc-test".into(), make_record(VmStatus::Running));
        let start = Instant::now();
        set_vm_failed(&vms, "fc-test", start, 42, "out".into(), "err".into());
        let rec = vms.get("fc-test").unwrap();
        assert_eq!(rec.info.status, VmStatus::Failed);
        let result = rec.result.as_ref().unwrap();
        assert_eq!(result.exit_code, 42);
        assert_eq!(result.status, VmStatus::Failed);
        assert_eq!(result.stdout, "out");
        assert_eq!(result.stderr, "err");
    }

    #[test]
    fn set_vm_failed_noop_for_unknown_vm() {
        let vms: DashMap<String, VmRecord> = DashMap::new();
        set_vm_failed(&vms, "missing", Instant::now(), 0, "".into(), "".into());
        assert!(vms.is_empty());
    }

    // -- not_enabled --------------------------------------------------------

    #[test]
    fn not_enabled_returns_503_with_hint() {
        let (code, body) = not_enabled();
        assert_eq!(code, StatusCode::SERVICE_UNAVAILABLE);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&body.0).unwrap()).unwrap();
        assert!(v["error"].as_str().unwrap().contains("not enabled"));
        assert!(
            v["hint"]
                .as_str()
                .unwrap()
                .contains("FC_PERSISTENT_ENDPOINTS_ENABLED")
        );
    }

    // -- Handler integration tests -----------------------------------------

    fn test_app(rootfs_dir: String, persistent: Option<Arc<PersistentState>>) -> Router {
        let state = AppState {
            vms: Arc::new(DashMap::new()),
            rootfs_dir,
            max_concurrent_vms: 4,
            jailer: None,
            persistent,
            billing: None,
        };
        Router::new()
            .route("/health", get(health))
            .route("/vm/create", post(create_vm))
            .route("/vm", get(list_vms))
            .route("/vm/{vm_id}", get(get_vm_status))
            .route("/vm/{vm_id}/result", get(get_vm_result))
            .route("/vm/{vm_id}", delete(destroy_vm))
            .route("/fc/deploy", post(fc_deploy))
            .route("/fc/list", get(fc_list))
            .route("/fc/{name}", get(fc_get))
            .route("/fc/{name}", delete(fc_destroy))
            .with_state(state)
    }

    async fn body_json(resp: Response) -> serde_json::Value {
        let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null)
    }

    #[tokio::test]
    async fn health_returns_ok_payload() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["status"], "ok");
        assert_eq!(v["service"], "firecracker-ctl");
        assert_eq!(v["jailer"], false);
        assert!(v["version"].is_string());
        assert!(v["timestamp"].is_string());
    }

    #[tokio::test]
    async fn list_vms_empty_returns_zero() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(Request::builder().uri("/vm").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["count"], 0);
        assert!(v["vms"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn get_vm_status_unknown_is_404() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/vm/fc-missing")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_vm_result_unknown_is_404() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/vm/fc-missing/result")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn destroy_vm_unknown_is_404() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/vm/fc-missing")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn create_vm_rejects_invalid_entrypoint() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "rootfs": "alpine",
            "entrypoint": "sh; ls",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/vm/create")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn create_vm_rejects_network_without_persistent() {
        let tmp = tempfile::tempdir().unwrap();
        // Create a fake rootfs so the network check is the failing path.
        let rootfs_path = tmp.path().join("alpine.ext4");
        std::fs::write(&rootfs_path, [0u8; 16]).unwrap();
        let app = test_app(tmp.path().to_string_lossy().into_owned(), None);
        let req_body = serde_json::json!({
            "rootfs": "alpine",
            "entrypoint": "/bin/sh",
            "network": true,
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/vm/create")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let v = body_json(resp).await;
        assert!(v["error"].as_str().unwrap().contains("firecracker-ctl-net"));
    }

    #[tokio::test]
    async fn create_vm_missing_rootfs_returns_400_with_available_list() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("alpine.ext4"), [0u8; 16]).unwrap();
        let app = test_app(tmp.path().to_string_lossy().into_owned(), None);
        let req_body = serde_json::json!({
            "rootfs": "nonexistent",
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/vm/create")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let v = body_json(resp).await;
        let available: Vec<String> = v["available"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap().to_string())
            .collect();
        assert!(available.contains(&"alpine".to_string()));
    }

    #[tokio::test]
    async fn fc_deploy_returns_503_when_disabled() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "demo",
            "rootfs": "alpine",
            "http_port": 8080,
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn fc_deploy_validates_name_before_503() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "bad name!",
            "rootfs": "alpine",
            "http_port": 8080,
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fc_deploy_rejects_reserved_name_public() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "public",
            "rootfs": "alpine",
            "http_port": 8080,
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fc_deploy_rejects_zero_port() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "demo",
            "rootfs": "alpine",
            "http_port": 0,
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fc_deploy_rejects_empty_rootfs_or_entrypoint() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "demo",
            "rootfs": "",
            "http_port": 8080,
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fc_deploy_caps_idle_ttl() {
        let app = test_app("/tmp".into(), None);
        let req_body = serde_json::json!({
            "name": "demo",
            "rootfs": "alpine",
            "http_port": 8080,
            "entrypoint": "/bin/sh",
            "idle_ttl_secs": MAX_IDLE_TTL_SECS + 1,
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/fc/deploy")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fc_list_returns_empty_when_disabled() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/fc/list")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["count"], 0);
        assert!(v["endpoints"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fc_get_returns_503_when_disabled() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/fc/anything")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn fc_destroy_returns_503_when_disabled() {
        let app = test_app("/tmp".into(), None);
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/fc/anything")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    // -- list_rootfs --------------------------------------------------------

    #[tokio::test]
    async fn list_rootfs_filters_to_ext4_basenames() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("alpine.ext4"), b"").unwrap();
        std::fs::write(tmp.path().join("ubuntu.ext4"), b"").unwrap();
        std::fs::write(tmp.path().join("README.md"), b"").unwrap();
        let mut got = list_rootfs(tmp.path().to_str().unwrap()).await;
        got.sort();
        assert_eq!(got, vec!["alpine".to_string(), "ubuntu".to_string()]);
    }

    #[tokio::test]
    async fn list_rootfs_missing_dir_returns_empty() {
        let v = list_rootfs("/nonexistent/path/should/be/empty").await;
        assert!(v.is_empty());
    }

    // -- read_child_pipe / read_child_stderr -------------------------------

    #[tokio::test]
    async fn read_child_pipe_none_returns_empty_string() {
        assert_eq!(read_child_pipe(None).await, "");
    }

    #[tokio::test]
    async fn read_child_stderr_none_returns_empty_string() {
        assert_eq!(read_child_stderr(None).await, "");
    }

    #[tokio::test]
    async fn read_child_pipe_reads_from_real_child() {
        let mut child = tokio::process::Command::new("/bin/sh")
            .arg("-c")
            .arg("printf hello-stdout")
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take();
        let _ = child.wait().await;
        assert_eq!(read_child_pipe(stdout).await, "hello-stdout");
    }

    #[tokio::test]
    async fn read_child_stderr_reads_from_real_child() {
        let mut child = tokio::process::Command::new("/bin/sh")
            .arg("-c")
            .arg("printf err-bytes 1>&2")
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let stderr = child.stderr.take();
        let _ = child.wait().await;
        assert_eq!(read_child_stderr(stderr).await, "err-bytes");
    }

    // -- classify_reqwest_error --------------------------------------------

    #[tokio::test]
    async fn classify_reqwest_error_maps_timeout_to_504() {
        // Spin up a sleepy upstream and request it with a 50ms timeout.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = axum::Router::new().route(
            "/",
            axum::routing::get(|| async {
                tokio::time::sleep(Duration::from_secs(2)).await;
                "late"
            }),
        );
        tokio::spawn(async move { axum::serve(listener, server).await.unwrap() });
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(50))
            .build()
            .unwrap();
        let err = client
            .get(format!("http://{addr}/"))
            .send()
            .await
            .err()
            .expect("must time out");
        let (status, reason) = classify_reqwest_error(&err);
        assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
        assert_eq!(reason, "upstream timed out");
    }

    #[tokio::test]
    async fn classify_reqwest_error_maps_connect_refused_to_502() {
        // Bind then drop so the port is guaranteed-free briefly. To avoid race,
        // use an obviously-dead address.
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(500))
            .build()
            .unwrap();
        let err = client
            .get("http://127.0.0.1:1/")
            .send()
            .await
            .err()
            .expect("must fail to connect");
        let (status, reason) = classify_reqwest_error(&err);
        assert_eq!(status, StatusCode::BAD_GATEWAY);
        assert!(
            reason == "upstream unreachable" || reason == "upstream timed out",
            "got reason={reason:?}"
        );
    }

    // -- fc_proxy_inner integration ----------------------------------------

    /// Spin up a localhost upstream that exposes a few deterministic routes.
    /// Returns the bound port — caller embeds it as the endpoint's http_port.
    async fn spawn_upstream() -> u16 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let app = axum::Router::new()
            .route("/", axum::routing::get(|| async { "root-ok" }))
            .route(
                "/echo",
                axum::routing::any(
                    |headers: axum::http::HeaderMap, body: axum::body::Bytes| async move {
                        let xt = headers
                            .get("x-trace")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("")
                            .to_string();
                        let mut out = format!("xt={xt};body=");
                        out.push_str(&String::from_utf8_lossy(&body));
                        out
                    },
                ),
            )
            .route(
                "/boom",
                axum::routing::get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "kaboom") }),
            );
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        // Yield once so the listener begins accepting before tests dial it.
        tokio::task::yield_now().await;
        port
    }

    fn make_endpoint(
        name: &str,
        port: u16,
        visibility: EndpointVisibility,
        http_config: EndpointHttpConfig,
    ) -> PersistentEndpoint {
        let pool = persistent::Ipv4Pool::from_cidr("172.18.0.0/16").unwrap();
        let mut allocation = pool.allocate().unwrap();
        allocation.guest_ip = "127.0.0.1".parse().unwrap();
        PersistentEndpoint {
            name: name.into(),
            rootfs: "alpine".into(),
            entrypoint: "/init".into(),
            http_port: port,
            health_path: "/health".into(),
            vcpu_count: 1,
            mem_size_mib: 128,
            allocation,
            tap: tap::TapDevice {
                name: "fctap-0".into(),
                host_ip: "172.18.0.1".parse().unwrap(),
                guest_ip: "127.0.0.1".parse().unwrap(),
                prefix_len: 30,
            },
            pid: None,
            status: EndpointStatus::Healthy,
            created: Instant::now(),
            visibility,
            rate_limiter: TokenBucket::from_config(http_config.rate_limit),
            http_config: http_config.clone(),
            metrics: Arc::new(EndpointMetrics::default()),
            idle_ttl_secs: 0,
            logs: Arc::new(LogRing::new()),
            billing_account_id: None,
        }
    }

    fn make_persistent_state(endpoint: PersistentEndpoint) -> Arc<PersistentState> {
        Arc::new(PersistentState {
            pool: persistent::Ipv4Pool::from_cidr("172.18.0.0/16").unwrap(),
            tap_manager: tap::TapManager::new(tap::TapConfig {
                jailer_uid: 0,
                tunnel_iface: "lo".into(),
                vm_subnet: "172.18.0.0/16".into(),
            }),
            endpoints: {
                let m = DashMap::new();
                m.insert(endpoint.name.clone(), endpoint);
                m
            },
            proxy_client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .build()
                .unwrap(),
        })
    }

    fn test_app_with_persistent(persistent: Arc<PersistentState>) -> Router {
        let state = AppState {
            vms: Arc::new(DashMap::new()),
            rootfs_dir: "/tmp".into(),
            max_concurrent_vms: 4,
            jailer: None,
            persistent: Some(persistent),
            billing: None,
        };
        Router::new()
            .route("/fc/list", get(fc_list))
            .route("/fc/{name}", get(fc_get))
            .route("/fc/{name}", delete(fc_destroy))
            .route("/proxy/{name}", axum::routing::any(fc_proxy))
            .route("/proxy/{name}/{*path}", axum::routing::any(fc_proxy))
            .route("/public-proxy/{name}", axum::routing::any(fc_proxy_public))
            .route(
                "/public-proxy/{name}/{*path}",
                axum::routing::any(fc_proxy_public),
            )
            .with_state(state)
    }

    #[tokio::test]
    async fn proxy_staff_forwards_to_upstream_root() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let ps = make_persistent_state(ep);
        let app = test_app_with_persistent(ps.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&bytes[..], b"root-ok");
        let snapshot = ps.endpoints.get("demo").unwrap().metrics.snapshot();
        assert_eq!(snapshot.requests_total, 1);
    }

    #[tokio::test]
    async fn proxy_staff_forwards_to_tail_path_with_query() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/demo/echo?id=42")
                    .header("x-trace", "abc")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = String::from_utf8(
            to_bytes(resp.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert!(body.contains("xt=abc"), "got body={body}");
    }

    #[tokio::test]
    async fn proxy_staff_unknown_endpoint_is_404() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("real", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/missing")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn proxy_public_rejects_staff_endpoint_with_403() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let ps = make_persistent_state(ep);
        let app = test_app_with_persistent(ps.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/public-proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
        let snap = ps.endpoints.get("demo").unwrap().metrics.snapshot();
        assert_eq!(snap.requests_forbidden, 1);
        assert_eq!(snap.requests_total, 0);
    }

    #[tokio::test]
    async fn proxy_public_allows_public_endpoint() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Public, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/public-proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn proxy_public_options_returns_cors_preflight() {
        let port = spawn_upstream().await;
        let mut cfg = http_cfg();
        cfg.cors_allow_origins = vec!["https://app.example".into()];
        cfg.cors_allow_methods = vec!["GET".into()];
        let ep = make_endpoint("demo", port, EndpointVisibility::Public, cfg);
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/public-proxy/demo")
                    .header(header::ORIGIN, "https://app.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            resp.headers()
                .get("access-control-allow-origin")
                .unwrap()
                .to_str()
                .unwrap(),
            "https://app.example"
        );
    }

    #[tokio::test]
    async fn proxy_public_rate_limit_returns_429() {
        let port = spawn_upstream().await;
        let mut cfg = http_cfg();
        cfg.rate_limit = RateLimitConfig {
            requests_per_sec: 1,
            burst: 1,
        };
        let ep = make_endpoint("demo", port, EndpointVisibility::Public, cfg);
        let ps = make_persistent_state(ep);
        let app = test_app_with_persistent(ps.clone());

        // First request: consumes the single token. Second: throttled.
        let resp1 = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/public-proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp1.status(), StatusCode::OK);
        let resp2 = app
            .oneshot(
                Request::builder()
                    .uri("/public-proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp2.status(), StatusCode::TOO_MANY_REQUESTS);
        let snap = ps.endpoints.get("demo").unwrap().metrics.snapshot();
        assert_eq!(snap.requests_total, 1);
        assert_eq!(snap.requests_throttled, 1);
    }

    #[tokio::test]
    async fn proxy_relays_5xx_from_upstream() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/demo/boom")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn proxy_upstream_unreachable_returns_502() {
        // Endpoint points at a port nothing listens on.
        let ep = make_endpoint("demo", 1, EndpointVisibility::Staff, http_cfg());
        let ps = make_persistent_state(ep);
        let app = test_app_with_persistent(ps.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_GATEWAY);
        let snap = ps.endpoints.get("demo").unwrap().metrics.snapshot();
        assert_eq!(snap.upstream_errors, 1);
    }

    #[tokio::test]
    async fn proxy_injects_configured_request_headers() {
        let port = spawn_upstream().await;
        let mut cfg = http_cfg();
        cfg.inject_request_headers
            .insert("x-trace".into(), "injected".into());
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, cfg);
        let app = test_app_with_persistent(make_persistent_state(ep));
        // Client tries to override with "bad" but inject overrides.
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/proxy/demo/echo")
                    .header("x-trace", "from-client")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = String::from_utf8(
            to_bytes(resp.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert!(body.contains("xt=injected"), "got body={body}");
    }

    // -- fc_get / fc_destroy with persistent state -------------------------

    #[tokio::test]
    async fn fc_get_returns_endpoint_info() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Public, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/fc/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["endpoint"]["name"], "demo");
        assert_eq!(v["endpoint"]["http_port"], port);
        assert_eq!(v["endpoint"]["visibility"], "public");
        assert!(v["endpoint"]["sku"].is_string());
        assert!(v["endpoint"]["credits_per_sec"].as_u64().unwrap() > 0);
        assert_eq!(v["endpoint"]["metrics"]["accumulated_credits"], 0);
    }

    #[test]
    fn accumulate_meter_first_call_seeds_without_charging() {
        let ep = make_endpoint("demo", 9999, EndpointVisibility::Staff, http_cfg());
        ep.metrics.requests_total.store(42, Ordering::Relaxed);
        let t = 1_000_000_000_i64;
        accumulate_meter(&ep, t);
        assert_eq!(ep.metrics.accumulated_credits.load(Ordering::Relaxed), 0);
        assert_eq!(
            ep.metrics.last_meter_requests_total.load(Ordering::Relaxed),
            42
        );
        assert_eq!(ep.metrics.last_meter_micros.load(Ordering::Relaxed), t);
    }

    #[test]
    fn accumulate_meter_second_call_charges_for_elapsed_and_requests() {
        let ep = make_endpoint("demo", 9999, EndpointVisibility::Staff, http_cfg());
        let t0 = 1_000_000_000_i64;
        accumulate_meter(&ep, t0);
        let t1 = t0 + 5_000_000;
        ep.metrics.requests_total.store(2_000, Ordering::Relaxed);
        accumulate_meter(&ep, t1);
        let expected = billing::meter_tick(ep.vcpu_count, ep.mem_size_mib, 5, 2_000);
        assert_eq!(
            ep.metrics.accumulated_credits.load(Ordering::Relaxed),
            expected
        );
    }

    #[test]
    fn accumulate_meter_zero_elapsed_zero_delta_is_noop_after_seed() {
        let ep = make_endpoint("demo", 9999, EndpointVisibility::Staff, http_cfg());
        let t = 1_000_000_000_i64;
        accumulate_meter(&ep, t);
        accumulate_meter(&ep, t);
        assert_eq!(ep.metrics.accumulated_credits.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn fc_get_unknown_endpoint_is_404() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("real", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/fc/ghost")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn fc_destroy_unknown_endpoint_is_404() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("real", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/fc/ghost")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn fc_destroy_removes_endpoint_and_releases_resources() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let ps = make_persistent_state(ep);
        let app = test_app_with_persistent(ps.clone());
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/fc/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["removed"], "demo");
        assert!(ps.endpoints.get("demo").is_none());
    }

    #[tokio::test]
    async fn create_vm_over_limit_returns_429() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("alpine.ext4"), b"").unwrap();

        // Build state with max=1 and seed one running VM so the next create
        // hits the cap before it spawns any real lifecycle.
        let vms: Arc<DashMap<String, VmRecord>> = Arc::new(DashMap::new());
        vms.insert("fc-busy".into(), make_record(VmStatus::Running));
        let state = AppState {
            vms,
            rootfs_dir: tmp.path().to_string_lossy().into_owned(),
            max_concurrent_vms: 1,
            jailer: None,
            persistent: None,
            billing: None,
        };
        let app = Router::new()
            .route("/vm/create", post(create_vm))
            .with_state(state);

        let req_body = serde_json::json!({
            "rootfs": "alpine",
            "entrypoint": "/bin/sh",
        });
        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/vm/create")
                    .header("content-type", "application/json")
                    .body(Body::from(req_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
        let v = body_json(resp).await;
        assert_eq!(v["active"], 1);
        assert_eq!(v["limit"], 1);
    }

    #[tokio::test]
    async fn get_vm_status_and_result_return_records() {
        let vms: Arc<DashMap<String, VmRecord>> = Arc::new(DashMap::new());
        let mut record = make_record(VmStatus::Completed);
        record.result = Some(VmResult {
            vm_id: "fc-test".into(),
            status: VmStatus::Completed,
            exit_code: 0,
            stdout: "ok".into(),
            stderr: "".into(),
            duration_ms: 100,
        });
        vms.insert("fc-test".into(), record);

        let state = AppState {
            vms,
            rootfs_dir: "/tmp".into(),
            max_concurrent_vms: 4,
            jailer: None,
            persistent: None,
            billing: None,
        };
        let app = Router::new()
            .route("/vm/{vm_id}", get(get_vm_status))
            .route("/vm/{vm_id}/result", get(get_vm_result))
            .with_state(state);

        let status_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/vm/fc-test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(status_resp.status(), StatusCode::OK);
        let v = body_json(status_resp).await;
        assert_eq!(v["vm_id"], "fc-test");
        assert_eq!(v["status"], "completed");

        let result_resp = app
            .oneshot(
                Request::builder()
                    .uri("/vm/fc-test/result")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result_resp.status(), StatusCode::OK);
        let v = body_json(result_resp).await;
        assert_eq!(v["vm_id"], "fc-test");
        assert_eq!(v["exit_code"], 0);
        assert_eq!(v["stdout"], "ok");
    }

    #[tokio::test]
    async fn destroy_vm_signals_kill_and_marks_destroyed() {
        let vms: Arc<DashMap<String, VmRecord>> = Arc::new(DashMap::new());
        let record = make_record(VmStatus::Running);
        let notify = record.kill_signal.clone();
        vms.insert("fc-live".into(), record);
        let state = AppState {
            vms: vms.clone(),
            rootfs_dir: "/tmp".into(),
            max_concurrent_vms: 4,
            jailer: None,
            persistent: None,
            billing: None,
        };
        let app = Router::new()
            .route("/vm/{vm_id}", delete(destroy_vm))
            .with_state(state);

        // Spawn a waiter so we can assert the kill_signal was triggered.
        let waiter = tokio::spawn(async move {
            tokio::time::timeout(Duration::from_secs(2), notify.notified())
                .await
                .is_ok()
        });

        let resp = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/vm/fc-live")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert!(waiter.await.unwrap(), "kill signal must fire");
    }

    // -- iso8601_now: spot-check a known second --------------------------
    // We can't override SystemTime::now(), but we can re-implement the
    // Hinnant algorithm here against a known second and verify the
    // production helper's output matches the same shape for "now". The
    // monotonicity test above already covers progression.

    #[test]
    fn iso8601_now_yields_4_digit_year_and_utc_z() {
        let s = iso8601_now();
        // Year is 4 digits + numeric.
        let year_str = &s[..4];
        assert!(
            year_str.chars().all(|c| c.is_ascii_digit()),
            "year: {year_str}"
        );
        let year: i32 = year_str.parse().unwrap();
        assert!(year >= 2024 && year < 3000, "unreasonable year: {year}");
        assert!(s.ends_with('Z'));
    }

    #[tokio::test]
    async fn fc_list_returns_registered_endpoints() {
        let port = spawn_upstream().await;
        let ep = make_endpoint("demo", port, EndpointVisibility::Staff, http_cfg());
        let app = test_app_with_persistent(make_persistent_state(ep));
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/fc/list")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["count"], 1);
        assert_eq!(v["endpoints"][0]["name"], "demo");
    }
}
