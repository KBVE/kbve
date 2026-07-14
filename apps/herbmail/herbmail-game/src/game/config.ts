export const HUMAN_H = 2.0;
export const EYE_H = 1.8;

export const TILE = 3;
export const WALL_H = 9;
export const COVE_R = 1.0;

export const TEXEL = 1 / 256;
export const UV_INSET = TEXEL * 0.5;
export const ANISOTROPY = 8;

export const BG_COLOR = '#000000';
// Streaming/light-culling horizon. Darkness comes from torch attenuation, so
// this bounds how far sectors mount and which emitters feed the shader — not
// a fog wall.
export const VIEW_RANGE = 30;

export const TINT = {
	wall: [1, 1, 1],
	floor: [0.7, 0.7, 0.75],
	ceiling: [0.45, 0.45, 0.5],
	arch: [0.72, 0.7, 0.72],
	cove: [0.92, 0.9, 0.95],
	bay: [0.72, 0.7, 0.72],
	bayBack: [0.6, 0.57, 0.6],
	door: [0.85, 0.82, 0.78],
	trim: [0.92, 0.92, 0.95],
} as const;

export const TEXTURES = {
	walls: [
		{
			color: '/textures/brickwall/brick15_color.png',
			normal: '/textures/brickwall/brick15_normal.png',
			har: '/textures/brickwall/brick15_har.png',
		},
		{
			color: '/textures/brickwall/brick1_color.png',
			normal: '/textures/brickwall/brick1_normal.png',
			har: '/textures/brickwall/brick1_har.png',
		},
		{
			color: '/textures/brickwall/brick12_color.png',
			normal: '/textures/brickwall/brick12_normal.png',
			har: '/textures/brickwall/brick12_har.png',
		},
	],
	floor: '/textures/Horror_Floor_01-256x256.png',
	ceiling: '/textures/Horror_Metal_01-256x256.png',
	arch: {
		color: '/textures/door/viking_color.png',
		normal: '/textures/door/viking_normal.png',
		har: '/textures/door/viking_har.png',
	},
	trim: {
		color: '/textures/door/marble1_color.png',
		normal: '/textures/door/marble1_normal.png',
		har: '/textures/door/marble1_har.png',
	},
	door: {
		color: '/textures/door/wood17_color.png',
		normal: '/textures/door/wood17_normal.png',
		har: '/textures/door/wood17_har.png',
	},
} as const;

export const PSX_DEFAULTS = {
	dpr: 2,
	snap: 0,
	affine: 0,
	eye: EYE_H,
	fov: 72,
} as const;
