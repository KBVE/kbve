//! Which field the world's ground comes from.
//!
//! Two exist and they answer different questions. The authored field is a
//! landscape someone tuned: hills, and one river carved down the z axis that the
//! road, the bridge and the fishing all hang off. The region field is a
//! landscape that argues for itself: sinks placed first and ground derived from
//! them, so relief is bounded and every point drains somewhere no matter how far
//! out you walk.
//!
//! The authored field is what ships. The region field is what an endless world
//! needs, and it is reachable here so it can be walked around in before anything
//! depends on it.
//!
//! What separates them is [`river_centre`]. The authored field has exactly one
//! river and can say where it is for any `z`; the region field has seas and
//! lakes but no river, because a river is a drainage question and drainage is a
//! graph over the ground rather than a property of a point. Everything that
//! needs a river to exist asks, and gets `None`.

use crate::region::{RegionGen, RegionParams};
use crate::worldgen::{HeightGen, HeightParams};

/// Which of the two fields a world is built on.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GroundSource {
    /// Hills and the one authored river. What ships.
    #[default]
    Authored,
    /// Sinks, and ground derived from them.
    Region,
}

impl GroundSource {
    /// Parsed from configuration, where an unknown value is the shipped world
    /// rather than an error: this selects a landscape, and refusing to start
    /// over a typo is worse than starting in the one everybody already has.
    pub fn parse(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "region" | "sinks" => Self::Region,
            _ => Self::Authored,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Authored => "authored",
            Self::Region => "region",
        }
    }
}

/// A built field, ready to be sampled.
pub enum Ground {
    Authored(Box<HeightGen>),
    Region(Box<RegionGen>),
}

impl Ground {
    pub fn new(source: GroundSource, seed: i32, authored: &HeightParams) -> Self {
        match source {
            GroundSource::Authored => Self::Authored(Box::new(HeightGen::new(authored))),
            GroundSource::Region => Self::Region(Box::new(RegionGen::new(&RegionParams {
                seed,
                sea_level: authored.water_level,
                ..Default::default()
            }))),
        }
    }

    pub fn source(&self) -> GroundSource {
        match self {
            Self::Authored(_) => GroundSource::Authored,
            Self::Region(_) => GroundSource::Region,
        }
    }

    pub fn height(&self, x: f32, z: f32) -> f32 {
        match self {
            Self::Authored(g) => g.height(x, z),
            Self::Region(g) => g.height(x, z),
        }
    }

    /// Row-major `res * res` heights over `[-extent, extent]` about `origin`.
    pub fn bake_at(&self, origin: [f32; 2], extent: f32, res: i32) -> Vec<f32> {
        match self {
            Self::Authored(g) => g.bake_at(origin, extent, res),
            Self::Region(g) => g.bake_at(origin, extent, res),
        }
    }

    pub fn bake(&self, extent: f32, res: i32) -> Vec<f32> {
        self.bake_at([0.0, 0.0], extent, res)
    }

    /// Where the one river runs at this `z`, or `None` where there is no such
    /// thing.
    ///
    /// The road, the bridge and the fish all start from this, so `None` is what
    /// tells them not to be built rather than to be built somewhere arbitrary.
    pub fn river_centre(&self, z: f32) -> Option<f32> {
        match self {
            Self::Authored(g) => Some(g.river_x(z)),
            Self::Region(_) => None,
        }
    }

    /// Height every water surface sits at.
    pub fn water_level(&self) -> f32 {
        match self {
            Self::Authored(g) => g.water_level(),
            Self::Region(g) => g.params().sea_level,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn authored() -> HeightParams {
        HeightParams::default()
    }

    #[test]
    fn an_unknown_source_is_the_shipped_world() {
        assert_eq!(GroundSource::parse("region"), GroundSource::Region);
        assert_eq!(GroundSource::parse("  REGION "), GroundSource::Region);
        assert_eq!(GroundSource::parse("sinks"), GroundSource::Region);
        assert_eq!(GroundSource::parse("authored"), GroundSource::Authored);
        assert_eq!(GroundSource::parse("rgion"), GroundSource::Authored);
        assert_eq!(GroundSource::parse(""), GroundSource::Authored);
        assert_eq!(GroundSource::default(), GroundSource::Authored);
    }

    /// Selecting a source must not disturb the world it did not select. The
    /// authored path has to bake exactly what it baked before this existed.
    #[test]
    fn the_authored_source_is_the_authored_field_untouched() {
        let p = authored();
        let g = Ground::new(GroundSource::Authored, p.seed, &p);
        let direct = HeightGen::new(&p);
        assert_eq!(g.bake(128.0, 65), direct.bake(128.0, 65));
        for z in [-300.0f32, -1.0, 0.0, 17.5, 900.0] {
            assert_eq!(g.river_centre(z), Some(direct.river_x(z)));
        }
    }

    #[test]
    fn the_region_source_has_seas_but_no_river() {
        let p = authored();
        let g = Ground::new(GroundSource::Region, p.seed, &p);
        assert_eq!(g.source(), GroundSource::Region);
        for z in [-300.0f32, 0.0, 900.0] {
            assert_eq!(g.river_centre(z), None);
        }
        assert_eq!(g.water_level(), p.water_level);
    }

    /// Both fields have to be bakeable the same way, or the streaming window
    /// cannot be written once and pointed at either.
    #[test]
    fn either_source_bakes_a_grid_that_matches_its_own_points() {
        let p = authored();
        for source in [GroundSource::Authored, GroundSource::Region] {
            let g = Ground::new(source, p.seed, &p);
            let (origin, extent, res) = ([256.0f32, -128.0], 64.0f32, 33);
            let grid = g.bake_at(origin, extent, res);
            let step = extent * 2.0 / (res - 1) as f32;
            for iy in 0..res {
                let z = origin[1] - extent + iy as f32 * step;
                for ix in 0..res {
                    let x = origin[0] - extent + ix as f32 * step;
                    assert_eq!(
                        grid[(iy * res + ix) as usize].to_bits(),
                        g.height(x, z).to_bits(),
                        "{} disagrees with its own bake",
                        source.as_str()
                    );
                }
            }
        }
    }

    /// The two must actually be different landscapes, or the switch is
    /// decoration.
    #[test]
    fn the_two_sources_are_different_ground() {
        let p = authored();
        let a = Ground::new(GroundSource::Authored, p.seed, &p);
        let b = Ground::new(GroundSource::Region, p.seed, &p);
        assert_ne!(a.bake(256.0, 65), b.bake(256.0, 65));
    }
}
