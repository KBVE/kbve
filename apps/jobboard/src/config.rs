use anyhow::Context;
use std::net::SocketAddr;

pub struct JobBoardConfig {
    pub http_addr: SocketAddr,
    pub secure_cookies: bool,
}

impl JobBoardConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        if std::env::var("KBVE_PG_RW_URL").is_err() {
            if let Ok(url) = std::env::var("DATABASE_URL") {
                std::env::set_var("KBVE_PG_RW_URL", url);
            }
        }

        let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let port: u16 = std::env::var("HTTP_PORT")
            .unwrap_or_else(|_| "5400".into())
            .parse()
            .context("HTTP_PORT must be a u16")?;
        let http_addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .with_context(|| format!("invalid HTTP bind address {host}:{port}"))?;

        let secure_cookies = std::env::var("SECURE_COOKIES")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        Ok(Self {
            http_addr,
            secure_cookies,
        })
    }
}
