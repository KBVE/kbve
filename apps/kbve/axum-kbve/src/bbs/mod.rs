mod chat;
pub mod claim;
mod door;
mod games;
mod post;
mod presence;
mod render;
mod session;
mod telnet;
#[cfg(test)]
mod tests;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Semaphore;

use render::Term;
use session::Session;
use telnet::TelnetConn;

pub use presence::count as online_count;

const DEFAULT_PETSCII_ADDR: &str = "0.0.0.0:6400";
const DEFAULT_ANSI_ADDR: &str = "0.0.0.0:6401";
const DEFAULT_MAX_SESSIONS: usize = 64;
const DEFAULT_IDLE_SECS: u64 = 600;
const DEFAULT_AUTHED_IDLE_SECS: u64 = 14400;
const DEFAULT_KEEPALIVE_SECS: u64 = 60;
const NEGOTIATION_WINDOW: Duration = Duration::from_millis(400);

/// How often a silent link is nudged, at both the TCP and the telnet layer.
/// Home NAT and cloud load balancers reap idle flows well inside the hour a
/// signed-in caller is allowed, so without this the leash granted at login was
/// longer than the connection underneath it could survive. `0` disables it.
pub(super) fn keepalive() -> Duration {
    static VALUE: std::sync::OnceLock<Duration> = std::sync::OnceLock::new();
    *VALUE.get_or_init(|| {
        Duration::from_secs(
            std::env::var("BBS_KEEPALIVE_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(DEFAULT_KEEPALIVE_SECS),
        )
    })
}

/// Keep the kernel probing too. The telnet heartbeat only fires while a
/// session is parked in a read; this covers the gaps and gives the socket a
/// death certificate the read loop can act on.
fn tune_socket(stream: &TcpStream) {
    let _ = stream.set_nodelay(true);
    let ka = keepalive();
    if ka.is_zero() {
        return;
    }
    let sock = socket2::SockRef::from(stream);
    if sock.set_keepalive(true).is_err() {
        return;
    }
    #[cfg(any(target_os = "linux", target_os = "android", target_vendor = "apple"))]
    {
        let params = socket2::TcpKeepalive::new()
            .with_time(ka)
            .with_interval(ka / 4);
        let _ = sock.set_tcp_keepalive(&params);
    }
}

/// How long a signed-in caller may sit idle. Guests keep the shorter
/// allowance so anonymous connections cannot squat the session slots.
pub(super) fn authed_idle() -> Duration {
    static VALUE: std::sync::OnceLock<Duration> = std::sync::OnceLock::new();
    *VALUE.get_or_init(|| {
        Duration::from_secs(
            std::env::var("BBS_AUTHED_IDLE_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(DEFAULT_AUTHED_IDLE_SECS),
        )
    })
}

fn env_flag(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(default)
}

fn env_addr(key: &str, default: &str) -> Option<SocketAddr> {
    let raw = std::env::var(key).unwrap_or_else(|_| default.to_string());
    match raw.parse() {
        Ok(addr) => Some(addr),
        Err(e) => {
            tracing::warn!(key, value = %raw, error = %e, "[bbs] invalid listen address, skipping");
            None
        }
    }
}

/// Bind the PETSCII and ANSI telnet frontends unless `BBS_ENABLED` turns them off.
pub fn init_bbs() -> bool {
    if !env_flag("BBS_ENABLED", true) {
        tracing::info!("[bbs] disabled via BBS_ENABLED");
        return false;
    }

    let max_sessions = std::env::var("BBS_MAX_SESSIONS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MAX_SESSIONS);
    let idle = Duration::from_secs(
        std::env::var("BBS_IDLE_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_IDLE_SECS),
    );
    let permits = Arc::new(Semaphore::new(max_sessions));
    chat::init_chat();

    let mut bound = false;
    for (key, default, term) in [
        ("BBS_PETSCII_ADDR", DEFAULT_PETSCII_ADDR, Term::Petscii),
        ("BBS_ANSI_ADDR", DEFAULT_ANSI_ADDR, Term::Ansi),
    ] {
        let Some(addr) = env_addr(key, default) else {
            continue;
        };
        bound = true;
        let permits = permits.clone();
        tokio::spawn(async move { listen(addr, term, permits, idle).await });
    }
    bound
}

async fn listen(addr: SocketAddr, term: Term, permits: Arc<Semaphore>, idle: Duration) {
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(%addr, error = %e, "[bbs] bind failed");
            return;
        }
    };
    tracing::info!(%addr, ?term, "[bbs] listening");

    loop {
        let (stream, peer) = match listener.accept().await {
            Ok(pair) => pair,
            Err(e) => {
                tracing::warn!(%addr, error = %e, "[bbs] accept failed");
                tokio::time::sleep(Duration::from_millis(250)).await;
                continue;
            }
        };
        tune_socket(&stream);

        let Ok(permit) = permits.clone().try_acquire_owned() else {
            tracing::debug!(%peer, "[bbs] rejecting caller, board full");
            let mut conn = TelnetConn::new(stream, idle);
            let _ = conn.write(b"\r\nBOARD FULL - TRY LATER\r\n").await;
            conn.shutdown().await;
            continue;
        };

        tokio::spawn(async move {
            let _permit = permit;
            if let Err(e) = serve(stream, term, idle).await {
                tracing::debug!(%peer, error = ?e, "[bbs] session ended");
            }
        });
    }
}

async fn serve(
    stream: TcpStream,
    default_term: Term,
    idle: Duration,
) -> Result<(), telnet::ReadError> {
    let mut conn = TelnetConn::new(stream, idle);
    conn.negotiate().await.map_err(telnet::ReadError::Io)?;
    conn.drain_negotiation(NEGOTIATION_WINDOW).await;

    let term = resolve_term(default_term, conn.term_type.as_deref());
    let (width, height) = window_for(&conn, term);
    let mut session = Session::new(conn, term, width, height);
    let result = session.run().await;
    session.close().await;
    result
}

/// Plenty of clients never send NAWS. Falling back to the PETSCII 40x25 for
/// those left ANSI callers reading a C64-shaped board on a modern terminal, so
/// pick the fallback from the terminal they actually are.
fn window_for(conn: &TelnetConn, term: Term) -> (usize, usize) {
    if conn.naws_seen {
        return (conn.width as usize, conn.height as usize);
    }
    match term {
        Term::Ansi => (80, 24),
        Term::Petscii => (40, 25),
    }
}

fn resolve_term(default_term: Term, term_type: Option<&str>) -> Term {
    let Some(name) = term_type else {
        return default_term;
    };
    if name.contains("PETSCII") || name.contains("C64") || name.contains("CBM") {
        return Term::Petscii;
    }
    if name.contains("ANSI")
        || name.contains("VT")
        || name.contains("XTERM")
        || name.contains("SYNCTERM")
        || name.contains("SCREEN")
    {
        return Term::Ansi;
    }
    default_term
}
