//! Keeps collidable ground under every player.
//!
//! The client re-bakes the ground around its own player as they walk, so the world
//! does not end at `extent`. A server has no single player to follow: two people can
//! stand a kilometre apart and both need ground. So instead of one window it holds a
//! set of regions, one per occupied neighbourhood, and adds and drops them as people
//! move.
//!
//! Regions overlap rather than tile. Every one is baked by the same generator from the
//! same seed, so where two overlap they agree on height to the bit — which is what
//! makes crossing between them seamless, and is also why the client and server agree
//! as long as they share seed, extent and resolution.

use std::collections::HashSet;
use std::sync::mpsc::{self, Receiver, Sender};

use q::rapier::sim3d::{SimCommand, SimWorld, TerrainDesc};
use q::worldgen::{HeightGen, HeightParams, Window};

/// Region indices, not world coordinates — the snap grid is what makes two players
/// standing near each other share one region instead of baking two.
type Cell = [i32; 2];

pub struct StreamConfig {
    pub seed: u64,
    /// Half-width of one baked region. Must match the client's terrain extent.
    pub extent: f32,
    /// Samples per side. Must match the client's terrain resolution.
    pub resolution: i32,
    /// Region centres snap to this grid.
    pub stride: f32,
    /// A region is dropped once every player is further than this from its centre.
    /// Comfortably beyond `extent` so walking back and forth over a boundary does not
    /// drop and re-bake the same ground repeatedly.
    pub keep_radius: f32,
    /// Concurrent bakes. Each is a full resolution² noise evaluation, so this is a
    /// cap on how much CPU terrain generation may steal from the sim thread's host.
    pub max_inflight: usize,
}

impl StreamConfig {
    fn params(&self) -> HeightParams {
        HeightParams {
            seed: self.seed as i32,
            ..Default::default()
        }
    }
}

pub struct TerrainStreamer {
    cfg: StreamConfig,
    window: Window,
    loaded: HashSet<Cell>,
    pending: HashSet<Cell>,
    tx: Sender<(Cell, [f32; 2], Vec<f32>)>,
    rx: Receiver<(Cell, [f32; 2], Vec<f32>)>,
}

impl TerrainStreamer {
    pub fn new(cfg: StreamConfig) -> Self {
        let (tx, rx) = mpsc::channel();
        let window = Window::new(cfg.extent, cfg.stride);
        Self {
            cfg,
            window,
            loaded: HashSet::new(),
            pending: HashSet::new(),
            tx,
            rx,
        }
    }

    fn cell_of(&self, at: [f32; 2]) -> Cell {
        let snapped = self.window.snap(at);
        [
            (snapped[0] / self.cfg.stride).round() as i32,
            (snapped[1] / self.cfg.stride).round() as i32,
        ]
    }

    fn origin_of(&self, cell: Cell) -> [f32; 2] {
        [
            cell[0] as f32 * self.cfg.stride,
            cell[1] as f32 * self.cfg.stride,
        ]
    }

    fn bake(&self, origin: [f32; 2]) -> Vec<f32> {
        HeightGen::new(&self.cfg.params()).bake_at(origin, self.cfg.extent, self.cfg.resolution)
    }

    fn desc(&self, heights: Vec<f32>) -> TerrainDesc {
        TerrainDesc {
            heights: std::sync::Arc::new(heights),
            resolution: self.cfg.resolution as u32,
            extent: self.cfg.extent,
        }
    }

    /// Bakes the spawn region synchronously, before the first player can join. Doing
    /// this in the background would let someone connect and fall through the world
    /// while the first bake was still running.
    pub fn prime(&mut self, world: &mut SimWorld) {
        let cell = self.cell_of([0.0, 0.0]);
        let origin = self.origin_of(cell);
        let heights = self.bake(origin);
        world.apply(SimCommand::AddTerrainRegion {
            origin,
            desc: self.desc(heights),
        });
        self.loaded.insert(cell);
    }

    /// Files completed bakes, requests missing regions, and drops ones nobody is near.
    /// Cheap enough to call often; the expensive part is on worker threads.
    pub fn update(&mut self, players: &[[f32; 2]], world: &mut SimWorld) {
        while let Ok((cell, origin, heights)) = self.rx.try_recv() {
            self.pending.remove(&cell);
            world.apply(SimCommand::AddTerrainRegion {
                origin,
                desc: self.desc(heights),
            });
            self.loaded.insert(cell);
        }

        // The spawn region is always wanted: it is where the next join lands, and
        // there may be nobody standing on it at the time.
        let mut wanted: HashSet<Cell> = HashSet::new();
        wanted.insert(self.cell_of([0.0, 0.0]));
        for p in players {
            wanted.insert(self.cell_of(*p));
        }

        for cell in &wanted {
            if self.loaded.contains(cell) || self.pending.contains(cell) {
                continue;
            }
            if self.pending.len() >= self.cfg.max_inflight {
                break;
            }
            self.request(*cell);
        }

        let spawn = self.cell_of([0.0, 0.0]);
        let keep = self.cfg.keep_radius;
        let stale: Vec<Cell> = self
            .loaded
            .iter()
            .copied()
            .filter(|cell| {
                if *cell == spawn || wanted.contains(cell) {
                    return false;
                }
                let o = self.origin_of(*cell);
                !players
                    .iter()
                    .any(|p| (p[0] - o[0]).abs().max((p[1] - o[1]).abs()) <= keep)
            })
            .collect();
        for cell in stale {
            world.apply(SimCommand::DropTerrainRegion {
                origin: self.origin_of(cell),
            });
            self.loaded.remove(&cell);
        }
    }

    fn request(&mut self, cell: Cell) {
        let origin = self.origin_of(cell);
        let params = self.cfg.params();
        let (extent, res) = (self.cfg.extent, self.cfg.resolution);
        let tx = self.tx.clone();
        let spawned = std::thread::Builder::new()
            .name("fs-terrain-bake".into())
            .spawn(move || {
                let heights = HeightGen::new(&params).bake_at(origin, extent, res);
                let _ = tx.send((cell, origin, heights));
            });
        match spawned {
            Ok(_) => {
                self.pending.insert(cell);
            }
            // Not fatal: the region stays unwanted-but-unloaded and the next update
            // asks again. Dropping it silently would leave a hole nobody retries.
            Err(e) => tracing::warn!(?origin, "terrain bake thread failed to spawn: {e}"),
        }
    }

    pub fn loaded_count(&self) -> usize {
        self.loaded.len()
    }

    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use q::rapier::sim3d::SimConfig;
    use std::time::{Duration, Instant};

    fn config() -> StreamConfig {
        StreamConfig {
            seed: 1337,
            extent: 64.0,
            resolution: 33,
            stride: 32.0,
            keep_radius: 96.0,
            max_inflight: 2,
        }
    }

    /// Bakes land on worker threads, so anything asserting on them has to wait.
    fn settle(streamer: &mut TerrainStreamer, world: &mut SimWorld, players: &[[f32; 2]]) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            streamer.update(players, world);
            if streamer.pending_count() == 0 {
                streamer.update(players, world);
                if streamer.pending_count() == 0 {
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("bakes did not settle");
    }

    #[test]
    fn priming_puts_ground_under_the_spawn_point() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);
        assert_eq!(world.terrain_region_count(), 1);
        assert_eq!(streamer.loaded_count(), 1);
    }

    #[test]
    fn a_player_walking_out_gets_ground_ahead_of_them() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);

        settle(&mut streamer, &mut world, &[[512.0, 0.0]]);
        assert!(
            world.terrain_region_count() >= 2,
            "far player should have their own region, got {}",
            world.terrain_region_count()
        );
    }

    #[test]
    fn two_players_far_apart_are_both_covered() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);

        // The case a single follow-the-player window cannot serve.
        settle(
            &mut streamer,
            &mut world,
            &[[1024.0, 0.0], [-1024.0, 512.0]],
        );
        assert_eq!(
            world.terrain_region_count(),
            3,
            "spawn plus one region each"
        );
    }

    #[test]
    fn players_standing_together_share_one_region() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);

        settle(
            &mut streamer,
            &mut world,
            &[[512.0, 0.0], [514.0, 3.0], [509.0, -2.0]],
        );
        assert_eq!(
            world.terrain_region_count(),
            2,
            "snapping should collapse a huddle to one region"
        );
    }

    #[test]
    fn ground_nobody_is_near_is_dropped_but_spawn_is_kept() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);

        settle(&mut streamer, &mut world, &[[1024.0, 0.0]]);
        assert_eq!(world.terrain_region_count(), 2);

        // Walked far past the region they came from.
        settle(&mut streamer, &mut world, &[[4096.0, 0.0]]);
        assert_eq!(
            world.terrain_region_count(),
            2,
            "the abandoned region should be gone, spawn should not be"
        );
        assert!(
            streamer.loaded.contains(&streamer.cell_of([0.0, 0.0])),
            "spawn region must survive — it is where the next join lands"
        );
    }

    #[test]
    fn a_player_pacing_a_boundary_does_not_thrash_the_bakes() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(config());
        streamer.prime(&mut world);

        // Just past one stride out, then back, repeatedly. keep_radius is wider than
        // the stride precisely so this does not drop and re-bake every pass.
        settle(&mut streamer, &mut world, &[[33.0, 0.0]]);
        let after_first = world.terrain_region_count();
        for at in [[31.0, 0.0], [33.0, 0.0], [30.0, 0.0], [34.0, 0.0]] {
            settle(&mut streamer, &mut world, &[at]);
        }
        assert_eq!(
            world.terrain_region_count(),
            after_first,
            "pacing a boundary should not churn regions"
        );
    }

    #[test]
    fn overlapping_regions_agree_on_height() {
        // The property the whole scheme rests on, and the same one that makes the
        // client and server agree: identical seed, extent and resolution means two
        // bakes covering the same ground produce the same numbers.
        let cfg = config();
        let streamer = TerrainStreamer::new(cfg);
        let a = streamer.bake([0.0, 0.0]);
        let b = streamer.bake([32.0, 0.0]);

        let res = 33usize;
        let step = 64.0 * 2.0 / (res - 1) as f32;
        let mut compared = 0;
        for row in 0..res {
            for col in 0..res {
                let x = -64.0 + col as f32 * step;
                let z = -64.0 + row as f32 * step;
                // Same world point, expressed in the second region's local grid.
                let bx = x - 32.0;
                if bx < -64.0 {
                    continue;
                }
                let bcol = ((bx + 64.0) / step).round() as usize;
                if bcol >= res {
                    continue;
                }
                let (ha, hb) = (a[row * res + col], b[row * res + bcol]);
                assert!(
                    (ha - hb).abs() < 1e-4,
                    "overlap disagrees at ({x},{z}): {ha} vs {hb}"
                );
                compared += 1;
            }
        }
        assert!(
            compared > 100,
            "expected a real overlap, compared {compared}"
        );
    }
}
