use std::path::PathBuf;

pub struct Config {
    pub ttl_secs: u64,
    pub reap_interval_secs: u64,
    pub active_dir: PathBuf,
    pub library_dir: PathBuf,
    pub state_file: PathBuf,
    pub api_addr: String,
    pub vpn_check_url: String,
    pub api_token: Option<String>,
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

pub fn load_from_env() -> anyhow::Result<Config> {
    Ok(Config {
        ttl_secs: env_u64("REEL_TTL_SECS", 21600)?,
        reap_interval_secs: env_u64("REEL_REAP_INTERVAL_SECS", 300)?,
        active_dir: PathBuf::from(env_or("REEL_ACTIVE_DIR", "/data/active")),
        library_dir: PathBuf::from(env_or("REEL_LIBRARY_DIR", "/data/library")),
        state_file: PathBuf::from(env_or("REEL_STATE_FILE", "/data/reel-state.json")),
        api_addr: env_or("REEL_API_ADDR", "0.0.0.0:8080"),
        vpn_check_url: env_or("REEL_VPN_CHECK_URL", "https://api.ipify.org"),
        api_token: std::env::var("REEL_API_TOKEN").ok(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn clear() {
        for k in ["REEL_TTL_SECS","REEL_REAP_INTERVAL_SECS","REEL_ACTIVE_DIR",
                  "REEL_LIBRARY_DIR","REEL_STATE_FILE","REEL_API_ADDR",
                  "REEL_VPN_CHECK_URL","REEL_API_TOKEN"] {
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
}
