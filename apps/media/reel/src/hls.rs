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
