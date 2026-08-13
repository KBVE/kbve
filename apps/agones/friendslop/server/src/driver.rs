use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use q::net::dual::DualHost;
use q::net::session::{HostSession, SessionConfig, TokenAuthority};
use q::rapier::sim3d::{SimConfig, TerrainDesc};
use q::worldgen::{HeightGen, HeightParams};

pub struct DriverConfig {
    pub seed: u64,
    pub tick_hz: f64,
    pub terrain_extent: f32,
    pub terrain_resolution: i32,
}

pub struct Driver {
    stop: Arc<AtomicBool>,
    tick: Arc<AtomicU64>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Driver {
    /// Shared counter, so a status route can read the sim without owning it.
    pub fn tick_handle(&self) -> Arc<AtomicU64> {
        self.tick.clone()
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Driver {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn terrain_for(cfg: &DriverConfig) -> TerrainDesc {
    let params = HeightParams {
        seed: cfg.seed as i32,
        ..Default::default()
    };
    let heights = HeightGen::new(&params).bake(cfg.terrain_extent, cfg.terrain_resolution);
    TerrainDesc {
        heights: Arc::new(heights),
        resolution: cfg.terrain_resolution as u32,
        extent: cfg.terrain_extent,
    }
}

/// Runs the authoritative sim on its own OS thread at a fixed cadence.
///
/// Not a tokio task: `HostSession::tick` is synchronous CPU work, and parking it
/// on a runtime worker would stall the sockets it depends on.
pub fn spawn(
    transport: Arc<DualHost>,
    cfg: DriverConfig,
    authority: Option<Arc<dyn TokenAuthority>>,
) -> Driver {
    let stop = Arc::new(AtomicBool::new(false));
    let tick = Arc::new(AtomicU64::new(0));
    let (stop_t, tick_t) = (stop.clone(), tick.clone());

    let sim = SimConfig {
        tick_hz: cfg.tick_hz,
        ..Default::default()
    };
    let terrain = terrain_for(&cfg);
    let seed = cfg.seed;

    let thread = std::thread::Builder::new()
        .name("friendslop-sim".into())
        .spawn(move || {
            let mut host =
                HostSession::dedicated(transport.clone(), SessionConfig::default(), sim, seed);
            if let Some(authority) = authority {
                host = host.with_authority(authority);
            }
            host.set_terrain(terrain);

            let step = Duration::from_secs_f64(sim.timestep());
            let mut next = Instant::now();

            while !stop_t.load(Ordering::Relaxed) {
                // Offers the datagram lane to any peer that just connected.
                transport.pump();
                for peer in transport.take_disconnects() {
                    tracing::info!(peer = peer.0, "peer disconnected");
                    host.remove_player(peer);
                }

                host.tick();
                tick_t.fetch_add(1, Ordering::Relaxed);

                next += step;
                match next.checked_duration_since(Instant::now()) {
                    Some(wait) => std::thread::sleep(wait),
                    // Fell behind. Resync rather than sprint to catch up, which
                    // would only dig the hole deeper under sustained load.
                    None => next = Instant::now(),
                }
            }
        })
        .expect("spawn sim thread");

    Driver {
        stop,
        tick,
        thread: Some(thread),
    }
}
