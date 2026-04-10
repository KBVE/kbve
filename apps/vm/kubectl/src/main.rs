use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{process::ExitCode, time::Duration};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const GUEST_POLL_INTERVAL: Duration = Duration::from_secs(2);
const GUEST_POLL_TIMEOUT: Duration = Duration::from_secs(300);

const TOOLS: &[(&str, &[&str])] = &[
    ("kubectl", &["kubectl", "version", "--client", "--short"]),
    ("curl", &["curl", "--version"]),
    ("wget", &["wget", "--version"]),
    ("jq", &["jq", "--version"]),
    ("virsh", &["virsh", "--version"]),
];

#[inline]
fn init_tracing(default_filter: &str) {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| default_filter.into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

#[derive(Parser)]
#[command(name = "kbve-kubectl", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Print version and available tools
    Info,
    /// Run a shell script (passthrough to /bin/sh)
    Run {
        script: String,
        #[arg(trailing_var_arg = true)]
        args: Vec<String>,
    },
    /// Execute a command inside a KubeVirt VM via QEMU Guest Agent
    GuestExec {
        #[arg(long)]
        vm: String,
        #[arg(long, default_value = "angelscript")]
        namespace: String,
        #[arg(long)]
        command: String,
        #[arg(long, default_value = "300")]
        timeout: u64,
        #[arg(trailing_var_arg = true)]
        args: Vec<String>,
    },
}

// ---------------------------------------------------------------------------
// Guest Agent types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GuestExecResponse {
    #[serde(rename = "return")]
    ret: GuestExecReturn,
}

#[derive(Deserialize)]
struct GuestExecReturn {
    pid: i64,
}

#[derive(Deserialize)]
struct GuestExecStatusResponse {
    #[serde(rename = "return")]
    ret: GuestExecStatusReturn,
}

#[derive(Deserialize)]
struct GuestExecStatusReturn {
    exited: bool,
    #[serde(default)]
    exitcode: Option<i64>,
    #[serde(default, rename = "out-data")]
    out_data: Option<String>,
    #[serde(default, rename = "err-data")]
    err_data: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

#[inline]
async fn kubectl_output(args: &[&str]) -> Result<String, String> {
    let output = tokio::time::timeout(
        DEFAULT_TIMEOUT,
        tokio::process::Command::new("kubectl").args(args).output(),
    )
    .await
    .map_err(|_| "kubectl timed out".to_string())?
    .map_err(|e| format!("kubectl spawn failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn virsh_guest_cmd(
    pod: &str,
    namespace: &str,
    domain: &str,
    payload: &str,
) -> Result<String, String> {
    kubectl_output(&[
        "exec",
        pod,
        "-n",
        namespace,
        "-c",
        "compute",
        "--",
        "virsh",
        "qemu-agent-command",
        domain,
        payload,
    ])
    .await
}

fn decode_b64(data: &Option<String>) -> String {
    match data {
        Some(s) if !s.is_empty() => B64
            .decode(s)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_else(|_| s.clone()),
        _ => String::new(),
    }
}

#[inline]
async fn check_tool(name: &'static str, cmd: &'static [&'static str]) -> (&'static str, String) {
    let output = tokio::process::Command::new(cmd[0])
        .args(&cmd[1..])
        .stderr(std::process::Stdio::null())
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let ver = String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("available")
                .trim()
                .to_string();
            (name, ver)
        }
        _ => (name, "not found".to_string()),
    }
}

fn resolve_pod_name(jsonpath_output: &str) -> Result<&str, String> {
    let pods: Vec<&str> = jsonpath_output.split_whitespace().collect();
    match pods.len() {
        0 => Err("no virt-launcher pod found".to_string()),
        1 => Ok(pods[0]),
        n => {
            tracing::warn!("found {n} pods, using first: {}", pods[0]);
            Ok(pods[0])
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn cmd_info() -> ExitCode {
    println!("kbve-kubectl v{VERSION}");
    println!();

    let handles: Vec<_> = TOOLS
        .iter()
        .map(|&(name, cmd)| tokio::spawn(check_tool(name, cmd)))
        .collect();

    for handle in handles {
        if let Ok((name, ver)) = handle.await {
            println!("  {name}: {ver}");
        }
    }

    ExitCode::SUCCESS
}

async fn cmd_run(script: &str, args: &[String]) -> ExitCode {
    let status = tokio::process::Command::new("/bin/sh")
        .arg(script)
        .args(args)
        .status()
        .await;

    match status {
        Ok(s) if s.success() => ExitCode::SUCCESS,
        Ok(s) => {
            let code = s.code().unwrap_or(1);
            ExitCode::from(code.clamp(1, 255) as u8)
        }
        Err(e) => {
            tracing::error!("failed to execute script: {e}");
            ExitCode::FAILURE
        }
    }
}

async fn cmd_guest_exec(
    vm: &str,
    namespace: &str,
    command: &str,
    args: &[String],
    timeout_secs: u64,
) -> ExitCode {
    let label = &format!("vm.kubevirt.io/name={vm}");

    // Phase 1: find exactly one running virt-launcher pod
    let pod_raw = match kubectl_output(&[
        "get",
        "pods",
        "-n",
        namespace,
        "-l",
        label,
        "--field-selector=status.phase=Running",
        "-o",
        "jsonpath={.items[*].metadata.name}",
    ])
    .await
    {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("{e}");
            return ExitCode::FAILURE;
        }
    };

    let pod = match resolve_pod_name(&pod_raw) {
        Ok(p) => p.to_string(),
        Err(e) => {
            tracing::error!("VM {vm}: {e}");
            return ExitCode::FAILURE;
        }
    };

    // Phase 2: get libvirt domain
    let domain_raw = match kubectl_output(&[
        "exec", &pod, "-n", namespace, "-c", "compute", "--", "virsh", "list", "--name",
    ])
    .await
    {
        Ok(o) => o,
        Err(e) => {
            tracing::error!("domain lookup failed: {e}");
            return ExitCode::FAILURE;
        }
    };

    let domain = match domain_raw.lines().find(|l| !l.trim().is_empty()) {
        Some(d) => d.trim().to_string(),
        None => {
            tracing::error!("no libvirt domain in pod {pod}");
            return ExitCode::FAILURE;
        }
    };

    // Phase 3: submit guest-exec
    let exec_payload = json!({
        "execute": "guest-exec",
        "arguments": {
            "path": command,
            "arg": args,
            "capture-output": true,
        }
    })
    .to_string();

    tracing::info!("guest-exec {command} on {vm} (pod={pod}, domain={domain})");

    let exec_result = match virsh_guest_cmd(&pod, namespace, &domain, &exec_payload).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("guest-exec submit failed: {e}");
            return ExitCode::FAILURE;
        }
    };

    let pid = match serde_json::from_str::<GuestExecResponse>(&exec_result) {
        Ok(r) => r.ret.pid,
        Err(e) => {
            tracing::error!("failed to parse guest-exec response: {e} — raw: {exec_result}");
            return ExitCode::FAILURE;
        }
    };

    tracing::info!("guest process started (pid={pid}), polling for completion...");

    // Phase 4: poll guest-exec-status until exited or timeout
    let poll_timeout = Duration::from_secs(timeout_secs).min(GUEST_POLL_TIMEOUT);
    let deadline = tokio::time::Instant::now() + poll_timeout;
    let status_payload = json!({
        "execute": "guest-exec-status",
        "arguments": { "pid": pid }
    })
    .to_string();

    loop {
        if tokio::time::Instant::now() >= deadline {
            tracing::error!("guest process {pid} did not exit within {timeout_secs}s");
            return ExitCode::FAILURE;
        }

        tokio::time::sleep(GUEST_POLL_INTERVAL).await;

        let status_raw = match virsh_guest_cmd(&pod, namespace, &domain, &status_payload).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("status poll failed (retrying): {e}");
                continue;
            }
        };

        let status = match serde_json::from_str::<GuestExecStatusResponse>(&status_raw) {
            Ok(s) => s.ret,
            Err(e) => {
                tracing::warn!("status parse failed (retrying): {e}");
                continue;
            }
        };

        if !status.exited {
            continue;
        }

        let stdout = decode_b64(&status.out_data);
        let stderr = decode_b64(&status.err_data);
        let exit_code = status.exitcode.unwrap_or(0);

        if !stdout.is_empty() {
            print!("{stdout}");
        }
        if !stderr.is_empty() {
            eprint!("{stderr}");
        }

        if exit_code == 0 {
            tracing::info!("guest process {pid} exited successfully");
            return ExitCode::SUCCESS;
        } else {
            tracing::error!("guest process {pid} exited with code {exit_code}");
            return ExitCode::from(exit_code.clamp(1, 255) as u8);
        }
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> ExitCode {
    init_tracing("kbve_kubectl=info");
    let cli = Cli::parse();

    match cli.command {
        Commands::Info => cmd_info().await,
        Commands::Run { script, args } => cmd_run(&script, &args).await,
        Commands::GuestExec {
            vm,
            namespace,
            command,
            timeout,
            args,
        } => cmd_guest_exec(&vm, &namespace, &command, &args, timeout).await,
    }
}
