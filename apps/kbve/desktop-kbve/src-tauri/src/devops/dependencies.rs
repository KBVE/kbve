//! Dependency detection for DevOps features.
//!
//! Checks for required CLI tools: gh (GitHub CLI), tmux, and claude (Claude Code CLI).

use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

/// Status of a single dependency
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DependencyStatus {
    /// Name of the dependency
    pub name: String,
    /// Whether the dependency is installed
    pub installed: bool,
    /// Whether the dependency is authenticated (for tools that require auth)
    pub authenticated: Option<bool>,
    /// Username/account if authenticated
    pub auth_user: Option<String>,
    /// Authentication hint URL if not authenticated
    pub auth_hint_url: Option<String>,
    /// Version string if installed
    pub version: Option<String>,
    /// Path to the executable if installed
    pub path: Option<String>,
    /// Installation instructions if not installed
    pub install_hint: String,
}

/// Status of all DevOps dependencies
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DevOpsDependencies {
    /// GitHub CLI status (required)
    pub gh: DependencyStatus,
    /// tmux status (required)
    pub tmux: DependencyStatus,
    /// Docker status (optional, enables sandboxed agents)
    pub docker: DependencyStatus,
    /// Claude Code CLI status
    pub claude: DependencyStatus,
    /// Aider CLI status
    pub aider: DependencyStatus,
    /// Gemini CLI status (Google AI)
    pub gemini: DependencyStatus,
    /// Ollama status (local LLM server)
    pub ollama: DependencyStatus,
    /// vLLM status (high-performance inference)
    pub vllm: DependencyStatus,
    /// Whether all required dependencies are installed (gh + tmux + at least one agent)
    pub all_satisfied: bool,
    /// List of available agent types that are installed
    pub available_agents: Vec<String>,
    /// Whether sandboxed (Docker) agents are available
    pub sandbox_available: bool,
}

/// Check if a command exists and get its version
fn check_command(name: &str, version_args: &[&str]) -> (bool, Option<String>, Option<String>) {
    // First check if command exists using `which`
    let which_result = Command::new("which").arg(name).output();

    let path = match which_result {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => return (false, None, None),
    };

    // Get version
    let version_result = Command::new(name).args(version_args).output();

    let version = match version_result {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Some tools output to stderr
            let output_str = if stdout.trim().is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            };
            // Extract first line and clean up
            output_str.lines().next().map(|s| s.trim().to_string())
        }
        _ => None,
    };

    (true, version, Some(path))
}

/// Run a command with a timeout, returning stdout if successful
fn run_command_with_timeout(
    name: &str,
    args: &[&str],
    timeout_secs: u64,
) -> Option<(bool, String)> {
    use std::sync::mpsc;
    use std::time::Duration;

    let name = name.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let result = Command::new(&name).args(&args).output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(Duration::from_secs(timeout_secs)) {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Some((output.status.success(), stdout))
        }
        _ => None,
    }
}

/// Check if GitHub CLI is authenticated and get the username
fn check_gh_auth() -> (bool, Option<String>) {
    // Use a 5 second timeout to prevent hanging
    match run_command_with_timeout("gh", &["auth", "status"], 5) {
        Some((success, _)) => {
            if success {
                // Get the authenticated username
                if let Some((_, stdout)) =
                    run_command_with_timeout("gh", &["api", "user", "-q", ".login"], 3)
                {
                    let username = stdout.trim().to_string();
                    if !username.is_empty() {
                        return (true, Some(username));
                    }
                }
                (true, None)
            } else {
                (false, None)
            }
        }
        None => (false, None),
    }
}

/// Check GitHub CLI (gh) status
fn check_gh() -> DependencyStatus {
    let (installed, version, path) = check_command("gh", &["--version"]);

    // Parse version from "gh version 2.40.0 (2024-01-01)" format
    let version = version.and_then(|v| {
        v.split_whitespace()
            .nth(2)
            .map(|s| s.trim_end_matches(',').to_string())
    });

    // Check authentication status if installed
    let (authenticated, auth_user) = if installed {
        let (is_auth, user) = check_gh_auth();
        (Some(is_auth), user)
    } else {
        (None, None)
    };

    DependencyStatus {
        name: "gh".to_string(),
        installed,
        authenticated,
        auth_user,
        auth_hint_url: Some("https://kbve.com/application/git#gh".to_string()),
        version,
        path,
        install_hint: "brew install gh".to_string(),
    }
}

/// Check tmux status
fn check_tmux() -> DependencyStatus {
    let (installed, version, path) = check_command("tmux", &["-V"]);

    // Parse version from "tmux 3.4" format
    let version = version.and_then(|v| v.split_whitespace().nth(1).map(|s| s.to_string()));

    DependencyStatus {
        name: "tmux".to_string(),
        installed,
        authenticated: None,
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "brew install tmux".to_string(),
    }
}

/// Check if Claude Code CLI is authenticated and get the email
fn check_claude_auth() -> (bool, Option<String>) {
    // Method 1: Check for ANTHROPIC_API_KEY environment variable (highest priority auth method)
    if let Ok(api_key) = std::env::var("ANTHROPIC_API_KEY") {
        if !api_key.is_empty() {
            return (true, Some("API Key".to_string()));
        }
    }

    // Method 2: Read ~/.claude.json and check for oauthAccount
    if let Ok(home) = std::env::var("HOME") {
        let claude_config = std::path::PathBuf::from(&home).join(".claude.json");
        if claude_config.exists() {
            if let Ok(contents) = std::fs::read_to_string(&claude_config) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    // Check for oauthAccount which contains email and other auth info
                    if let Some(oauth) = json.get("oauthAccount") {
                        if let Some(email) = oauth.get("emailAddress").and_then(|e| e.as_str()) {
                            if !email.is_empty() {
                                return (true, Some(email.to_string()));
                            }
                        }
                        // Has oauth account but no email - still authenticated
                        return (true, None);
                    }
                }
            }
        }
    }

    (false, None)
}

/// Check Claude Code CLI status
fn check_claude() -> DependencyStatus {
    let (installed, version, path) = check_command("claude", &["--version"]);

    // Version output format may vary, just use the first line
    let version = version.map(|v| v.trim().to_string());

    // Check authentication status if installed
    let (authenticated, auth_user) = if installed {
        let (is_auth, user) = check_claude_auth();
        (Some(is_auth), user)
    } else {
        (None, None)
    };

    DependencyStatus {
        name: "claude".to_string(),
        installed,
        authenticated,
        auth_user,
        auth_hint_url: Some("https://kbve.com/application/ml/#claude".to_string()),
        version,
        path,
        install_hint: "npm install -g @anthropic-ai/claude-code".to_string(),
    }
}

/// Check Aider CLI status
fn check_aider() -> DependencyStatus {
    let (installed, version, path) = check_command("aider", &["--version"]);

    // Parse version from aider output
    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "aider".to_string(),
        installed,
        authenticated: None,
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "pip install aider-chat".to_string(),
    }
}

/// Check Gemini CLI status (Google AI Studio)
fn check_gemini() -> DependencyStatus {
    let (installed, version, path) = check_command("gemini", &["--version"]);

    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "gemini".to_string(),
        installed,
        authenticated: None,
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "pip install google-generativeai".to_string(),
    }
}

/// Check Ollama status (local LLM server)
fn check_ollama() -> DependencyStatus {
    let (installed, version, path) = check_command("ollama", &["--version"]);

    // Parse version from ollama output
    let version = version.and_then(|v| {
        v.split_whitespace()
            .find(|s| {
                s.chars()
                    .next()
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false)
            })
            .map(|s| s.to_string())
    });

    DependencyStatus {
        name: "ollama".to_string(),
        installed,
        authenticated: None,
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "brew install ollama".to_string(),
    }
}

/// Check vLLM status (high-performance inference server)
fn check_vllm() -> DependencyStatus {
    // vLLM is typically run as a server, check for python module
    let (installed, version, path) = check_command("vllm", &["--version"]);

    let version = version.map(|v| v.trim().to_string());

    DependencyStatus {
        name: "vllm".to_string(),
        installed,
        authenticated: None,
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "pip install vllm".to_string(),
    }
}

/// Check Docker status
fn check_docker() -> DependencyStatus {
    let (installed, version, path) = check_command("docker", &["--version"]);

    // Parse version from "Docker version 24.0.7, build afdd53b" format
    let version = version.and_then(|v| {
        v.split_whitespace()
            .nth(2)
            .map(|s| s.trim_end_matches(',').to_string())
    });

    // Check if Docker daemon is running
    let daemon_running = if installed {
        run_command_with_timeout("docker", &["info"], 5)
            .map(|(success, _)| success)
            .unwrap_or(false)
    } else {
        false
    };

    DependencyStatus {
        name: "docker".to_string(),
        installed,
        // Use authenticated field to indicate daemon is running
        authenticated: if installed {
            Some(daemon_running)
        } else {
            None
        },
        auth_user: None,
        auth_hint_url: None,
        version,
        path,
        install_hint: "Install Docker Desktop from https://docker.com".to_string(),
    }
}

/// Check all DevOps dependencies
pub fn check_all_dependencies() -> DevOpsDependencies {
    let gh = check_gh();
    let tmux = check_tmux();
    let docker = check_docker();
    let claude = check_claude();
    let aider = check_aider();
    let gemini = check_gemini();
    let ollama = check_ollama();
    let vllm = check_vllm();

    // Build list of available agents
    let mut available_agents = Vec::new();
    if claude.installed {
        available_agents.push("claude".to_string());
    }
    if aider.installed {
        available_agents.push("aider".to_string());
    }
    if gemini.installed {
        available_agents.push("gemini".to_string());
    }
    if ollama.installed {
        available_agents.push("ollama".to_string());
    }
    if vllm.installed {
        available_agents.push("vllm".to_string());
    }

    // All satisfied if gh + tmux + at least one agent
    let has_agent = !available_agents.is_empty();
    let all_satisfied = gh.installed && tmux.installed && has_agent;

    // Sandbox is available if Docker is installed and daemon is running
    let sandbox_available = docker.installed && docker.authenticated.unwrap_or(false);

    DevOpsDependencies {
        gh,
        tmux,
        docker,
        claude,
        aider,
        gemini,
        ollama,
        vllm,
        all_satisfied,
        available_agents,
        sandbox_available,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_dependencies() {
        let deps = check_all_dependencies();
        // Just verify it doesn't panic and returns valid structure
        assert!(!deps.gh.name.is_empty());
        assert!(!deps.tmux.name.is_empty());
    }
}
