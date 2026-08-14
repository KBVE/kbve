use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use q::net::dual::DualHost;
use q::net::session::{HostSession, SessionConfig, TokenAuthority};
use q::rapier::sim3d::{BodyId, SimConfig, SimSnapshot, TerrainDesc};
use q::worldgen::{HeightGen, HeightParams};

use crate::terrain_stream::{StreamConfig, TerrainStreamer};

pub struct DriverConfig {
    pub seed: u64,
    pub tick_hz: f64,
    pub terrain_extent: f32,
    pub terrain_resolution: i32,
    /// Must match the client's QTerrain: the bridge deck is measured from both.
    pub water_level: f32,
    pub road_width: f32,
    /// Follow players with a set of baked regions instead of laying one fixed tile at
    /// the origin. Off reproduces the old behaviour exactly, for a client whose own
    /// terrain streaming is switched off and which therefore never leaves the tile.
    pub stream_enabled: bool,
    pub stream_stride: f32,
    /// Scatter cell sizes, which must match the client's field exports, and how
    /// far a player may stand from a cell and still work it.
    pub stone_grid_size: f32,
    pub tree_grid_size: f32,
    pub harvest_reach: f32,
    pub stream_keep_radius: f32,
}

/// How often the region set is reconsidered. Every tick would be wasted work — a
/// player at 4 m/s takes many seconds to cross a stride — and each pass walks the
/// roster and takes a snapshot.
const STREAM_INTERVAL_TICKS: u64 = 30;

pub struct Driver {
    stop: Arc<AtomicBool>,
    tick: Arc<AtomicU64>,
    regions: Arc<AtomicUsize>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Driver {
    /// Shared counter, so a status route can read the sim without owning it.
    pub fn tick_handle(&self) -> Arc<AtomicU64> {
        self.tick.clone()
    }

    /// Terrain regions currently collidable. The only outward sign that streaming is
    /// doing anything — a number stuck at 1 while players roam means it is not.
    pub fn regions_handle(&self) -> Arc<AtomicUsize> {
        self.regions.clone()
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
pub fn spawn(
    transport: Arc<DualHost>,
    cfg: DriverConfig,
    authority: Option<Arc<dyn TokenAuthority>>,
) -> Driver {
    let stop = Arc::new(AtomicBool::new(false));
    let tick = Arc::new(AtomicU64::new(0));
    let regions = Arc::new(AtomicUsize::new(0));
    let (stop_t, tick_t, regions_t) = (stop.clone(), tick.clone(), regions.clone());

    let sim = SimConfig {
        tick_hz: cfg.tick_hz,
        ..Default::default()
    };
    // Only baked for the non-streaming path; the streamer bakes its own regions.
    let terrain = (!cfg.stream_enabled).then(|| terrain_for(&cfg));
    let seed = cfg.seed;
    let stream = cfg.stream_enabled;
    let extent = cfg.terrain_extent;
    let resolution = cfg.terrain_resolution;
    let stride = cfg.stream_stride;
    let keep_radius = cfg.stream_keep_radius;
    let water_level = cfg.water_level;
    let road_width = cfg.road_width;
    let stone_grid_size = cfg.stone_grid_size;
    let tree_grid_size = cfg.tree_grid_size;
    let harvest_reach = cfg.harvest_reach;

    let thread =
        std::thread::Builder::new()
            .name("friendslop-sim".into())
            .spawn(move || {
                // The terrain contract goes out in Welcome so the client stops having
                // to agree with the server by convention.
                let session_config = SessionConfig {
                    terrain_extent: extent,
                    terrain_resolution: resolution.max(2) as u32,
                    water_level,
                    road_width,
                    stone_grid_size,
                    tree_grid_size,
                    harvest_reach,
                    ..SessionConfig::default()
                };
                let mut host = HostSession::dedicated(transport.clone(), session_config, sim, seed);
                if let Some(authority) = authority {
                    host = host.with_authority(authority);
                }
                // Spawns stand on the ground rather than at a fixed altitude. The host
                // has no terrain of its own to sample — with streaming on it never sees
                // a SetTerrain at all — so the generator is handed over directly.
                let spawn_gen = HeightGen::new(&HeightParams {
                    seed: seed as i32,
                    ..Default::default()
                });
                host = host.with_ground(Arc::new(move |x, z| spawn_gen.height(x, z)));

                let mut streamer = if stream {
                    let mut s = TerrainStreamer::new(StreamConfig {
                        seed,
                        water_level: cfg.water_level,
                        road_width: cfg.road_width,
                        extent,
                        resolution,
                        stride,
                        keep_radius,
                        max_inflight: 2,
                    });
                    s.prime(host.world_mut());
                    tracing::info!(extent, stride, keep_radius, "terrain streaming enabled");
                    Some(s)
                } else {
                    // One tile at the origin, exactly as before.
                    if let Some(terrain) = terrain {
                        host.set_terrain(terrain);
                    }
                    None
                };

                let step = Duration::from_secs_f64(sim.timestep());
                let mut next = Instant::now();
                let mut scratch = SimSnapshot::default();
                let mut players: Vec<[f32; 2]> = Vec::new();
                let mut ticks: u64 = 0;

                while !stop_t.load(Ordering::Relaxed) {
                    transport.pump();
                    for peer in transport.take_disconnects() {
                        tracing::info!(peer = peer.0, "peer disconnected");
                        host.remove_player(peer);
                    }

                    if let Some(streamer) = streamer.as_mut()
                        && ticks % STREAM_INTERVAL_TICKS == 0
                    {
                        let bodies: Vec<BodyId> = host.roster().iter().map(|p| p.body).collect();
                        host.world_mut().snapshot_into(&mut scratch);
                        players.clear();
                        players.extend(bodies.iter().filter_map(|b| {
                            scratch.body(*b).map(|s| [s.iso.pos[0], s.iso.pos[2]])
                        }));
                        streamer.update(&players, host.world_mut());
                        regions_t.store(host.world_mut().terrain_region_count(), Ordering::Relaxed);
                    }

                    host.tick();
                    ticks += 1;
                    tick_t.fetch_add(1, Ordering::Relaxed);

                    next += step;
                    match next.checked_duration_since(Instant::now()) {
                        Some(wait) => std::thread::sleep(wait),
                        None => next = Instant::now(),
                    }
                }
            })
            .expect("spawn sim thread");

    Driver {
        stop,
        tick,
        regions,
        thread: Some(thread),
    }
}
