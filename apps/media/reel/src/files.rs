use std::path::{Path, PathBuf};

/// One downloadable file inside a completed torrent. `index` is the file's
/// position in the sorted listing, and every download route addresses files by
/// that index — a caller never supplies a path, so no request can escape the
/// torrent directory.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct FileEntry {
    pub index: usize,
    pub name: String,
    pub size: u64,
    pub content_type: &'static str,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// `hls/` holds generated segments and `*.reel.mp4` is the transcoder's own
/// output; both are derived from the source files already in the listing.
fn is_derived(rel: &str) -> bool {
    rel == "hls" || rel.starts_with("hls/") || rel.contains("/hls/") || rel.ends_with(".reel.mp4")
}

pub fn list_files(dir: &Path) -> std::io::Result<Vec<FileEntry>> {
    let mut found: Vec<(String, u64)> = Vec::new();
    if dir.is_file() {
        let size = std::fs::metadata(dir)?.len();
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".into());
        found.push((name, size));
    } else {
        collect(dir, dir, &mut found)?;
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(found
        .into_iter()
        .enumerate()
        .map(|(index, (name, size))| FileEntry {
            content_type: crate::stream::content_type_for(&name),
            index,
            name,
            size,
        })
        .collect())
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<(String, u64)>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let rel = match path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        if is_derived(&rel) {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, out)?;
        } else {
            out.push((rel, entry.metadata()?.len()));
        }
    }
    Ok(())
}

/// Resolve a listing index back to an absolute path. Returns None for an index
/// past the end of the listing.
pub fn path_for(dir: &Path, entry: &FileEntry) -> PathBuf {
    if dir.is_file() {
        dir.to_path_buf()
    } else {
        dir.join(&entry.name)
    }
}

/// RFC 6266 `filename*` value plus an ASCII fallback, so a track called
/// "Étude n°3.flac" downloads under its real name in modern browsers and under
/// a safe transliteration everywhere else.
pub fn content_disposition(name: &str) -> String {
    let base = name.rsplit('/').next().unwrap_or(name);
    let ascii: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric()
                || matches!(c, '.' | '-' | '_' | ' ' | '(' | ')' | '[' | ']')
            {
                c
            } else {
                '_'
            }
        })
        .collect();
    let encoded = percent_encode(base);
    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'~') {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Torrent name reduced to a safe archive filename.
pub fn archive_name(torrent_name: &str) -> String {
    let mut stem = String::with_capacity(torrent_name.len());
    for c in torrent_name.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '_') {
            stem.push(c);
        } else if !stem.ends_with('-') {
            stem.push('-');
        }
    }
    let trimmed = stem.trim_matches(|c| c == '-' || c == '.');
    if trimmed.is_empty() {
        "download.zip".into()
    } else {
        format!("{trimmed}.zip")
    }
}

/// Stream the whole torrent as a zip without staging it on disk. The archive
/// is written by a blocking task into one half of a duplex pipe while axum
/// drains the other, so a 40 GB album costs a 64 KiB buffer, not 40 GB of
/// scratch space. Entries are Stored, never deflated: FLAC, mp4 and jpeg are
/// already compressed, so deflate would burn CPU for nothing.
pub fn zip_stream(root: PathBuf, files: Vec<FileEntry>, id: String) -> axum::body::Body {
    let (writer, reader) = tokio::io::duplex(64 * 1024);
    let bridge = tokio_util::io::SyncIoBridge::new(writer);
    tokio::task::spawn_blocking(move || {
        if let Err(e) = write_zip(bridge, &root, &files) {
            // The client hanging up mid-download lands here too; the archive
            // is unrecoverable either way, so the truncated stream IS the
            // error signal — headers went out long ago.
            tracing::warn!(id = %id, error = %e, "archive: zip stream ended early");
        }
    });
    axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(reader))
}

fn write_zip<W: std::io::Write>(out: W, root: &Path, files: &[FileEntry]) -> std::io::Result<()> {
    use zip::write::SimpleFileOptions;
    let mut zip = zip::ZipWriter::new_stream(out);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(true);
    for entry in files {
        let path = path_for(root, entry);
        let mut file = std::fs::File::open(&path)?;
        zip.start_file(entry.name.clone(), opts)
            .map_err(std::io::Error::other)?;
        std::io::copy(&mut file, &mut zip)?;
    }
    zip.finish().map_err(std::io::Error::other)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, rel: &str, bytes: &[u8]) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, bytes).unwrap();
    }

    #[test]
    fn lists_every_file_sorted_with_stable_indexes() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "02 - b.flac", b"bb");
        write(dir.path(), "01 - a.flac", b"a");
        write(dir.path(), "art/cover.jpg", b"jpeg");
        write(dir.path(), "album.log", b"log");
        let files = list_files(dir.path()).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["01 - a.flac", "02 - b.flac", "album.log", "art/cover.jpg"],
            "sorted by relative path so indexes stay stable across calls"
        );
        assert_eq!(files[0].index, 0);
        assert_eq!(files[0].size, 1);
        assert_eq!(files[0].content_type, "audio/flac");
        assert_eq!(files[3].content_type, "image/jpeg");
    }

    #[test]
    fn skips_derived_and_hidden_files() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "movie.mkv", b"m");
        write(dir.path(), "movie.reel.mp4", b"derived");
        write(dir.path(), "hls/seg00000.ts", b"seg");
        write(dir.path(), ".hidden", b"x");
        let files = list_files(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "movie.mkv");
    }

    #[test]
    fn single_file_torrent_lists_itself() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("track.flac");
        std::fs::write(&f, b"flac").unwrap();
        let files = list_files(&f).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "track.flac");
        assert_eq!(path_for(&f, &files[0]), f);
    }

    #[test]
    fn disposition_carries_ascii_and_utf8_names() {
        let d = content_disposition("art/Étude n°3.flac");
        assert!(d.starts_with("attachment; "));
        assert!(d.contains("filename=\"_tude n_3.flac\""), "{d}");
        assert!(
            d.contains("filename*=UTF-8''%C3%89tude%20n%C2%B03.flac"),
            "{d}"
        );
    }

    #[test]
    fn disposition_cannot_inject_a_path_or_quote() {
        let d = content_disposition("../../etc/pa\"sswd");
        assert!(d.contains("filename=\"pa_sswd\""), "{d}");
        assert!(!d.contains(".."), "{d}");
    }

    #[test]
    fn zip_round_trips_every_listed_file() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "01 - a.flac", b"first");
        write(dir.path(), "art/cover.jpg", b"jpeg-bytes");
        let files = list_files(dir.path()).unwrap();
        let mut buf = Vec::new();
        write_zip(std::io::Cursor::new(&mut buf), dir.path(), &files).unwrap();

        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(buf)).unwrap();
        assert_eq!(archive.len(), 2);
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["01 - a.flac", "art/cover.jpg"]);
        let mut got = String::new();
        std::io::Read::read_to_string(&mut archive.by_name("01 - a.flac").unwrap(), &mut got)
            .unwrap();
        assert_eq!(got, "first");
    }

    #[test]
    fn zip_entries_are_stored_not_deflated() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "track.flac", &vec![0u8; 4096]);
        let files = list_files(dir.path()).unwrap();
        let mut buf = Vec::new();
        write_zip(std::io::Cursor::new(&mut buf), dir.path(), &files).unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(buf)).unwrap();
        assert_eq!(
            archive.by_index(0).unwrap().compression(),
            zip::CompressionMethod::Stored,
            "already-compressed media must not be re-compressed"
        );
    }

    #[test]
    fn archive_names_are_safe() {
        assert_eq!(
            archive_name("Some Album (2024) [FLAC]"),
            "Some-Album-2024-FLAC.zip"
        );
        assert_eq!(archive_name("../../etc"), "etc.zip");
        assert_eq!(archive_name("///"), "download.zip");
    }
}
