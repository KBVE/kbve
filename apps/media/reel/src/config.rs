use std::path::PathBuf;

pub struct Config {
    pub ttl_secs: u64,
    pub reap_interval_secs: u64,
    pub active_dir: PathBuf,
    pub library_dir: PathBuf,
    pub session_dir: PathBuf,
    pub state_file: PathBuf,
    pub api_addr: String,
    pub vpn_check_url: String,
    pub vpn_check_urls: Vec<String>,
    pub vpn_leak_threshold: u32,
    pub vpn_watchdog_secs: u64,
    pub metadata_timeout_secs: u64,
    pub stall_timeout_secs: u64,
    pub stall_check_secs: u64,
    pub extra_trackers: Vec<String>,
    pub trackers_urls: Vec<String>,
    pub trackers_cache: PathBuf,
    pub trackers_refresh_secs: u64,
    pub state_flush_ms: u64,
    pub upload_limit_bps: Option<u32>,
    pub peer_connect_timeout_secs: u64,
    pub peer_read_write_timeout_secs: u64,
    pub peer_keepalive_secs: u64,
    pub api_token: Option<String>,
    pub transcode_enabled: bool,
    pub remux_concurrency: usize,
    pub encode_concurrency: usize,
    pub encode_threads: usize,
    pub encode_preset: String,
    pub ffmpeg_bin: String,
    pub ffprobe_bin: String,
    pub stream_enabled: bool,
    pub hls_enabled: bool,
    pub live_hls_enabled: bool,
    pub live_prebuffer_segments: usize,
    pub hls_segment_secs: u64,
    pub bt_port_file: Option<PathBuf>,
    pub bt_port_wait_secs: u64,
    pub bt_port_stable_secs: u64,
    pub bt_port_watch_secs: u64,
    pub bt_port_watch_restart: bool,
}

pub const DEFAULT_TRACKERS_URLS: &[&str] = &[
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_https.txt",
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_http.txt",
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt",
];

const DEFAULT_TRACKERS: &[&str] = &[
    "https://tracker.tamersunion.org:443/announce",
    "https://tracker.gbitt.info:443/announce",
    "https://tracker.renfei.net:443/announce",
    "http://tracker.opentrackr.org:1337/announce",
    "http://tracker.openbittorrent.com:80/announce",
    "http://open.tracker.cl:1337/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
];

pub fn parse_trackers(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| {
            l.starts_with("udp://") || l.starts_with("http://") || l.starts_with("https://")
        })
        .map(str::to_string)
        .collect()
}

pub fn merge_trackers<I: IntoIterator<Item = String>>(lists: I) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for t in lists {
        if seen.insert(t.clone()) {
            out.push(t);
        }
    }
    out
}

pub const DEFAULT_VPN_CHECK_URLS: &[&str] = &[
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
    "https://ipinfo.io/ip",
];

fn vpn_check_urls_from_env() -> Vec<String> {
    if let Ok(v) = std::env::var("REEL_VPN_CHECK_URLS") {
        let list: Vec<String> = v
            .split([',', '\n'])
            .map(str::trim)
            .filter(|s| s.starts_with("http"))
            .map(String::from)
            .collect();
        if !list.is_empty() {
            return list;
        }
    }
    let mut urls: Vec<String> = Vec::new();
    if let Ok(u) = std::env::var("REEL_VPN_CHECK_URL") {
        let u = u.trim();
        if u.starts_with("http") {
            urls.push(u.to_string());
        }
    }
    for d in DEFAULT_VPN_CHECK_URLS {
        if !urls.iter().any(|x| x == d) {
            urls.push((*d).to_string());
        }
    }
    urls
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
        Ok(v) if v.trim().is_empty() => default,
        Ok(v) => !(v.eq_ignore_ascii_case("false") || v == "0"),
        Err(_) => default,
    }
}

pub fn load_from_env() -> anyhow::Result<Config> {
    let active_dir = PathBuf::from(env_or("REEL_ACTIVE_DIR", "/data/active"));
    let session_dir = match std::env::var("REEL_SESSION_DIR") {
        Ok(v) => PathBuf::from(v),
        Err(_) => active_dir.join(".session"),
    };
    Ok(Config {
        ttl_secs: env_u64("REEL_TTL_SECS", 21600)?,
        reap_interval_secs: env_u64("REEL_REAP_INTERVAL_SECS", 300)?,
        active_dir: active_dir.clone(),
        library_dir: PathBuf::from(env_or("REEL_LIBRARY_DIR", "/data/library")),
        session_dir,
        state_file: PathBuf::from(env_or("REEL_STATE_FILE", "/data/reel-state.json")),
        api_addr: env_or("REEL_API_ADDR", "0.0.0.0:8080"),
        vpn_check_url: env_or("REEL_VPN_CHECK_URL", "https://api.ipify.org"),
        vpn_check_urls: vpn_check_urls_from_env(),
        vpn_leak_threshold: env_u64("REEL_VPN_LEAK_THRESHOLD", 3)?.max(1) as u32,
        vpn_watchdog_secs: env_u64("REEL_VPN_WATCHDOG_SECS", 60)?,
        metadata_timeout_secs: env_u64("REEL_METADATA_TIMEOUT_SECS", 120)?,
        stall_timeout_secs: env_u64("REEL_STALL_TIMEOUT_SECS", 300)?,
        stall_check_secs: env_u64("REEL_STALL_CHECK_SECS", 15)?,
        extra_trackers: match std::env::var("REEL_TRACKERS") {
            Ok(v) if !v.trim().is_empty() => parse_trackers(&v.replace(',', "\n")),
            _ => DEFAULT_TRACKERS.iter().map(|s| s.to_string()).collect(),
        },
        trackers_urls: match std::env::var("REEL_TRACKERS_URLS") {
            Ok(v)
                if v.trim().is_empty()
                    || v.eq_ignore_ascii_case("none")
                    || v.eq_ignore_ascii_case("off") =>
            {
                Vec::new()
            }
            Ok(v) => v
                .split([',', '\n'])
                .map(str::trim)
                .filter(|s| s.starts_with("http"))
                .map(str::to_string)
                .collect(),
            Err(_) => DEFAULT_TRACKERS_URLS
                .iter()
                .map(|s| s.to_string())
                .collect(),
        },
        trackers_cache: PathBuf::from(env_or("REEL_TRACKERS_CACHE", "/data/reel-trackers.txt")),
        trackers_refresh_secs: env_u64("REEL_TRACKERS_REFRESH_SECS", 21600)?,
        state_flush_ms: env_u64("REEL_STATE_FLUSH_MS", crate::state::DEFAULT_STATE_FLUSH_MS)?,
        upload_limit_bps: match env_u64("REEL_UPLOAD_LIMIT_BPS", 0)? {
            0 => None,
            n => Some(n.min(u32::MAX as u64) as u32),
        },
        peer_connect_timeout_secs: env_u64("REEL_PEER_CONNECT_TIMEOUT_SECS", 10)?,
        peer_read_write_timeout_secs: env_u64("REEL_PEER_READ_WRITE_TIMEOUT_SECS", 120)?,
        peer_keepalive_secs: env_u64("REEL_PEER_KEEPALIVE_SECS", 30)?,
        api_token: std::env::var("REEL_API_TOKEN").ok(),
        transcode_enabled: env_bool("REEL_TRANSCODE_ENABLED", true),
        remux_concurrency: env_u64("REEL_REMUX_CONCURRENCY", 3)? as usize,
        encode_concurrency: env_u64("REEL_ENCODE_CONCURRENCY", 1)? as usize,
        encode_threads: env_u64("REEL_ENCODE_THREADS", 1)? as usize,
        encode_preset: env_or("REEL_ENCODE_PRESET", "veryfast"),
        ffmpeg_bin: env_or("REEL_FFMPEG_BIN", "ffmpeg"),
        ffprobe_bin: env_or("REEL_FFPROBE_BIN", "ffprobe"),
        stream_enabled: env_bool("REEL_STREAM_ENABLED", true),
        hls_enabled: env_bool("REEL_HLS_ENABLED", true),
        live_hls_enabled: env_bool("REEL_LIVE_HLS", true),
        live_prebuffer_segments: env_u64("REEL_LIVE_PREBUFFER_SEGMENTS", 3)?.max(1) as usize,
        hls_segment_secs: env_u64("REEL_HLS_SEGMENT_SECS", 4)?,
        bt_port_file: match std::env::var("REEL_BT_PORT_FILE") {
            Ok(v) if !v.trim().is_empty() => Some(PathBuf::from(v.trim())),
            _ => None,
        },
        bt_port_wait_secs: env_u64("REEL_BT_PORT_WAIT_SECS", 20)?,
        bt_port_stable_secs: env_u64("REEL_BT_PORT_STABLE_SECS", 45)?,
        bt_port_watch_secs: env_u64("REEL_BT_PORT_WATCH_SECS", 30)?,
        bt_port_watch_restart: env_bool("REEL_BT_PORT_WATCH_RESTART", false),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn clear() {
        for k in [
            "REEL_TTL_SECS",
            "REEL_REAP_INTERVAL_SECS",
            "REEL_ACTIVE_DIR",
            "REEL_LIBRARY_DIR",
            "REEL_SESSION_DIR",
            "REEL_STATE_FILE",
            "REEL_API_ADDR",
            "REEL_VPN_CHECK_URL",
            "REEL_VPN_CHECK_URLS",
            "REEL_VPN_LEAK_THRESHOLD",
            "REEL_VPN_WATCHDOG_SECS",
            "REEL_METADATA_TIMEOUT_SECS",
            "REEL_STALL_TIMEOUT_SECS",
            "REEL_STALL_CHECK_SECS",
            "REEL_TRACKERS",
            "REEL_TRACKERS_URLS",
            "REEL_TRACKERS_CACHE",
            "REEL_TRACKERS_REFRESH_SECS",
            "REEL_STATE_FLUSH_MS",
            "REEL_UPLOAD_LIMIT_BPS",
            "REEL_PEER_CONNECT_TIMEOUT_SECS",
            "REEL_PEER_READ_WRITE_TIMEOUT_SECS",
            "REEL_PEER_KEEPALIVE_SECS",
            "REEL_API_TOKEN",
            "REEL_TRANSCODE_ENABLED",
            "REEL_REMUX_CONCURRENCY",
            "REEL_ENCODE_CONCURRENCY",
            "REEL_ENCODE_THREADS",
            "REEL_FFMPEG_BIN",
            "REEL_FFPROBE_BIN",
            "REEL_STREAM_ENABLED",
            "REEL_HLS_ENABLED",
            "REEL_LIVE_HLS",
            "REEL_LIVE_PREBUFFER_SEGMENTS",
            "REEL_HLS_SEGMENT_SECS",
            "REEL_BT_PORT_FILE",
            "REEL_BT_PORT_WAIT_SECS",
            "REEL_BT_PORT_WATCH_RESTART",
        ] {
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
        assert_eq!(c.vpn_leak_threshold, 3);
        assert_eq!(c.vpn_check_urls.len(), DEFAULT_VPN_CHECK_URLS.len());
        assert!(c.vpn_check_urls.iter().all(|u| u.starts_with("https://")));
        assert_eq!(c.metadata_timeout_secs, 120);
        assert_eq!(c.stall_timeout_secs, 300);
        assert_eq!(c.stall_check_secs, 15);
        assert!(
            !c.extra_trackers.is_empty(),
            "embedded default trackers present"
        );
        assert!(
            c.extra_trackers
                .iter()
                .all(|t| t.starts_with("udp://") || t.starts_with("http"))
        );
        assert_eq!(c.trackers_urls.len(), DEFAULT_TRACKERS_URLS.len());
        assert!(c.trackers_urls.iter().all(|u| u.starts_with("https://")));
        assert_eq!(
            c.trackers_cache,
            std::path::PathBuf::from("/data/reel-trackers.txt")
        );
        assert_eq!(c.trackers_refresh_secs, 21600);
        assert_eq!(c.state_flush_ms, 1000);
        assert!(c.upload_limit_bps.is_none());
        assert_eq!(c.active_dir, std::path::PathBuf::from("/data/active"));
        assert_eq!(
            c.session_dir,
            std::path::PathBuf::from("/data/active/.session")
        );
        assert_eq!(c.api_addr, "0.0.0.0:8080");
        assert!(c.api_token.is_none());
        assert!(c.bt_port_file.is_none());
        assert_eq!(c.bt_port_wait_secs, 20);
        assert_eq!(c.bt_port_stable_secs, 45);
        assert_eq!(c.bt_port_watch_secs, 30);
        assert!(!c.bt_port_watch_restart);
    }

    #[test]
    fn parse_trackers_keeps_only_usable_schemes() {
        let txt = "udp://a:1337/announce\n\nwss://b/ws\nhttps://c:443/announce\n# comment\nhttp://d/announce\nws://e";
        let got = parse_trackers(txt);
        assert_eq!(
            got,
            vec![
                "udp://a:1337/announce",
                "https://c:443/announce",
                "http://d/announce"
            ]
        );
    }

    #[test]
    #[serial]
    fn trackers_urls_disable_and_override() {
        clear();
        std::env::set_var("REEL_TRACKERS_URLS", "none");
        assert!(load_from_env().unwrap().trackers_urls.is_empty());
        std::env::set_var("REEL_TRACKERS_URLS", "https://a/t.txt, https://b/t.txt");
        assert_eq!(
            load_from_env().unwrap().trackers_urls,
            vec!["https://a/t.txt", "https://b/t.txt"]
        );
        clear();
    }

    #[test]
    fn merge_trackers_dedups_preserving_order() {
        let got = merge_trackers(
            [
                "udp://a/announce",
                "udp://b/announce",
                "udp://a/announce",
                "udp://c/announce",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
        assert_eq!(
            got,
            vec!["udp://a/announce", "udp://b/announce", "udp://c/announce"]
        );
    }

    #[test]
    #[serial]
    fn trackers_env_override_replaces_default() {
        clear();
        std::env::set_var(
            "REEL_TRACKERS",
            "udp://x:1/announce, wss://skip, https://y:2/announce",
        );
        let c = load_from_env().unwrap();
        assert_eq!(
            c.extra_trackers,
            vec!["udp://x:1/announce", "https://y:2/announce"]
        );
        clear();
    }

    #[test]
    #[serial]
    fn vpn_check_urls_override_and_legacy_prepend() {
        clear();
        std::env::set_var("REEL_VPN_CHECK_URLS", "https://a/ip, https://b/ip");
        assert_eq!(
            load_from_env().unwrap().vpn_check_urls,
            vec!["https://a/ip", "https://b/ip"]
        );
        std::env::remove_var("REEL_VPN_CHECK_URLS");
        std::env::set_var("REEL_VPN_CHECK_URL", "https://custom/ip");
        let urls = load_from_env().unwrap().vpn_check_urls;
        assert_eq!(urls.first().map(String::as_str), Some("https://custom/ip"));
        assert!(urls.len() > 1, "defaults appended as fallback");
        clear();
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
    fn session_dir_defaults_under_active_and_overrides() {
        clear();
        std::env::set_var("REEL_ACTIVE_DIR", "/mnt/act");
        assert_eq!(
            load_from_env().unwrap().session_dir,
            std::path::PathBuf::from("/mnt/act/.session")
        );
        std::env::set_var("REEL_SESSION_DIR", "/mnt/sess");
        assert_eq!(
            load_from_env().unwrap().session_dir,
            std::path::PathBuf::from("/mnt/sess")
        );
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
        assert_eq!(c.encode_threads, 1);
        assert_eq!(c.encode_preset, "veryfast");
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
    fn env_bool_empty_falls_back_to_default() {
        clear();
        std::env::set_var("REEL_TRANSCODE_ENABLED", "");
        assert!(
            load_from_env().unwrap().transcode_enabled,
            "empty must not read as false"
        );
        std::env::set_var("REEL_STREAM_ENABLED", "   ");
        assert!(
            load_from_env().unwrap().stream_enabled,
            "whitespace must not read as false"
        );
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
        assert!(c.live_hls_enabled);
        assert_eq!(c.live_prebuffer_segments, 3);
        assert_eq!(c.hls_segment_secs, 4);
        std::env::set_var("REEL_HLS_ENABLED", "false");
        std::env::set_var("REEL_LIVE_HLS", "false");
        std::env::set_var("REEL_HLS_SEGMENT_SECS", "8");
        let c2 = load_from_env().unwrap();
        assert!(!c2.hls_enabled);
        assert!(!c2.live_hls_enabled);
        assert_eq!(c2.hls_segment_secs, 8);
        clear();
    }
}
