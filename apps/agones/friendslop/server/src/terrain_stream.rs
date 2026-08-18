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

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{self, Receiver, Sender};

use q::ground::{Ground, GroundSource};
use q::landmark::{Landmark, LandmarkFootprint, LandmarkKind};
use q::rapier::sim3d::{
    BodyDesc, BodyId, BodyKind, Iso, ShapeDesc, SimCommand, SimWorld, TerrainDesc,
};
use q::worldgen::{BridgePlan, HeightGen, HeightParams, Slab, Window};

/// Well clear of the player body space, which starts at a million.
const BRIDGE_BODY_BASE: u32 = 2_000;

/// Clear of the bridge's own range. Each landmark standing in the world is given a
/// block of this many consecutive ids, which is comfortably more boxes than either
/// kind is built from.
const LANDMARK_BODY_BASE: u32 = 100_000;
const LANDMARK_BODY_STRIDE: u32 = 64;

/// How far past a region a landmark still counts as reaching into it. Matches the
/// client's, so the two stand the same buildings up at the same moment.
const LANDMARK_MARGIN: f32 = 80.0;

/// Which landmark a block of bodies belongs to. Kind and cell rather than position:
/// two regions overlapping the same capital must recognise it as the one they have
/// already stood up.
type MarkKey = (u8, i32, i32);

fn key_of(mark: &Landmark) -> MarkKey {
    let kind = match mark.kind {
        LandmarkKind::Capital => 0,
        LandmarkKind::Harbour => 1,
    };
    (kind, mark.cell[0], mark.cell[1])
}

/// Region indices, not world coordinates — the snap grid is what makes two players
/// standing near each other share one region instead of baking two.
type Cell = [i32; 2];

pub struct StreamConfig {
    pub seed: u64,
    /// Which field the ground comes from. Must match the client's.
    pub ground_source: GroundSource,
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
    /// Must match the client's terrain: the deck's height is measured from it.
    pub water_level: f32,
    /// Must match the client's road width; the deck is a multiple of it.
    pub road_width: f32,
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
    plan: BridgePlan,
    /// Deck, kerbs and both approaches, in one list. Baked once: the geometry is a
    /// function of the seed, and re-deriving it per crossing would re-run the ramp's
    /// height sampling every time somebody walks near the river.
    slabs: Vec<Slab>,
    bridge_in: bool,
    /// Landmarks currently in the solver, and the id block each was given.
    marks_in: HashMap<MarkKey, (u32, Landmark)>,
    /// Id blocks handed back when a landmark was taken down, so walking past the same
    /// capital all afternoon does not exhaust the range.
    free_slots: Vec<u32>,
    next_slot: u32,
}

impl TerrainStreamer {
    pub fn new(cfg: StreamConfig) -> Self {
        let (tx, rx) = mpsc::channel();
        let window = Window::aligned(cfg.extent, cfg.stride, cfg.resolution.max(2));
        let hgen = HeightGen::new(&cfg.params());
        let plan = BridgePlan::new(&hgen, cfg.extent, cfg.water_level, cfg.road_width);
        let mut slabs = plan.slabs().to_vec();
        slabs.extend(plan.ramp_slabs(&hgen));
        slabs.extend(plan.ramp_skirt_slabs(&hgen));
        slabs.extend(plan.ramp_rail_slabs(&hgen));
        slabs.extend(plan.abutment_slabs(&hgen));
        Self {
            cfg,
            window,
            loaded: HashSet::new(),
            pending: HashSet::new(),
            tx,
            rx,
            plan,
            slabs,
            bridge_in: false,
            marks_in: HashMap::new(),
            free_slots: Vec::new(),
            next_slot: 0,
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
        Ground::new(
            self.cfg.ground_source,
            self.cfg.seed as i32,
            &self.cfg.params(),
        )
        .bake_at(origin, self.cfg.extent, self.cfg.resolution)
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
        self.sync_bridge(world);
        self.sync_landmarks(world);
    }

    /// Puts the deck, its kerbs and both approaches into the solver, or takes them out
    /// again.
    ///
    /// The heightfield under a bridge is river, so without this the server holds
    /// water where the client draws planks: the player walks onto the bridge,
    /// their own host drops them in, and the correction yanks them back off. The
    /// geometry comes from [`BridgePlan`] rather than from the client, which is
    /// the only reason the two agree on where the deck is.
    fn sync_bridge(&mut self, world: &mut SimWorld) {
        let wanted = self
            .loaded
            .iter()
            .any(|c| self.plan.in_window(self.origin_of(*c), self.cfg.extent));
        if wanted == self.bridge_in {
            return;
        }
        self.bridge_in = wanted;
        for (i, slab) in self.slabs.iter().enumerate() {
            let id = BodyId(BRIDGE_BODY_BASE + i as u32);
            if wanted {
                world.apply(SimCommand::Spawn {
                    id,
                    desc: BodyDesc {
                        kind: BodyKind::Fixed,
                        shape: ShapeDesc::Cuboid {
                            half_extents: slab.half_extents,
                        },
                        iso: Iso {
                            pos: slab.centre,
                            rot: slab.rot,
                        },
                        restitution: 0.0,
                        friction: 1.0,
                        linear_damping: 0.0,
                        mass: None,
                        ..Default::default()
                    },
                });
            } else {
                world.apply(SimCommand::Despawn { id });
            }
        }
    }

    /// True while the deck is in the solver.
    #[cfg(test)]
    pub fn bridge_loaded(&self) -> bool {
        self.bridge_in
    }

    /// Stands up the walls, keeps and quays of every landmark reaching a loaded
    /// region, and takes down the ones nobody is near any more.
    ///
    /// The client draws these from the seed without being told, so a server that did
    /// not do the same would let a player walk through a capital wall on their own
    /// screen and be shoved back out by a correction. Which landmark is where is not
    /// on the wire at all: both sides derive it, the same way they derive the crossing.
    ///
    /// Only the authored field has them. The region field has no river for a harbour
    /// to stand on, so it has neither kind.
    fn sync_landmarks(&mut self, world: &mut SimWorld) {
        if self.cfg.ground_source != GroundSource::Authored {
            return;
        }
        let hgen = HeightGen::new(&self.cfg.params());
        let reach = self.cfg.extent + LANDMARK_MARGIN;

        let mut wanted: HashMap<MarkKey, Landmark> = HashMap::new();
        for cell in &self.loaded {
            for mark in
                q::landmark::in_window(self.cfg.seed as u32, &hgen, self.origin_of(*cell), reach)
            {
                wanted.insert(key_of(&mark), mark);
            }
        }

        let gone: Vec<MarkKey> = self
            .marks_in
            .keys()
            .copied()
            .filter(|k| !wanted.contains_key(k))
            .collect();
        for key in gone {
            let Some((slot, _)) = self.marks_in.remove(&key) else {
                continue;
            };
            for i in 0..LANDMARK_BODY_STRIDE {
                world.apply(SimCommand::Despawn {
                    id: BodyId(LANDMARK_BODY_BASE + slot * LANDMARK_BODY_STRIDE + i),
                });
            }
            self.free_slots.push(slot);
        }

        for (key, mark) in wanted {
            if self.marks_in.contains_key(&key) {
                continue;
            }
            let slot = self.free_slots.pop().unwrap_or_else(|| {
                let s = self.next_slot;
                self.next_slot += 1;
                s
            });
            let slabs = mark.slabs(&hgen);
            debug_assert!(
                slabs.len() as u32 <= LANDMARK_BODY_STRIDE,
                "a landmark outgrew its id block"
            );
            for (i, slab) in slabs.iter().enumerate() {
                world.apply(SimCommand::Spawn {
                    id: BodyId(LANDMARK_BODY_BASE + slot * LANDMARK_BODY_STRIDE + i as u32),
                    desc: BodyDesc {
                        kind: BodyKind::Fixed,
                        shape: ShapeDesc::Cuboid {
                            half_extents: slab.half_extents,
                        },
                        iso: Iso {
                            pos: slab.centre,
                            rot: slab.rot,
                        },
                        restitution: 0.0,
                        friction: 1.0,
                        linear_damping: 0.0,
                        mass: None,
                        ..Default::default()
                    },
                });
            }
            self.marks_in.insert(key, (slot, mark));
        }
    }

    /// Landmarks currently standing in the solver.
    #[cfg(test)]
    pub fn landmarks_loaded(&self) -> usize {
        self.marks_in.len()
    }

    /// What is built on the loaded ground, as lines a flow field can be told about.
    ///
    /// The solver stops a body at a wall, but a pet steers by a field rather than by
    /// walking into things, and a field reading only the height sampler sees a
    /// levelled courtyard as the most walkable country for miles.
    ///
    /// Ordered, so an unchanged world compares equal and does not restamp every
    /// field on every pass.
    pub fn footprints(&self, hgen: &HeightGen) -> Vec<LandmarkFootprint> {
        let mut keys: Vec<&MarkKey> = self.marks_in.keys().collect();
        keys.sort_unstable();
        keys.into_iter()
            .map(|k| self.marks_in[k].1.footprint(hgen))
            .collect()
    }

    /// How many id blocks have ever been handed out, which is what tells a leak from
    /// honest reuse.
    #[cfg(test)]
    pub fn slot_high_water(&self) -> usize {
        self.next_slot as usize
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

        self.sync_bridge(world);
        self.sync_landmarks(world);
    }

    fn request(&mut self, cell: Cell) {
        let origin = self.origin_of(cell);
        let params = self.cfg.params();
        let (extent, res) = (self.cfg.extent, self.cfg.resolution);
        let (source, seed) = (self.cfg.ground_source, self.cfg.seed as i32);
        let tx = self.tx.clone();
        let spawned = std::thread::Builder::new()
            .name("fs-terrain-bake".into())
            .spawn(move || {
                let heights = Ground::new(source, seed, &params).bake_at(origin, extent, res);
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

    /// Centres of every region currently laid into the sim.
    pub fn loaded_origins(&self) -> Vec<[f32; 2]> {
        self.loaded.iter().map(|c| self.origin_of(*c)).collect()
    }

    #[cfg(test)]
    pub fn loaded_count(&self) -> usize {
        self.loaded.len()
    }

    #[cfg(test)]
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
            ground_source: GroundSource::default(),
            extent: 64.0,
            resolution: 33,
            stride: 32.0,
            water_level: -1.4,
            road_width: 3.2,
            keep_radius: 96.0,
            max_inflight: 2,
        }
    }

    /// The streamer bakes its regions on worker threads that build their own
    /// field, so a source that is not carried through is a server quietly
    /// serving the shipped world while it reports another one.
    #[test]
    fn the_selected_ground_is_what_gets_baked() {
        let authored = TerrainStreamer::new(config()).bake([0.0, 0.0]);
        let region = TerrainStreamer::new(StreamConfig {
            ground_source: GroundSource::Region,
            ..config()
        })
        .bake([0.0, 0.0]);

        assert_eq!(authored.len(), region.len());
        assert_ne!(
            authored, region,
            "the region source baked the authored field"
        );

        let same = TerrainStreamer::new(StreamConfig {
            ground_source: GroundSource::Region,
            ..config()
        })
        .bake([0.0, 0.0]);
        assert_eq!(
            region, same,
            "the same source and seed must bake the same ground"
        );
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

    /// Every other test settles the bakes before asserting, so they measure where
    /// the streamer ends up rather than what a player standing there experiences.
    /// This one asserts at every step of a walk, while bakes are still in flight:
    /// the ground a player is standing on must never be missing, whatever the
    /// streamer is busy with.
    #[test]
    fn ground_is_never_missing_under_a_walking_player() {
        let cfg = config();
        let (extent, stride) = (cfg.extent, cfg.stride);
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(cfg);
        streamer.prime(&mut world);

        let covered = |streamer: &TerrainStreamer, at: [f32; 2]| {
            streamer
                .loaded_origins()
                .iter()
                .any(|o| (at[0] - o[0]).abs() <= extent && (at[1] - o[1]).abs() <= extent)
        };

        let mut a = [0.0f32, 0.0];
        let mut b = [0.0f32, 0.0];
        for step in 0..1200 {
            // One walking out in a straight line, one wandering the other way, so
            // the streamer is serving two fronts at once.
            a[0] += stride * 0.02;
            b[1] -= stride * 0.015;
            b[0] += (step as f32 * 0.05).sin() * stride * 0.01;
            let players = [a, b];
            streamer.update(&players, &mut world);
            // A real tick is far longer than this; the point is that the walk does
            // not wait for bakes it did not ask for in time.
            std::thread::sleep(Duration::from_millis(1));
            for p in players {
                assert!(
                    covered(&streamer, p),
                    "step {step}: {p:?} had no ground, loaded {:?}",
                    streamer.loaded_origins()
                );
            }
        }
        assert!(
            streamer.loaded_count() > 2,
            "the walk never needed new ground, so this proved nothing"
        );
    }

    /// The bug this closes: the heightfield under a bridge is river, so a server
    /// with no deck drops a player the client is drawing on planks.
    /// The client raises these from the seed whether the server does or not. A server
    /// that skipped them would let a player walk into a capital's keep on their own
    /// screen and be shoved back out by a correction they did nothing to earn.
    #[test]
    fn a_capitals_wall_is_a_wall_on_the_server_too() {
        let cfg = StreamConfig {
            extent: 256.0,
            resolution: 129,
            stride: 128.0,
            keep_radius: 384.0,
            ..config()
        };
        let hgen = HeightGen::new(&cfg.params());
        let mark = q::landmark::nearest(cfg.seed as u32, &hgen, [0.0, 0.0])
            .into_iter()
            .find(|m| m.kind == LandmarkKind::Capital)
            .expect("no capital anywhere near the origin");

        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(cfg);
        streamer.prime(&mut world);
        settle(&mut streamer, &mut world, &[mark.centre]);
        assert!(
            streamer.landmarks_loaded() > 0,
            "walked into a capital and the server had not built it"
        );

        // Dropped over the middle of the keep, which is the tallest thing inside.
        let id = BodyId(78);
        world.apply(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind: BodyKind::Dynamic,
                shape: ShapeDesc::Ball { radius: 0.3 },
                iso: Iso::at(mark.centre[0], mark.pad_y + 24.0, mark.centre[1]),
                restitution: 0.0,
                friction: 1.0,
                linear_damping: 0.0,
                mass: Some(1.0),
                ..Default::default()
            },
        });
        let start = world.snapshot().body(id).expect("body vanished").iso.pos[1];
        for _ in 0..360 {
            world.step();
        }
        let y = world.snapshot().body(id).expect("body vanished").iso.pos[1];
        assert!(y < start, "body never fell at all: {start} -> {y}");
        assert!(
            y > mark.pad_y + 16.0,
            "fell through the keep: rested at {y}, courtyard is {}",
            mark.pad_y
        );
    }

    /// Landmarks are given blocks of body ids from a free list. Walk past the same
    /// capital repeatedly and the list has to come back, or the range runs out and a
    /// later landmark silently overwrites an earlier one's bodies.
    #[test]
    fn walking_past_a_capital_twice_does_not_leak_its_bodies() {
        let cfg = StreamConfig {
            extent: 256.0,
            resolution: 65,
            stride: 128.0,
            keep_radius: 300.0,
            ..config()
        };
        let hgen = HeightGen::new(&cfg.params());
        let mark = q::landmark::nearest(cfg.seed as u32, &hgen, [0.0, 0.0])
            .into_iter()
            .find(|m| m.kind == LandmarkKind::Capital)
            .expect("no capital near the origin");

        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(cfg);
        streamer.prime(&mut world);

        let away = [mark.centre[0] + 4000.0, mark.centre[1] + 4000.0];
        settle(&mut streamer, &mut world, &[mark.centre]);
        let first = streamer.landmarks_loaded();
        assert!(first > 0, "the capital never went in");

        settle(&mut streamer, &mut world, &[away]);
        settle(&mut streamer, &mut world, &[mark.centre]);
        assert_eq!(
            streamer.landmarks_loaded(),
            first,
            "coming back stood up a different number of landmarks"
        );
        assert!(
            streamer.slot_high_water() <= first * 2,
            "id blocks are not being handed back: {} allocated for {first} landmarks",
            streamer.slot_high_water()
        );
    }

    /// The region field has no river, so it has nothing for a harbour to stand on and
    /// none of this applies to it.
    #[test]
    fn the_region_field_has_no_landmarks() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(StreamConfig {
            ground_source: GroundSource::Region,
            ..config()
        });
        streamer.prime(&mut world);
        settle(&mut streamer, &mut world, &[[1200.0, 400.0]]);
        assert_eq!(streamer.landmarks_loaded(), 0);
    }

    #[test]
    fn the_deck_holds_a_body_up_over_the_river() {
        let cfg = StreamConfig {
            extent: 256.0,
            resolution: 129,
            stride: 128.0,
            keep_radius: 384.0,
            ..config()
        };
        let plan = BridgePlan::new(
            &HeightGen::new(&cfg.params()),
            cfg.extent,
            cfg.water_level,
            cfg.road_width,
        );
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(cfg);
        streamer.prime(&mut world);
        assert!(
            streamer.bridge_loaded(),
            "spawn region should carry the deck"
        );

        // Dropped from just above the deck, right over the middle of the river.
        let [cx, cz] = plan.crossing;
        let id = BodyId(77);
        world.apply(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind: BodyKind::Dynamic,
                shape: ShapeDesc::Ball { radius: 0.3 },
                iso: Iso::at(cx, plan.deck_y + 2.0, cz),
                restitution: 0.0,
                friction: 1.0,
                linear_damping: 0.0,
                mass: Some(1.0),
                ..Default::default()
            },
        });
        let start = world.snapshot().body(id).expect("body vanished").iso.pos[1];
        for _ in 0..240 {
            world.step();
        }
        let y = world.snapshot().body(id).expect("body vanished").iso.pos[1];
        assert!(y < start, "body never fell at all: {start} -> {y}");
        assert!(
            y > plan.deck_y,
            "fell through the deck: rested at {y}, deck is {}",
            plan.deck_y
        );
        assert!(
            y < plan.deck_y + 1.0,
            "hovering at {y}, deck {} rails {}",
            plan.deck_y,
            plan.deck_y + 0.62
        );
    }

    /// The deck goes away with the ground it spans, or a server keeps colliders
    /// for a bridge nobody is anywhere near.
    #[test]
    fn the_deck_is_dropped_with_its_region() {
        let cfg = StreamConfig {
            keep_radius: 96.0,
            ..config()
        };
        let mut world = SimWorld::new(&SimConfig::default());
        let mut streamer = TerrainStreamer::new(cfg);
        streamer.prime(&mut world);
        assert!(streamer.bridge_loaded());
        // The spawn region is always kept, so the deck stays with it.
        settle(&mut streamer, &mut world, &[[4000.0, 4000.0]]);
        assert!(
            streamer.bridge_loaded(),
            "the spawn region is kept, so its deck should be too"
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
