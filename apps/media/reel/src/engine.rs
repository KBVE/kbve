use crate::{config, mover, state};
use std::collections::HashMap;
use std::net::IpAddr;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, ManagedTorrent, Session, SessionPersistenceConfig};
use tokio::io::{AsyncRead, AsyncSeek};
use tokio::sync::Notify;

pub fn is_vpn_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified())
        }
        IpAddr::V6(v6) => {
            let octets = v6.octets();
            let is_unique_local = octets[0] & 0xfe == 0xfc;
            let is_link_local = octets[0] == 0xfe && octets[1] & 0xc0 == 0x80;
            !(v6.is_loopback() || v6.is_unspecified() || is_unique_local || is_link_local)
        }
    }
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default()
    })
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum VpnStatus {
    Confirmed(IpAddr),
    Leak(IpAddr),
    Unverified,
}

async fn probe_ip(url: &str) -> Option<IpAddr> {
    let body = http_client()
        .get(url)
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    body.trim().parse().ok()
}

pub async fn vpn_status(urls: &[String]) -> VpnStatus {
    for url in urls {
        if let Some(ip) = probe_ip(url).await {
            return if is_vpn_ip(ip) {
                VpnStatus::Confirmed(ip)
            } else {
                VpnStatus::Leak(ip)
            };
        }
    }
    VpnStatus::Unverified
}

pub fn decide_vpn(status: VpnStatus, prev_ok: bool, streak: u32, _threshold: u32) -> (bool, u32) {
    match status {
        VpnStatus::Confirmed(_) => (true, 0),
        VpnStatus::Leak(_) => (false, 0),
        // Unverified means the check endpoints were unreachable — NOT that the
        // tunnel leaked. Under heavy download the probes compete for tunnel
        // bandwidth and time out, so pausing here would falsely drop every peer
        // and thrash the swarm. Hold the previous state and lean on the gluetun
        // killswitch (which blocks all non-tunnel egress) as the real barrier;
        // only a Confirmed leak (a real non-VPN egress IP) forces a pause.
        VpnStatus::Unverified => (prev_ok, streak.saturating_add(1)),
    }
}

pub fn parse_forwarded_port(raw: &str) -> Option<u16> {
    match raw.trim().parse::<u16>() {
        Ok(p) if p != 0 => Some(p),
        _ => None,
    }
}

async fn await_forwarded_port(
    path: &std::path::Path,
    wait_secs: u64,
    stable_secs: u64,
) -> Option<u16> {
    let mut waited = 0u64;
    let mut current = loop {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Some(port) = parse_forwarded_port(&raw) {
                break port;
            }
        }
        if waited >= wait_secs {
            return None;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        waited += 1;
    };
    let mut steady = 0u64;
    let cap = stable_secs.saturating_mul(2);
    let mut elapsed = 0u64;
    while steady < stable_secs && elapsed < cap {
        tokio::time::sleep(Duration::from_secs(1)).await;
        elapsed += 1;
        match std::fs::read_to_string(path)
            .ok()
            .and_then(|r| parse_forwarded_port(&r))
        {
            Some(p) if p == current => steady += 1,
            Some(p) => {
                tracing::info!(
                    from = current,
                    to = p,
                    "forwarded port changed during startup; re-stabilizing"
                );
                current = p;
                steady = 0;
            }
            None => steady = 0,
        }
    }
    Some(current)
}

pub async fn forwarded_port_watch_loop(
    engine: Engine,
    interval_secs: u64,
    restart: Arc<Notify>,
    restart_on_change: bool,
) {
    if engine.bt_port_file.is_none() {
        return;
    }
    let interval = Duration::from_secs(interval_secs.max(5));
    let started = now_secs();
    let mut last_forwarded: Option<u16> = engine.forwarded_port();
    let mut rotations = 0u64;
    let mut mismatches = 0u32;
    tracing::info!(
        initial = ?last_forwarded,
        restart_on_change,
        "forwarded-port watcher started (observe mode: logs rotation rate without tearing down the session)"
    );
    loop {
        tokio::time::sleep(interval).await;
        let forwarded = engine.forwarded_port();
        if forwarded != last_forwarded {
            rotations = engine.port_rotations.fetch_add(1, Ordering::Relaxed) + 1;
            let elapsed = now_secs().saturating_sub(started).max(1);
            let per_hour = (rotations as f64) * 3600.0 / (elapsed as f64);
            tracing::warn!(
                from = ?last_forwarded,
                to = ?forwarded,
                rotations,
                elapsed_secs = elapsed,
                rotations_per_hour = per_hour,
                "vpn_forwarded_port_rotated: Proton changed the NAT-PMP forwarded port"
            );
            last_forwarded = forwarded;
        }
        if !restart_on_change {
            continue;
        }
        match (forwarded, engine.bt_listen_port()) {
            (Some(f), Some(listen)) if f != listen => {
                mismatches += 1;
                tracing::warn!(
                    forwarded = f,
                    listen,
                    mismatches,
                    "VPN forwarded port no longer matches BitTorrent listener"
                );
                if mismatches >= 2 {
                    tracing::warn!(
                        forwarded = f,
                        listen,
                        "vpn_forwarded_port_changed: restarting to rebind listener to the forwarded port"
                    );
                    restart.notify_one();
                    return;
                }
            }
            _ => mismatches = 0,
        }
    }
}

pub async fn vpn_preflight(urls: &[String]) -> anyhow::Result<IpAddr> {
    for attempt in 0..5u32 {
        match vpn_status(urls).await {
            VpnStatus::Confirmed(ip) => return Ok(ip),
            VpnStatus::Leak(ip) => {
                anyhow::bail!("egress ip {ip} is not a public/vpn address; refusing to start")
            }
            VpnStatus::Unverified => {
                tracing::warn!(
                    attempt,
                    "vpn preflight: no check endpoint reachable; retrying"
                );
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
    }
    anyhow::bail!("vpn preflight failed: no check endpoint reachable after retries")
}

use crate::util::now_secs;

static ADD_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_subdir() -> String {
    let n = ADD_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos}-{n}")
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum VpnAction {
    None,
    Pause,
    Resume,
}

pub fn next_vpn_action(prev_ok: bool, now_ok: bool) -> VpnAction {
    match (prev_ok, now_ok) {
        (true, false) => VpnAction::Pause,
        (false, true) => VpnAction::Resume,
        _ => VpnAction::None,
    }
}

#[derive(Clone)]
pub struct Engine {
    session: Arc<Session>,
    store: state::StateStore,
    active_dir: PathBuf,
    library_dir: PathBuf,
    vpn_check_urls: Vec<String>,
    vpn_leak_threshold: u32,
    vpn_ok: Arc<AtomicBool>,
    vpn_fail_streak: Arc<AtomicU32>,
    active_leech: Arc<Mutex<HashMap<String, u32>>>,
    drain: Arc<Notify>,
    metadata_timeout: Duration,
    stall_timeout: Duration,
    stall_connected_timeout: Duration,
    stall_check: Duration,
    stall_recovery_attempts: u32,
    trackers: Arc<Mutex<Arc<Vec<String>>>>,
    bt_port_file: Option<PathBuf>,
    transcode_wake: Arc<Notify>,
    port_rotations: Arc<AtomicU64>,
}

const LEECH_DRAIN_CAP: Duration = Duration::from_secs(6 * 3600);

pub fn is_stalled(
    prev_bytes: u64,
    cur_bytes: u64,
    idle_secs: u64,
    stall_timeout_secs: u64,
) -> bool {
    cur_bytes <= prev_bytes && idle_secs >= stall_timeout_secs
}

/// Peers connected but sending nothing is a choke or a dead-but-not-yet-timed-out
/// socket, not an empty swarm — give those the longer budget so a re-dial has a
/// chance before we call the download lost.
pub fn stall_budget_secs(peers_live: usize, dry_secs: u64, connected_secs: u64) -> u64 {
    if peers_live > 0 {
        connected_secs.max(dry_secs)
    } else {
        dry_secs
    }
}

#[derive(serde::Serialize)]
pub struct TorrentLive {
    pub id: String,
    pub progress_bytes: u64,
    pub total_bytes: u64,
    pub finished: bool,
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub peers_live: usize,
    pub peers_seen: usize,
    pub peers_connecting: usize,
}

fn magnet_with_trackers(source: &str, trackers: &[String]) -> String {
    if trackers.is_empty() {
        return source.to_string();
    }
    match url::Url::parse(source) {
        Ok(mut u) => {
            {
                let mut qp = u.query_pairs_mut();
                for t in trackers {
                    qp.append_pair("tr", t);
                }
            }
            u.to_string()
        }
        Err(_) => source.to_string(),
    }
}

fn leeching_meta(id: &str, name: &str, out_dir: &std::path::Path) -> state::Metadata {
    state::Metadata {
        id: id.to_string(),
        name: name.to_string(),
        path: String::new(),
        size: 0,
        completed_at: None,
        last_access: now_secs(),
        state: state::TorrentState::Leeching,
        error: None,
        active_path: Some(out_dir.to_string_lossy().into_owned()),
        transcode: state::TranscodeStatus::None,
        transcode_path: None,
        transcode_error: None,
        hls: state::HlsStatus::None,
        hls_dir: None,
        hls_error: None,
    }
}

impl Engine {
    pub async fn start(cfg: &config::Config, store: state::StateStore) -> anyhow::Result<Self> {
        let ip = vpn_preflight(&cfg.vpn_check_urls).await?;
        tracing::info!(%ip, "vpn preflight ok");
        std::fs::create_dir_all(&cfg.active_dir)?;
        std::fs::create_dir_all(&cfg.library_dir)?;
        std::fs::create_dir_all(&cfg.session_dir)?;
        let listen_port_range = match &cfg.bt_port_file {
            Some(path) => {
                match await_forwarded_port(path, cfg.bt_port_wait_secs, cfg.bt_port_stable_secs)
                    .await
                {
                    Some(port) => {
                        tracing::info!(port, "using VPN forwarded port for BitTorrent listener");
                        Some(port..port.saturating_add(1))
                    }
                    None => {
                        tracing::warn!(
                            path = %path.display(),
                            "forwarded-port file not ready; BitTorrent listener uses a random port (no inbound peers)"
                        );
                        None
                    }
                }
            }
            None => None,
        };
        // Inbound peers are unreachable behind the VPN (no port forwarding), so
        // the swarm is outbound-only — tune peering to make the most of it: try
        // more peers without hanging on dead ones, hold quiet-but-alive peers
        // instead of dropping them, and send keepalives so we aren't dropped.
        let peer_opts = Some(librqbit::PeerConnectionOptions {
            connect_timeout: (cfg.peer_connect_timeout_secs > 0)
                .then(|| Duration::from_secs(cfg.peer_connect_timeout_secs)),
            read_write_timeout: (cfg.peer_read_write_timeout_secs > 0)
                .then(|| Duration::from_secs(cfg.peer_read_write_timeout_secs)),
            keep_alive_interval: (cfg.peer_keepalive_secs > 0)
                .then(|| Duration::from_secs(cfg.peer_keepalive_secs)),
        });
        let opts = librqbit::SessionOptions {
            fastresume: true,
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(cfg.session_dir.clone()),
            }),
            ratelimits: librqbit::limits::LimitsConfig {
                upload_bps: cfg.upload_limit_bps.and_then(std::num::NonZeroU32::new),
                download_bps: None,
            },
            peer_opts,
            listen_port_range,
            enable_upnp_port_forwarding: false,
            ..Default::default()
        };
        if let Some(bps) = opts.ratelimits.upload_bps {
            tracing::info!(upload_bps = bps.get(), "seeding upload rate limit enabled");
        }
        let session = Session::new_with_opts(cfg.active_dir.clone(), opts).await?;
        let engine = Self {
            session,
            store,
            active_dir: cfg.active_dir.clone(),
            library_dir: cfg.library_dir.clone(),
            vpn_check_urls: cfg.vpn_check_urls.clone(),
            vpn_leak_threshold: cfg.vpn_leak_threshold,
            vpn_ok: Arc::new(AtomicBool::new(true)),
            vpn_fail_streak: Arc::new(AtomicU32::new(0)),
            active_leech: Arc::new(Mutex::new(HashMap::new())),
            drain: Arc::new(Notify::new()),
            metadata_timeout: Duration::from_secs(cfg.metadata_timeout_secs),
            stall_timeout: Duration::from_secs(cfg.stall_timeout_secs),
            stall_connected_timeout: Duration::from_secs(cfg.stall_connected_timeout_secs),
            stall_check: Duration::from_secs(cfg.stall_check_secs.max(1)),
            stall_recovery_attempts: cfg.stall_recovery_attempts,
            trackers: Arc::new(Mutex::new(Arc::new(seed_trackers(
                &cfg.trackers_cache,
                &cfg.extra_trackers,
            )))),
            bt_port_file: cfg.bt_port_file.clone(),
            transcode_wake: Arc::new(Notify::new()),
            port_rotations: Arc::new(AtomicU64::new(0)),
        };
        engine.resume_on_start();
        Ok(engine)
    }

    pub fn vpn_ok(&self) -> bool {
        self.vpn_ok.load(Ordering::Relaxed)
    }

    /// Notified whenever a torrent finishes and becomes Seeding, so an
    /// auto-transcode worker can turn it into a playable file without the user
    /// asking. Also fire once at startup to catch resumed Seeding items.
    pub fn transcode_wake(&self) -> Arc<Notify> {
        self.transcode_wake.clone()
    }

    fn all_handles(&self) -> Vec<Arc<ManagedTorrent>> {
        self.session
            .with_torrents(|it| it.map(|(_, h)| h.clone()).collect())
    }

    pub async fn vpn_recheck(&self) -> bool {
        let status = vpn_status(&self.vpn_check_urls).await;
        let prev_ok = self.vpn_ok.load(Ordering::Relaxed);
        let streak = self.vpn_fail_streak.load(Ordering::Relaxed);
        let (now_ok, new_streak) = decide_vpn(status, prev_ok, streak, self.vpn_leak_threshold);
        self.vpn_fail_streak.store(new_streak, Ordering::Relaxed);
        if matches!(status, VpnStatus::Unverified) && !now_ok && prev_ok {
            tracing::warn!(
                streak = new_streak,
                "vpn check unverified past threshold; pausing"
            );
        }
        match next_vpn_action(prev_ok, now_ok) {
            VpnAction::Pause => {
                crate::telemetry::vpn_leak();
                for h in self.all_handles() {
                    if let Err(e) = self.session.pause(&h).await {
                        tracing::warn!(error = %e, "torrent pause failed");
                    }
                }
            }
            VpnAction::Resume => {
                crate::telemetry::vpn_restored();
                for h in self.all_handles() {
                    if let Err(e) = self.session.unpause(&h).await {
                        tracing::warn!(error = %e, "torrent unpause failed");
                    }
                }
            }
            VpnAction::None => {}
        }
        self.vpn_ok.store(now_ok, Ordering::Relaxed);
        now_ok
    }

    fn already_active(&self, id: &str) -> bool {
        is_active_state(self.store.get(id).map(|m| m.state))
    }

    pub async fn add(&self, source: &str) -> anyhow::Result<String> {
        if !self.vpn_ok() {
            anyhow::bail!("vpn egress unavailable; refusing to add torrent");
        }
        let out_dir = self.active_dir.join(unique_subdir());
        let trackers = self.trackers.lock().unwrap().clone();
        let opts = AddTorrentOptions {
            output_folder: Some(out_dir.to_string_lossy().into_owned()),
            trackers: (!trackers.is_empty()).then(|| (*trackers).clone()),
            ..Default::default()
        };

        // librqbit's add_torrent() blocks until it resolves metadata from
        // peers, which hangs indefinitely for a magnet with no live seeders.
        // A magnet already carries its info_hash, so register it immediately
        // and resolve in the background — the watcher marks it Failed if
        // metadata never arrives, instead of hanging the HTTP request.
        if let Some((id, name)) = librqbit::Magnet::parse(source)
            .ok()
            .and_then(|m| m.as_id20().map(|h| (h.as_string(), m.name.clone())))
        {
            let name = name.unwrap_or_else(|| id.clone());
            if self.already_active(&id) {
                tracing::info!(id = %id, "add ignored: torrent already active (idempotent)");
                return Ok(id);
            }
            self.store.upsert(leeching_meta(&id, &name, &out_dir))?;
            crate::telemetry::torrent_added(&id, "magnet");
            let this = self.clone();
            let source = magnet_with_trackers(source, trackers.as_slice());
            let (id_bg, name_bg) = (id.clone(), name);
            tokio::spawn(async move {
                this.resolve_and_watch(source, opts, out_dir, id_bg, name_bg)
                    .await;
            });
            return Ok(id);
        }

        // Non-magnet source (http/https .torrent URL): resolve inline, but
        // bounded so the request can't hang forever.
        let resp = match tokio::time::timeout(
            self.metadata_timeout,
            self.session
                .add_torrent(AddTorrent::from_url(source), Some(opts)),
        )
        .await
        {
            Ok(r) => r?,
            Err(_) => anyhow::bail!("timed out resolving torrent metadata"),
        };
        let handle = resp
            .into_handle()
            .ok_or_else(|| anyhow::anyhow!("torrent is list-only, no handle"))?;
        let id = handle.info_hash().as_string();
        if self.already_active(&id) {
            let _ = std::fs::remove_dir_all(&out_dir);
            tracing::info!(id = %id, "add ignored: torrent already active (idempotent)");
            return Ok(id);
        }
        let name = handle.name().unwrap_or_else(|| id.clone());
        self.store.upsert(leeching_meta(&id, &name, &out_dir))?;
        crate::telemetry::torrent_added(&id, "url");
        self.spawn_completion_watcher(handle, out_dir, id.clone(), name);
        Ok(id)
    }

    async fn resolve_and_watch(
        &self,
        source: String,
        opts: AddTorrentOptions,
        out_dir: PathBuf,
        id: String,
        name: String,
    ) {
        match tokio::time::timeout(
            self.metadata_timeout,
            self.session.add_torrent(AddTorrent::from_url(&source), Some(opts)),
        )
        .await
        {
            Ok(Ok(resp)) => match resp.into_handle() {
                Some(handle) => self.spawn_completion_watcher(handle, out_dir, id, name),
                None => self.mark_failed(&id, "torrent is list-only, no handle"),
            },
            Ok(Err(e)) => self.mark_failed(&id, &format!("could not add torrent: {e}")),
            Err(_) => self.mark_failed(
                &id,
                &format!(
                    "could not resolve torrent metadata within {}s — no peers responded (dead magnet or unreachable trackers)",
                    self.metadata_timeout.as_secs()
                ),
            ),
        }
    }

    fn mark_failed(&self, id: &str, reason: &str) {
        crate::telemetry::torrent_failed(id, "metadata", reason);
        let _ = self.store.update(id, |m| {
            m.state = state::TorrentState::Failed;
            m.error = Some(reason.to_string());
            ((), true)
        });
    }

    fn spawn_completion_watcher(
        &self,
        handle: Arc<ManagedTorrent>,
        out_dir: PathBuf,
        id: String,
        name: String,
    ) {
        let store = self.store.clone();
        let library_dir = self.library_dir.clone();
        let session = self.session.clone();
        let active_leech = self.active_leech.clone();
        let drain = self.drain.clone();
        let transcode_wake = self.transcode_wake.clone();
        let metadata_timeout = self.metadata_timeout;
        let stall_timeout = self.stall_timeout;
        let stall_connected_timeout = self.stall_connected_timeout;
        let stall_check = self.stall_check;
        let stall_recovery_attempts = self.stall_recovery_attempts;
        let vpn_ok = self.vpn_ok.clone();
        tokio::spawn(async move {
            match tokio::time::timeout(metadata_timeout, handle.wait_until_initialized()).await {
                Err(_) => {
                    let reason = format!(
                        "could not resolve torrent metadata within {}s — no peers responded (dead magnet or unreachable trackers)",
                        metadata_timeout.as_secs()
                    );
                    crate::telemetry::torrent_failed(&id, "metadata", &reason);
                    let _ = store.update(&id, |m| {
                        m.state = state::TorrentState::Failed;
                        m.error = Some(reason);
                        ((), true)
                    });
                    delete_from_session(&session, &id, true).await;
                    return;
                }
                Ok(Err(e)) => {
                    let reason = format!("metadata resolution failed: {e}");
                    crate::telemetry::torrent_failed(&id, "metadata", &reason);
                    let _ = store.update(&id, |m| {
                        m.state = state::TorrentState::Failed;
                        m.error = Some(reason);
                        ((), true)
                    });
                    delete_from_session(&session, &id, true).await;
                    return;
                }
                Ok(Ok(())) => {}
            }

            let completed = handle.wait_until_completed();
            tokio::pin!(completed);
            let mut last_bytes = 0u64;
            let mut idle_secs = 0u64;
            let mut recoveries = 0u32;
            let outcome: anyhow::Result<()> = loop {
                tokio::select! {
                    r = &mut completed => break r,
                    _ = tokio::time::sleep(stall_check) => {
                        let s = handle.stats();
                        let (dl_mbps, peers_live, peers_seen, peers_connecting) = s
                            .live
                            .as_ref()
                            .map(|l| {
                                (
                                    l.download_speed.mbps,
                                    l.snapshot.peer_stats.live,
                                    l.snapshot.peer_stats.seen,
                                    l.snapshot.peer_stats.connecting,
                                )
                            })
                            .unwrap_or((0.0, 0, 0, 0));
                        tracing::debug!(
                            id = %id,
                            progress_bytes = s.progress_bytes,
                            total_bytes = s.total_bytes,
                            peers_live,
                            peers_seen,
                            peers_connecting,
                            dl_mbps,
                            idle_secs,
                            recoveries,
                            "leech heartbeat"
                        );
                        if s.finished {
                            break Ok(());
                        }
                        if !vpn_ok.load(Ordering::Relaxed) {
                            idle_secs = 0;
                            continue;
                        }
                        if s.progress_bytes > last_bytes {
                            last_bytes = s.progress_bytes;
                            idle_secs = 0;
                        } else {
                            idle_secs = idle_secs.saturating_add(stall_check.as_secs());
                        }
                        let budget = stall_budget_secs(
                            peers_live,
                            stall_timeout.as_secs(),
                            stall_connected_timeout.as_secs(),
                        );
                        if is_stalled(last_bytes, s.progress_bytes, idle_secs, budget) {
                            if recoveries < stall_recovery_attempts {
                                recoveries += 1;
                                tracing::warn!(
                                    id = %id,
                                    attempt = recoveries,
                                    of = stall_recovery_attempts,
                                    idle_secs,
                                    peers_live,
                                    peers_seen,
                                    "leech stalled; re-dialing swarm"
                                );
                                crate::telemetry::torrent_stall_recovery(&id, recoveries);
                                redial_swarm(&session, &handle, &id).await;
                                idle_secs = 0;
                                continue;
                            }
                            break Err(anyhow::anyhow!(
                                "no data received for {budget}s after {recoveries} re-dial attempts \
                                 (peers live={peers_live} seen={peers_seen} connecting={peers_connecting}) \
                                 — swarm unreachable, partial data kept for retry"
                            ));
                        }
                    }
                }
            };
            if let Err(e) = outcome {
                crate::telemetry::torrent_failed(&id, "download", &e.to_string());
                let _ = store.update(&id, |m| {
                    m.state = state::TorrentState::Failed;
                    m.error = Some(format!("download failed: {e}"));
                    ((), true)
                });
                // Keep the partial payload: re-adding the same magnet resumes
                // from it instead of re-fetching everything. The reaper still
                // clears it once the TTL expires.
                delete_from_session(&session, &id, false).await;
                return;
            }
            // Stop uploading the moment the download lands. The torrent is
            // dropped from the session further down, but the HLS settle, the
            // move, and the stream drain in between can take hours — we don't
            // seed through them. Both the raw stream and the live HLS encoder
            // read the file directly, so a paused torrent never interrupts
            // either one.
            if let Err(e) = session.pause(&handle).await {
                tracing::debug!(id = %id, error = %e, "pause after completion failed");
            }
            // If a live (popcorn) HLS job was serving this download, let it
            // finalize before we relocate the directory — a completed HLS can be
            // reused as the deliverable instead of re-encoding the whole file.
            let had_live = matches!(
                store.get(&id).map(|m| m.hls),
                Some(state::HlsStatus::Starting | state::HlsStatus::Live)
            );
            if had_live {
                wait_hls_settle(&store, &id, LEECH_DRAIN_CAP).await;
            }
            match mover::move_completed(&out_dir, &library_dir) {
                Ok(moved) => {
                    let now = now_secs();
                    crate::telemetry::torrent_completed(&id, moved.size);
                    let hls_dir = moved.dest.join("hls");
                    let adopt = had_live
                        && matches!(store.get(&id).map(|m| m.hls), Some(state::HlsStatus::Ready))
                        && live_hls_complete(&hls_dir);
                    if adopt {
                        // Reuse the HLS produced during download; drop the source
                        // video (HLS is the deliverable) but keep subtitles/poster.
                        if let Ok(src) = crate::transcode::pick_primary_file(&moved.dest) {
                            if let Err(e) = std::fs::remove_file(&src) {
                                tracing::warn!(id = %id, path = %src.display(), error = %e, "adopt: source remove failed");
                            }
                        }
                        let _ = store.upsert(state::Metadata {
                            id: id.clone(),
                            name,
                            path: moved.dest.display().to_string(),
                            size: moved.size,
                            completed_at: Some(now),
                            last_access: now,
                            state: state::TorrentState::Seeding,
                            error: None,
                            active_path: None,
                            transcode: state::TranscodeStatus::Ready,
                            transcode_path: None,
                            transcode_error: None,
                            hls: state::HlsStatus::Ready,
                            hls_dir: Some(hls_dir.display().to_string()),
                            hls_error: None,
                        });
                        crate::telemetry::live_hls_adopted(&id, &hls_dir.display().to_string());
                    } else {
                        let _ = store.upsert(state::Metadata {
                            id: id.clone(),
                            name,
                            path: moved.dest.display().to_string(),
                            size: moved.size,
                            completed_at: Some(now),
                            last_access: now,
                            state: state::TorrentState::Seeding,
                            error: None,
                            active_path: None,
                            transcode: state::TranscodeStatus::None,
                            transcode_path: None,
                            transcode_error: None,
                            hls: state::HlsStatus::None,
                            hls_dir: None,
                            hls_error: None,
                        });
                        transcode_wake.notify_one();
                    }
                    wait_leech_drained(&active_leech, &drain, &id).await;
                    delete_from_session(&session, &id, false).await;
                }
                Err(e) => {
                    crate::telemetry::torrent_failed(&id, "move", &e.to_string());
                    let _ = store.update(&id, |m| {
                        m.state = state::TorrentState::Failed;
                        m.error = Some(format!("move failed: {e}"));
                        ((), true)
                    });
                    delete_from_session(&session, &id, true).await;
                }
            }
        });
    }

    fn resume_on_start(&self) {
        for m in self.store.list() {
            if !needs_resume_watch(&m.state) {
                continue;
            }
            match (self.handle(&m.id), m.active_path.clone()) {
                (Some(handle), Some(active_path)) => {
                    self.spawn_completion_watcher(
                        handle,
                        PathBuf::from(active_path),
                        m.id.clone(),
                        m.name.clone(),
                    );
                    crate::telemetry::torrent_added(&m.id, "resume");
                }
                _ => {
                    let _ = self.store.update(&m.id, |m| {
                        m.state = state::TorrentState::Failed;
                        m.error = Some("interrupted by restart; not restored".into());
                        ((), true)
                    });
                    crate::telemetry::reconcile_failed(&m.id, &m.name);
                }
            }
        }
    }

    pub async fn delete(&self, id: &str) -> anyhow::Result<bool> {
        let removed = self.store.remove(id)?;
        if let Ok(tid) = TorrentIdOrHash::parse(id) {
            let _ = self.session.delete(tid, true).await;
        }
        if let Some(m) = &removed {
            remove_entry_files(&m.path, m.transcode_path.as_deref());
        }
        Ok(removed.is_some())
    }

    pub async fn reap_expired(&self, ttl_secs: u64, now: u64) -> anyhow::Result<Vec<String>> {
        let expired = crate::reaper::select_expired(&self.store.list(), ttl_secs, now);
        let mut reaped = Vec::new();
        for id in expired {
            let meta = self.store.get(&id);
            match self.delete(&id).await {
                Ok(true) => {
                    match meta {
                        Some(m) => crate::telemetry::reaped(&id, &m.name, m.size),
                        None => crate::telemetry::reaped(&id, "", 0),
                    }
                    reaped.push(id);
                }
                Ok(false) => {}
                Err(e) => tracing::warn!(id = %id, error = %e, "reap delete failed"),
            }
        }
        Ok(reaped)
    }

    pub fn sweep_orphans(&self, ttl_secs: u64, now: u64) -> usize {
        let mut known = std::collections::HashSet::new();
        for m in self.store.list() {
            known.insert(m.path.clone());
            if let Some(p) = m.transcode_path {
                known.insert(p);
            }
            if let Some(p) = m.hls_dir {
                known.insert(p);
            }
        }
        crate::sweeper::sweep_orphans(
            &[self.library_dir.clone(), self.active_dir.clone()],
            &known,
            ttl_secs,
            now,
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FileEntry {
    pub index: usize,
    pub name: String,
    pub len: u64,
}

fn is_media_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        ".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".ts", ".m2ts", ".mts", ".flv", ".wmv",
        ".mpg", ".mpeg", ".3gp", ".ogv",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

pub fn primary_file_index(files: &[FileEntry]) -> Option<usize> {
    files
        .iter()
        .filter(|f| is_media_name(&f.name))
        .max_by_key(|f| f.len)
        .map(|f| f.index)
}

impl Engine {
    fn handle(&self, id: &str) -> Option<Arc<ManagedTorrent>> {
        let tid = TorrentIdOrHash::parse(id).ok()?;
        self.session.get(tid)
    }

    pub fn list_files(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>> {
        let handle = match self.handle(id) {
            Some(h) => h,
            None => return Ok(None),
        };
        let files = handle.with_metadata(|m| {
            m.file_infos
                .iter()
                .enumerate()
                .map(|(index, fi)| FileEntry {
                    index,
                    name: fi.relative_filename.to_string_lossy().into_owned(),
                    len: fi.len,
                })
                .collect::<Vec<_>>()
        });
        match files {
            Ok(v) => Ok(Some(v)),
            Err(_) => Ok(None),
        }
    }

    pub fn open_stream(
        &self,
        id: &str,
        file_id: usize,
    ) -> anyhow::Result<impl AsyncRead + AsyncSeek + Send + Unpin + 'static> {
        let handle = self
            .handle(id)
            .ok_or_else(|| anyhow::anyhow!("no managed torrent for id {id}"))?;
        handle.stream(file_id)
    }

    /// Open a sequential-priority stream over the largest media file of a
    /// leeching torrent, for live playback while the download is still in
    /// flight. The returned reader carries a leech guard, so the completion
    /// watcher will not tear the torrent down until the reader is dropped.
    pub fn primary_stream(&self, id: &str) -> LeechStream {
        let files = match self.list_files(id) {
            Ok(Some(f)) => f,
            _ => return LeechStream::NotReady,
        };
        let idx = match primary_file_index(&files) {
            Some(i) => i,
            None => return LeechStream::NoMedia,
        };
        let (name, len) = match files.iter().find(|f| f.index == idx) {
            Some(e) => (e.name.clone(), e.len),
            None => return LeechStream::NoMedia,
        };
        match self.open(id, idx) {
            Ok(reader) => LeechStream::Ready { reader, name, len },
            Err(_) => LeechStream::NotReady,
        }
    }

    fn leech_enter(&self, id: &str) -> LeechGuard {
        *self
            .active_leech
            .lock()
            .unwrap()
            .entry(id.to_string())
            .or_insert(0) += 1;
        LeechGuard {
            active: self.active_leech.clone(),
            drain: self.drain.clone(),
            id: id.to_string(),
        }
    }
}

pub struct LeechGuard {
    active: Arc<Mutex<HashMap<String, u32>>>,
    drain: Arc<Notify>,
    id: String,
}

impl Drop for LeechGuard {
    fn drop(&mut self) {
        {
            let mut g = self.active.lock().unwrap();
            if let Some(n) = g.get_mut(&self.id) {
                *n = n.saturating_sub(1);
                if *n == 0 {
                    g.remove(&self.id);
                }
            }
        }
        self.drain.notify_waiters();
    }
}

struct GuardedReader<R> {
    inner: R,
    _guard: LeechGuard,
}

impl<R: AsyncRead + Unpin> AsyncRead for GuardedReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl<R: AsyncSeek + Unpin> AsyncSeek for GuardedReader<R> {
    fn start_seek(mut self: Pin<&mut Self>, position: std::io::SeekFrom) -> std::io::Result<()> {
        Pin::new(&mut self.inner).start_seek(position)
    }
    fn poll_complete(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<u64>> {
        Pin::new(&mut self.inner).poll_complete(cx)
    }
}

/// Wait until a live HLS job leaves a transient state (Starting/Live), i.e. the
/// ffmpeg process has exited and its output is stable, so the directory can be
/// safely relocated. Bounded by `cap`.
async fn wait_hls_settle(store: &state::StateStore, id: &str, cap: Duration) {
    let step = Duration::from_secs(1);
    let mut waited = Duration::ZERO;
    loop {
        match store.get(id).map(|m| m.hls) {
            Some(state::HlsStatus::Starting) | Some(state::HlsStatus::Live) => {}
            _ => return,
        }
        if waited >= cap {
            tracing::warn!(id = %id, "live hls did not finalize before timeout; proceeding");
            return;
        }
        tokio::time::sleep(step).await;
        waited = waited.saturating_add(step);
    }
}

/// A live HLS directory is complete when its manifest exists and at least one
/// playlist carries `#EXT-X-ENDLIST` (ffmpeg finished writing it end to end).
pub fn live_hls_complete(hls_dir: &std::path::Path) -> bool {
    if !hls_dir.join("index.m3u8").exists() {
        return false;
    }
    let rd = match std::fs::read_dir(hls_dir) {
        Ok(r) => r,
        Err(_) => return false,
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|x| x.to_str()) == Some("m3u8") {
            if let Ok(s) = std::fs::read_to_string(&p) {
                if s.contains("#EXT-X-ENDLIST") {
                    return true;
                }
            }
        }
    }
    false
}

async fn wait_leech_drained(
    active: &Arc<Mutex<HashMap<String, u32>>>,
    drain: &Arc<Notify>,
    id: &str,
) {
    let fut = async {
        loop {
            let notified = drain.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if active.lock().unwrap().get(id).copied().unwrap_or(0) == 0 {
                return;
            }
            notified.await;
        }
    };
    if tokio::time::timeout(LEECH_DRAIN_CAP, fut).await.is_err() {
        tracing::warn!(id = %id, "leech stream drain timed out; deleting torrent anyway");
    }
}

pub trait ReadSeek: AsyncRead + AsyncSeek + Send + Unpin {}
impl<T: AsyncRead + AsyncSeek + Send + Unpin> ReadSeek for T {}

/// Result of opening a leeching torrent's primary media file for live playback.
pub enum LeechStream {
    /// Metadata not resolved yet, or the file handle is not available.
    NotReady,
    /// The torrent has no playable media file.
    NoMedia,
    Ready {
        reader: Box<dyn ReadSeek>,
        name: String,
        len: u64,
    },
}

pub trait MediaSource: Send + Sync {
    fn entries(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>>;
    fn open(&self, id: &str, file_id: usize) -> anyhow::Result<Box<dyn ReadSeek>>;
}

impl MediaSource for Engine {
    fn entries(&self, id: &str) -> anyhow::Result<Option<Vec<FileEntry>>> {
        self.list_files(id)
    }
    fn open(&self, id: &str, file_id: usize) -> anyhow::Result<Box<dyn ReadSeek>> {
        let reader = self.open_stream(id, file_id)?;
        let guard = self.leech_enter(id);
        Ok(Box::new(GuardedReader {
            inner: reader,
            _guard: guard,
        }))
    }
}

pub fn needs_resume_watch(state: &state::TorrentState) -> bool {
    matches!(state, state::TorrentState::Leeching)
}

/// Drop every peer connection and re-announce. Sockets behind the VPN go quiet
/// without closing, and with no inbound port nothing replaces them — a pause
/// tears them down and the unpause redials the swarm from a fresh announce.
async fn redial_swarm(session: &Arc<Session>, handle: &Arc<ManagedTorrent>, id: &str) {
    if let Err(e) = session.pause(handle).await {
        tracing::warn!(id = %id, error = %e, "stall recovery: pause failed");
        return;
    }
    if let Err(e) = session.unpause(handle).await {
        tracing::warn!(id = %id, error = %e, "stall recovery: unpause failed");
    }
}

async fn delete_from_session(session: &Session, id: &str, delete_files: bool) {
    if let Ok(tid) = TorrentIdOrHash::parse(id) {
        if let Err(e) = session.delete(tid, delete_files).await {
            tracing::debug!(id = %id, error = %e, "session delete after terminal state failed");
        }
    }
}

pub async fn vpn_watchdog_loop(engine: Engine, interval_secs: u64) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    ticker.tick().await;
    loop {
        ticker.tick().await;
        engine.vpn_recheck().await;
    }
}

fn seed_trackers(cache: &std::path::Path, embedded: &[String]) -> Vec<String> {
    let cached = std::fs::read_to_string(cache)
        .ok()
        .map(|t| config::parse_trackers(&t))
        .unwrap_or_default();
    let merged = config::merge_trackers(embedded.iter().cloned().chain(cached));
    tracing::info!(count = merged.len(), "tracker list seeded");
    merged
}

impl Engine {
    pub async fn refresh_trackers(
        &self,
        urls: &[String],
        cache: &std::path::Path,
        embedded: &[String],
    ) -> anyhow::Result<usize> {
        let mut fetched: Vec<String> = Vec::new();
        let mut ok = 0usize;
        for url in urls {
            match http_client()
                .get(url)
                .send()
                .await
                .and_then(|r| r.error_for_status())
            {
                Ok(resp) => match resp.text().await {
                    Ok(text) => {
                        fetched.extend(config::parse_trackers(&text));
                        ok += 1;
                    }
                    Err(e) => tracing::warn!(error = %e, %url, "tracker list read failed"),
                },
                Err(e) => tracing::warn!(error = %e, %url, "tracker list fetch failed"),
            }
        }
        if ok == 0 {
            anyhow::bail!("all {} tracker sources failed", urls.len());
        }
        let merged = config::merge_trackers(embedded.iter().cloned().chain(fetched));
        let current = self.trackers.lock().unwrap().clone();
        if merged == *current {
            return Ok(merged.len());
        }
        if let Err(e) = write_cache(cache, &merged) {
            tracing::warn!(error = %e, cache = %cache.display(), "tracker cache write failed");
        }
        let n = merged.len();
        *self.trackers.lock().unwrap() = Arc::new(merged);
        Ok(n)
    }

    pub fn live_stats(&self) -> Vec<TorrentLive> {
        self.session.with_torrents(|it| {
            it.map(|(_, h)| {
                let s = h.stats();
                let (down, up, live, seen, connecting) = match s.live.as_ref() {
                    Some(l) => (
                        l.download_speed.mbps,
                        l.upload_speed.mbps,
                        l.snapshot.peer_stats.live,
                        l.snapshot.peer_stats.seen,
                        l.snapshot.peer_stats.connecting,
                    ),
                    None => (0.0, 0.0, 0, 0, 0),
                };
                TorrentLive {
                    id: h.info_hash().as_string(),
                    progress_bytes: s.progress_bytes,
                    total_bytes: s.total_bytes,
                    finished: s.finished,
                    download_mbps: down,
                    upload_mbps: up,
                    peers_live: live,
                    peers_seen: seen,
                    peers_connecting: connecting,
                }
            })
            .collect()
        })
    }

    pub fn live_stats_map(&self) -> HashMap<String, TorrentLive> {
        self.live_stats()
            .into_iter()
            .map(|t| (t.id.clone(), t))
            .collect()
    }

    pub fn tracker_count(&self) -> usize {
        self.trackers.lock().unwrap().len()
    }

    pub fn bt_listen_port(&self) -> Option<u16> {
        self.session.tcp_listen_port()
    }

    pub fn forwarded_port(&self) -> Option<u16> {
        let path = self.bt_port_file.as_ref()?;
        parse_forwarded_port(&std::fs::read_to_string(path).ok()?)
    }

    pub fn port_rotations(&self) -> u64 {
        self.port_rotations.load(Ordering::Relaxed)
    }

    pub fn vpn_fail_streak(&self) -> u32 {
        self.vpn_fail_streak.load(Ordering::Relaxed)
    }
}

fn write_cache(cache: &std::path::Path, list: &[String]) -> std::io::Result<()> {
    let tmp = cache.with_extension("tmp");
    std::fs::write(&tmp, list.join("\n"))?;
    std::fs::rename(&tmp, cache)
}

fn cache_is_fresh(cache: &std::path::Path, max_age_secs: u64) -> bool {
    std::fs::metadata(cache)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .map(|age| age.as_secs() < max_age_secs)
        .unwrap_or(false)
}

pub async fn tracker_refresh_loop(
    engine: Engine,
    urls: Vec<String>,
    cache: PathBuf,
    embedded: Vec<String>,
    interval_secs: u64,
) {
    if cache_is_fresh(&cache, interval_secs.max(60)) {
        tracing::info!("tracker cache is fresh; deferring initial fetch to first interval");
    } else {
        match engine.refresh_trackers(&urls, &cache, &embedded).await {
            Ok(n) => tracing::info!(count = n, sources = urls.len(), "tracker list loaded"),
            Err(e) => {
                tracing::warn!(error = %e, "tracker fetch failed; using cache/embedded seed")
            }
        }
    }
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs.max(60)));
    ticker.tick().await;
    loop {
        ticker.tick().await;
        match engine.refresh_trackers(&urls, &cache, &embedded).await {
            Ok(n) => tracing::info!(count = n, "tracker list refreshed"),
            Err(e) => tracing::warn!(error = %e, "tracker refresh failed; keeping previous"),
        }
    }
}

pub fn is_active_state(state: Option<state::TorrentState>) -> bool {
    matches!(
        state,
        Some(state::TorrentState::Leeching | state::TorrentState::Seeding)
    )
}

pub fn remove_entry_files(path: &str, transcode_path: Option<&str>) {
    for p in std::iter::once(path).chain(transcode_path) {
        let pb = std::path::Path::new(p);
        let res = if pb.is_dir() {
            std::fs::remove_dir_all(pb)
        } else if pb.exists() {
            std::fs::remove_file(pb)
        } else {
            Ok(())
        };
        if let Err(e) = res {
            tracing::warn!(path = %p, error = %e, "failed to remove entry files; leaving orphan for sweeper");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;

    #[test]
    fn remove_entry_files_deletes_source_and_transcode() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("srcdir");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("a.mkv"), b"x").unwrap();
        let tc = dir.path().join("out.reel.mp4");
        std::fs::write(&tc, b"y").unwrap();
        remove_entry_files(&src.display().to_string(), Some(&tc.display().to_string()));
        assert!(!src.exists());
        assert!(!tc.exists());
    }

    #[test]
    fn live_hls_complete_requires_manifest_and_endlist() {
        let dir = tempfile::tempdir().unwrap();
        let h = dir.path();
        assert!(!live_hls_complete(h), "no manifest");
        std::fs::write(h.join("index.m3u8"), b"#EXTM3U\nstream_0.m3u8\n").unwrap();
        std::fs::write(
            h.join("stream_0.m3u8"),
            b"#EXTM3U\n#EXTINF:4,\nseg_0_00000.ts\n",
        )
        .unwrap();
        assert!(!live_hls_complete(h), "no ENDLIST yet (still live)");
        std::fs::write(
            h.join("stream_0.m3u8"),
            b"#EXTM3U\n#EXTINF:4,\nseg_0_00000.ts\n#EXT-X-ENDLIST\n",
        )
        .unwrap();
        assert!(live_hls_complete(h), "manifest + ENDLIST -> complete");
    }

    #[test]
    fn is_active_state_matches_leeching_and_seeding_only() {
        use state::TorrentState::*;
        assert!(is_active_state(Some(Leeching)));
        assert!(is_active_state(Some(Seeding)));
        assert!(!is_active_state(Some(Failed)));
        assert!(!is_active_state(None));
    }

    #[test]
    fn parse_forwarded_port_accepts_valid_rejects_junk() {
        assert_eq!(parse_forwarded_port("51820"), Some(51820));
        assert_eq!(parse_forwarded_port("  42069\n"), Some(42069));
        assert_eq!(parse_forwarded_port("0"), None);
        assert_eq!(parse_forwarded_port(""), None);
        assert_eq!(parse_forwarded_port("notaport"), None);
        assert_eq!(parse_forwarded_port("70000"), None);
    }

    #[tokio::test]
    async fn await_forwarded_port_returns_none_when_never_written() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("forwarded_port");
        assert_eq!(await_forwarded_port(&path, 1, 1).await, None);
    }

    #[tokio::test]
    async fn await_forwarded_port_adopts_late_settled_value() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("forwarded_port");
        std::fs::File::create(&path)
            .unwrap()
            .write_all(b"33078")
            .unwrap();
        let p2 = path.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1200)).await;
            std::fs::write(&p2, b"43287").unwrap();
        });
        assert_eq!(await_forwarded_port(&path, 2, 2).await, Some(43287));
    }

    #[test]
    fn stall_budget_extends_while_peers_connected() {
        assert_eq!(stall_budget_secs(0, 300, 900), 300);
        assert_eq!(stall_budget_secs(1, 300, 900), 900);
        assert_eq!(
            stall_budget_secs(4, 900, 300),
            900,
            "connected budget never shortens the dry budget"
        );
    }

    #[test]
    fn connected_peers_delay_stall_trip() {
        let dry = stall_budget_secs(0, 300, 900);
        let connected = stall_budget_secs(3, 300, 900);
        assert!(is_stalled(500, 500, 300, dry));
        assert!(
            !is_stalled(500, 500, 300, connected),
            "peers alive at 300s idle are choked, not gone"
        );
        assert!(is_stalled(500, 500, 900, connected));
    }

    #[test]
    fn is_stalled_detects_no_progress_past_timeout() {
        assert!(!is_stalled(0, 0, 100, 300), "under timeout not stalled");
        assert!(
            !is_stalled(100, 200, 300, 300),
            "progress resets — not stalled"
        );
        assert!(
            is_stalled(500, 500, 300, 300),
            "no progress at timeout is stalled"
        );
        assert!(
            is_stalled(500, 500, 315, 300),
            "no progress past timeout is stalled"
        );
        assert!(
            !is_stalled(0, 1, 999, 300),
            "any forward progress not stalled"
        );
    }

    #[test]
    fn needs_resume_watch_only_leeching() {
        use state::TorrentState::*;
        assert!(needs_resume_watch(&Leeching));
        assert!(!needs_resume_watch(&Seeding));
        assert!(!needs_resume_watch(&Failed));
        assert!(!needs_resume_watch(&Reaped));
    }

    fn mk_guard(
        active: &Arc<Mutex<HashMap<String, u32>>>,
        drain: &Arc<Notify>,
        id: &str,
    ) -> LeechGuard {
        *active.lock().unwrap().entry(id.to_string()).or_insert(0) += 1;
        LeechGuard {
            active: active.clone(),
            drain: drain.clone(),
            id: id.to_string(),
        }
    }

    #[tokio::test]
    async fn drain_returns_immediately_when_no_streams() {
        let active = Arc::new(Mutex::new(HashMap::new()));
        let drain = Arc::new(Notify::new());
        tokio::time::timeout(
            Duration::from_secs(1),
            wait_leech_drained(&active, &drain, "none"),
        )
        .await
        .expect("must return without waiting");
    }

    #[tokio::test]
    async fn drain_waits_until_all_guards_dropped() {
        let active = Arc::new(Mutex::new(HashMap::new()));
        let drain = Arc::new(Notify::new());
        let g1 = mk_guard(&active, &drain, "x");
        let g2 = mk_guard(&active, &drain, "x");

        let (a2, d2) = (active.clone(), drain.clone());
        let waiter = tokio::spawn(async move { wait_leech_drained(&a2, &d2, "x").await });

        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!waiter.is_finished(), "two streams in flight");
        drop(g1);
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!waiter.is_finished(), "one still in flight");
        drop(g2);
        tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("drain must complete after last guard drops")
            .unwrap();
        assert!(
            active.lock().unwrap().get("x").is_none(),
            "entry cleaned up"
        );
    }

    #[test]
    fn vpn_action_transitions() {
        assert_eq!(next_vpn_action(true, true), VpnAction::None);
        assert_eq!(next_vpn_action(true, false), VpnAction::Pause);
        assert_eq!(next_vpn_action(false, true), VpnAction::Resume);
        assert_eq!(next_vpn_action(false, false), VpnAction::None);
    }

    #[test]
    fn magnet_with_trackers_appends_and_encodes() {
        let src = "magnet:?xt=urn:btih:ULA23RTI7QS33SYTPVBQMC3WZUCDU763&dn=tears";
        let out = magnet_with_trackers(
            src,
            &[
                "udp://tracker.opentrackr.org:1337/announce".to_string(),
                "https://x/announce".to_string(),
            ],
        );
        let parsed = librqbit::Magnet::parse(&out).unwrap();
        assert!(parsed.trackers.iter().any(|t| t.contains("opentrackr")));
        assert!(
            parsed
                .trackers
                .iter()
                .any(|t| t.contains("https://x/announce"))
        );
        assert_eq!(magnet_with_trackers(src, &[]), src, "empty list is a no-op");
    }

    #[test]
    fn decide_vpn_debounces_transient_failures() {
        let ip = "1.2.3.4".parse().unwrap();
        assert_eq!(decide_vpn(VpnStatus::Confirmed(ip), false, 5, 3), (true, 0));
        assert_eq!(decide_vpn(VpnStatus::Leak(ip), true, 0, 3), (false, 0));

        let (ok1, s1) = decide_vpn(VpnStatus::Unverified, true, 0, 3);
        assert_eq!((ok1, s1), (true, 1), "1st flake holds prev ok");
        let (ok2, s2) = decide_vpn(VpnStatus::Unverified, ok1, s1, 3);
        assert_eq!((ok2, s2), (true, 2), "2nd flake still holds");
        let (ok3, s3) = decide_vpn(VpnStatus::Unverified, ok2, s2, 3);
        assert_eq!(
            (ok3, s3),
            (true, 3),
            "unverified never pauses — killswitch is the barrier"
        );
        let (ok4, s4) = decide_vpn(VpnStatus::Unverified, ok3, s3, 3);
        assert_eq!((ok4, s4), (true, 4), "still holds past threshold");

        assert_eq!(
            decide_vpn(VpnStatus::Leak(ip), true, 9, 3),
            (false, 0),
            "a confirmed leak still pauses immediately"
        );
        assert_eq!(
            decide_vpn(VpnStatus::Confirmed(ip), false, 3, 3),
            (true, 0),
            "confirm resets streak and resumes"
        );
    }

    #[test]
    fn private_and_loopback_are_not_vpn() {
        assert!(!is_vpn_ip("127.0.0.1".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("10.0.0.5".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("192.168.1.2".parse::<IpAddr>().unwrap()));
        assert!(!is_vpn_ip("172.16.0.1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn public_ip_is_vpn() {
        assert!(is_vpn_ip("203.0.113.7".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_unique_local_is_not_vpn() {
        assert!(!is_vpn_ip("fc00::1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_link_local_is_not_vpn() {
        assert!(!is_vpn_ip("fe80::1".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn ipv6_public_is_vpn() {
        assert!(is_vpn_ip("2606:4700::1111".parse::<IpAddr>().unwrap()));
    }

    #[test]
    fn primary_file_index_picks_largest_media() {
        let files = vec![
            FileEntry {
                index: 0,
                name: "sample.nfo".into(),
                len: 10,
            },
            FileEntry {
                index: 1,
                name: "movie.mkv".into(),
                len: 900,
            },
            FileEntry {
                index: 2,
                name: "poster.jpg".into(),
                len: 5000,
            },
            FileEntry {
                index: 3,
                name: "clip.mp4".into(),
                len: 100,
            },
        ];
        assert_eq!(primary_file_index(&files), Some(1));
    }

    #[test]
    fn primary_file_index_none_when_no_media() {
        let files = vec![FileEntry {
            index: 0,
            name: "readme.txt".into(),
            len: 10,
        }];
        assert_eq!(primary_file_index(&files), None);
    }
}
