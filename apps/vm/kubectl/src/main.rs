use clap::{Parser, Subcommand};
use std::process::ExitCode;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
// Handlers
// ---------------------------------------------------------------------------

async fn cmd_info() -> ExitCode {
    println!("kbve-kubectl v{}", env!("CARGO_PKG_VERSION"));
    println!();

    // Check available tools
    let tools = [
        ("kubectl", "kubectl version --client --short"),
        ("curl", "curl --version"),
        ("wget", "wget --version"),
        ("jq", "jq --version"),
        ("virsh", "virsh --version"),
    ];

    for (name, check_cmd) in &tools {
        let parts: Vec<&str> = check_cmd.split_whitespace().collect();
        let status = tokio::process::Command::new(parts[0])
            .args(&parts[1..])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;

        match status {
            Ok(s) if s.success() => println!("  {name}: available"),
            _ => println!("  {name}: not found"),
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
        Ok(s) => {
            if s.success() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(s.code().unwrap_or(1) as u8)
            }
        }
        Err(e) => {
            tracing::error!("failed to execute script: {e}");
            ExitCode::FAILURE
        }
    }
}

async fn cmd_guest_exec(vm: &str, namespace: &str, command: &str, args: &[String]) -> ExitCode {
    // Find the virt-launcher pod
    let pod_output = tokio::process::Command::new("kubectl")
        .args([
            "get",
            "pods",
            "-n",
            namespace,
            "-l",
            &format!("vm.kubevirt.io/name={vm}"),
            "-o",
            "jsonpath={.items[0].metadata.name}",
        ])
        .output()
        .await;

    let pod = match pod_output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => {
            tracing::error!("failed to find virt-launcher pod for VM {vm}");
            return ExitCode::FAILURE;
        }
    };

    if pod.is_empty() {
        tracing::error!("no virt-launcher pod found for VM {vm}");
        return ExitCode::FAILURE;
    }

    // Get libvirt domain name
    let domain_output = tokio::process::Command::new("kubectl")
        .args([
            "exec", &pod, "-n", namespace, "-c", "compute", "--", "virsh", "list", "--name",
        ])
        .output()
        .await;

    let domain = match domain_output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim()
            .to_string(),
        _ => {
            tracing::error!("failed to get libvirt domain from {pod}");
            return ExitCode::FAILURE;
        }
    };

    if domain.is_empty() {
        tracing::error!("no libvirt domain found in {pod}");
        return ExitCode::FAILURE;
    }

    // Build guest-exec JSON
    let cmd_args: Vec<String> = args.iter().map(|a| format!("\"{a}\"")).collect();
    let args_json = cmd_args.join(",");
    let guest_exec = format!(
        r#"{{"execute":"guest-exec","arguments":{{"path":"{command}","arg":[{args_json}],"capture-output":true}}}}"#
    );

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
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kbve_kubectl=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

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
