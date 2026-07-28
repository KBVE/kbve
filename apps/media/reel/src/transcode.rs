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
    pub duration_secs: Option<f64>,
}

pub fn progress_pct(out_time_us: u64, duration_secs: f64) -> u8 {
    if duration_secs <= 0.0 {
        return 0;
    }
    let pct = (out_time_us as f64 / 1_000_000.0) / duration_secs * 100.0;
    pct.clamp(0.0, 100.0) as u8
}

pub fn parse_progress_line(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once('=')?;
    Some((k.trim(), v.trim()))
}

pub fn parse_speed(v: &str) -> Option<f32> {
    let v = v.trim().trim_end_matches('x').trim();
    if v.eq_ignore_ascii_case("n/a") {
        return None;
    }
    v.parse::<f32>().ok().filter(|s| *s > 0.0)
}

pub fn eta_secs(duration_secs: f64, out_time_us: u64, speed: f32) -> Option<u32> {
    if speed <= 0.05 || duration_secs <= 0.0 {
        return None;
    }
    let remaining = duration_secs - (out_time_us as f64 / 1_000_000.0);
    if remaining <= 0.0 {
        return Some(0);
    }
    Some((remaining / speed as f64).round().max(0.0) as u32)
}

#[derive(Clone, Copy, Debug, serde::Serialize)]
pub struct TranscodeProgress {
    pub pct: u8,
    pub speed: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eta_secs: Option<u32>,
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
    CopyVideoHls,
    TranscodeHls,
}

pub fn decide_route(p: &ProbeResult) -> Route {
    if p.video_codec.as_deref() == Some("h264") {
        Route::Remux
    } else {
        Route::Encode
    }
}

pub fn decide_delivery(p: &ProbeResult) -> Delivery {
    if p.video_codec.as_deref() != Some("h264") {
        return Delivery::TranscodeHls;
    }
    if p.audio_codec.as_deref() != Some("aac") {
        return Delivery::CopyVideoHls;
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

pub async fn pick_primary_file_async(dir: PathBuf) -> anyhow::Result<PathBuf> {
    tokio::task::spawn_blocking(move || pick_primary_file(&dir))
        .await
        .map_err(|e| anyhow::anyhow!("pick_primary_file task failed: {e}"))?
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
    let format = json.get("format");
    let container = format
        .and_then(|f| f.get("format_name"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let duration_secs = format
        .and_then(|f| f.get("duration"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|d| *d > 0.0);
    Ok(ProbeResult {
        video_codec: video,
        audio_codec: audio,
        container,
        duration_secs,
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
    encode_threads: usize,
    children: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::process::Child>>>,
    progress: Arc<std::sync::Mutex<std::collections::HashMap<String, TranscodeProgress>>>,
}

impl Transcoder {
    pub fn new(
        store: StateStore,
        remux_conc: usize,
        encode_conc: usize,
        ffmpeg_bin: String,
        ffprobe_bin: String,
        enabled: bool,
        encode_threads: usize,
    ) -> Self {
        let this = Self {
            store,
            remux_sem: Arc::new(Semaphore::new(remux_conc.max(1))),
            encode_sem: Arc::new(Semaphore::new(encode_conc.max(1))),
            ffmpeg_bin,
            ffprobe_bin,
            enabled,
            encode_threads,
            children: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            progress: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
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

    async fn run_tracked(
        &self,
        id: &str,
        args: &[&str],
        src: &std::path::Path,
        dest: &std::path::Path,
        duration_secs: Option<f64>,
    ) -> anyhow::Result<()> {
        use tokio::io::AsyncReadExt;
        let mut cmd = Command::new(&self.ffmpeg_bin);
        cmd.arg("-y").arg("-nostats");
        if duration_secs.is_some() {
            cmd.arg("-progress")
                .arg("pipe:1")
                .arg("-stats_period")
                .arg("1");
        }
        cmd.arg("-loglevel")
            .arg("error")
            .arg("-i")
            .arg(src)
            .args(args)
            .arg(dest)
            .stderr(std::process::Stdio::piped());
        if duration_secs.is_some() {
            cmd.stdout(std::process::Stdio::piped());
        }
        let mut child = cmd.spawn()?;
        let stdout = child.stdout.take();
        let mut stderr = child.stderr.take();
        self.children
            .lock()
            .unwrap()
            .insert(id.to_string(), child);

        if let (Some(stdout), Some(dur)) = (stdout, duration_secs) {
            use tokio::io::AsyncBufReadExt;
            let this = self.clone();
            let id = id.to_string();
            tokio::spawn(async move {
                let mut lines = tokio::io::BufReader::new(stdout).lines();
                let mut last_us = 0u64;
                let mut last_speed = 0.0f32;
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some((k, v)) = parse_progress_line(&line) {
                        match k {
                            // ffmpeg reports both keys in microseconds
                            "out_time_us" | "out_time_ms" => {
                                if let Ok(us) = v.parse::<u64>() {
                                    last_us = us;
                                    this.set_progress(
                                        &id,
                                        TranscodeProgress {
                                            pct: progress_pct(last_us, dur),
                                            speed: last_speed,
                                            eta_secs: eta_secs(dur, last_us, last_speed),
                                        },
                                    );
                                }
                            }
                            "speed" => {
                                if let Some(s) = parse_speed(v) {
                                    last_speed = s;
                                    this.set_progress(
                                        &id,
                                        TranscodeProgress {
                                            pct: progress_pct(last_us, dur),
                                            speed: last_speed,
                                            eta_secs: eta_secs(dur, last_us, last_speed),
                                        },
                                    );
                                }
                            }
                            "progress" if v == "end" => this.set_progress(
                                &id,
                                TranscodeProgress {
                                    pct: 100,
                                    speed: last_speed,
                                    eta_secs: Some(0),
                                },
                            ),
                            _ => {}
                        }
                    }
                }
            });
        }

        let mut errbuf = String::new();
        if let Some(e) = stderr.as_mut() {
            let _ = e.read_to_string(&mut errbuf).await;
        }

        let mut child = match self.take_child(id) {
            Some(c) => c,
            None => anyhow::bail!("transcode aborted"),
        };
        let status = child.wait().await?;
        if !status.success() {
            anyhow::bail!("ffmpeg failed: {errbuf}");
        }
        Ok(())
    }

    fn take_child(&self, id: &str) -> Option<tokio::process::Child> {
        self.children.lock().unwrap().remove(id)
    }

    fn set_progress(&self, id: &str, p: TranscodeProgress) {
        self.progress.lock().unwrap().insert(id.to_string(), p);
    }

    fn clear_progress(&self, id: &str) {
        self.progress.lock().unwrap().remove(id);
    }

    pub fn progress_of(&self, id: &str) -> Option<TranscodeProgress> {
        self.progress.lock().unwrap().get(id).copied()
    }

    pub async fn abort(&self, id: &str) {
        if let Some(mut child) = self.take_child(id) {
            let _ = child.kill().await;
        }
    }

    pub async fn abort_all(&self) {
        let children: Vec<tokio::process::Child> = {
            let mut g = self.children.lock().unwrap();
            g.drain().map(|(_, c)| c).collect()
        };
        for mut child in children {
            let _ = child.kill().await;
        }
    }

    async fn run_job(&self, id: &str, meta: &crate::state::Metadata) -> anyhow::Result<()> {
        let src_dir = std::path::PathBuf::from(&meta.path);
        let primary = pick_primary_file(&src_dir)?;
        let probe = probe(&self.ffprobe_bin, &primary).await?;
        let route = decide_route(&probe);
        crate::telemetry::transcode_started(
            id,
            match route {
                Route::Remux => "remux",
                Route::Encode => "encode",
            },
        );
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
        self.set_progress(
            id,
            TranscodeProgress {
                pct: 0,
                speed: 0.0,
                eta_secs: None,
            },
        );
        let duration = probe.duration_secs;

        let result = async {
            match route {
                Route::Remux => {
                    let _permit = self.remux_sem.acquire().await?;
                    let audio_aac = probe.audio_codec.as_deref() == Some("aac");
                    let mut args: Vec<&str> = vec!["-c:v", "copy"];
                    if audio_aac {
                        args.extend_from_slice(&["-c:a", "copy"]);
                    } else {
                        args.extend_from_slice(&["-c:a", "aac"]);
                    }
                    args.extend_from_slice(&["-movflags", "+faststart"]);
                    self.run_tracked(id, &args, &primary, &dest, duration).await
                }
                Route::Encode => {
                    let _permit = self.encode_sem.acquire().await?;
                    let threads = self.encode_threads.to_string();
                    let mut args: Vec<&str> = vec!["-c:v", "libx264"];
                    if self.encode_threads > 0 {
                        args.push("-threads");
                        args.push(&threads);
                    }
                    args.extend_from_slice(&["-c:a", "aac", "-movflags", "+faststart"]);
                    self.run_tracked(id, &args, &primary, &dest, duration).await
                }
            }
        }
        .await;
        self.clear_progress(id);
        result?;

        let _ = self.store.update(id, |m| {
            m.transcode = TranscodeStatus::Ready;
            m.transcode_path = Some(dest.display().to_string());
            m.transcode_error = None;
            ((), true)
        });
        crate::telemetry::transcode_ready(id, &dest.display().to_string());
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
            duration_secs: None,
        }
    }

    #[test]
    fn progress_pct_computes_and_clamps() {
        assert_eq!(progress_pct(0, 100.0), 0);
        assert_eq!(progress_pct(50_000_000, 100.0), 50);
        assert_eq!(progress_pct(100_000_000, 100.0), 100);
        assert_eq!(progress_pct(200_000_000, 100.0), 100, "clamps over 100");
        assert_eq!(progress_pct(50_000_000, 0.0), 0, "no duration → 0");
    }

    #[test]
    fn parse_progress_line_splits_key_value() {
        assert_eq!(parse_progress_line("out_time_us=4560000"), Some(("out_time_us", "4560000")));
        assert_eq!(parse_progress_line("progress=end"), Some(("progress", "end")));
        assert_eq!(parse_progress_line("garbage"), None);
    }

    #[test]
    fn parse_speed_strips_x_and_rejects_na() {
        assert_eq!(parse_speed("1.85x"), Some(1.85));
        assert_eq!(parse_speed(" 2x "), Some(2.0));
        assert_eq!(parse_speed("N/A"), None);
        assert_eq!(parse_speed("0x"), None);
        assert_eq!(parse_speed("junk"), None);
    }

    #[test]
    fn eta_secs_from_remaining_over_speed() {
        // 100s total, 40s done, 2x → 30s remaining wall-clock
        assert_eq!(eta_secs(100.0, 40_000_000, 2.0), Some(30));
        assert_eq!(eta_secs(100.0, 100_000_000, 2.0), Some(0), "done → 0");
        assert_eq!(eta_secs(100.0, 40_000_000, 0.0), None, "no speed → none");
        assert_eq!(eta_secs(0.0, 0, 2.0), None, "no duration → none");
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
    fn h264_non_aac_audio_still_remuxes() {
        assert_eq!(
            decide_route(&pr(Some("h264"), Some("ac3"), None)),
            Route::Remux,
            "h264 video is copied; only audio is transcoded"
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
    fn h264_non_aac_mp4_is_copy_video_hls() {
        assert_eq!(
            decide_delivery(&pr(Some("h264"), Some("ac3"), Some("mov,mp4,m4a"))),
            Delivery::CopyVideoHls,
            "h264 video copied, audio transcoded to aac — no video re-encode"
        );
    }
    #[test]
    fn h264_non_aac_mkv_is_copy_video_hls() {
        assert_eq!(
            decide_delivery(&pr(Some("h264"), Some("eac3"), Some("matroska,webm"))),
            Delivery::CopyVideoHls
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
            Transcoder::new(store.clone(), 1, 1, "ffmpeg".into(), "ffprobe".into(), true, 1);

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
