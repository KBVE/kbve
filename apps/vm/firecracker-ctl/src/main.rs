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

/// Whether an endpoint is reachable from the public `/fc/public/{name}/*`
/// path (no JWT) or only via the staff-gated `/fc/{name}/*` path.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EndpointVisibility {
    #[default]
    Staff,
    Public,
}

/// CORS + request-header policy attached to a persistent endpoint. Only the
/// public tier evaluates the CORS fields; `inject_request_headers` is applied
/// on both tiers. Hard caps live in [`validate_http_config`].
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct EndpointHttpConfig {
    /// Origins allowed for cross-origin requests on `/fc/public/{name}/*`.
    /// Use `["*"]` to allow any origin. Empty disables CORS handling.
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
    /// Header name -> value pairs injected into every upstream request
    /// before forwarding to the guest. Intended for endpoint-scoped
    /// identity headers (e.g. `X-Endpoint-Name`, `X-Tenant-Id`). Reserved
    /// hop-by-hop / framing headers are rejected at deploy time.
    #[serde(default)]
    pub inject_request_headers: std::collections::BTreeMap<String, String>,
    /// Per-endpoint global token bucket. Applies only to the public tier.
    /// `requests_per_sec = 0` (default) disables rate limiting.
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
}

/// Per-endpoint global token bucket. Burst defaults to one second of capacity
/// when omitted. Validated by [`validate_http_config`].
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
}

#[derive(Default)]
struct EndpointMetrics {
    requests_total: AtomicU64,
    requests_throttled: AtomicU64,
    requests_forbidden: AtomicU64,
    upstream_errors: AtomicU64,
    bytes_in: AtomicU64,
    bytes_out: AtomicU64,
    /// 0 = never seen traffic. Otherwise micros since start.
    last_request_micros: AtomicI64,
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
}

impl PersistentEndpointInfo {
    fn from(ep: &PersistentEndpoint) -> Self {
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
        },
    );

    // Spawn VM lifecycle in background
    let vms = state.vms.clone();
    let rootfs_dir = state.rootfs_dir.clone();
    let jailer = state.jailer.clone();
    let persistent = state.persistent.clone();
    tokio::spawn(async move {
        run_vm_lifecycle(vms, vm_id, req, rootfs_dir, kill_signal, jailer, persistent).await;
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

    // --- Allocate IP ---
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

    // Spawn a background task that monitors the child process. If it
    // exits unexpectedly, mark the endpoint as degraded so the proxy
    // returns 502 with a meaningful message rather than silently timing out.
    {
        let ps = persistent.clone();
        let name = req.name.clone();
        let mut child = spawn_result.child;
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

    (
        StatusCode::CREATED,
        Json(serde_json::json!({ "endpoint": info })),
    )
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

    tracing::info!(
        "fc_destroy: removed endpoint {name} (pid={:?})",
        endpoint.pid
    );
    (StatusCode::OK, Json(serde_json::json!({"removed": name})))
}

/// Scan the registry every `interval`, remove endpoints whose
/// `idle_ttl_secs` expired (no traffic seen in that window). Endpoints
/// with `idle_ttl_secs == 0` are skipped. Endpoints that have never been
/// hit are measured from `created`, not `last_request_micros`.
async fn idle_sweeper_task(persistent: Arc<PersistentState>, interval: Duration) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        ticker.tick().await;
        let now = now_micros();
        let mut to_kill: Vec<String> = Vec::new();
        for entry in persistent.endpoints.iter() {
            let ep = entry.value();
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
            tracing::info!(
                "idle_sweeper: tore down idle endpoint {name} (ttl={}s)",
                endpoint.idle_ttl_secs
            );
        }
    }
}

/// Hop-by-hop headers that must not cross proxy boundaries per RFC 7230 §6.1.
/// `accept-encoding` is stripped on the request side so upstream never
/// compresses — reqwest would transparently decode and the content-length
/// wouldn't match what we forward. On the response side we also drop
/// `content-encoding` since reqwest's own Content-Encoding decoding
/// (when enabled) would otherwise mismatch the bytes we relay.
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

/// Reverse-proxy an HTTP request into the persistent VM identified by `name`.
///
/// Flow:
///   1. Look up the endpoint in the registry (404 if missing).
///   2. Build `http://{guest_ip}:{http_port}/{tail}?{query}`.
///   3. Strip hop-by-hop headers from the client request.
///   4. Issue the upstream request, streaming the request body.
///   5. Stream the response back, stripping hop-by-hop on the way out.
///
/// Error mapping:
///   - endpoint unknown → 404
///   - upstream connect failed → 502 (usually: VM not spawned yet, Phase 2e)
///   - upstream read timed out → 504
///   - any other reqwest error → 502
///
/// WebSocket upgrades are intentionally NOT handled here. Phase 2d covers
/// regular HTTP + long-poll/SSE; WS upgrade would need a separate handler
/// that takes `WebSocketUpgrade` and opens a raw TCP stream to the guest.
async fn fc_proxy(
    State(state): State<AppState>,
    Path(params): Path<Vec<(String, String)>>,
    req: Request<Body>,
) -> Response {
    fc_proxy_inner(state, params, req, false).await
}

/// Public-tier sibling of [`fc_proxy`]. Forwards `/proxy/public/{name}/{*path}`
/// into the guest VM only when the endpoint was registered with
/// `visibility: "public"`. No auth required at this layer — the gate is the
/// endpoint's visibility flag, which is fixed at deploy time.
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
            // Preflights bypass the bucket so a flood of CORS probes cannot
            // starve real traffic; budget is for the actual workload.
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

    let state = AppState {
        vms,
        rootfs_dir,
        max_concurrent_vms,
        jailer,
        persistent: persistent.clone(),
    };

    if let Some(p) = persistent.clone() {
        tokio::spawn(idle_sweeper_task(p, Duration::from_secs(60)));
    }

    tracing::info!(
        "FC_MAX_CONCURRENT_VMS={}, FC_VM_TTL_SECS={}",
        max_concurrent_vms,
        vm_ttl_secs,
    );

    let app = Router::new()
        .route("/health", get(health))
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
        .route("/proxy/{name}", axum::routing::any(fc_proxy))
        .route("/proxy/{name}/{*path}", axum::routing::any(fc_proxy))
        .route("/proxy/public/{name}", axum::routing::any(fc_proxy_public))
        .route(
            "/proxy/public/{name}/{*path}",
            axum::routing::any(fc_proxy_public),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("firecracker-ctl listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
