//! Stone and tree colliders for the regions the terrain streamer has loaded.

use std::collections::HashMap;

use q::rapier::sim3d::{BodyDesc, BodyId, BodyKind, Iso, ShapeDesc, SimCommand, SimWorld};
use q::worldgen::{HeightGen, HeightParams, RoadPlan, StoneScatter, TreeScatter};

const PROP_BODY_BASE: u32 = 100_000;
const PROP_BODY_CEILING: u32 = 900_000;

type Cell = [i32; 2];

pub struct PropConfig {
    pub seed: u64,
    pub extent: f32,
    pub stride: f32,
    pub water_level: f32,
    pub road_width: f32,
    /// Must match `QTreeField`'s grid size, or the host and the client stand their
    /// trees in different places and a player walks through one while being stopped
    /// by another that is not there.
    pub tree_grid_size: f32,
}

pub struct PropField {
    cfg: PropConfig,
    hgen: HeightGen,
    road: RoadPlan,
    scatter: StoneScatter,
    trees: TreeScatter,
    loaded: HashMap<Cell, Region>,
    next_id: u32,
    free: Vec<BodyId>,
    /// Bumped whenever the loaded set changes, so a reader can tell whether the
    /// discs it last took are still current without comparing them.
    revision: u64,
}

struct Region {
    bodies: Vec<BodyId>,
    /// Flat `x, z, radius` triples, kept from the placement pass rather than
    /// scattered again. A flow field wants these every time it restamps, and
    /// re-running the scatter for that is the same work twice.
    discs: Vec<f32>,
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
        let trees = TreeScatter {
            seed: cfg.seed as i32,
            grid_size: cfg.tree_grid_size,
            ..TreeScatter::default()
        };
        Self {
            cfg,
            hgen,
            road,
            scatter,
            trees,
            loaded: HashMap::new(),
            next_id: PROP_BODY_BASE,
            free: Vec::new(),
            revision: 0,
        }
    }

    /// Changes as the loaded region set changes, and not otherwise.
    pub fn revision(&self) -> u64 {
        self.revision
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
        if self.next_id >= PROP_BODY_CEILING {
            return None;
        }
        let id = BodyId(self.next_id);
        self.next_id += 1;
        Some(id)
    }

    /// Brings the prop colliders in line with the regions currently loaded.
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
            if let Some(region) = self.loaded.remove(&cell) {
                for id in region.bodies {
                    world.apply(SimCommand::Despawn { id });
                    self.free.push(id);
                }
            }
            self.revision += 1;
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
        let discs = StoneScatter::discs(&placements);
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
        let stones = ids.len();
        let mut discs = discs;
        self.load_trees(origin, world, &mut ids, &mut discs);
        tracing::debug!(
            ?origin,
            stones,
            trees = ids.len() - stones,
            "prop colliders in"
        );
        self.loaded.insert(cell, Region { bodies: ids, discs });
        self.revision += 1;
    }

    /// Stands a trunk in the sim for every tree this region grew.
    ///
    /// The host derives the forest from the seed exactly as the client does, so neither
    /// has to be told where it is. A trunk is all that goes in: the crown is over a
    /// walker's head and the roots are under their feet, and neither is something to
    /// walk into.
    ///
    /// The trunks join the discs too. A flow field that routes a pet round every rock
    /// and straight through every tree has not routed it round anything.
    fn load_trees(
        &mut self,
        origin: [f32; 2],
        world: &mut SimWorld,
        ids: &mut Vec<BodyId>,
        discs: &mut Vec<f32>,
    ) {
        for p in self.trees.place(
            &self.hgen,
            Some(&self.road),
            origin,
            self.cfg.extent,
            self.cfg.water_level,
        ) {
            let Some(id) = self.take_id() else {
                tracing::warn!("tree body ids exhausted; region left partly uncollidable");
                break;
            };
            let (half_height, radius) = self.trees.trunk(p.scale);
            world.apply(SimCommand::Spawn {
                id,
                desc: BodyDesc {
                    kind: BodyKind::Fixed,
                    shape: ShapeDesc::Cylinder {
                        half_height,
                        radius,
                    },
                    iso: Iso {
                        pos: [p.pos[0], p.base_y + half_height, p.pos[1]],
                        ..Iso::IDENTITY
                    },
                    ..BodyDesc::default()
                },
            });
            ids.push(id);
            discs.extend_from_slice(&[p.pos[0], p.pos[1], radius]);
        }
    }

    /// Flat `x, z, radius` triples for every region loaded, which is the shape a
    /// flow field stamps.
    ///
    /// Sorted by cell so the same loaded set always produces the same order, which
    /// is what lets a reader skip work when nothing has moved.
    pub fn discs(&self) -> Vec<f32> {
        let mut cells: Vec<&Cell> = self.loaded.keys().collect();
        cells.sort_unstable();
        let mut out = Vec::new();
        for cell in cells {
            out.extend_from_slice(&self.loaded[cell].discs);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use q::rapier::sim3d::SimConfig;

    fn field() -> PropField {
        PropField::new(PropConfig {
            seed: 1234,
            extent: 128.0,
            stride: 64.0,
            water_level: HeightParams::default().water_level,
            road_width: 3.2,
            tree_grid_size: 14.0,
        })
    }

    /// A region the host has loaded has to have its trees in it, not just its rocks.
    /// A player who can see a tree the host never stood up walks straight through it.
    #[test]
    fn a_loaded_region_stands_up_its_trees_as_well_as_its_stones() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut props = field();

        let trees = props
            .trees
            .place(
                &props.hgen,
                Some(&props.road),
                [0.0, 0.0],
                props.cfg.extent,
                props.cfg.water_level,
            )
            .len();
        assert!(
            trees > 0,
            "this seed was supposed to grow a wood to test with"
        );

        props.sync(&[[0.0, 0.0]], &mut world);
        let loaded: usize = props.loaded.values().map(|r| r.bodies.len()).sum();
        assert!(
            loaded > trees,
            "a region with {trees} trees stood up only {loaded} bodies, so the rocks or \
             the trees are missing"
        );

        // And every trunk is an obstacle a pet routes around, not just something a
        // player bumps into.
        assert_eq!(
            props.discs().len() % 3,
            0,
            "the disc list is flat x, z, radius triples"
        );
        assert!(
            props.discs().len() / 3 >= trees,
            "the trunks are not in the discs"
        );
    }

    /// Walking away has to take the trees down with the rocks, or the host keeps
    /// paying for every wood it has ever streamed.
    #[test]
    fn leaving_a_region_takes_its_trees_down_too() {
        let mut world = SimWorld::new(&SimConfig::default());
        let mut props = field();
        props.sync(&[[0.0, 0.0]], &mut world);
        assert!(!props.loaded.is_empty());

        props.sync(&[[4096.0, 4096.0]], &mut world);
        assert!(
            props.loaded.keys().all(|c| *c != [0, 0]),
            "the region was left loaded after the players walked out of it"
        );
    }
}
