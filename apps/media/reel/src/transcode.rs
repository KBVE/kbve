use crate::state::{StateStore, TorrentState, TranscodeStatus};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Semaphore;

#[derive(Clone, Debug, PartialEq)]
pub struct ProbeResult {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub container: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Route {
    Remux,
    Encode,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Delivery {
    RawProgressive,
    RemuxHls,
    TranscodeHls,
}

pub fn decide_route(p: &ProbeResult) -> Route {
    if p.video_codec.as_deref() == Some("h264") && p.audio_codec.as_deref() == Some("aac") {
        Route::Remux
    } else {
        Route::Encode
    }
}

pub fn decide_delivery(p: &ProbeResult) -> Delivery {
    let compat_codecs =
        p.video_codec.as_deref() == Some("h264") && p.audio_codec.as_deref() == Some("aac");
    if !compat_codecs {
        return Delivery::TranscodeHls;
    }
    let is_mp4 = p
        .container
        .as_deref()
        .map(|c| c.contains("mp4"))
        .unwrap_or(false);
    if is_mp4 {
        Delivery::RawProgressive
    } else {
        Delivery::RemuxHls
    }
}

pub fn pick_primary_file(dir: &Path) -> anyhow::Result<PathBuf> {
    if dir.is_file() {
        return Ok(dir.to_path_buf());
    }
    let mut best: Option<(u64, PathBuf)> = None;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in std::fs::read_dir(&d)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let is_hls_dir = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n == "hls")
                    .unwrap_or(false);
                if is_hls_dir {
                    continue;
                }
                stack.push(path);
            } else {
                let is_reel_output = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.ends_with(".reel.mp4"))
                    .unwrap_or(false);
                if is_reel_output {
                    continue;
                }
                let len = entry.metadata()?.len();
                if best.as_ref().map(|(b, _)| len > *b).unwrap_or(true) {
                    best = Some((len, path));
                }
            }
        }
    }
    best.map(|(_, p)| p)
        .ok_or_else(|| anyhow::anyhow!("no media file under {}", dir.display()))
}

pub async fn probe(ffprobe_bin: &str, path: &Path) -> anyhow::Result<ProbeResult> {
    let out = Command::new(ffprobe_bin)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
        ])
        .arg(path)
        .output()
        .await?;
    if !out.status.success() {
        anyhow::bail!("ffprobe failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    let json: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    let mut video = None;
    let mut audio = None;
    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        for s in streams {
            let kind = s.get("codec_type").and_then(|v| v.as_str());
            let codec = s
                .get("codec_name")
                .and_then(|v| v.as_str())
                .map(String::from);
            match kind {
                Some("video") if video.is_none() => video = codec,
                Some("audio") if audio.is_none() => audio = codec,
                _ => {}
            }
        }
    }
    let container = json
        .get("format")
        .and_then(|f| f.get("format_name"))
        .and_then(|v| v.as_str())
        .map(String::from);
    Ok(ProbeResult {
        video_codec: video,
        audio_codec: audio,
        container,
    })
}

async fn run_ffmpeg(
    ffmpeg_bin: &str,
    args: &[&str],
    src: &Path,
    dest: &Path,
) -> anyhow::Result<()> {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y")
        .arg("-nostats")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(src)
        .args(args)
        .arg(dest);
    let out = cmd.output().await?;
    if !out.status.success() {
        anyhow::bail!("ffmpeg failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

pub async fn remux(ffmpeg_bin: &str, src: &Path, dest: &Path) -> anyhow::Result<()> {
    run_ffmpeg(
        ffmpeg_bin,
        &["-c", "copy", "-movflags", "+faststart"],
        src,
        dest,
    )
    .await
}

pub async fn encode(ffmpeg_bin: &str, src: &Path, dest: &Path) -> anyhow::Result<()> {
    run_ffmpeg(
        ffmpeg_bin,
        &["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
        src,
        dest,
    )
    .await
}

#[derive(Clone, Debug, PartialEq)]
pub enum RequestOutcome {
    Ready(String),
    InProgress(TranscodeStatus),
    Started,
    NotFound,
    NotCompleted,
    Disabled,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Decision {
    Reject(RequestOutcome),
    Enqueue,
}

pub fn next_status(current: &TranscodeStatus, state: &TorrentState, enabled: bool) -> Decision {
    if !enabled {
        return Decision::Reject(RequestOutcome::Disabled);
    }
    if *state != TorrentState::Seeding {
        return Decision::Reject(RequestOutcome::NotCompleted);
    }
    match current {
        TranscodeStatus::None | TranscodeStatus::Failed => Decision::Enqueue,
        other => Decision::Reject(RequestOutcome::InProgress(other.clone())),
    }
}

#[derive(Clone)]
pub struct Transcoder {
    store: StateStore,
    remux_sem: Arc<Semaphore>,
    encode_sem: Arc<Semaphore>,
    ffmpeg_bin: String,
    ffprobe_bin: String,
    enabled: bool,
}

impl Transcoder {
    pub fn new(
        store: StateStore,
        remux_conc: usize,
        encode_conc: usize,
        ffmpeg_bin: String,
        ffprobe_bin: String,
        enabled: bool,
    ) -> Self {
        let this = Self {
            store,
            remux_sem: Arc::new(Semaphore::new(remux_conc.max(1))),
            encode_sem: Arc::new(Semaphore::new(encode_conc.max(1))),
            ffmpeg_bin,
            ffprobe_bin,
            enabled,
        };
        for m in this.store.list() {
            let in_flight = matches!(
                m.transcode,
                TranscodeStatus::Pending | TranscodeStatus::Remuxing | TranscodeStatus::Encoding
            );
            if in_flight {
                let _ = this.store.update(&m.id, |m| {
                    m.transcode = TranscodeStatus::Failed;
                    m.transcode_error = Some("interrupted by restart".into());
                    ((), true)
                });
            }
        }
        this
    }

    pub async fn request(&self, id: &str) -> RequestOutcome {
        let result = self.store.update(id, |m| {
            match next_status(&m.transcode, &m.state, self.enabled) {
                Decision::Reject(RequestOutcome::InProgress(TranscodeStatus::Ready)) => {
                    let outcome = match &m.transcode_path {
                        Some(p) => RequestOutcome::Ready(p.clone()),
                        None => RequestOutcome::InProgress(TranscodeStatus::Ready),
                    };
                    (outcome, false)
                }
                Decision::Reject(outcome) => (outcome, false),
                Decision::Enqueue => {
                    m.transcode = TranscodeStatus::Pending;
                    m.transcode_error = None;
                    (RequestOutcome::Started, true)
                }
            }
        });
        match result {
            Ok(Some(RequestOutcome::Started)) => {
                if let Some(meta) = self.store.get(id) {
                    self.spawn_job(id.to_string(), meta);
                }
                RequestOutcome::Started
            }
            Ok(Some(outcome)) => outcome,
            Ok(None) => RequestOutcome::NotFound,
            Err(_) => RequestOutcome::NotFound,
        }
    }

    fn spawn_job(&self, id: String, meta: crate::state::Metadata) {
        let this = self.clone();
        tokio::spawn(async move {
            if let Err(e) = this.run_job(&id, &meta).await {
                crate::telemetry::transcode_failed(&id, &e.to_string());
                let _ = this.store.update(&id, |m| {
                    m.transcode = TranscodeStatus::Failed;
                    m.transcode_error = Some(e.to_string());
                    ((), true)
                });
            }
        });
    }

    async fn run_job(&self, id: &str, meta: &crate::state::Metadata) -> anyhow::Result<()> {
        let src_dir = std::path::PathBuf::from(&meta.path);
        let primary = pick_primary_file(&src_dir)?;
        let probe = probe(&self.ffprobe_bin, &primary).await?;
        let route = decide_route(&probe);
        let stem = primary
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "media".into());
        let dest = src_dir.join(format!("{stem}.reel.mp4"));

        let _ = self.store.update(id, |m| {
            m.transcode = match route {
                Route::Remux => TranscodeStatus::Remuxing,
                Route::Encode => TranscodeStatus::Encoding,
            };
            ((), true)
        });

        match route {
            Route::Remux => {
                let _permit = self.remux_sem.acquire().await?;
                remux(&self.ffmpeg_bin, &primary, &dest).await?;
            }
            Route::Encode => {
                let _permit = self.encode_sem.acquire().await?;
                encode(&self.ffmpeg_bin, &primary, &dest).await?;
            }
        }

        let _ = self.store.update(id, |m| {
            m.transcode = TranscodeStatus::Ready;
            m.transcode_path = Some(dest.display().to_string());
            m.transcode_error = None;
            ((), true)
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pr(v: Option<&str>, a: Option<&str>, c: Option<&str>) -> ProbeResult {
        ProbeResult {
            video_codec: v.map(String::from),
            audio_codec: a.map(String::from),
            container: c.map(String::from),
        }
    }
    #[test]
    fn h264_aac_remuxes() {
        assert_eq!(
            decide_route(&pr(Some("h264"), Some("aac"), None)),
            Route::Remux
        );
    }
    #[test]
    fn hevc_encodes() {
        assert_eq!(
            decide_route(&pr(Some("hevc"), Some("aac"), None)),
            Route::Encode
        );
    }
    #[test]
    fn non_aac_audio_encodes() {
        assert_eq!(
            decide_route(&pr(Some("h264"), Some("ac3"), None)),
            Route::Encode
        );
    }
    #[test]
    fn missing_codecs_encode() {
        assert_eq!(decide_route(&pr(None, None, None)), Route::Encode);
    }
    #[test]
    fn mp4_h264_aac_is_raw() {
        assert_eq!(
            decide_delivery(&pr(
                Some("h264"),
                Some("aac"),
                Some("mov,mp4,m4a,3gp,3g2,mj2")
            )),
            Delivery::RawProgressive
        );
    }
    #[test]
    fn mkv_h264_aac_is_remux_hls() {
        assert_eq!(
            decide_delivery(&pr(Some("h264"), Some("aac"), Some("matroska,webm"))),
            Delivery::RemuxHls
        );
    }
    #[test]
    fn hevc_is_transcode_hls() {
        assert_eq!(
            decide_delivery(&pr(Some("hevc"), Some("aac"), Some("matroska,webm"))),
            Delivery::TranscodeHls
        );
    }
    #[test]
    fn non_aac_is_transcode_hls() {
        assert_eq!(
            decide_delivery(&pr(Some("h264"), Some("ac3"), Some("mov,mp4,m4a"))),
            Delivery::TranscodeHls
        );
    }
    #[test]
    fn missing_is_transcode_hls() {
        assert_eq!(
            decide_delivery(&pr(None, None, None)),
            Delivery::TranscodeHls
        );
    }
    #[test]
    fn picks_largest_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("small.mkv"), b"aa").unwrap();
        std::fs::write(dir.path().join("big.mkv"), b"aaaaaaaa").unwrap();
        assert_eq!(
            pick_primary_file(dir.path()).unwrap(),
            dir.path().join("big.mkv")
        );
    }
    #[test]
    fn excludes_stale_reel_output() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("big.reel.mp4"), b"aaaaaaaa").unwrap();
        std::fs::write(dir.path().join("movie.mkv"), b"aa").unwrap();
        assert_eq!(
            pick_primary_file(dir.path()).unwrap(),
            dir.path().join("movie.mkv")
        );
    }
}

#[cfg(test)]
mod transcoder_tests {
    use super::*;
    use crate::state::{HlsStatus, Metadata, StateStore, TorrentState, TranscodeStatus};

    fn meta(id: &str, transcode: TranscodeStatus) -> Metadata {
        Metadata {
            id: id.into(),
            name: format!("t-{id}"),
            path: format!("/lib/{id}"),
            size: 10,
            completed_at: Some(1),
            last_access: 1,
            state: TorrentState::Seeding,
            error: None,
            active_path: None,
            transcode,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        }
    }

    #[test]
    fn disabled_rejects() {
        assert_eq!(
            next_status(&TranscodeStatus::None, &TorrentState::Seeding, false),
            Decision::Reject(RequestOutcome::Disabled)
        );
    }
    #[test]
    fn not_seeding_rejected() {
        assert_eq!(
            next_status(&TranscodeStatus::None, &TorrentState::Leeching, true),
            Decision::Reject(RequestOutcome::NotCompleted)
        );
    }
    #[test]
    fn ready_is_idempotent() {
        assert_eq!(
            next_status(&TranscodeStatus::Ready, &TorrentState::Seeding, true),
            Decision::Reject(RequestOutcome::InProgress(TranscodeStatus::Ready))
        );
    }
    #[test]
    fn in_flight_not_requeued() {
        assert_eq!(
            next_status(&TranscodeStatus::Encoding, &TorrentState::Seeding, true),
            Decision::Reject(RequestOutcome::InProgress(TranscodeStatus::Encoding))
        );
    }
    #[test]
    fn none_enqueues() {
        assert_eq!(
            next_status(&TranscodeStatus::None, &TorrentState::Seeding, true),
            Decision::Enqueue
        );
    }
    #[test]
    fn failed_re_enqueues() {
        assert_eq!(
            next_status(&TranscodeStatus::Failed, &TorrentState::Seeding, true),
            Decision::Enqueue
        );
    }

    #[tokio::test]
    async fn new_resets_in_flight_to_failed() {
        let dir = tempfile::tempdir().unwrap();
        let store = StateStore::load(dir.path().join("state.json")).unwrap();
        store
            .upsert(meta("pending", TranscodeStatus::Pending))
            .unwrap();
        store
            .upsert(meta("encoding", TranscodeStatus::Encoding))
            .unwrap();
        store.upsert(meta("ready", TranscodeStatus::Ready)).unwrap();
        store.upsert(meta("none", TranscodeStatus::None)).unwrap();

        let _transcoder =
            Transcoder::new(store.clone(), 1, 1, "ffmpeg".into(), "ffprobe".into(), true);

        let pending = store.get("pending").unwrap();
        assert_eq!(pending.transcode, TranscodeStatus::Failed);
        assert_eq!(
            pending.transcode_error.as_deref(),
            Some("interrupted by restart")
        );

        let encoding = store.get("encoding").unwrap();
        assert_eq!(encoding.transcode, TranscodeStatus::Failed);
        assert_eq!(
            encoding.transcode_error.as_deref(),
            Some("interrupted by restart")
        );

        assert_eq!(
            store.get("ready").unwrap().transcode,
            TranscodeStatus::Ready
        );
        assert_eq!(store.get("none").unwrap().transcode, TranscodeStatus::None);
    }
}
