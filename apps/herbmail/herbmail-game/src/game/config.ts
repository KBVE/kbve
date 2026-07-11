export const HUMAN_H = 2.0;
export const EYE_H = 1.8;

export const TILE = 3;
export const WALL_H = 4.5;
export const COVE_R = 1.0;

export const WALL_SEG = 8;
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
	bayBack: [0.4, 0.38, 0.42],
	door: [0.85, 0.82, 0.78],
} as const;

export const TEXTURES = {
	walls: [
		'/textures/Horror_Brick_01-256x256.png',
		'/textures/Horror_Brick_05-256x256.png',
		'/textures/Horror_Brick_08-256x256.png',
	],
	floor: '/textures/Horror_Floor_01-256x256.png',
	ceiling: '/textures/Horror_Metal_01-256x256.png',
	arch: '/textures/Horror_Stone_01-256x256.png',
	door: '/textures/wood_13_256_.png',
	doorAlt: '/textures/wood_14_256_.png',
} as const;

export const PSX_DEFAULTS = {
	dpr: 1,
	snap: 420,
	affine: 0.18,
	eye: EYE_H,
	fov: 72,
} as const;
