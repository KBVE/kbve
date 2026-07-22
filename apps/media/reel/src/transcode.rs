use crate::state::{StateStore, TorrentState, TranscodeStatus};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Semaphore;

#[derive(Clone, Debug, PartialEq)]
pub struct ProbeResult {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Route {
    Remux,
    Encode,
}

pub fn decide_route(p: &ProbeResult) -> Route {
    if p.video_codec.as_deref() == Some("h264") && p.audio_codec.as_deref() == Some("aac") {
        Route::Remux
    } else {
        Route::Encode
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
                stack.push(path);
            } else {
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
        .args(["-v", "quiet", "-print_format", "json", "-show_streams"])
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
            let codec = s.get("codec_name").and_then(|v| v.as_str()).map(String::from);
            match kind {
                Some("video") if video.is_none() => video = codec,
                Some("audio") if audio.is_none() => audio = codec,
                _ => {}
            }
        }
    }
    Ok(ProbeResult { video_codec: video, audio_codec: audio })
}

async fn run_ffmpeg(ffmpeg_bin: &str, args: &[&str], src: &Path, dest: &Path) -> anyhow::Result<()> {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y").arg("-i").arg(src).args(args).arg(dest);
    let out = cmd.output().await?;
    if !out.status.success() {
        anyhow::bail!("ffmpeg failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

pub async fn remux(ffmpeg_bin: &str, src: &Path, dest: &Path) -> anyhow::Result<()> {
    run_ffmpeg(ffmpeg_bin, &["-c", "copy", "-movflags", "+faststart"], src, dest).await
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
        Self {
            store,
            remux_sem: Arc::new(Semaphore::new(remux_conc.max(1))),
            encode_sem: Arc::new(Semaphore::new(encode_conc.max(1))),
            ffmpeg_bin,
            ffprobe_bin,
            enabled,
        }
    }

    pub async fn request(&self, id: &str) -> RequestOutcome {
        let result = self.store.update(id, |m| {
            match next_status(&m.transcode, &m.state, self.enabled) {
                Decision::Reject(RequestOutcome::InProgress(TranscodeStatus::Ready)) => {
                    match &m.transcode_path {
                        Some(p) => RequestOutcome::Ready(p.clone()),
                        None => RequestOutcome::InProgress(TranscodeStatus::Ready),
                    }
                }
                Decision::Reject(outcome) => outcome,
                Decision::Enqueue => {
                    m.transcode = TranscodeStatus::Pending;
                    m.transcode_error = None;
                    RequestOutcome::Started
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
                tracing::error!(id = %id, error = %e, "transcode failed");
                let _ = this.store.update(&id, |m| {
                    m.transcode = TranscodeStatus::Failed;
                    m.transcode_error = Some(e.to_string());
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
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pr(v: Option<&str>, a: Option<&str>) -> ProbeResult {
        ProbeResult { video_codec: v.map(String::from), audio_codec: a.map(String::from) }
    }
    #[test]
    fn h264_aac_remuxes() {
        assert_eq!(decide_route(&pr(Some("h264"), Some("aac"))), Route::Remux);
    }
    #[test]
    fn hevc_encodes() {
        assert_eq!(decide_route(&pr(Some("hevc"), Some("aac"))), Route::Encode);
    }
    #[test]
    fn non_aac_audio_encodes() {
        assert_eq!(decide_route(&pr(Some("h264"), Some("ac3"))), Route::Encode);
    }
    #[test]
    fn missing_codecs_encode() {
        assert_eq!(decide_route(&pr(None, None)), Route::Encode);
    }
    #[test]
    fn picks_largest_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("small.mkv"), b"aa").unwrap();
        std::fs::write(dir.path().join("big.mkv"), b"aaaaaaaa").unwrap();
        assert_eq!(pick_primary_file(dir.path()).unwrap(), dir.path().join("big.mkv"));
    }
}

#[cfg(test)]
mod transcoder_tests {
    use super::*;
    use crate::state::{TorrentState, TranscodeStatus};

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
}
