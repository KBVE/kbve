use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

pub const DEFAULT_BACKEND: &str = "https://chuckrpg.com";

#[derive(Debug, thiserror::Error)]
pub enum LauncherError {
    #[error("http error: {0}")]
    Http(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("no build available for {0}")]
    NoBuild(String),
    #[error("game not installed")]
    NotInstalled,
    #[error("no launchable executable found in install dir")]
    NoEntrypoint,
}

impl serde::Serialize for LauncherError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for LauncherError {
    fn from(e: std::io::Error) -> Self {
        LauncherError::Io(e.to_string())
    }
}
impl From<reqwest::Error> for LauncherError {
    fn from(e: reqwest::Error) -> Self {
        LauncherError::Http(e.to_string())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ClientVersion {
    pub platform: String,
    pub upload_id: u64,
    pub channel: Option<String>,
    pub user_version: Option<String>,
    pub build_id: Option<u64>,
    pub state: Option<String>,
    pub live: bool,
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Installed {
    pub platform: String,
    pub build_id: Option<u64>,
    pub user_version: Option<String>,
    pub entrypoint: Option<String>,
    pub install_dir: String,
}

pub fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn chuck_dir() -> Result<PathBuf, LauncherError> {
    let base = dirs::data_local_dir().ok_or_else(|| LauncherError::Io("no data dir".into()))?;
    let dir = base.join("ChuckRPG");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn install_dir() -> Result<PathBuf, LauncherError> {
    Ok(chuck_dir()?.join("app"))
}

fn state_path() -> Result<PathBuf, LauncherError> {
    Ok(chuck_dir()?.join("installed.json"))
}

fn session_path() -> Result<PathBuf, LauncherError> {
    Ok(chuck_dir()?.join("session.json"))
}

pub fn read_state() -> Option<Installed> {
    let path = state_path().ok()?;
    let raw = fs::read(path).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn write_state(state: &Installed) -> Result<(), LauncherError> {
    let raw = serde_json::to_vec_pretty(state).map_err(|e| LauncherError::Io(e.to_string()))?;
    fs::write(state_path()?, raw)?;
    Ok(())
}

pub async fn fetch_clients(backend: &str) -> Result<Vec<ClientVersion>, LauncherError> {
    let url = format!("{}/api/downloads", backend.trim_end_matches('/'));
    let clients = reqwest::Client::new()
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<ClientVersion>>()
        .await?;
    Ok(clients)
}

pub async fn host_client(backend: &str) -> Result<ClientVersion, LauncherError> {
    let platform = current_platform();
    fetch_clients(backend)
        .await?
        .into_iter()
        .find(|c| c.platform == platform)
        .ok_or_else(|| LauncherError::NoBuild(platform.to_string()))
}

pub async fn install_update<F: Fn(u64, u64) + Send + 'static>(
    backend: &str,
    progress: F,
) -> Result<Installed, LauncherError> {
    let platform = current_platform();
    let latest = host_client(backend).await?;
    if !latest.live {
        return Err(LauncherError::NoBuild(format!(
            "{platform} (still processing)"
        )));
    }

    let url = format!("{}/downloads/{}", backend.trim_end_matches('/'), platform);
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await?
        .error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    let dir = chuck_dir()?;
    let zip_path = dir.join("download.zip");
    let mut file = fs::File::create(&zip_path)?;
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)?;
        received += chunk.len() as u64;
        progress(received, total);
    }
    file.flush()?;
    drop(file);

    let target = install_dir()?;
    let zip_for_blocking = zip_path.clone();
    let target_for_blocking = target.clone();
    tokio::task::spawn_blocking(move || extract_zip(&zip_for_blocking, &target_for_blocking))
        .await
        .map_err(|e| LauncherError::Io(e.to_string()))??;
    let _ = fs::remove_file(&zip_path);

    let entrypoint = discover_entrypoint(&target, platform);
    let state = Installed {
        platform: platform.to_string(),
        build_id: latest.build_id,
        user_version: latest.user_version.clone(),
        entrypoint: entrypoint.map(|p| p.to_string_lossy().into_owned()),
        install_dir: target.to_string_lossy().into_owned(),
    };
    write_state(&state)?;
    Ok(state)
}

fn extract_zip(zip_path: &Path, target: &Path) -> Result<(), LauncherError> {
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    fs::create_dir_all(target)?;
    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| LauncherError::Io(e.to_string()))?;
    archive
        .extract(target)
        .map_err(|e| LauncherError::Io(e.to_string()))?;
    Ok(())
}

fn discover_entrypoint(dir: &Path, platform: &str) -> Option<PathBuf> {
    let mut files = Vec::new();
    collect_files(dir, 0, 4, &mut files);
    match platform {
        "windows" => files
            .iter()
            .filter(|p| has_ext(p, "exe"))
            .filter(|p| !is_aux_exe(p))
            .min_by_key(|p| (!name_has_chuck(p), depth_of(dir, p)))
            .cloned(),
        "macos" => find_app_bundle(dir, 0, 4),
        _ => files
            .iter()
            .filter(|p| has_ext(p, "sh") || (is_executable(p) && p.extension().is_none()))
            .min_by_key(|p| (!name_has_chuck(p), depth_of(dir, p)))
            .cloned(),
    }
}

fn collect_files(dir: &Path, depth: usize, max: usize, out: &mut Vec<PathBuf>) {
    if depth > max {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, depth + 1, max, out);
        } else {
            out.push(path);
        }
    }
}

fn find_app_bundle(dir: &Path, depth: usize, max: usize) -> Option<PathBuf> {
    if depth > max {
        return None;
    }
    let entries = fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if has_ext(&path, "app") {
                return Some(path);
            }
            subdirs.push(path);
        }
    }
    subdirs
        .into_iter()
        .find_map(|d| find_app_bundle(&d, depth + 1, max))
}

fn has_ext(p: &Path, ext: &str) -> bool {
    p.extension()
        .map(|e| e.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

fn name_has_chuck(p: &Path) -> bool {
    p.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase().contains("chuck"))
        .unwrap_or(false)
}

fn is_aux_exe(p: &Path) -> bool {
    let n = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    n.contains("crashreport") || n.contains("cefsubprocess") || n.contains("prereq")
}

fn depth_of(root: &Path, p: &Path) -> usize {
    p.strip_prefix(root)
        .map(|r| r.components().count())
        .unwrap_or(usize::MAX)
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(p)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_p: &Path) -> bool {
    false
}

// Apple-Silicon UE scene-culling crash workaround; passed via -execcmds (UE
// splits cvars on commas). Harmless on already-stable configs.
const SAFE_CVARS: &str = "r.GPUScene.UpdateMode 0,r.InstanceCulling.OcclusionCull 0";

fn set_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = fs::set_permissions(path, perms);
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

fn mac_inner_binary(app: &Path) -> Option<PathBuf> {
    let macos = app.join("Contents/MacOS");
    if let Some(stem) = app.file_stem().and_then(|s| s.to_str()) {
        let named = macos.join(stem);
        if named.is_file() {
            return Some(named);
        }
    }
    fs::read_dir(&macos)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.is_file())
}

pub fn launch(
    url: Option<&str>,
    session: Option<&erust::supabase::Session>,
) -> Result<std::process::Child, LauncherError> {
    let state = read_state().ok_or(LauncherError::NotInstalled)?;
    let entrypoint = state.entrypoint.ok_or(LauncherError::NoEntrypoint)?;
    let path = PathBuf::from(&entrypoint);

    let session_file = match session {
        Some(s) => Some(
            erust::tauri::write_session_file(&session_path()?, s)
                .map_err(|e| LauncherError::Io(e.to_string()))?,
        ),
        None => None,
    };

    let child = if cfg!(target_os = "macos") && has_ext(&path, "app") {
        let _ = std::process::Command::new("xattr")
            .args(["-d", "-r", "com.apple.quarantine"])
            .arg(&path)
            .status();
        let bin = mac_inner_binary(&path).unwrap_or_else(|| path.clone());
        set_executable(&bin);
        let mut cmd = std::process::Command::new(&bin);
        if let Some(u) = url {
            cmd.arg(u);
        }
        if let Some(f) = &session_file {
            cmd.env("CHUCKRPG_SESSION", f);
        }
        cmd.arg(format!("-execcmds={SAFE_CVARS}"));
        cmd.spawn()?
    } else {
        set_executable(&path);
        let mut cmd = std::process::Command::new(&path);
        if let Some(u) = url {
            cmd.arg(u);
        }
        if let Some(f) = &session_file {
            cmd.env("CHUCKRPG_SESSION", f);
        }
        cmd.spawn()?
    };
    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("chuck-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn macos_finds_nested_app_bundle() {
        let root = scratch("macos");
        fs::create_dir_all(root.join("Mac/chuck-Mac-Shipping.app/Contents")).unwrap();
        let ep = discover_entrypoint(&root, "macos").unwrap();
        assert!(ep.ends_with("Mac/chuck-Mac-Shipping.app"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn windows_prefers_game_exe_over_aux() {
        let root = scratch("windows");
        fs::create_dir_all(root.join("Windows")).unwrap();
        fs::write(root.join("Windows/chuck-Win64-Shipping.exe"), b"x").unwrap();
        fs::write(root.join("Windows/CrashReportClient.exe"), b"x").unwrap();
        let ep = discover_entrypoint(&root, "windows").unwrap();
        assert!(ep.ends_with("chuck-Win64-Shipping.exe"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn linux_finds_launch_script() {
        let root = scratch("linux");
        fs::create_dir_all(root.join("Linux")).unwrap();
        fs::write(root.join("Linux/chuck-Linux-Shipping.sh"), b"#!/bin/sh\n").unwrap();
        let ep = discover_entrypoint(&root, "linux").unwrap();
        assert!(ep.ends_with("chuck-Linux-Shipping.sh"));
        fs::remove_dir_all(&root).unwrap();
    }
}
