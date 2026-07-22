use crate::{config, mover, state};
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, Session};

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

#[derive(Clone)]
pub struct Engine {
    session: Arc<Session>,
    store: state::StateStore,
    active_dir: PathBuf,
    library_dir: PathBuf,
}

impl Engine {
    pub async fn start(cfg: &config::Config, store: state::StateStore) -> anyhow::Result<Self> {
        let ip = vpn_preflight(&cfg.vpn_check_url).await?;
        tracing::info!(%ip, "vpn preflight ok");
        std::fs::create_dir_all(&cfg.active_dir)?;
        std::fs::create_dir_all(&cfg.library_dir)?;
        let session = Session::new(cfg.active_dir.clone()).await?;
        Ok(Self {
            session,
            store,
            active_dir: cfg.active_dir.clone(),
            library_dir: cfg.library_dir.clone(),
        })
    }

    pub async fn add(&self, source: &str) -> anyhow::Result<String> {
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
            transcode: state::TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
        })?;

        let store = self.store.clone();
        let library_dir = self.library_dir.clone();
        let id_task = id.clone();
        tokio::spawn(async move {
            if let Err(e) = handle.wait_until_completed().await {
                tracing::error!(id = %id_task, error = %e, "torrent failed");
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
                        transcode: state::TranscodeStatus::None,
                        transcode_path: None,
                        transcode_error: None,
                    });
                    tracing::info!(id = %id_task, "moved to library");
                }
                Err(e) => tracing::error!(id = %id_task, error = %e, "move failed"),
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
                    if let Some(m) = meta {
                        tracing::info!(id = %id, name = %m.name, size = m.size, "reaped");
                    } else {
                        tracing::info!(id = %id, "reaped");
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
}
