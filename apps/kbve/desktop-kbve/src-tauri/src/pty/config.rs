#[derive(Debug, Clone)]
pub struct PtySpawnConfig {
    pub shell: Option<String>,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub rows: u16,
    pub cols: u16,
    pub env: Vec<(String, String)>,
}

impl PtySpawnConfig {
    pub fn resolved_shell(&self) -> String {
        if let Some(shell) = &self.shell {
            return shell.clone();
        }

        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.is_empty() {
                return shell;
            }
        }

        if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    }
}
