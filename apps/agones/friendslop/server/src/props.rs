//! Stone colliders for the regions the terrain streamer has loaded.

use std::collections::HashMap;

use q::rapier::sim3d::{BodyDesc, BodyId, BodyKind, Iso, ShapeDesc, SimCommand, SimWorld};
use q::worldgen::{HeightGen, HeightParams, RoadPlan, StoneScatter};

const STONE_BODY_BASE: u32 = 100_000;
const STONE_BODY_CEILING: u32 = 900_000;

type Cell = [i32; 2];

pub struct PropConfig {
    pub seed: u64,
    pub extent: f32,
    pub stride: f32,
    pub water_level: f32,
    pub road_width: f32,
}

pub struct PropField {
    cfg: PropConfig,
    hgen: HeightGen,
    road: RoadPlan,
    scatter: StoneScatter,
    loaded: HashMap<Cell, Vec<BodyId>>,
    next_id: u32,
    free: Vec<BodyId>,
}

impl PropField {
    pub fn new(cfg: PropConfig) -> Self {
        let params = HeightParams {
            seed: cfg.seed as i32,
            ..Default::default()
        };
        let hgen = HeightGen::new(&params);
        let road = RoadPlan::new(
            &hgen,
            [0.0, 0.0],
            cfg.extent,
            cfg.water_level,
            cfg.road_width,
        );
        let scatter = StoneScatter {
            seed: cfg.seed as i32,
            ..Default::default()
        };
        Self {
            cfg,
            hgen,
            road,
            scatter,
            loaded: HashMap::new(),
            next_id: STONE_BODY_BASE,
            free: Vec::new(),
        }
    }

    fn cell_of(origin: [f32; 2], stride: f32) -> Cell {
        [
            (origin[0] / stride).round() as i32,
            (origin[1] / stride).round() as i32,
        ]
    }

    fn take_id(&mut self) -> Option<BodyId> {
        if let Some(id) = self.free.pop() {
            return Some(id);
        }
        if self.next_id >= STONE_BODY_CEILING {
            return None;
        }
        let id = BodyId(self.next_id);
        self.next_id += 1;
        Some(id)
    }

    /// Brings the stone colliders in line with the regions currently loaded.
    pub fn sync(&mut self, regions: &[[f32; 2]], world: &mut SimWorld) {
        let wanted: Vec<Cell> = regions
            .iter()
            .map(|o| Self::cell_of(*o, self.cfg.stride))
            .collect();

        let stale: Vec<Cell> = self
            .loaded
            .keys()
            .copied()
            .filter(|c| !wanted.contains(c))
            .collect();
        for cell in stale {
            if let Some(ids) = self.loaded.remove(&cell) {
                for id in ids {
                    world.apply(SimCommand::Despawn { id });
                    self.free.push(id);
                }
            }
        }

        for (cell, origin) in wanted.iter().zip(regions.iter()) {
            if self.loaded.contains_key(cell) {
                continue;
            }
            self.load(*cell, *origin, world);
        }
    }

    fn load(&mut self, cell: Cell, origin: [f32; 2], world: &mut SimWorld) {
        let placements = self.scatter.place(
            &self.hgen,
            Some(&self.road),
            origin,
            self.cfg.extent,
            self.cfg.water_level,
        );
        let mut ids = Vec::with_capacity(placements.len());
        for p in &placements {
            let Some(id) = self.take_id() else {
                tracing::warn!("stone body ids exhausted; region left partly uncollidable");
                break;
            };
            // Bedded rather than balanced on the surface, matching how the client
            // seats them, so a body walks into a rock instead of over it.
            let y = self.hgen.height(p.pos[0], p.pos[1]) + p.radius * 0.45;
            world.apply(SimCommand::Spawn {
                id,
                desc: BodyDesc {
                    kind: BodyKind::Fixed,
                    shape: ShapeDesc::Ball { radius: p.radius },
                    iso: Iso {
                        pos: [p.pos[0], y, p.pos[1]],
                        ..Iso::IDENTITY
                    },
                    ..BodyDesc::default()
                },
            });
            ids.push(id);
        }
        tracing::debug!(?origin, stones = ids.len(), "stone colliders in");
        self.loaded.insert(cell, ids);
    }

    pub fn stone_count(&self) -> usize {
        self.loaded.values().map(|v| v.len()).sum()
    }

    /// Flat `x, z, radius` triples for every region loaded, which is the shape a
    /// flow field stamps.
    pub fn discs(&self, regions: &[[f32; 2]]) -> Vec<f32> {
        let mut out = Vec::new();
        for origin in regions {
            let placements = self.scatter.place(
                &self.hgen,
                Some(&self.road),
                *origin,
                self.cfg.extent,
                self.cfg.water_level,
            );
            out.extend(StoneScatter::discs(&placements));
        }
        out
    }
}
