use crate::tiles::TileMask;

/// World scale and static geometry dimensions.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldConfig {
    /// Edge length of one tile in world units.
    pub tile: f32,
    /// Height of a solid tile's wall block.
    pub wall_height: f32,
    /// Half-thickness of a floor slab. The slab's top face sits at y=0 for any
    /// value, so this is a robustness knob rather than a gameplay one.
    pub floor_half: f32,
}

impl Default for WorldConfig {
    fn default() -> Self {
        Self {
            tile: 1.0,
            wall_height: 3.0,
            floor_half: 0.5,
        }
    }
}

/// Capsule dimensions and kinematic character controller tuning.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CharacterConfig {
    /// Capsule half-height, excluding the end caps.
    pub half_height: f32,
    pub radius: f32,
    /// Controller skin width; the capsule rests this far off a surface.
    pub offset: f32,
    pub autostep_max_height: f32,
    pub autostep_min_width: f32,
    pub autostep_dynamic_bodies: bool,
    /// `None` disables snap-to-ground.
    pub snap_to_ground: Option<f32>,
    pub gravity: f32,
    /// Exponential approach rate toward the desired horizontal velocity.
    pub accel: f32,
    pub walk_speed: f32,
    pub run_speed: f32,
}

impl CharacterConfig {
    /// Distance from the reported foot position up to the capsule's centre.
    #[inline]
    pub fn centre_offset(&self) -> f32 {
        self.half_height + self.radius
    }
}

impl Default for CharacterConfig {
    fn default() -> Self {
        Self {
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
        }
    }
}

/// Fixed simulation step. Keep `dt` shorter than a display frame: at exactly
/// 1/60 a 60Hz frame straddles the boundary and takes 0 or 2 steps, which reads
/// as judder.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StepConfig {
    pub dt: f32,
    pub max_steps: u32,
}

impl Default for StepConfig {
    fn default() -> Self {
        Self {
            dt: 1.0 / 120.0,
            max_steps: 8,
        }
    }
}

/// Everything a [`crate::PhysicsWorld`] needs to interpret a tile buffer.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct SimbodyConfig {
    pub world: WorldConfig,
    pub character: CharacterConfig,
    pub step: StepConfig,
    pub mask: TileMask,
}
