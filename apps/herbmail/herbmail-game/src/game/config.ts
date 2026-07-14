export const HUMAN_H = 2.0;
export const EYE_H = 1.8;

export const TILE = 3;
export const WALL_H = 4.5;
export const COVE_R = 1.0;

export const WALL_SEG = 8;
export const WALL_FLAT_SEG = 2;
export const TEXEL = 1 / 256;
export const UV_INSET = TEXEL * 0.5;
export const ANISOTROPY = 8;

export const FOG = { color: '#0a0a0e', near: 5, far: 30 } as const;

export const TINT = {
	wall: [1, 1, 1],
	floor: [0.7, 0.7, 0.75],
	ceiling: [0.45, 0.45, 0.5],
	arch: [0.72, 0.7, 0.72],
	cove: [0.92, 0.9, 0.95],
	bay: [0.72, 0.7, 0.72],
	bayBack: [0.6, 0.57, 0.6],
	door: [0.85, 0.82, 0.78],
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
	arch: '/textures/Horror_Stone_01-256x256.png',
	door: '/textures/wood_13_256_.png',
	doorAlt: '/textures/wood_14_256_.png',
} as const;

export const PSX_DEFAULTS = {
	dpr: 2,
	snap: 0,
	affine: 0,
	eye: EYE_H,
	fov: 72,
} as const;
