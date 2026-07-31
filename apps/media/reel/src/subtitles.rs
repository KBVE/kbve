use std::path::{Path, PathBuf};

/// A subtitle sidecar discovered next to a completed download.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SubtitleTrack {
    pub index: usize,
    pub label: String,
    pub lang: String,
}

fn is_srt(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".srt")
}

/// Best-effort language guess from a sidecar filename, e.g.
/// `movie.en.srt` / `movie.sub2.eng.srt` → a 2-letter code, else "und".
fn guess_lang(stem: &str) -> String {
    let lower = stem.to_ascii_lowercase();
    for part in lower.rsplit(['.', '_', '-']) {
        let p = part.trim();
        let code = match p {
            "en" | "eng" | "english" => "en",
            "es" | "spa" | "spanish" => "es",
            "fr" | "fra" | "fre" | "french" => "fr",
            "de" | "ger" | "deu" | "german" => "de",
            "it" | "ita" | "italian" => "it",
            "pt" | "por" | "portuguese" => "pt",
            "ru" | "rus" | "russian" => "ru",
            "ja" | "jpn" | "japanese" => "ja",
            "ko" | "kor" | "korean" => "ko",
            "zh" | "chi" | "zho" | "chinese" => "zh",
            _ => continue,
        };
        return code.to_string();
    }
    "und".to_string()
}

/// List `.srt` sidecars directly inside `dir`, sorted by filename so the order
/// is stable across requests. `dir` is the entry's library directory; a file
/// path (single-file entry) has no sidecars.
pub fn list_sidecars(dir: &Path) -> Vec<PathBuf> {
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<PathBuf> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(is_srt)
                    .unwrap_or(false)
        })
        .collect();
    out.sort();
    out
}

pub fn tracks_for(dir: &Path) -> Vec<SubtitleTrack> {
    list_sidecars(dir)
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            SubtitleTrack {
                index,
                label: format!("Subtitles {}", index + 1),
                lang: guess_lang(&stem),
            }
        })
        .collect()
}

/// Convert SubRip text to WebVTT. Only the timestamp line's `,` separators are
/// rewritten to `.` — commas inside dialogue are left untouched. A leading BOM
/// is stripped. Cue-index lines pass through (valid in WebVTT).
pub fn srt_to_vtt(srt: &str) -> String {
    let srt = srt.strip_prefix('\u{feff}').unwrap_or(srt);
    let mut out = String::with_capacity(srt.len() + 16);
    out.push_str("WEBVTT\n\n");
    for line in srt.lines() {
        if line.contains("-->") {
            out.push_str(&line.replace(',', "."));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srt_to_vtt_rewrites_only_timestamp_commas() {
        let srt = "1\n00:00:01,000 --> 00:00:04,500\nHello, world\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:04.500"));
        assert!(vtt.contains("Hello, world"), "dialogue comma preserved");
    }

    #[test]
    fn srt_to_vtt_strips_bom() {
        let vtt = srt_to_vtt("\u{feff}1\n00:00:00,000 --> 00:00:01,000\nhi\n");
        assert!(vtt.starts_with("WEBVTT"));
        assert!(!vtt.contains('\u{feff}'));
    }

    #[test]
    fn guess_lang_reads_codes() {
        assert_eq!(guess_lang("movie.en"), "en");
        assert_eq!(guess_lang("movie.sub2.eng"), "en");
        assert_eq!(guess_lang("movie.spanish"), "es");
        assert_eq!(guess_lang("movie.sub0"), "und");
    }

    #[test]
    fn list_and_tracks_sorted_srt_only() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        std::fs::write(d.join("m.sub1.srt"), b"x").unwrap();
        std::fs::write(d.join("m.sub0.srt"), b"x").unwrap();
        std::fs::write(d.join("m.mp4"), b"x").unwrap();
        std::fs::write(d.join("poster.jpg"), b"x").unwrap();
        let list = list_sidecars(d);
        assert_eq!(list.len(), 2);
        assert!(list[0].ends_with("m.sub0.srt"), "sorted");
        let tracks = tracks_for(d);
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].index, 0);
        assert_eq!(tracks[0].label, "Subtitles 1");
    }

    #[test]
    fn list_sidecars_missing_dir_is_empty() {
        assert!(list_sidecars(Path::new("/no/such/dir/xyz")).is_empty());
    }
}
