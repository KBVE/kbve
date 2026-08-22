//! Agones lifecycle sidecar for game servers with no SDK integration of their own.
//!
//! AzerothCore, Factorio and Palworld all ship without Agones support, so each
//! of their manifests grew its own busybox shim polling a socket with `nc` and
//! posting to the SDK's HTTP endpoint with `wget`. Those copies share three
//! defects:
//!
//!   1. None of them ever call Shutdown(). On a scale-down or a rolling update
//!      the pod takes SIGTERM, the shim dies, and Agones records the server as
//!      Unhealthy instead of shut down — so the grace period the manifest asks
//!      for is never actually used to flush state.
//!
//!   2. Readiness means "the socket accepts", which is not the same as "the
//!      server is reachable". A worldserver binds its port and only then
//!      registers with servers-registry; in that window Agones believes the
//!      server is good while the gateway cannot route anyone to it.
//!
//!   3. Nothing reports occupancy, so Agones has no idea how loaded a server
//!      is and a FleetAutoscaler has nothing to scale on.
//!
//! This binary fixes all three and is driven entirely by environment variables
//! so one image serves every game.

use std::time::Duration;

use anyhow::{Context, Result};
use tokio::net::TcpStream;

/// A readiness or liveness probe. TCP proves a port is bound; HTTP proves the
/// server answered, which for a server that registers with a service registry
/// after binding is the stronger signal of the two.
#[derive(Clone, Debug)]
enum Probe {
    Tcp { addr: String },
    Http { url: String },
}

impl Probe {
    async fn check(&self, client: &reqwest::Client) -> bool {
        match self {
            Probe::Tcp { addr } => {
                matches!(
                    tokio::time::timeout(Duration::from_secs(2), TcpStream::connect(addr)).await,
                    Ok(Ok(_))
                )
            }
            Probe::Http { url } => match client.get(url).send().await {
                Ok(resp) => resp.status().is_success(),
                Err(_) => false,
            },
        }
    }

    fn describe(&self) -> String {
        match self {
            Probe::Tcp { addr } => format!("tcp {addr}"),
            Probe::Http { url } => format!("http {url}"),
        }
    }
}

struct Config {
    /// Probes that must all pass before the GameServer is marked Ready.
    ready: Vec<Probe>,
    /// Probes polled for the lifetime of the server. Defaults to `ready`.
    live: Vec<Probe>,
    ready_interval: Duration,
    health_interval: Duration,
    /// Give up waiting for readiness after this long, and exit non-zero so
    /// Agones replaces the pod.
    ///
    /// This defaulted to zero -- wait forever -- which produced a failure with
    /// no symptom. When a worldserver died on startup on 2026-08-22 the shim
    /// kept probing a process that was never coming back; because the sidecar
    /// was still alive the pod stayed Running, so Agones left the GameServer in
    /// Scheduled and never replaced it. Two dead servers sat that way for over
    /// an hour with no restarts, no crashloop and nothing to alert on.
    ///
    /// A finite default is the safer wrong answer: a server slower than this
    /// gets recycled once and the deadline gets raised, which is noisy but
    /// visible. Zero is still honoured when set explicitly, for the rare server
    /// whose startup genuinely has no upper bound.
    ready_timeout: Duration,
    /// Optional Counter published to the GameServer status, sourced from a
    /// Prometheus text endpoint.
    counter: Option<CounterConfig>,
}

struct CounterConfig {
    /// Counter name, which must already exist in the GameServer spec — the SDK
    /// cannot create one.
    name: String,
    metrics_url: String,
    /// Metric to read out of the Prometheus text exposition.
    metric: String,
    interval: Duration,
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn env_secs(key: &str, default: u64) -> Duration {
    Duration::from_secs(
        env_opt(key)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(default),
    )
}

/// `8085` and `127.0.0.1:8085` both mean the same thing here; a bare port is
/// the common case and spelling out loopback every time is noise.
fn parse_tcp(value: &str) -> String {
    if value.contains(':') {
        value.to_string()
    } else {
        format!("127.0.0.1:{value}")
    }
}

fn probes_from(tcp_key: &str, http_key: &str) -> Vec<Probe> {
    let mut out = Vec::new();
    if let Some(v) = env_opt(tcp_key) {
        for part in v.split(',').map(str::trim).filter(|p| !p.is_empty()) {
            out.push(Probe::Tcp {
                addr: parse_tcp(part),
            });
        }
    }
    if let Some(v) = env_opt(http_key) {
        for part in v.split(',').map(str::trim).filter(|p| !p.is_empty()) {
            out.push(Probe::Http {
                url: part.to_string(),
            });
        }
    }
    out
}

impl Config {
    fn from_env() -> Result<Self> {
        let ready = probes_from("AGONES_SHIM_READY_TCP", "AGONES_SHIM_READY_HTTP");
        anyhow::ensure!(
            !ready.is_empty(),
            "set AGONES_SHIM_READY_TCP and/or AGONES_SHIM_READY_HTTP; \
             without a readiness probe this shim would mark the GameServer \
             Ready before the game server can accept anyone"
        );

        let mut live = probes_from("AGONES_SHIM_LIVE_TCP", "AGONES_SHIM_LIVE_HTTP");
        if live.is_empty() {
            live = ready.clone();
        }

        let counter = match (
            env_opt("AGONES_SHIM_COUNTER_NAME"),
            env_opt("AGONES_SHIM_COUNTER_METRICS_URL"),
            env_opt("AGONES_SHIM_COUNTER_METRIC"),
        ) {
            (Some(name), Some(metrics_url), Some(metric)) => Some(CounterConfig {
                name,
                metrics_url,
                metric,
                interval: env_secs("AGONES_SHIM_COUNTER_INTERVAL_SECS", 30),
            }),
            (None, None, None) => None,
            _ => anyhow::bail!(
                "AGONES_SHIM_COUNTER_NAME, _METRICS_URL and _METRIC must be set together"
            ),
        };

        Ok(Self {
            ready,
            live,
            ready_interval: env_secs("AGONES_SHIM_READY_INTERVAL_SECS", 5),
            health_interval: env_secs("AGONES_SHIM_HEALTH_INTERVAL_SECS", 5),
            ready_timeout: env_secs("AGONES_SHIM_READY_TIMEOUT_SECS", 900),
            counter,
        })
    }
}

/// Pull a single gauge out of Prometheus text exposition. Deliberately minimal:
/// the endpoints this reads expose bare `name value` lines, and pulling in a
/// full parser to read one number would not earn its dependency.
fn scrape_metric(body: &str, metric: &str) -> Option<i64> {
    for line in body.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let (name, value) = line.split_once(char::is_whitespace)?;
        // Ignore labels: `foo{a="b"} 1` still matches metric `foo`.
        let name = name.split('{').next().unwrap_or(name);
        if name == metric {
            return value.trim().parse::<f64>().ok().map(|v| v as i64);
        }
    }
    None
}

async fn wait_until_ready(cfg: &Config, client: &reqwest::Client) -> Result<()> {
    for p in &cfg.ready {
        tracing::info!(probe = %p.describe(), "waiting for readiness probe");
    }

    let started = std::time::Instant::now();
    loop {
        let mut all_ok = true;
        for p in &cfg.ready {
            if !p.check(client).await {
                all_ok = false;
                break;
            }
        }
        if all_ok {
            tracing::info!(
                elapsed_secs = started.elapsed().as_secs(),
                "all readiness probes passed"
            );
            return Ok(());
        }

        if !cfg.ready_timeout.is_zero() && started.elapsed() > cfg.ready_timeout {
            anyhow::bail!(
                "readiness probes did not pass within {}s",
                cfg.ready_timeout.as_secs()
            );
        }
        tokio::time::sleep(cfg.ready_interval).await;
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = Config::from_env()?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .context("building http client")?;

    // Degrade rather than fail when there is no sidecar, matching
    // apps/mc/mc_auth: the same image then runs under docker compose, where the
    // probes and counter scraping are still worth exercising, without Agones.
    //
    // The timeout is not optional. Sdk::new does not fail fast when nothing is
    // listening — it sits there — and every line below it, readiness included,
    // is behind it. Unbounded, a sidecar that starts slowly means this never
    // marks the GameServer Ready and Agones kills the pod at
    // initialDelaySeconds for a game server that was healthy all along.
    let connect_timeout = env_secs("AGONES_SHIM_SDK_CONNECT_TIMEOUT_SECS", 30);
    let mut sdk = match tokio::time::timeout(connect_timeout, agones::Sdk::new(None, None)).await {
        Ok(Ok(sdk)) => {
            tracing::info!("connected to the Agones SDK sidecar");
            Some(sdk)
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Agones SDK unavailable — probe-only mode (no Agones?)");
            None
        }
        Err(_) => {
            tracing::warn!(
                timeout_secs = connect_timeout.as_secs(),
                "Agones SDK did not answer — probe-only mode"
            );
            None
        }
    };

    // Start beating health immediately. Agones only enforces health after the
    // Fleet's initialDelaySeconds, but beating from the start means a server
    // that is slow to become Ready is never mistaken for a hung one.
    if let Some(sdk) = sdk.as_ref() {
        let health = sdk.health_check();
        let health_interval = cfg.health_interval;
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(health_interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticker.tick().await;
                if health.send(()).await.is_err() {
                    tracing::warn!("health channel closed — sidecar gone");
                    return;
                }
            }
        });
    }

    wait_until_ready(&cfg, &client).await?;
    if let Some(sdk) = sdk.as_mut() {
        sdk.ready().await.context("marking the GameServer Ready")?;
        tracing::info!("GameServer marked Ready");
    }

    if let (Some(c), Some(sdk)) = (&cfg.counter, sdk.as_ref()) {
        let mut beta = sdk.beta().clone();
        let client = client.clone();
        let (name, url, metric, interval) = (
            c.name.clone(),
            c.metrics_url.clone(),
            c.metric.clone(),
            c.interval,
        );
        tokio::spawn(async move {
            let mut last: Option<i64> = None;
            loop {
                tokio::time::sleep(interval).await;
                let scraped = match client.get(&url).send().await {
                    Ok(r) => match r.text().await {
                        Ok(body) => scrape_metric(&body, &metric),
                        Err(_) => None,
                    },
                    Err(_) => None,
                };
                // A failed scrape leaves the previous value in place. Reporting
                // zero because a metrics endpoint blipped would tell an
                // autoscaler the server had emptied.
                let Some(value) = scraped else {
                    tracing::debug!(metric = %metric, "scrape failed, keeping previous count");
                    continue;
                };
                if last == Some(value) {
                    continue;
                }
                match beta.set_counter_count(&name, value).await {
                    Ok(()) => {
                        tracing::info!(counter = %name, value, "counter updated");
                        last = Some(value);
                    }
                    // Most likely the Counter is not declared in the GameServer
                    // spec; the SDK cannot create one.
                    Err(e) => tracing::warn!(counter = %name, error = %e, "counter update failed"),
                }
            }
        });
    }

    let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .context("installing SIGTERM handler")?;
    let mut sigint = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())
        .context("installing SIGINT handler")?;

    let mut liveness = tokio::time::interval(cfg.health_interval);
    liveness.tick().await;

    loop {
        tokio::select! {
            _ = sigterm.recv() => {
                tracing::info!("SIGTERM received, shutting the GameServer down");
                break;
            }
            _ = sigint.recv() => {
                tracing::info!("SIGINT received, shutting the GameServer down");
                break;
            }
            _ = liveness.tick() => {
                let mut alive = true;
                for p in &cfg.live {
                    if !p.check(&client).await {
                        tracing::error!(probe = %p.describe(), "liveness probe failed");
                        alive = false;
                        break;
                    }
                }
                if !alive {
                    // Stop beating health and let Agones replace the pod. Calling
                    // Shutdown() here would report a clean exit for a server that
                    // actually died.
                    tracing::error!("game server is gone, exiting without Shutdown()");
                    std::process::exit(1);
                }
            }
        }
    }

    // The point of the whole exercise: tell Agones this was deliberate, so it
    // stops routing here and the pod's grace period is spent letting the game
    // server flush rather than waiting to be killed.
    if let Some(sdk) = sdk.as_mut() {
        if let Err(e) = sdk.shutdown().await {
            tracing::warn!(error = %e, "Shutdown() failed");
        } else {
            tracing::info!("GameServer marked Shutdown");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrapes_a_bare_gauge() {
        // The shape libsidecar actually emits.
        let body = "active_connections 7\ndelay_mean 14\n";
        assert_eq!(scrape_metric(body, "active_connections"), Some(7));
        assert_eq!(scrape_metric(body, "delay_mean"), Some(14));
    }

    #[test]
    fn ignores_help_and_type_lines() {
        let body = "# HELP active_connections The number of active connections\n\
                    # TYPE active_connections gauge\n\
                    active_connections 3\n";
        assert_eq!(scrape_metric(body, "active_connections"), Some(3));
    }

    #[test]
    fn matches_a_labelled_metric() {
        let body = "players{realm=\"1\"} 42\n";
        assert_eq!(scrape_metric(body, "players"), Some(42));
    }

    #[test]
    fn truncates_floats_rather_than_failing() {
        // Prometheus gauges are floats; a Counter is an integer.
        let body = "players 12.0\n";
        assert_eq!(scrape_metric(body, "players"), Some(12));
    }

    #[test]
    fn returns_none_for_a_missing_metric() {
        assert_eq!(scrape_metric("other 1\n", "players"), None);
    }

    #[test]
    fn bare_port_becomes_loopback() {
        assert_eq!(parse_tcp("8085"), "127.0.0.1:8085");
        assert_eq!(parse_tcp("10.0.0.1:8085"), "10.0.0.1:8085");
    }
}
