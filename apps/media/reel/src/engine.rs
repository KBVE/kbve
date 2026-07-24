use crate::{config, mover, state};
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, ManagedTorrent, Session};
use tokio::io::{AsyncRead, AsyncSeek};

pub fn is_vpn_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified())
        }
        IpAddr::V6(v6) => {
            let octets = v6.octets();
            let is_unique_local = octets[0] & 0xfe == 0xfc;
            let is_link_local = octets[0] == 0xfe && octets[1] & 0xc0 == 0x80;
            !(v6.is_loopback() || v6.is_unspecified() || is_unique_local || is_link_local)
        }
    }
}

pub async fn vpn_preflight(check_url: &str) -> anyhow::Result<IpAddr> {
    let body = reqwest::get(check_url).await?.text().await?;
    let ip: IpAddr = body
        .trim()
        .parse()
        .map_err(|_| anyhow::anyhow!("vpn check returned non-ip: {body}"))?;
    if !is_vpn_ip(ip) {
        anyhow::bail!("egress ip {ip} is not a public/vpn address; refusing to start");
    }
    Ok(ip)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

static ADD_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_subdir() -> String {
    let n = ADD_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos}-{n}")
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum VpnAction {
    None,
    Pause,
    Resume,
}

pub fn next_vpn_action(prev_ok: bool, now_ok: bool) -> VpnAction {
    match (prev_ok, now_ok) {
        (true, false) => VpnAction::Pause,
        (false, true) => VpnAction::Resume,
        _ => VpnAction::None,
    }
}

#[derive(Clone)]
pub struct Engine {
    session: Arc<Session>,
    store: state::StateStore,
    active_dir: PathBuf,
    library_dir: PathBuf,
    vpn_check_url: String,
    vpn_ok: Arc<AtomicBool>,
}

impl Engine {
    pub async fn start(cfg: &config::Config, store: state::StateStore) -> anyhow::Result<Self> {
        let ip = vpn_preflight(&cfg.vpn_check_url).await?;
        tracing::info!(%ip, "vpn preflight ok");
        std::fs::create_dir_all(&cfg.active_dir)?;
        std::fs::create_dir_all(&cfg.library_dir)?;
        let opts = librqbit::SessionOptions {
            ratelimits: librqbit::limits::LimitsConfig {
                upload_bps: cfg.upload_limit_bps.and_then(std::num::NonZeroU32::new),
                download_bps: None,
            },
            ..Default::default()
        };
        if let Some(bps) = opts.ratelimits.upload_bps {
            tracing::info!(upload_bps = bps.get(), "seeding upload rate limit enabled");
        }
        let session = Session::new_with_opts(cfg.active_dir.clone(), opts).await?;
        reconcile_on_start(&store);
        Ok(Self {
            session,
            store,
            active_dir: cfg.active_dir.clone(),
            library_dir: cfg.library_dir.clone(),
            vpn_check_url: cfg.vpn_check_url.clone(),
            vpn_ok: Arc::new(AtomicBool::new(true)),
        })
    }

    pub fn vpn_ok(&self) -> bool {
        self.vpn_ok.load(Ordering::Relaxed)
    }

    fn all_handles(&self) -> Vec<Arc<ManagedTorrent>> {
        self.session
            .with_torrents(|it| it.map(|(_, h)| h.clone()).collect())
    }

    pub async fn vpn_recheck(&self) -> bool {
        let now_ok = vpn_preflight(&self.vpn_check_url).await.is_ok();
        let prev_ok = self.vpn_ok.load(Ordering::Relaxed);
        match next_vpn_action(prev_ok, now_ok) {
            VpnAction::Pause => {
                crate::telemetry::vpn_leak();
                for h in self.all_handles() {
                    if let Err(e) = self.session.pause(&h).await {
                        tracing::warn!(error = %e, "torrent pause failed");
                    }
                }
            }
            VpnAction::Resume => {
                crate::telemetry::vpn_restored();
                for h in self.all_handles() {
                    if let Err(e) = self.session.unpause(&h).await {
                        tracing::warn!(error = %e, "torrent unpause failed");
                    }
                }
            }
            VpnAction::None => {}
        }
        self.vpn_ok.store(now_ok, Ordering::Relaxed);
        now_ok
    }

    pub async fn add(&self, source: &str) -> anyhow::Result<String> {
        if !self.vpn_ok() {
            anyhow::bail!("vpn egress unavailable; refusing to add torrent");
        }
        let out_dir = self.active_dir.join(unique_subdir());
        let opts = AddTorrentOptions {
            output_folder: Some(out_dir.to_string_lossy().into_owned()),
            ..Default::default()
        };
        let resp = self
            .session
            .add_torrent(AddTorrent::from_url(source), Some(opts))
            .await?;
        let handle = resp
            .into_handle()
            .ok_or_else(|| anyhow::anyhow!("torrent is list-only, no handle"))?;
        let id = handle.id().to_string();
        let name = handle.name().unwrap_or_else(|| id.clone());

        self.store.upsert(state::Metadata {
            id: id.clone(),
            name: name.clone(),
            path: String::new(),
            size: 0,
            completed_at: None,
            last_access: now_secs(),
            state: state::TorrentState::Leeching,
            error: None,
            transcode: state::TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: state::HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        })?;
        crate::telemetry::torrent_added(&id, source.split_once(':').map(|(s, _)| s).unwrap_or("unknown"));

        let store = self.store.clone();
        let library_dir = self.library_dir.clone();
        let id_task = id.clone();
        tokio::spawn(async move {
            if let Err(e) = handle.wait_until_completed().await {
                crate::telemetry::torrent_failed(&id_task, "download", &e.to_string());
                let _ = store.update(&id_task, |m| {
                    m.state = state::TorrentState::Failed;
                    m.error = Some(format!("download failed: {e}"));
                    ((), true)
                });
                return;
            }
            match mover::move_completed(&out_dir, &library_dir) {
                Ok(moved) => {
                    let now = now_secs();
                    let _ = store.upsert(state::Metadata {
                        id: id_task.clone(),
                        name,
                        path: moved.dest.display().to_string(),
                        size: moved.size,
                        completed_at: Some(now),
                        last_access: now,
                        state: state::TorrentState::Seeding,
                        error: None,
                        transcode: state::TranscodeStatus::None,
                        transcode_path: None,
                        transcode_error: None,
                        hls: state::HlsStatus::None,
                        hls_dir: None,
                        hls_error: None,
                    });
                    crate::telemetry::torrent_completed(&id_task, moved.size);
                }
                Err(e) => {
                    crate::telemetry::torrent_failed(&id_task, "move", &e.to_string());
                    let _ = store.update(&id_task, |m| {
                        m.state = state::TorrentState::Failed;
                        m.error = Some(format!("move failed: {e}"));
                        ((), true)
                    });
                }
            }
        });
        Ok(id)
    }

    pub async fn delete(&self, id: &str) -> anyhow::Result<bool> {
        let removed = self.store.remove(id)?;
        if let Ok(tid) = id.parse::<usize>() {
            let _ = self.session.delete(TorrentIdOrHash::Id(tid), true).await;
        }
        if let Some(m) = &removed {
            remove_entry_files(&m.path, m.transcode_path.as_deref());
        }
        Ok(removed.is_some())
    }

    pub async fn reap_expired(&self, ttl_secs: u64, now: u64) -> anyhow::Result<Vec<String>> {
        let expired = crate::reaper::select_expired(&self.store.list(), ttl_secs, now);
        let mut reaped = Vec::new();
        for id in expired {
            let meta = self.store.get(&id);
            match self.delete(&id).await {
                Ok(true) => {
                    match meta {
                        Some(m) => crate::telemetry::reaped(&id, &m.name, m.size),
                        None => crate::telemetry::reaped(&id, "", 0),
                    }
                    reaped.push(id);
                }
                Ok(false) => {}
                Err(e) => tracing::warn!(id = %id, error = %e, "reap delete failed"),
            }
        }
        Ok(reaped)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FileEntry {
    pub index: usize,
    pub name: String,
    pub len: u64,
}

fn is_media_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".ts"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

pub fn primary_file_index(files: &[FileEntry]) -> Option<usize> {
    files
        .iter()
        .filter(|f| is_media_name(&f.name))
        .max_by_key(|f| f.len)
        .map(|f| f.index)
}

impl Engine {
    fn handle(&self, id: &str) -> Option<Arc<ManagedTorrent>> {
        let tid = id.parse::<usize>().ok()?;
        self.session.get(TorrentIdOrHash::Id(tid))
    }

    pub fn list_files(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>> {
        let handle = match self.handle(id) {
            Some(h) => h,
            None => return Ok(None),
        };
        let files = handle.with_metadata(|m| {
            m.file_infos
                .iter()
                .enumerate()
                .map(|(index, fi)| FileEntry {
                    index,
                    name: fi.relative_filename.to_string_lossy().into_owned(),
                    len: fi.len,
                })
                .collect::<Vec<_>>()
        });
        match files {
            Ok(v) => Ok(Some(v)),
            Err(_) => Ok(None),
        }
    }

    pub fn open_stream(
        &self,
        id: &str,
        file_id: usize,
    ) -> anyhow::Result<impl AsyncRead + AsyncSeek + Send + Unpin + 'static> {
        let handle = self
            .handle(id)
            .ok_or_else(|| anyhow::anyhow!("no managed torrent for id {id}"))?;
        handle.stream(file_id)
    }
}

pub trait ReadSeek: AsyncRead + AsyncSeek + Send + Unpin {}
impl<T: AsyncRead + AsyncSeek + Send + Unpin> ReadSeek for T {}

pub trait MediaSource: Send + Sync {
    fn entries(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>>;
    fn open(&self, id: &str, file_id: usize) -> anyhow::Result<Box<dyn ReadSeek>>;
}

impl MediaSource for Engine {
    fn entries(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>> {
        self.list_files(id)
    }
    fn open(&self, id: &str, file_id: usize) -> anyhow::Result<Box<dyn ReadSeek>> {
        Ok(Box::new(self.open_stream(id, file_id)?))
    }
}

pub fn needs_fail_on_restart(state: &state::TorrentState) -> bool {
    matches!(state, state::TorrentState::Leeching)
}

fn reconcile_on_start(store: &state::StateStore) {
    for m in store.list() {
        if needs_fail_on_restart(&m.state) {
            let _ = store.update(&m.id, |m| {
                m.state = state::TorrentState::Failed;
                m.error = Some("interrupted by restart; not resumable".into());
                ((), true)
            });
            crate::telemetry::reconcile_failed(&m.id, &m.name);
        }
    }
}

pub async fn vpn_watchdog_loop(engine: Engine, interval_secs: u64) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    ticker.tick().await;
    loop {
        ticker.tick().await;
        engine.vpn_recheck().await;
    }
}

pub fn remove_entry_files(path: &str, transcode_path: Option<&str>) {
    for p in std::iter::once(path).chain(transcode_path) {
        let pb = std::path::Path::new(p);
        if pb.is_dir() {
            let _ = std::fs::remove_dir_all(pb);
        } else if pb.exists() {
            let _ = std::fs::remove_file(pb);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;

    #[test]
    fn remove_entry_files_deletes_source_and_transcode() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("srcdir");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("a.mkv"), b"x").unwrap();
        let tc = dir.path().join("out.reel.mp4");
        std::fs::write(&tc, b"y").unwrap();
        remove_entry_files(&src.display().to_string(), Some(&tc.display().to_string()));
        assert!(!src.exists());
        assert!(!tc.exists());
    }

    #[test]
    fn needs_fail_on_restart_only_leeching() {
        use state::TorrentState::*;
        assert!(needs_fail_on_restart(&Leeching));
        assert!(!needs_fail_on_restart(&Seeding));
        assert!(!needs_fail_on_restart(&Failed));
        assert!(!needs_fail_on_restart(&Reaped));
    }

    #[test]
    fn reconcile_fails_stranded_leeching_keeps_seeding() {
        let dir = tempfile::tempdir().unwrap();
        let store = state::StateStore::load(dir.path().join("s.json")).unwrap();
        let mut leech = mk_meta("1", state::TorrentState::Leeching);
        leech.name = "dl".into();
        store.upsert(leech).unwrap();
        store
            .upsert(mk_meta("2", state::TorrentState::Seeding))
            .unwrap();

        reconcile_on_start(&store);

        let a = store.get("1").unwrap();
        assert_eq!(a.state, state::TorrentState::Failed);
        assert!(a.error.as_deref().unwrap().contains("restart"));
        assert_eq!(store.get("2").unwrap().state, state::TorrentState::Seeding);
    }

    fn mk_meta(id: &str, st: state::TorrentState) -> state::Metadata {
        state::Metadata {
            id: id.into(),
            name: id.into(),
            path: format!("/lib/{id}"),
            size: 1,
            completed_at: None,
            last_access: 0,
            state: st,
            error: None,
            transcode: state::TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: state::HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        }
    }

    #[test]
    fn vpn_action_transitions() {
        assert_eq!(next_vpn_action(true, true), VpnAction::None);
        assert_eq!(next_vpn_action(true, false), VpnAction::Pause);
        assert_eq!(next_vpn_action(false, true), VpnAction::Resume);
        assert_eq!(next_vpn_action(false, false), VpnAction::None);
    }

    #[test]
    fn private_and_loopback_are_not_vpn() {
        assert!(!is_vpn_ip("127.0.0.1".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("10.0.0.5".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("192.168.1.2".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("172.16.0.1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn public_ip_is_vpn() {
        assert!(is_vpn_ip("203.0.113.7".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_unique_local_is_not_vpn() {
        assert!(!is_vpn_ip("fc00::1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_link_local_is_not_vpn() {
        assert!(!is_vpn_ip("fe80::1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_public_is_vpn() {
        assert!(is_vpn_ip("2606:4700::1111".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn primary_file_index_picks_largest_media() {
        let files = vec![
            FileEntry {
                index: 0,
                name: "sample.nfo".into(),
                len: 10,
            },
            FileEntry {
                index: 1,
                name: "movie.mkv".into(),
                len: 900,
            },
            FileEntry {
                index: 2,
                name: "poster.jpg".into(),
                len: 5000,
            },
            FileEntry {
                index: 3,
                name: "clip.mp4".into(),
                len: 100,
            },
        ];
        assert_eq!(primary_file_index(&files), Some(1));
    }

    #[test]
    fn primary_file_index_none_when_no_media() {
        let files = vec![FileEntry {
            index: 0,
            name: "readme.txt".into(),
            len: 10,
        }];
        assert_eq!(primary_file_index(&files), None);
    }
}
