pub const TILE: f32 = 3.0;
pub const WALL_H: f32 = 9.0;

pub const PLAYER_HALF: f32 = 0.6;
pub const PLAYER_RADIUS: f32 = 0.35;

/// Half-thickness of the floor slab; its top face sits exactly at y=0.
pub const FLOOR_HALF: f32 = 0.5;

pub const MOTOR_DT: f32 = 1.0 / 120.0;
pub const MOTOR_MAX_STEPS: u32 = 8;
pub const MOTOR_ACCEL: f32 = 12.0;
pub const GRAVITY: f32 = 22.0;
pub const WALK_SPEED: f32 = 1.8;
pub const RUN_SPEED: f32 = 4.5;

pub const KCC_OFFSET: f32 = 0.02;
pub const AUTOSTEP_MAX_HEIGHT: f32 = 0.5;
pub const AUTOSTEP_MIN_WIDTH: f32 = 0.2;
pub const SNAP_TO_GROUND: f32 = 0.5;

/// Capsule centre offset above the reported foot position.
pub const CAPSULE_CENTRE_Y: f32 = PLAYER_HALF + PLAYER_RADIUS;
