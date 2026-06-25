import {
	type CreatureAnim,
	type CreatureDef,
	NAIVE_DIR_BLOCKS,
} from '../model';

// Wyvern — a NEUTRAL flying creature that streams over the grass surface (z=0).
// Sheet layout differs from apex: 14336x2048 of 256px frames = 8 ROWS (one per
// facing) x 56 COLS, where each row holds 7 anims of 8 frames laid left-to-right:
//   col-block 0 Hover · 1 Fly · 2 Sting · 3 Breathe · 4 Ram · 5 Hit · 6 Die
// Directions are a full row apart (dirStride 56), anims 8 frames each. Rows 0-3
// are the cardinal half, rows 4-7 the diagonal half (diagonalBase 4*56=224).
// Ships as four elemental variants, each its own one-sheet CreatureDef.
const WYVERN_FRAMES_PER_DIR = 8;
const WYVERN_DIR_STRIDE = 56;
const WYVERN_DIAG_BASE = 4 * WYVERN_DIR_STRIDE;

function wyvernDef(id: string, sheet: string): CreatureDef {
	const at = (
		col: number,
		frameRate: number,
		loop: boolean,
	): CreatureAnim => ({
		sheet,
		cardinalBase: col * WYVERN_FRAMES_PER_DIR,
		diagonalBase: WYVERN_DIAG_BASE + col * WYVERN_FRAMES_PER_DIR,
		framesPerDir: WYVERN_FRAMES_PER_DIR,
		dirStride: WYVERN_DIR_STRIDE,
		frameRate,
		loop,
	});
	return {
		id,
		assetPath: '/assets/arcade/arpg/creatures/wyvern',
		// Sheet shipped at 7168x1024 (256px frames downscaled 2x -> 128px) to stay
		// under the 8192 WebGL max-texture size; frame indices are unchanged.
		frameSize: 128,
		displaySize: 112,
		// Flyer: anchor high in the frame so the body hovers above the tile instead
		// of standing on it. Eyeball against the debug overlay like apex's 0.82.
		originY: 0.6,
		sheetCols: 56,
		dirBlocks: NAIVE_DIR_BLOCKS,
		// Calibrated in-game: the 8 rows step by 45° starting at West, so each
		// facing maps to an absolute row (row 0=W,1=NW,2=N,3=NE,4=E,5=SE,6=S,7=SW).
		dirRows: { N: 2, NE: 3, E: 4, SE: 5, S: 6, SW: 7, W: 0, NW: 1 },
		anims: {
			Idle: at(0, 6, true),
			Walking: at(1, 10, true),
			Running: at(1, 14, true),
			Attack1: at(2, 12, false),
			Attack2: at(3, 10, false),
			UseSkill: at(4, 12, false),
			GetHit: at(5, 14, false),
			Dead: at(6, 8, false),
		},
	};
}

// Shared ground-shadow layer for every wyvern: same frame layout, the silhouette
// sheet. NOT a spawnable creature — attached as each variant's `shadow`.
const WYVERN_SHADOW = wyvernDef('wyvern_shadow', 'wyvern_shadow');

function wyvernVariant(id: string, sheet: string): CreatureDef {
	return { ...wyvernDef(id, sheet), shadow: WYVERN_SHADOW };
}

export const WYVERN_AIR = wyvernVariant('wyvern_air', 'wyvern_air');
export const WYVERN_WATER = wyvernVariant('wyvern_water', 'wyvern_water');
export const WYVERN_FIRE = wyvernVariant('wyvern_fire', 'wyvern_fire');
