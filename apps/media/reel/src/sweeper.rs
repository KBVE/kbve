use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub fn expired_orphans(
    entries: &[(String, u64)],
    known: &HashSet<String>,
    ttl_secs: u64,
    now: u64,
) -> Vec<String> {
    entries
        .iter()
        .filter(|(path, mtime)| !known.contains(path) && now.saturating_sub(*mtime) > ttl_secs)
        .map(|(path, _)| path.clone())
        .collect()
}

fn scan_dir(dir: &Path) -> Vec<(String, u64)> {
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push((path.to_string_lossy().into_owned(), mtime));
    }
    out
}

fn delete_path(path: &str) -> std::io::Result<()> {
    let pb = Path::new(path);
    if pb.is_dir() {
        std::fs::remove_dir_all(pb)
    } else if pb.exists() {
        std::fs::remove_file(pb)
    } else {
        Ok(())
    }
}

pub fn sweep_orphans(
    dirs: &[PathBuf],
    known: &HashSet<String>,
    ttl_secs: u64,
    now: u64,
) -> usize {
    let mut entries = Vec::new();
    for dir in dirs {
        entries.extend(scan_dir(dir));
    }
    let mut removed = 0usize;
    for path in expired_orphans(&entries, known, ttl_secs, now) {
        match delete_path(&path) {
            Ok(()) => {
                crate::telemetry::swept(&path);
                removed += 1;
            }
            Err(e) => tracing::warn!(path = %path, error = %e, "sweep: orphan delete failed"),
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn keeps_known_paths() {
        let entries = vec![("/lib/a".to_string(), 0)];
        let known = set(&["/lib/a"]);
        assert!(expired_orphans(&entries, &known, 50, 1000).is_empty());
    }

    #[test]
    fn keeps_fresh_orphans() {
        let entries = vec![("/lib/a".to_string(), 990)];
        let known = set(&[]);
        assert!(expired_orphans(&entries, &known, 50, 1000).is_empty());
    }

    #[test]
    fn removes_old_orphans() {
        let entries = vec![("/lib/a".to_string(), 100), ("/lib/b".to_string(), 990)];
        let known = set(&[]);
        assert_eq!(
            expired_orphans(&entries, &known, 50, 1000),
            vec!["/lib/a".to_string()]
        );
    }

    #[test]
    fn known_takes_priority_over_age() {
        let entries = vec![("/lib/a".to_string(), 0)];
        let known = set(&["/lib/a"]);
        assert!(expired_orphans(&entries, &known, 50, 10_000_000).is_empty());
    }

    #[test]
    fn scan_skips_hidden_and_reports_orphans() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join(".session")).unwrap();
        std::fs::write(dir.path().join("movie.mp4"), b"data").unwrap();
        let entries = scan_dir(dir.path());
        assert_eq!(entries.len(), 1);
        assert!(entries[0].0.ends_with("movie.mp4"));
    }

    #[test]
    fn sweep_deletes_old_orphan_dir_keeps_known_and_session() {
        let dir = tempfile::tempdir().unwrap();
        let lib = dir.path().join("library");
        let active = dir.path().join("active");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::create_dir_all(&active).unwrap();
        std::fs::create_dir(active.join(".session")).unwrap();

        let orphan = lib.join("old-orphan");
        std::fs::create_dir(&orphan).unwrap();
        std::fs::write(orphan.join("f.mp4"), b"x").unwrap();
        let tracked = lib.join("tracked");
        std::fs::create_dir(&tracked).unwrap();

        let known = set(&[tracked.to_string_lossy().as_ref()]);
        // now far in the future so every mtime is "old"
        let removed = sweep_orphans(&[lib.clone(), active.clone()], &known, 10, 10_000_000_000);
        assert_eq!(removed, 1);
        assert!(!orphan.exists(), "old orphan removed");
        assert!(tracked.exists(), "known path kept");
        assert!(active.join(".session").exists(), "session dir protected");
    }
}
