use clap::{Parser, Subcommand};
use serde_json::json;
use std::{borrow::Cow, process::ExitCode};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

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
#[command(
    name = "kbve-kubectl",
    about = "KBVE kubectl wrapper for KubeVirt VM lifecycle management",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Print version and available tools
    Info,

    /// Run a shell script via kubectl (passthrough)
    Run {
        /// Path to the shell script
        script: String,

        /// Extra arguments passed to the script
        #[arg(trailing_var_arg = true)]
        args: Vec<String>,
    },

    /// Execute a command inside a KubeVirt VM via QEMU Guest Agent
    GuestExec {
        /// VM name
        #[arg(long)]
        vm: String,

        /// Namespace
        #[arg(long, default_value = "angelscript")]
        namespace: String,

        /// Command to execute inside the VM
        #[arg(long)]
        command: String,

        /// Arguments for the command
        #[arg(trailing_var_arg = true)]
        args: Vec<String>,
    },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn kubectl_output(args: &[&str]) -> Result<String, Cow<'static, str>> {
    let output = tokio::process::Command::new("kubectl")
        .args(args)
        .output()
        .await
        .map_err(|e| Cow::Owned(format!("kubectl spawn failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Cow::Owned(format!("kubectl failed: {stderr}")));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn cmd_info() -> ExitCode {
    println!("kbve-kubectl v{}", env!("CARGO_PKG_VERSION"));
    println!();

    let tools: &[(&str, &[&str])] = &[
        ("kubectl", &["kubectl", "version", "--client", "--short"]),
        ("curl", &["curl", "--version"]),
        ("wget", &["wget", "--version"]),
        ("jq", &["jq", "--version"]),
        ("virsh", &["virsh", "--version"]),
    ];

    let checks = tools.iter().map(|(name, cmd)| async move {
        let status = tokio::process::Command::new(cmd[0])
            .args(&cmd[1..])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
        let ok = matches!(status, Ok(s) if s.success());
        (*name, ok)
    });

    let results = futures::future::join_all(checks).await;
    for (name, ok) in results {
        let label = if ok { "available" } else { "not found" };
        println!("  {name}: {label}");
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
        Ok(s) => ExitCode::from(s.code().unwrap_or(1) as u8),
        Err(e) => {
            tracing::error!("failed to execute script: {e}");
            ExitCode::FAILURE
        }
    }
}

async fn cmd_guest_exec(vm: &str, namespace: &str, command: &str, args: &[String]) -> ExitCode {
    // Find the virt-launcher pod
    let pod = match kubectl_output(&[
        "get",
        "pods",
        "-n",
        namespace,
        "-l",
        &format!("vm.kubevirt.io/name={vm}"),
        "-o",
        "jsonpath={.items[0].metadata.name}",
    ])
    .await
    {
        Ok(p) if !p.is_empty() => p,
        Ok(_) => {
            tracing::error!("no virt-launcher pod found for VM {vm}");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            tracing::error!("failed to find virt-launcher pod for VM {vm}: {e}");
            return ExitCode::FAILURE;
        }
    };

    // Get libvirt domain name
    let domain = match kubectl_output(&[
        "exec", &pod, "-n", namespace, "-c", "compute", "--", "virsh", "list", "--name",
    ])
    .await
    {
        Ok(out) => {
            let d = out
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("")
                .trim()
                .to_string();
            if d.is_empty() {
                tracing::error!("no libvirt domain found in {pod}");
                return ExitCode::FAILURE;
            }
            d
        }
        Err(e) => {
            tracing::error!("failed to get libvirt domain from {pod}: {e}");
            return ExitCode::FAILURE;
        }
    };

    // Build guest-exec payload with serde_json (proper escaping)
    let guest_exec = json!({
        "execute": "guest-exec",
        "arguments": {
            "path": command,
            "arg": args,
            "capture-output": true,
        }
    })
    .to_string();

    tracing::info!("guest-exec on {vm} (pod={pod}, domain={domain}): {command}");

    let result = tokio::process::Command::new("kubectl")
        .args([
            "exec",
            &pod,
            "-n",
            namespace,
            "-c",
            "compute",
            "--",
            "virsh",
            "qemu-agent-command",
            &domain,
            &guest_exec,
        ])
        .output()
        .await;

    match result {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            if !stdout.is_empty() {
                println!("{stdout}");
            }
            if !stderr.is_empty() {
                eprintln!("{stderr}");
            }
            if o.status.success() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(e) => {
            tracing::error!("guest-exec failed: {e}");
            ExitCode::FAILURE
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
            args,
        } => cmd_guest_exec(&vm, &namespace, &command, &args).await,
    }
}
