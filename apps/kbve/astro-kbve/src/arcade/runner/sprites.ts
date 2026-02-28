// ============================================================================
// Knight Sprite Configuration
// ============================================================================

// Scale factor for knight sprites to match background proportions
export const KNIGHT_SCALE = 2.5;

// Frame size for all knight sprites (each frame is 120x80 - width x height)
// The canvas was kept larger with padding to be consistent across all animations
export const KNIGHT_FRAME = {
	width: 120,
	height: 80,
} as const;

// Actual character hitbox (smaller than canvas, fits the knight sprite)
// Values are scaled by KNIGHT_SCALE
export const KNIGHT_HITBOX = {
	width: 28 * KNIGHT_SCALE,
	height: 42 * KNIGHT_SCALE,
} as const;

// Reduced hitbox when crouching (shorter height)
// Values are scaled by KNIGHT_SCALE
export const KNIGHT_CROUCH_HITBOX = {
	width: 28 * KNIGHT_SCALE,
	height: 26 * KNIGHT_SCALE,
} as const;

// Reduced hitbox when wall hanging (compact to fit near platform edge)
// Values are scaled by KNIGHT_SCALE
export const KNIGHT_HANG_HITBOX = {
	width: 24 * KNIGHT_SCALE,
	height: 30 * KNIGHT_SCALE,
} as const;

// Vertical offset from frame center to character's feet
// Used to align sprite visually with the physics hitbox
// Frame is 80px tall. Tuned to center sprite in hitbox.
// Higher value = sprite moves UP relative to hitbox
// Scaled by KNIGHT_SCALE
export const KNIGHT_FEET_OFFSET = 42 * KNIGHT_SCALE;

// Sword attack hitbox (extends from knight's body when attacking)
// This is the additional reach of the sword beyond the body hitbox
// Values are scaled by KNIGHT_SCALE
export const KNIGHT_SWORD_HITBOX = {
	width: 45 * KNIGHT_SCALE, // Horizontal reach of sword
	height: 30 * KNIGHT_SCALE, // Vertical height of sword swing
	offsetX: 20 * KNIGHT_SCALE, // How far forward the sword hitbox starts from knight center
	offsetY: -5 * KNIGHT_SCALE, // Slight upward offset for sword swing
} as const;

// Base path for knight sprites
const KNIGHT_PATH = '/assets/arcade/runner/knight';

// Animation definitions with frame counts and speeds
// All sprites are horizontal strips: width = frames * 120, height = 80
export const KNIGHT_ANIMATIONS = {
	idle: {
		key: 'knight-idle',
		path: `${KNIGHT_PATH}/_Idle.png`,
		frames: 10,
		frameRate: 10,
		repeat: -1,
	},
	run: {
		key: 'knight-run',
		path: `${KNIGHT_PATH}/_Run.png`,
		frames: 10,
		frameRate: 12,
		repeat: -1,
	},
	jump: {
		key: 'knight-jump',
		path: `${KNIGHT_PATH}/_Jump.png`,
		frames: 3,
		frameRate: 10,
		repeat: 0,
	},
	fall: {
		key: 'knight-fall',
		path: `${KNIGHT_PATH}/_Fall.png`,
		frames: 3,
		frameRate: 10,
		repeat: -1,
	},
	jumpFallTransition: {
		key: 'knight-jump-fall',
		path: `${KNIGHT_PATH}/_JumpFallInbetween.png`,
		frames: 2,
		frameRate: 10,
		repeat: 0,
	},
	attack1: {
		key: 'knight-attack1',
		path: `${KNIGHT_PATH}/_Attack.png`,
		frames: 4,
		frameRate: 12,
		repeat: 0,
	},
	attack2: {
		key: 'knight-attack2',
		path: `${KNIGHT_PATH}/_Attack2.png`,
		frames: 6,
		frameRate: 12,
		repeat: 0,
	},
	hit: {
		key: 'knight-hit',
		path: `${KNIGHT_PATH}/_Hit.png`,
		frames: 1,
		frameRate: 10,
		repeat: 0,
	},
	death: {
		key: 'knight-death',
		path: `${KNIGHT_PATH}/_Death.png`,
		frames: 10,
		frameRate: 10,
		repeat: 0,
	},
	roll: {
		key: 'knight-roll',
		path: `${KNIGHT_PATH}/_Roll.png`,
		frames: 12,
		frameRate: 17, // 12 frames at 17fps = ~700ms
		repeat: 0,
	},
	dash: {
		key: 'knight-dash',
		path: `${KNIGHT_PATH}/_Dash.png`,
		frames: 2,
		frameRate: 10,
		repeat: 0,
	},
	slide: {
		key: 'knight-slide',
		path: `${KNIGHT_PATH}/_Slide.png`,
		frames: 2,
		frameRate: 10,
		repeat: -1,
	},
	wallSlide: {
		key: 'knight-wall-slide',
		path: `${KNIGHT_PATH}/_WallSlide.png`,
		frames: 3,
		frameRate: 8,
		repeat: -1,
	},
	wallHang: {
		key: 'knight-wall-hang',
		path: `${KNIGHT_PATH}/_WallHang.png`,
		frames: 1,
		frameRate: 10,
		repeat: -1,
	},
	wallClimb: {
		key: 'knight-wall-climb',
		path: `${KNIGHT_PATH}/_WallClimb.png`,
		frames: 7,
		frameRate: 10,
		repeat: -1,
	},
	crouch: {
		key: 'knight-crouch',
		path: `${KNIGHT_PATH}/_Crouch.png`,
		frames: 1,
		frameRate: 10,
		repeat: -1,
	},
	crouchWalk: {
		key: 'knight-crouch-walk',
		path: `${KNIGHT_PATH}/_CrouchWalk.png`,
		frames: 8,
		frameRate: 10,
		repeat: -1,
	},
	crouchAttack: {
		key: 'knight-crouch-attack',
		path: `${KNIGHT_PATH}/_CrouchAttack.png`,
		frames: 4,
		frameRate: 12,
		repeat: 0,
	},
	turnAround: {
		key: 'knight-turn',
		path: `${KNIGHT_PATH}/_TurnAround.png`,
		frames: 3,
		frameRate: 15,
		repeat: 0,
	},
} as const;

export type KnightAnimationKey = keyof typeof KNIGHT_ANIMATIONS;

// ============================================================================
// Parallax Background Configuration
// ============================================================================

const PARALLAX_PATH = '/assets/arcade/runner/parallax';

// Parallax layers ordered from back (sky) to front (mist)
// Lower speedFactor = slower movement = appears further away
// Layer 10 (Sky) is furthest back, Layer 01 (Mist) is closest to camera
export const PARALLAX_LAYERS = [
	{
		key: 'parallax-sky',
		path: `${PARALLAX_PATH}/10_Sky.png`,
		speedFactor: 0.0,
	},
	{
		key: 'parallax-forest-far',
		path: `${PARALLAX_PATH}/09_Forest.png`,
		speedFactor: 0.1,
	},
	{
		key: 'parallax-forest-mid-far',
		path: `${PARALLAX_PATH}/08_Forest.png`,
		speedFactor: 0.2,
	},
	{
		key: 'parallax-forest-mid',
		path: `${PARALLAX_PATH}/07_Forest.png`,
		speedFactor: 0.3,
	},
	{
		key: 'parallax-forest-close',
		path: `${PARALLAX_PATH}/06_Forest.png`,
		speedFactor: 0.4,
	},
	{
		key: 'parallax-particles-back',
		path: `${PARALLAX_PATH}/05_Particles.png`,
		speedFactor: 0.45,
	},
	{
		key: 'parallax-forest-front',
		path: `${PARALLAX_PATH}/04_Forest.png`,
		speedFactor: 0.5,
	},
	{
		key: 'parallax-particles-front',
		path: `${PARALLAX_PATH}/03_Particles.png`,
		speedFactor: 0.6,
	},
	{
		key: 'parallax-bushes',
		path: `${PARALLAX_PATH}/02_Bushes.png`,
		speedFactor: 0.7,
	},
	{
		key: 'parallax-mist',
		path: `${PARALLAX_PATH}/01_Mist.png`,
		speedFactor: 0.8,
	},
] as const;

// Original image dimensions
export const PARALLAX_DIMENSIONS = {
	width: 1920,
	height: 1080,
} as const;
