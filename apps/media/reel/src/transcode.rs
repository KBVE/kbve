use std::path::{Path, PathBuf};
use tokio::process::Command;

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
