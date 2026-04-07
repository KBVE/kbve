use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc, time::Instant};
use tokio::process::Command;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    "console=ttyS0 reboot=k panic=1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VmStatus {
    Creating,
    Running,
    Completed,
    Failed,
    Timeout,
    Destroyed,
}

#[derive(Debug, Clone, Serialize)]
pub struct VmInfo {
    pub vm_id: String,
    pub status: VmStatus,
    pub rootfs: String,
    pub vcpu_count: u8,
    pub mem_size_mib: u16,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
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
    _created: Instant,
}

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct AppState {
    vms: Arc<DashMap<String, VmRecord>>,
    rootfs_dir: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "firecracker-ctl",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono_now(),
    }))
}

async fn create_vm(
    State(state): State<AppState>,
    Json(req): Json<CreateVmRequest>,
) -> impl IntoResponse {
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

    let vm_id = format!("fc-{}", Uuid::new_v4().as_simple());
    let now = chrono_now();

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
            _created: Instant::now(),
        },
    );

    // Spawn VM lifecycle in background
    let vms = state.vms.clone();
    let rootfs_dir = state.rootfs_dir.clone();
    tokio::spawn(async move {
        run_vm_lifecycle(vms, vm_id, req, rootfs_dir).await;
    });

    (StatusCode::CREATED, Json(serde_json::json!(info)))
}

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

async fn destroy_vm(State(state): State<AppState>, Path(vm_id): Path<String>) -> impl IntoResponse {
    match state.vms.get_mut(&vm_id) {
        Some(mut record) => {
            record.info.status = VmStatus::Destroyed;
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

async fn list_vms(State(state): State<AppState>) -> impl IntoResponse {
    let vms: Vec<VmInfo> = state
        .vms
        .iter()
        .map(|entry| entry.value().info.clone())
        .collect();
    Json(serde_json::json!({ "vms": vms, "count": vms.len() }))
}

// ---------------------------------------------------------------------------
// VM Lifecycle
// ---------------------------------------------------------------------------

async fn run_vm_lifecycle(
    vms: Arc<DashMap<String, VmRecord>>,
    vm_id: String,
    req: CreateVmRequest,
    rootfs_dir: String,
) {
    let start = Instant::now();

    // Update status to running
    if let Some(mut record) = vms.get_mut(&vm_id) {
        record.info.status = VmStatus::Running;
    }

    let rootfs_path = format!("{}/{}.ext4", rootfs_dir, req.rootfs);
    let scratch_dir = "/var/lib/firecracker/scratch";

    // Write user code to a raw block file that the VM reads from /dev/vdb.
    // Padded to 512-byte boundary so Firecracker accepts it as a drive.
    let code_path = format!("{}/{}.code", scratch_dir, vm_id);
    let code = req
        .env
        .get("CODE")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    {
        let mut buf = code.as_bytes().to_vec();
        let pad = (512 - (buf.len() % 512)) % 512;
        buf.resize(buf.len() + pad, 0);
        if let Err(e) = tokio::fs::write(&code_path, &buf).await {
            tracing::error!("Failed to write code file: {}", e);
            set_vm_failed(
                &vms,
                &vm_id,
                start,
                -1,
                "".into(),
                format!("Code write failed: {}", e),
            );
            return;
        }
    }

    // Append entrypoint to boot_args so the init script knows what to exec
    let boot_args = format!("{} fc_entrypoint={}", req.boot_args, req.entrypoint);

    // Build firecracker config and launch via the Firecracker binary.
    // The Firecracker binary communicates over a Unix socket; we create
    // a per-VM socket in the scratch directory.
    let socket_path = format!("{}/{}.sock", scratch_dir, vm_id);
    let config = serde_json::json!({
        "boot-source": {
            "kernel_image_path": format!("{}/vmlinux", rootfs_dir),
            "boot_args": boot_args,
        },
        "drives": [
            {
                "drive_id": "rootfs",
                "path_on_host": rootfs_path,
                "is_root_device": true,
                "is_read_only": true,
            },
            {
                "drive_id": "code",
                "path_on_host": code_path.clone(),
                "is_root_device": false,
                "is_read_only": true,
            },
        ],
        "machine-config": {
            "vcpu_count": req.vcpu_count,
            "mem_size_mib": req.mem_size_mib,
        },
    });

    let config_path = format!("{}/{}.json", scratch_dir, vm_id);

    // Write config
    if let Err(e) = tokio::fs::write(&config_path, config.to_string()).await {
        tracing::error!("Failed to write VM config: {}", e);
        set_vm_failed(
            &vms,
            &vm_id,
            start,
            -1,
            "".into(),
            format!("Config write failed: {}", e),
        );
        return;
    }

    // Launch firecracker process
    let timeout = tokio::time::Duration::from_millis(req.timeout_ms);
    let child = Command::new("firecracker")
        .args(["--api-sock", &socket_path, "--config-file", &config_path])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to spawn firecracker: {}", e);
            set_vm_failed(
                &vms,
                &vm_id,
                start,
                -1,
                "".into(),
                format!("Spawn failed: {}", e),
            );
            cleanup_files(&config_path, &socket_path, &code_path).await;
            return;
        }
    };

    // Wait with timeout. Use wait() + take stdout/stderr separately to
    // allow killing the child on timeout (wait_with_output takes ownership).
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();
    let result = tokio::time::timeout(timeout, child.wait()).await;

    match result {
        Ok(Ok(exit_status)) => {
            let exit_code = exit_status.code().unwrap_or(-1);
            let stdout = if let Some(mut out) = child_stdout {
                let mut buf = Vec::new();
                let _ = tokio::io::AsyncReadExt::read_to_end(&mut out, &mut buf).await;
                String::from_utf8_lossy(&buf).to_string()
            } else {
                String::new()
            };
            let stderr = if let Some(mut err) = child_stderr {
                let mut buf = Vec::new();
                let _ = tokio::io::AsyncReadExt::read_to_end(&mut err, &mut buf).await;
                String::from_utf8_lossy(&buf).to_string()
            } else {
                String::new()
            };
            let duration_ms = start.elapsed().as_millis() as u64;
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
        Ok(Err(e)) => {
            tracing::error!("VM {} process error: {}", vm_id, e);
            set_vm_failed(
                &vms,
                &vm_id,
                start,
                -1,
                "".into(),
                format!("Process error: {}", e),
            );
        }
        Err(_) => {
            tracing::warn!("VM {} timed out after {}ms", vm_id, req.timeout_ms);
            let _ = child.kill().await;
            if let Some(mut record) = vms.get_mut(&vm_id) {
                record.info.status = VmStatus::Timeout;
                record.result = Some(VmResult {
                    vm_id: vm_id.clone(),
                    status: VmStatus::Timeout,
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: format!("VM timed out after {}ms", req.timeout_ms),
                    duration_ms: start.elapsed().as_millis() as u64,
                });
            }
        }
    }

    cleanup_files(&config_path, &socket_path, &code_path).await;
}

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

async fn cleanup_files(config_path: &str, socket_path: &str, code_path: &str) {
    let _ = tokio::fs::remove_file(config_path).await;
    let _ = tokio::fs::remove_file(socket_path).await;
    let _ = tokio::fs::remove_file(code_path).await;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn chrono_now() -> String {
    // Simple ISO 8601 without pulling in chrono crate
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // Return epoch seconds as string — proper formatting can come later
    format!("{}Z", secs)
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

    let state = AppState {
        vms: Arc::new(DashMap::new()),
        rootfs_dir,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/vm/create", post(create_vm))
        .route("/vm", get(list_vms))
        .route("/vm/{vm_id}", get(get_vm_status))
        .route("/vm/{vm_id}/result", get(get_vm_result))
        .route("/vm/{vm_id}", delete(destroy_vm))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("firecracker-ctl listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
