use std::path::PathBuf;

pub struct Config {
    pub ttl_secs: u64,
    pub reap_interval_secs: u64,
    pub active_dir: PathBuf,
    pub library_dir: PathBuf,
    pub state_file: PathBuf,
    pub api_addr: String,
    pub vpn_check_url: String,
    pub vpn_watchdog_secs: u64,
    pub state_flush_ms: u64,
    pub upload_limit_bps: Option<u32>,
    pub api_token: Option<String>,
    pub transcode_enabled: bool,
    pub remux_concurrency: usize,
    pub encode_concurrency: usize,
    pub ffmpeg_bin: String,
    pub ffprobe_bin: String,
    pub stream_enabled: bool,
    pub hls_enabled: bool,
    pub hls_segment_secs: u64,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_u64(key: &str, default: u64) -> anyhow::Result<u64> {
    match std::env::var(key) {
        Ok(v) => Ok(v.parse()?),
        Err(_) => Ok(default),
    }
}

fn env_bool(key: &str, default: bool) -> bool {
    match std::env::var(key) {
        Ok(v) => !(v.eq_ignore_ascii_case("false") || v == "0"),
        Err(_) => default,
    }
}

pub fn load_from_env() -> anyhow::Result<Config> {
    Ok(Config {
        ttl_secs: env_u64("REEL_TTL_SECS", 21600)?,
        reap_interval_secs: env_u64("REEL_REAP_INTERVAL_SECS", 300)?,
        active_dir: PathBuf::from(env_or("REEL_ACTIVE_DIR", "/data/active")),
        library_dir: PathBuf::from(env_or("REEL_LIBRARY_DIR", "/data/library")),
        state_file: PathBuf::from(env_or("REEL_STATE_FILE", "/data/reel-state.json")),
        api_addr: env_or("REEL_API_ADDR", "0.0.0.0:8080"),
        vpn_check_url: env_or("REEL_VPN_CHECK_URL", "https://api.ipify.org"),
        vpn_watchdog_secs: env_u64("REEL_VPN_WATCHDOG_SECS", 60)?,
        state_flush_ms: env_u64("REEL_STATE_FLUSH_MS", crate::state::DEFAULT_STATE_FLUSH_MS)?,
        upload_limit_bps: match env_u64("REEL_UPLOAD_LIMIT_BPS", 0)? {
            0 => None,
            n => Some(n.min(u32::MAX as u64) as u32),
        },
        api_token: std::env::var("REEL_API_TOKEN").ok(),
        transcode_enabled: env_bool("REEL_TRANSCODE_ENABLED", true),
        remux_concurrency: env_u64("REEL_REMUX_CONCURRENCY", 3)? as usize,
        encode_concurrency: env_u64("REEL_ENCODE_CONCURRENCY", 1)? as usize,
        ffmpeg_bin: env_or("REEL_FFMPEG_BIN", "ffmpeg"),
        ffprobe_bin: env_or("REEL_FFPROBE_BIN", "ffprobe"),
        stream_enabled: env_bool("REEL_STREAM_ENABLED", true),
        hls_enabled: env_bool("REEL_HLS_ENABLED", true),
        hls_segment_secs: env_u64("REEL_HLS_SEGMENT_SECS", 4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn clear() {
        for k in ["REEL_TTL_SECS","REEL_REAP_INTERVAL_SECS","REEL_ACTIVE_DIR",
                  "REEL_LIBRARY_DIR","REEL_STATE_FILE","REEL_API_ADDR",
                  "REEL_VPN_CHECK_URL","REEL_VPN_WATCHDOG_SECS","REEL_STATE_FLUSH_MS","REEL_UPLOAD_LIMIT_BPS","REEL_API_TOKEN","REEL_TRANSCODE_ENABLED",
                  "REEL_REMUX_CONCURRENCY","REEL_ENCODE_CONCURRENCY",
                  "REEL_FFMPEG_BIN","REEL_FFPROBE_BIN","REEL_STREAM_ENABLED",
                  "REEL_HLS_ENABLED","REEL_HLS_SEGMENT_SECS"] {
            std::env::remove_var(k);
        }
    }

    #[test]
    #[serial]
    fn defaults_apply_when_env_absent() {
        clear();
        let c = load_from_env().unwrap();
        assert_eq!(c.ttl_secs, 21600);
        assert_eq!(c.reap_interval_secs, 300);
        assert_eq!(c.vpn_watchdog_secs, 60);
        assert_eq!(c.state_flush_ms, 1000);
        assert!(c.upload_limit_bps.is_none());
        assert_eq!(c.active_dir, std::path::PathBuf::from("/data/active"));
        assert_eq!(c.api_addr, "0.0.0.0:8080");
        assert!(c.api_token.is_none());
    }

    #[test]
    #[serial]
    fn env_overrides_defaults() {
        clear();
        std::env::set_var("REEL_TTL_SECS", "60");
        std::env::set_var("REEL_API_TOKEN", "secret");
        let c = load_from_env().unwrap();
        assert_eq!(c.ttl_secs, 60);
        assert_eq!(c.api_token.as_deref(), Some("secret"));
        clear();
    }

    #[test]
    #[serial]
    fn upload_limit_parses_zero_as_unlimited() {
        clear();
        assert!(load_from_env().unwrap().upload_limit_bps.is_none());
        std::env::set_var("REEL_UPLOAD_LIMIT_BPS", "0");
        assert!(load_from_env().unwrap().upload_limit_bps.is_none());
        std::env::set_var("REEL_UPLOAD_LIMIT_BPS", "1048576");
        assert_eq!(load_from_env().unwrap().upload_limit_bps, Some(1_048_576));
        clear();
    }

    #[test]
    #[serial]
    fn transcode_defaults_and_overrides() {
        clear();
        let c = load_from_env().unwrap();
        assert!(c.transcode_enabled);
        assert_eq!(c.remux_concurrency, 3);
        assert_eq!(c.encode_concurrency, 1);
        assert_eq!(c.ffmpeg_bin, "ffmpeg");
        std::env::set_var("REEL_TRANSCODE_ENABLED", "false");
        std::env::set_var("REEL_ENCODE_CONCURRENCY", "2");
        let c2 = load_from_env().unwrap();
        assert!(!c2.transcode_enabled);
        assert_eq!(c2.encode_concurrency, 2);
        clear();
    }

    #[test]
    #[serial]
    fn stream_defaults_and_overrides() {
        clear();
        let c = load_from_env().unwrap();
        assert!(c.stream_enabled);
        std::env::set_var("REEL_STREAM_ENABLED", "false");
        let c2 = load_from_env().unwrap();
        assert!(!c2.stream_enabled);
        clear();
    }

    #[test]
    #[serial]
    fn hls_defaults_and_overrides() {
        clear();
        let c = load_from_env().unwrap();
        assert!(c.hls_enabled);
        assert_eq!(c.hls_segment_secs, 4);
        std::env::set_var("REEL_HLS_ENABLED", "false");
        std::env::set_var("REEL_HLS_SEGMENT_SECS", "8");
        let c2 = load_from_env().unwrap();
        assert!(!c2.hls_enabled);
        assert_eq!(c2.hls_segment_secs, 8);
        clear();
    }
}
