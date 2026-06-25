import { type CreatureDef } from '../model';

// Apex Predator — rendered isometric reptilian creature. Sheets Sprite_1..8.
export const APEX_PREDATOR: CreatureDef = {
	id: 'apex_predator',
	assetPath: '/assets/arcade/arpg/creatures/apex_predator',
	frameSize: 512,
	// Tile is 64px wide; 120 keeps the predator reading as a big creature while
	// cutting the overhang that hung the old 160px body over walls/void. Pairs
	// with the server clearance rule that keeps it in open areas.
	displaySize: 120,
	// Feet + baked shadow sit ~0.82 down the 512px frame; anchor there so the
	// creature stands ON the tile instead of floating a few px above it.
	originY: 0.82,
	// Calibrated against the codex: cardinal block order is S,W,E,N (block 0 is
	// the toward-viewer/South render, block 3 the away/North); the diagonal half
	// packs SW,NW,SE,NE.
	dirBlocks: {
		N: 3,
		W: 1,
		E: 2,
		S: 0,
		SW: 0,
		NW: 1,
		SE: 2,
		NE: 3,
	},
	anims: {
		Walking: {
			sheet: 'Sprite_1',
			cardinalBase: 0,
			diagonalBase: 32,
			framesPerDir: 8,
			frameRate: 14,
			loop: true,
		},
		Running: {
			sheet: 'Sprite_2',
			cardinalBase: 0,
			diagonalBase: 32,
			framesPerDir: 8,
			frameRate: 18,
			loop: true,
		},
		Idle: {
			sheet: 'Sprite_3',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 6,
			loop: true,
		},
		Resting: {
			sheet: 'Sprite_3',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 6,
			loop: true,
		},
		Attack1: {
			sheet: 'Sprite_4',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 9,
			loop: false,
		},
		Attack2: {
			sheet: 'Sprite_4',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 9,
			loop: false,
		},
		UseSkill: {
			sheet: 'Sprite_5',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 14,
			loop: false,
		},
		Block: {
			sheet: 'Sprite_5',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 12,
			loop: false,
		},
		Evade: {
			sheet: 'Sprite_6',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 16,
			loop: false,
		},
		GetHit: {
			sheet: 'Sprite_6',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 16,
			loop: false,
		},
		CriticalHP: {
			sheet: 'Sprite_7',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 8,
			loop: true,
		},
		Woozy: {
			sheet: 'Sprite_7',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 8,
			loop: true,
		},
		Behavior: {
			sheet: 'Sprite_8',
			cardinalBase: 0,
			diagonalBase: 12,
			framesPerDir: 3,
			frameRate: 10,
			loop: false,
		},
		Dead: {
			sheet: 'Sprite_8',
			cardinalBase: 24,
			diagonalBase: 24,
			framesPerDir: 8,
			frameRate: 12,
			loop: false,
			dirless: true,
		},
	},
};
