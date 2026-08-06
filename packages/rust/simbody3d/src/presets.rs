use crate::config::{CharacterConfig, SimbodyConfig, StepConfig, WorldConfig};
use crate::tiles::TileMask;

/// Herbmail's tile bitfield, mirroring `game/geometry/grid.ts`. Only SOLID and
/// PIT reach collision; the rest are rendering concerns listed so the mapping is
/// checkable against the client.
pub mod herbmail_tiles {
    pub const SOLID: u8 = 1 << 0;
    pub const OCCLUDES: u8 = 1 << 1;
    pub const DOORWAY: u8 = 1 << 2;
    pub const PILLAR: u8 = 1 << 3;
    pub const PIT: u8 = 1 << 4;
    pub const OPEN: u8 = 1 << 5;

    pub const FLOOR: u8 = 0;
    pub const WALL: u8 = SOLID | OCCLUDES;
    pub const ARCH: u8 = DOORWAY;
    pub const COLUMN: u8 = SOLID | PILLAR;
    pub const OASIS: u8 = PIT;
}

/// Herbmail's world and character dimensions.
///
/// These are the numbers the client's physics worker already runs with, and the
/// single place they are declared for any consumer of this crate — a second
/// declaration is how an authoritative and a predicted body quietly diverge.
pub fn herbmail() -> SimbodyConfig {
    SimbodyConfig {
        world: WorldConfig {
            tile: 3.0,
            wall_height: 9.0,
            floor_half: 0.5,
        },
        character: CharacterConfig {
            half_height: 0.6,
            radius: 0.35,
            offset: 0.02,
            autostep_max_height: 0.5,
            autostep_min_width: 0.2,
            autostep_dynamic_bodies: true,
            snap_to_ground: Some(0.5),
            gravity: 22.0,
            accel: 12.0,
            walk_speed: 1.8,
            run_speed: 4.5,
        },
        step: StepConfig {
            dt: 1.0 / 120.0,
            max_steps: 8,
        },
        mask: TileMask {
            solid: herbmail_tiles::SOLID,
            no_floor: herbmail_tiles::PIT,
        },
    }
}
