use crate::state::{HlsStatus, Metadata, StateStore, TorrentState};
use crate::transcode::{Delivery, pick_primary_file};
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
        for n in [
            "../x",
            ".../x",
            "a/b",
            "/etc/passwd",
            "seg.ts",
            "index.m3u",
            "seg01.ts..",
        ] {
            assert!(!valid_segment_name(n), "{n}");
        }
    }
}

fn delivery_label(d: Delivery) -> &'static str {
    match d {
        Delivery::RawProgressive => "raw_progressive",
        Delivery::RemuxHls => "remux_hls",
        Delivery::CopyVideoHls => "copy_video_hls",
        Delivery::TranscodeHls => "transcode_hls",
    }
}

fn ffmpeg_tail(buf: &Arc<Mutex<String>>) -> String {
    let s = buf.lock().unwrap();
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return "no stderr captured".into();
    }
    let mut tail: Vec<char> = trimmed.chars().rev().take(500).collect();
    tail.reverse();
    tail.into_iter().collect::<String>().replace('\n', " ")
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

/// Live (popcorn) HLS runs while the torrent is still Leeching, transcoding
/// from the in-flight download stream. Only one job per torrent — an existing
/// Starting/Live/Ready job is left to run.
pub fn next_hls_live(current: &HlsStatus, state: &TorrentState, live_enabled: bool) -> HlsDecision {
    if !live_enabled {
        return HlsDecision::Reject(StartOutcome::Disabled);
    }
    if *state != TorrentState::Leeching {
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
    ffprobe_bin: String,
    segment_secs: u32,
    enabled: bool,
    live_enabled: bool,
    encode_threads: usize,
    children: Arc<Mutex<HashMap<String, Child>>>,
    delivery_cache: Arc<Mutex<HashMap<String, Delivery>>>,
}

impl HlsManager {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        store: StateStore,
        encode_conc: usize,
        ffmpeg_bin: String,
        ffprobe_bin: String,
        segment_secs: u32,
        enabled: bool,
        live_enabled: bool,
        encode_threads: usize,
    ) -> Self {
        let this = Self {
            store,
            encode_sem: Arc::new(Semaphore::new(encode_conc.max(1))),
            ffmpeg_bin,
            ffprobe_bin,
            segment_secs,
            enabled,
            live_enabled,
            encode_threads,
            children: Arc::new(Mutex::new(HashMap::new())),
            delivery_cache: Arc::new(Mutex::new(HashMap::new())),
        };
        for m in this.store.list() {
            if matches!(m.hls, HlsStatus::Starting | HlsStatus::Live) {
                let _ = this.store.update(&m.id, |m| {
                    m.hls = HlsStatus::Failed;
                    m.hls_error = Some("interrupted by restart".into());
                    ((), true)
                });
            }
        }
        this
    }

    pub fn cached_delivery(&self, id: &str) -> Option<Delivery> {
        let g = self.delivery_cache.lock().unwrap();
        g.get(id).copied()
    }

    pub fn cache_delivery(&self, id: &str, d: Delivery) {
        let mut g = self.delivery_cache.lock().unwrap();
        g.insert(id.to_string(), d);
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn live_enabled(&self) -> bool {
        self.live_enabled
    }

    pub async fn request(&self, id: &str, delivery: Delivery) -> StartOutcome {
        if delivery == Delivery::RawProgressive {
            return StartOutcome::RawProgressive;
        }
        let result = self
            .store
            .update(id, |m| match next_hls(&m.hls, &m.state, self.enabled) {
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
        self.delivery_cache.lock().unwrap().remove(id);
        let child = self.take_child(id);
        if let Some(mut child) = child {
            let _ = child.kill().await;
        }
    }

    pub async fn abort_all(&self) {
        let children: Vec<Child> = {
            let mut g = self.children.lock().unwrap();
            g.drain().map(|(_, c)| c).collect()
        };
        for mut child in children {
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
                crate::telemetry::hls_failed(&id, &e.to_string());
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
        if hls_dir.exists() {
            let _ = std::fs::remove_dir_all(&hls_dir);
        }
        std::fs::create_dir_all(&hls_dir)?;
        let hls_dir_str = hls_dir.display().to_string();
        let _ = self.store.update(id, |m| {
            m.hls_dir = Some(hls_dir_str.clone());
            ((), true)
        });

        let mut args: Vec<String> = vec![
            "-y".into(),
            "-nostats".into(),
            "-loglevel".into(),
            "error".into(),
            "-i".into(),
            primary.display().to_string(),
        ];
        args.extend(
            crate::transcode::MAP_VIDEO_AUDIO
                .iter()
                .map(|s| s.to_string()),
        );
        match delivery {
            Delivery::RemuxHls => {
                args.push("-c".into());
                args.push("copy".into());
            }
            Delivery::CopyVideoHls => {
                args.push("-c:v".into());
                args.push("copy".into());
                args.push("-c:a".into());
                args.push("aac".into());
            }
            Delivery::TranscodeHls => {
                args.push("-c:v".into());
                args.push("libx264".into());
                args.push("-preset".into());
                args.push("veryfast".into());
                if self.encode_threads > 0 {
                    args.push("-threads".into());
                    args.push(self.encode_threads.to_string());
                }
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
        cmd.args(&args).stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn()?;

        let errbuf = Arc::new(Mutex::new(String::new()));
        if let Some(mut stderr) = child.stderr.take() {
            let buf = errbuf.clone();
            tokio::spawn(async move {
                use tokio::io::AsyncReadExt;
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s).await;
                *buf.lock().unwrap() = s;
            });
        }

        crate::telemetry::hls_started(id, delivery_label(delivery));

        {
            let mut g = self.children.lock().unwrap();
            g.insert(id.to_string(), child);
        }

        self.spawn_output_watch(id.to_string(), hls_dir.join("index.m3u8"), errbuf, permit);

        Ok(())
    }

    /// Watch an already-spawned HLS ffmpeg child: flip the entry to Live once
    /// the manifest appears, then to Ready or Failed when ffmpeg exits. Shared
    /// by the completed-download path (`run_hls`) and the live path
    /// (`run_live`).
    fn spawn_output_watch(
        &self,
        id: String,
        index_path: PathBuf,
        errbuf: Arc<Mutex<String>>,
        permit: Option<tokio::sync::OwnedSemaphorePermit>,
    ) {
        let this = self.clone();
        tokio::spawn(async move {
            let mut went_live = false;
            for _ in 0..100 {
                if index_path.exists() {
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Live;
                        ((), true)
                    });
                    tracing::info!(id = %id, "hls manifest live");
                    went_live = true;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            if !went_live {
                tracing::warn!(id = %id, "hls manifest not produced within 10s; ffmpeg may still be starting");
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
                    crate::telemetry::hls_ready(&id);
                }
                Some(Ok(status)) => {
                    let reason = format!("ffmpeg exited: {status}: {}", ffmpeg_tail(&errbuf));
                    crate::telemetry::hls_failed(&id, &reason);
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Failed;
                        m.hls_error = Some(reason.clone());
                        ((), true)
                    });
                }
                Some(Err(e)) => {
                    let reason = e.to_string();
                    crate::telemetry::hls_failed(&id, &reason);
                    let _ = this.store.update(&id, |m| {
                        m.hls = HlsStatus::Failed;
                        m.hls_error = Some(reason.clone());
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
    }

    /// Start (or join) a live HLS job for a still-downloading torrent, reading
    /// from its in-flight librqbit stream. Idempotent: a job already Starting,
    /// Live or Ready is returned as-is and the passed reader is dropped.
    pub async fn request_live(
        &self,
        id: &str,
        reader: Box<dyn crate::engine::ReadSeek>,
        out_dir: PathBuf,
    ) -> StartOutcome {
        let result = self
            .store
            .update(id, |m| match next_hls_live(&m.hls, &m.state, self.live_enabled) {
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
            });
        match result {
            Ok(Some(StartOutcome::Started)) => {
                self.spawn_live_job(id.to_string(), reader, out_dir);
                StartOutcome::Started
            }
            Ok(Some(outcome)) => outcome,
            Ok(None) => StartOutcome::NotFound,
            Err(_) => StartOutcome::NotFound,
        }
    }

    fn spawn_live_job(&self, id: String, reader: Box<dyn crate::engine::ReadSeek>, out_dir: PathBuf) {
        let this = self.clone();
        tokio::spawn(async move {
            if let Err(e) = this.run_live(&id, reader, out_dir).await {
                crate::telemetry::hls_failed(&id, &e.to_string());
                let _ = this.store.update(&id, |m| {
                    m.hls = HlsStatus::Failed;
                    m.hls_error = Some(e.to_string());
                    ((), true)
                });
            }
        });
    }

    async fn run_live(
        &self,
        id: &str,
        mut reader: Box<dyn crate::engine::ReadSeek>,
        out_dir: PathBuf,
    ) -> anyhow::Result<()> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let hls_dir = out_dir.join("hls");
        if hls_dir.exists() {
            let _ = std::fs::remove_dir_all(&hls_dir);
        }
        std::fs::create_dir_all(&hls_dir)?;
        let hls_dir_str = hls_dir.display().to_string();
        let _ = self.store.update(id, |m| {
            m.hls_dir = Some(hls_dir_str.clone());
            ((), true)
        });

        // Read a prefix off the front of the download to detect the video
        // codec, then replay it into ffmpeg so no bytes are lost.
        const PREFIX_MAX: usize = 8 * 1024 * 1024;
        let mut prefix = Vec::with_capacity(256 * 1024);
        let mut buf = vec![0u8; 256 * 1024];
        while prefix.len() < PREFIX_MAX {
            let n = reader.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            prefix.extend_from_slice(&buf[..n]);
        }
        let video_copy = self.probe_prefix_is_h264(&prefix).await;

        // h264 is stream-copied (cheap, realtime); anything else is encoded and
        // must hold an encode permit. Audio is always downmixed to stereo aac.
        let permit = if video_copy {
            None
        } else {
            Some(self.encode_sem.clone().acquire_owned().await?)
        };

        let mut args: Vec<String> = vec![
            "-y".into(),
            "-nostats".into(),
            "-loglevel".into(),
            "error".into(),
            "-i".into(),
            "pipe:0".into(),
        ];
        args.extend(
            crate::transcode::MAP_VIDEO_AUDIO
                .iter()
                .map(|s| s.to_string()),
        );
        if video_copy {
            args.push("-c:v".into());
            args.push("copy".into());
        } else {
            args.push("-c:v".into());
            args.push("libx264".into());
            args.push("-preset".into());
            args.push("veryfast".into());
            if self.encode_threads > 0 {
                args.push("-threads".into());
                args.push(self.encode_threads.to_string());
            }
        }
        args.push("-c:a".into());
        args.push("aac".into());
        args.push("-ac".into());
        args.push("2".into());
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

        let mut cmd = Command::new(&self.ffmpeg_bin);
        cmd.args(&args)
            .stdin(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn()?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow::anyhow!("no ffmpeg stdin"))?;

        // Feed the prefix, then pump the rest of the download into ffmpeg.
        // When the download completes the reader hits EOF, stdin closes and
        // ffmpeg finalizes the playlist; dropping the reader releases the
        // leech guard so the completion watcher can move the files.
        tokio::spawn(async move {
            if stdin.write_all(&prefix).await.is_ok() {
                let _ = tokio::io::copy(&mut reader, &mut stdin).await;
            }
            let _ = stdin.shutdown().await;
        });

        let errbuf = Arc::new(Mutex::new(String::new()));
        if let Some(mut stderr) = child.stderr.take() {
            let buf = errbuf.clone();
            tokio::spawn(async move {
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s).await;
                *buf.lock().unwrap() = s;
            });
        }

        crate::telemetry::hls_started(id, if video_copy { "live_copy" } else { "live_transcode" });
        {
            let mut g = self.children.lock().unwrap();
            g.insert(id.to_string(), child);
        }

        self.spawn_output_watch(id.to_string(), hls_dir.join("index.m3u8"), errbuf, permit);
        Ok(())
    }

    /// Best-effort: write the download prefix to a temp file and ask ffprobe
    /// whether the video stream is h264. Any failure (partial header, unknown
    /// codec) returns false, so the caller falls back to a safe re-encode.
    async fn probe_prefix_is_h264(&self, prefix: &[u8]) -> bool {
        if prefix.is_empty() {
            return false;
        }
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let tmp = std::env::temp_dir().join(format!("reel-live-probe-{}-{n}.bin", std::process::id()));
        if tokio::fs::write(&tmp, prefix).await.is_err() {
            return false;
        }
        let res = crate::transcode::probe(&self.ffprobe_bin, &tmp).await;
        let _ = tokio::fs::remove_file(&tmp).await;
        matches!(res, Ok(p) if p.video_codec.as_deref() == Some("h264"))
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
        assert_eq!(
            next_hls(&HlsStatus::None, &TorrentState::Seeding, true),
            HlsDecision::Start
        );
    }
    #[test]
    fn failed_restarts() {
        assert_eq!(
            next_hls(&HlsStatus::Failed, &TorrentState::Seeding, true),
            HlsDecision::Start
        );
    }
    #[test]
    fn live_in_progress() {
        assert_eq!(
            next_hls(&HlsStatus::Live, &TorrentState::Seeding, true),
            HlsDecision::Reject(StartOutcome::InProgress(HlsStatus::Live))
        );
    }

    #[test]
    fn live_starts_only_while_leeching() {
        assert_eq!(
            next_hls_live(&HlsStatus::None, &TorrentState::Leeching, true),
            HlsDecision::Start
        );
        assert_eq!(
            next_hls_live(&HlsStatus::Failed, &TorrentState::Leeching, true),
            HlsDecision::Start
        );
        assert_eq!(
            next_hls_live(&HlsStatus::None, &TorrentState::Seeding, true),
            HlsDecision::Reject(StartOutcome::NotCompleted)
        );
    }

    #[test]
    fn live_disabled_and_in_progress_rejected() {
        assert_eq!(
            next_hls_live(&HlsStatus::None, &TorrentState::Leeching, false),
            HlsDecision::Reject(StartOutcome::Disabled)
        );
        assert_eq!(
            next_hls_live(&HlsStatus::Live, &TorrentState::Leeching, true),
            HlsDecision::Reject(StartOutcome::InProgress(HlsStatus::Live))
        );
        assert_eq!(
            next_hls_live(&HlsStatus::Starting, &TorrentState::Leeching, true),
            HlsDecision::Reject(StartOutcome::InProgress(HlsStatus::Starting))
        );
    }

    #[tokio::test]
    async fn abort_unknown_is_noop() {
        let dir = std::env::temp_dir().join(format!("reel-hls-test-{}", std::process::id()));
        let store = StateStore::load(dir.join("state.json")).unwrap();
        let mgr = HlsManager::new(store, 1, "ffmpeg".into(), "ffprobe".into(), 4, true, true, 1);
        mgr.abort("unknown-id").await;
        assert!(mgr.take_child("unknown-id").is_none());
    }

    #[test]
    fn cached_delivery_none_then_some() {
        let dir = std::env::temp_dir().join(format!("reel-hls-test-cache-{}", std::process::id()));
        let store = StateStore::load(dir.join("state.json")).unwrap();
        let mgr = HlsManager::new(store, 1, "ffmpeg".into(), "ffprobe".into(), 4, true, true, 1);
        assert_eq!(mgr.cached_delivery("1"), None);
        mgr.cache_delivery("1", Delivery::RemuxHls);
        assert_eq!(mgr.cached_delivery("1"), Some(Delivery::RemuxHls));
    }
}
