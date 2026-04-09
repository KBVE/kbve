use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Notify;
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
    "console=ttyS0 reboot=k panic=1 init=/init".to_string()
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "firecracker-ctl",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": iso8601_now(),
        "jailer": state.jailer.is_some(),
    }))
}

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
    tokio::spawn(async move {
        run_vm_lifecycle(vms, vm_id, req, rootfs_dir, kill_signal, jailer).await;
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

enum VmOutcome {
    Exited(std::process::ExitStatus),
    ProcessError(std::io::Error),
    Timeout,
    Killed,
}

/// What to clean up after the VM exits.
enum VmCleanup {
    /// Direct mode: individual scratch files.
    Direct {
        config_path: String,
        socket_path: String,
        code_path: String,
    },
    /// Jailed mode: entire jail directory tree + cgroup.
    Jailed { jail_dir: String, vm_id: String },
}

async fn run_vm_lifecycle(
    vms: Arc<DashMap<String, VmRecord>>,
    vm_id: String,
    req: CreateVmRequest,
    rootfs_dir: String,
    kill_signal: Arc<Notify>,
    jailer: Option<Arc<JailerConfig>>,
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

    let boot_args = format!("{} fc_entrypoint={}", req.boot_args, req.entrypoint);

    // Spawn via jailer or direct depending on configuration.
    let spawn_result = if let Some(ref jailer_cfg) = jailer {
        spawn_jailed(
            jailer_cfg,
            &vm_id,
            &rootfs_path,
            &rootfs_dir,
            &code_buf,
            &boot_args,
            &req,
        )
        .await
    } else {
        spawn_direct(
            &vm_id,
            &rootfs_path,
            &rootfs_dir,
            &code_buf,
            &boot_args,
            &req,
        )
        .await
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

    // Cleanup scratch files or jail directory
    match cleanup {
        VmCleanup::Direct {
            config_path,
            socket_path,
            code_path,
        } => {
            let _ = tokio::fs::remove_file(&config_path).await;
            let _ = tokio::fs::remove_file(&socket_path).await;
            let _ = tokio::fs::remove_file(&code_path).await;
        }
        VmCleanup::Jailed { jail_dir, vm_id } => {
            let _ = tokio::fs::remove_dir_all(&jail_dir).await;
            // Remove the cgroup directory the jailer created (empty after VM exit)
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
) -> Result<(tokio::process::Child, VmCleanup), String> {
    let scratch_dir = "/var/lib/firecracker/scratch";
    let code_path = format!("{}/{}.code", scratch_dir, vm_id);
    let socket_path = format!("{}/{}.sock", scratch_dir, vm_id);
    let config_path = format!("{}/{}.json", scratch_dir, vm_id);

    tokio::fs::write(&code_path, code_buf)
        .await
        .map_err(|e| format!("Code write failed: {}", e))?;

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
                "path_on_host": &code_path,
                "is_root_device": false,
                "is_read_only": true,
            },
        ],
        "machine-config": {
            "vcpu_count": req.vcpu_count,
            "mem_size_mib": req.mem_size_mib,
        },
    });

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

    // Config with paths relative to the chroot root.
    let config = serde_json::json!({
        "boot-source": {
            "kernel_image_path": "/vmlinux",
            "boot_args": boot_args,
        },
        "drives": [
            {
                "drive_id": "rootfs",
                "path_on_host": "/rootfs.ext4",
                "is_root_device": true,
                "is_read_only": true,
            },
            {
                "drive_id": "code",
                "path_on_host": "/code.raw",
                "is_root_device": false,
                "is_read_only": true,
            },
        ],
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

    let state = AppState {
        vms,
        rootfs_dir,
        max_concurrent_vms,
        jailer,
    };

    tracing::info!(
        "FC_MAX_CONCURRENT_VMS={}, FC_VM_TTL_SECS={}",
        max_concurrent_vms,
        vm_ttl_secs,
    );

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
