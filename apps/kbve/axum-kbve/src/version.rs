//! Version reporting.
//!
//! `env!("CARGO_PKG_VERSION")` bakes the version in at compile time. That's
//! brittle for our publish flow: CI can build an image at one SHA
//! (`ci-${SHA}` tag) and then **promote** it — re-tag without rebuild — to
//! the release version once the release-prep commit lands. Promote means
//! the binary reports the pre-bump version while the image tag says
//! otherwise. Health probes lie about what's running.
//!
//! Fix: read `Cargo.toml` from disk at startup. CI's pre-build sync step
//! bumps `apps/kbve/axum-kbve/Cargo.toml` from the api.mdx source before
//! the image build (see `utils-publish-docker-image.yml` +
//! `docker-test-app.yml`), and the Dockerfile copies that file into the
//! runtime image. Each image carries its own canonical version next to
//! the binary, no env var coupling — single source of truth that travels
//! with the image.
//!
//! Resolution order:
//!   1. Parse `/app/Cargo.toml` (or `KBVE_VERSION_TOML_PATH` if set —
//!      lets dev / e2e point at a local file).
//!   2. `CARGO_PKG_VERSION` baked at compile time (fallback).

use std::sync::OnceLock;

static RESOLVED: OnceLock<String> = OnceLock::new();

const COMPILE_TIME: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_TOML_PATH: &str = "/app/Cargo.toml";

/// Pure parser — pull `version = "x.y.z"` out of a TOML blob. Doesn't
/// pull in a real toml crate just to grab one line; the file is owned by
/// the build pipeline so we know the shape.
fn parse_version_line(contents: &str) -> Option<String> {
    for raw in contents.lines() {
        let line = raw.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some(rest) = line.strip_prefix("version") else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim();
        let trimmed = rest.trim_matches('"').trim_matches('\'');
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn read_toml(path: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    parse_version_line(&contents)
}

fn resolve() -> String {
    let path =
        std::env::var("KBVE_VERSION_TOML_PATH").unwrap_or_else(|_| DEFAULT_TOML_PATH.to_string());
    read_toml(&path).unwrap_or_else(|| COMPILE_TIME.to_string())
}

/// Resolved release version. Cached on first call so `/health` and
/// `/api/status` don't re-read disk per request.
pub fn current() -> &'static str {
    RESOLVED.get_or_init(resolve)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_version_line() {
        assert_eq!(
            parse_version_line("version = \"1.0.138\"\npublish = true\n"),
            Some("1.0.138".to_string())
        );
    }

    #[test]
    fn parses_with_extra_whitespace() {
        assert_eq!(
            parse_version_line("  version   =   \"1.0.42\"  \n"),
            Some("1.0.42".to_string())
        );
    }

    #[test]
    fn parses_single_quotes() {
        assert_eq!(
            parse_version_line("version = '0.9.0'\n"),
            Some("0.9.0".to_string())
        );
    }

    #[test]
    fn ignores_commented_version() {
        assert_eq!(
            parse_version_line("# version = \"9.9.9\"\nversion = \"1.0.138\"\n"),
            Some("1.0.138".to_string())
        );
    }

    #[test]
    fn returns_none_when_missing() {
        assert_eq!(parse_version_line("publish = true\n"), None);
        assert_eq!(parse_version_line(""), None);
    }

    #[test]
    fn read_toml_falls_through_when_file_missing() {
        assert_eq!(read_toml("/nonexistent/path/version.toml"), None);
    }

    #[test]
    fn read_toml_round_trip() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kbve-version-test-{}.toml", std::process::id()));
        std::fs::write(&path, "version = \"2.3.4\"\npublish = true\n").unwrap();
        let result = read_toml(path.to_str().unwrap());
        let _ = std::fs::remove_file(&path);
        assert_eq!(result, Some("2.3.4".to_string()));
    }

    #[test]
    fn parses_cargo_toml_shape_picks_package_version() {
        // Real Cargo.toml shape — `[package].version` comes first; dependency
        // version specs use `crate = { version = "..." }` inline (line
        // starts with the crate name, not `version`) so the parser can't
        // accidentally pick them up.
        let cargo_like = r#"
[package]
name = "axum-kbve"
authors = ["kbve"]
version = "1.0.138"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.43", features = ["full"] }
"#;
        assert_eq!(parse_version_line(cargo_like), Some("1.0.138".to_string()));
    }
}
