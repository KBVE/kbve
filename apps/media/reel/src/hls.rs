use crate::state::{HlsStatus, Metadata, StateStore, TorrentState};
use crate::transcode::{pick_primary_file, Delivery};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::process::{Child, Command};
use tokio::sync::Semaphore;

pub fn valid_segment_name(name: &str) -> bool {
    if name == "index.m3u8" {
        return true;
    }
    let stem = match name.strip_suffix(".ts") {
        Some(s) => s,
        None => return false,
    };
    stem.strip_prefix("seg")
        .map(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_segment_and_manifest() {
        assert!(valid_segment_name("seg00001.ts"));
        assert!(valid_segment_name("index.m3u8"));
    }
    #[test]
    fn rejects_traversal() {
        for n in ["../x", ".../x", "a/b", "/etc/passwd", "seg.ts", "index.m3u", "seg01.ts.."] {
            assert!(!valid_segment_name(n), "{n}");
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum StartOutcome {
    Started,
    InProgress(HlsStatus),
    Ready(String),
    NotFound,
    NotCompleted,
    RawProgressive,
    Disabled,
}

#[derive(Clone, Debug, PartialEq)]
pub enum HlsDecision {
    Reject(StartOutcome),
    Start,
}

pub fn next_hls(current: &HlsStatus, state: &TorrentState, enabled: bool) -> HlsDecision {
    if !enabled {
        return HlsDecision::Reject(StartOutcome::Disabled);
    }
    if *state != TorrentState::Seeding {
        return HlsDecision::Reject(StartOutcome::NotCompleted);
    }
    match current {
        HlsStatus::None | HlsStatus::Failed => HlsDecision::Start,
        other => HlsDecision::Reject(StartOutcome::InProgress(other.clone())),
    }
}

#[derive(Clone)]
pub struct HlsManager {
    store: StateStore,
    encode_sem: Arc<Semaphore>,
    ffmpeg_bin: String,
    segment_secs: u32,
    enabled: bool,
    children: Arc<Mutex<HashMap<String, Child>>>,
}

impl HlsManager {
    pub fn new(
        store: StateStore,
        encode_conc: usize,
        ffmpeg_bin: String,
        segment_secs: u32,
        enabled: bool,
    ) -> Self {
        Self {
            store,
            encode_sem: Arc::new(Semaphore::new(encode_conc.max(1))),
            ffmpeg_bin,
            segment_secs,
            enabled,
            children: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub async fn request(&self, id: &str, delivery: Delivery) -> StartOutcome {
        if delivery == Delivery::RawProgressive {
            return StartOutcome::RawProgressive;
        }
        let result = self.store.update(id, |m| {
            match next_hls(&m.hls, &m.state, self.enabled) {
                HlsDecision::Reject(StartOutcome::InProgress(HlsStatus::Ready)) => {
                    let outcome = match &m.hls_dir {
                        Some(dir) => StartOutcome::Ready(dir.clone()),
                        None => StartOutcome::InProgress(HlsStatus::Ready),
                    };
                    (outcome, false)
                }
                HlsDecision::Reject(outcome) => (outcome, false),
                HlsDecision::Start => {
                    m.hls = HlsStatus::Starting;
                    m.hls_error = None;
                    (StartOutcome::Started, true)
                }
            }
        });
        match result {
            Ok(Some(StartOutcome::Started)) => {
                if let Some(meta) = self.store.get(id) {
                    self.spawn_job(id.to_string(), meta, delivery);
                }
                StartOutcome::Started
            }
            Ok(Some(outcome)) => outcome,
            Ok(None) => StartOutcome::NotFound,
            Err(_) => StartOutcome::NotFound,
        }
    }

    pub async fn abort(&self, id: &str) {
        let child = self.take_child(id);
        if let Some(mut child) = child {
            let _ = child.kill().await;
        }
    }

    fn take_child(&self, id: &str) -> Option<Child> {
        let mut g = self.children.lock().unwrap();
        g.remove(id)
    }

    fn poll_child(&self, id: &str) -> Option<std::io::Result<Option<std::process::ExitStatus>>> {
        let mut g = self.children.lock().unwrap();
        g.get_mut(id).map(|child| child.try_wait())
    }

    fn spawn_job(&self, id: String, meta: Metadata, delivery: Delivery) {
        let this = self.clone();
        tokio::spawn(async move {
            if let Err(e) = this.run_hls(&id, &meta, delivery).await {
                tracing::error!(id = %id, error = %e, "hls start failed");
                let _ = this.store.update(&id, |m| {
                    m.hls = HlsStatus::Failed;
                    m.hls_error = Some(e.to_string());
                    ((), true)
                });
            }
        });
    }

    async fn run_hls(&self, id: &str, meta: &Metadata, delivery: Delivery) -> anyhow::Result<()> {
        let src_dir = PathBuf::from(&meta.path);
        let primary = pick_primary_file(&src_dir)?;
        let hls_dir = src_dir.join("hls");
        std::fs::create_dir_all(&hls_dir)?;

        let mut args: Vec<String> = vec![
            "-y".into(),
            "-nostats".into(),
            "-loglevel".into(),
            "error".into(),
            "-i".into(),
            primary.display().to_string(),
        ];
        match delivery {
            Delivery::RemuxHls => {
                args.push("-c".into());
                args.push("copy".into());
            }
            Delivery::TranscodeHls => {
                args.push("-c:v".into());
                args.push("libx264".into());
                args.push("-preset".into());
                args.push("veryfast".into());
                args.push("-c:a".into());
                args.push("aac".into());
            }
            Delivery::RawProgressive => unreachable!("filtered out in request"),
        }
        args.push("-f".into());
        args.push("hls".into());
        args.push("-hls_time".into());
        args.push(self.segment_secs.to_string());
        args.push("-hls_playlist_type".into());
        args.push("event".into());
        args.push("-hls_flags".into());
        args.push("append_list".into());
        args.push("-hls_segment_filename".into());
        args.push(hls_dir.join("seg%05d.ts").display().to_string());
        args.push(hls_dir.join("index.m3u8").display().to_string());

        let permit = if delivery == Delivery::TranscodeHls {
            Some(self.encode_sem.clone().acquire_owned().await?)
        } else {
            None
        };

        let mut cmd = Command::new(&self.ffmpeg_bin);
        cmd.args(&args);
        let child = cmd.spawn()?;

        {
            let mut g = self.children.lock().unwrap();
            g.insert(id.to_string(), child);
        }

        let this = self.clone();
        let id = id.to_string();
        let index_path = hls_dir.join("index.m3u8");
        let hls_dir_str = hls_dir.display().to_string();
        tokio::spawn(async move {
            for _ in 0..100 {
                if index_path.exists() {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Live;
                        m.hls_dir = Some(hls_dir_str.clone());
                        ((), true)
                    });
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }

            let exit_result = loop {
                match this.poll_child(&id) {
                    Some(Ok(Some(status))) => break Some(Ok(status)),
                    Some(Ok(None)) => {}
                    Some(Err(e)) => break Some(Err(e)),
                    None => break None,
                }
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            };

            this.take_child(&id);

            match exit_result {
                Some(Ok(status)) if status.success() => {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Ready;
                        m.hls_error = None;
                        ((), true)
                    });
                }
                Some(Ok(status)) => {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Failed;
                        m.hls_error = Some(format!("ffmpeg exited: {status}"));
                        ((), true)
                    });
                }
                Some(Err(e)) => {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Failed;
                        m.hls_error = Some(e.to_string());
                        ((), true)
                    });
                }
                None => {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Failed;
                        m.hls_error = Some("aborted".into());
                        ((), true)
                    });
                }
            }
            drop(permit);
        });

        Ok(())
    }
}

#[cfg(test)]
mod mgr_tests {
    use super::*;
    use crate::state::{HlsStatus, TorrentState};
    #[test]
    fn disabled_rejects() {
        assert_eq!(
            next_hls(&HlsStatus::None, &TorrentState::Seeding, false),
            HlsDecision::Reject(StartOutcome::Disabled)
        );
    }
    #[test]
    fn not_seeding_rejected() {
        assert_eq!(
            next_hls(&HlsStatus::None, &TorrentState::Leeching, true),
            HlsDecision::Reject(StartOutcome::NotCompleted)
        );
    }
    #[test]
    fn none_starts() {
        assert_eq!(next_hls(&HlsStatus::None, &TorrentState::Seeding, true), HlsDecision::Start);
    }
    #[test]
    fn failed_restarts() {
        assert_eq!(next_hls(&HlsStatus::Failed, &TorrentState::Seeding, true), HlsDecision::Start);
    }
    #[test]
    fn live_in_progress() {
        assert_eq!(
            next_hls(&HlsStatus::Live, &TorrentState::Seeding, true),
            HlsDecision::Reject(StartOutcome::InProgress(HlsStatus::Live))
        );
    }
}
