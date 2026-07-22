use std::path::{Path, PathBuf};

pub struct Moved {
    pub dest: PathBuf,
    pub size: u64,
}

fn dir_size(dir: &Path) -> anyhow::Result<u64> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            total += dir_size(&entry.path())?;
        } else if file_type.is_file() {
            total += entry.metadata()?.len();
        }
    }
    Ok(total)
}

pub fn move_completed(src: &Path, library_dir: &Path) -> anyhow::Result<Moved> {
    let meta = std::fs::metadata(src)
        .map_err(|e| anyhow::anyhow!("source unavailable {}: {e}", src.display()))?;
    let size = if meta.is_dir() {
        dir_size(src)?
    } else {
        meta.len()
    };
    if size == 0 {
        anyhow::bail!("source is empty: {}", src.display());
    }
    std::fs::create_dir_all(library_dir)?;
    let file_name = src.file_name()
        .ok_or_else(|| anyhow::anyhow!("source has no file name"))?;
    let dest = library_dir.join(file_name);
    std::fs::rename(src, &dest)?;
    Ok(Moved { dest, size })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn moves_file_to_library() {
        let dir = tempdir().unwrap();
        let active = dir.path().join("active");
        let library = dir.path().join("library");
        std::fs::create_dir_all(&active).unwrap();
        let src = active.join("movie.mp4");
        std::fs::write(&src, b"data").unwrap();

        let moved = move_completed(&src, &library).unwrap();
        assert_eq!(moved.dest, library.join("movie.mp4"));
        assert_eq!(moved.size, 4);
        assert!(!src.exists());
        assert!(moved.dest.exists());
    }

    #[test]
    fn errors_on_missing_source() {
        let dir = tempdir().unwrap();
        let res = move_completed(&dir.path().join("nope.mp4"), &dir.path().join("lib"));
        assert!(res.is_err());
    }

    #[test]
    fn errors_on_empty_source() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("empty.mp4");
        std::fs::write(&src, b"").unwrap();
        let res = move_completed(&src, &dir.path().join("lib"));
        assert!(res.is_err());
    }

    #[test]
    fn moves_directory_to_library() {
        let dir = tempdir().unwrap();
        let active = dir.path().join("active");
        let library = dir.path().join("library");
        let src = active.join("torrent-out");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("movie.mp4"), b"data12345").unwrap();

        let moved = move_completed(&src, &library).unwrap();
        assert_eq!(moved.dest, library.join("torrent-out"));
        assert_eq!(moved.size, 9);
        assert!(!src.exists());
        assert!(moved.dest.exists());
        assert!(moved.dest.join("movie.mp4").exists());
    }
}
