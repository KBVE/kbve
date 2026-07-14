use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LauncherError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Game not installed")]
    GameNotInstalled,
    #[error("Invalid version: {0}")]
    InvalidVersion(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GameStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub install_path: Option<PathBuf>,
    pub needs_update: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub changelog: String,
}

/// Check for game updates from itch.io
pub async fn check_for_updates() -> Result<String, String> {
    // TODO: Implement itch.io API integration
    // For now, return mock data
    Ok("0.1.0".to_string())
}

/// Download a specific game version
pub async fn download_game_version(version: &str) -> Result<String, String> {
    // TODO: Implement download logic
    // 1. Fetch download URL from itch.io
    // 2. Download game archive
    // 3. Extract to game directory
    // 4. Update version file

    println!("Downloading Death Slayer version: {}", version);
    Ok(format!("Downloaded version {}", version))
}

/// Launch the installed game
pub fn launch_game() -> Result<(), String> {
    let game_path = get_game_install_path();

    if !game_path.exists() {
        return Err("Game not installed".to_string());
    }

    // TODO: Launch platform-specific executable
    #[cfg(target_os = "windows")]
    let exe_name = "DeathSlayer.exe";

    #[cfg(target_os = "linux")]
    let exe_name = "DeathSlayer";

    #[cfg(target_os = "macos")]
    let exe_name = "DeathSlayer.app";

    let exe_path = game_path.join(exe_name);

    if !exe_path.exists() {
        return Err(format!("Game executable not found at: {:?}", exe_path));
    }

    std::process::Command::new(exe_path)
        .spawn()
        .map_err(|e| format!("Failed to launch game: {}", e))?;

    Ok(())
}

/// Get the current game status
pub fn get_status() -> Result<GameStatus, String> {
    let install_path = get_game_install_path();
    let installed = install_path.exists();

    let version = if installed {
        read_installed_version()
    } else {
        None
    };

    Ok(GameStatus {
        installed,
        version,
        install_path: Some(install_path),
        needs_update: false, // TODO: Compare with remote version
    })
}

/// Get the game installation directory
fn get_game_install_path() -> PathBuf {
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));

    data_dir.join("DeathSlayer").join("game")
}

/// Read the installed game version
fn read_installed_version() -> Option<String> {
    let version_file = get_game_install_path().join("version.txt");
    std::fs::read_to_string(version_file).ok()
}
