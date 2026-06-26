import {
	type CreatureAnim,
	type CreatureDef,
	NAIVE_DIR_BLOCKS,
} from '../model';

// Goblin — a small ground melee NPC. ONE sheet, row-major like the wyvern:
// 5120x1024 of 128px frames = 8 ROWS (one per facing) x 40 COLS, each row
// packing every anim left-to-right. The source art shipped 48 cols; the trailing
// 8 (40-47) were unused renders and cropped out, so the row is 40 wide.
//
// The 8 rows step 45° from West (row 0=W ... row 2=S front view ... row 4=E ...
// row 6=N back), so each facing maps to an absolute row via `dirRows` and the
// half-split/dirBlocks is bypassed (cardinalBase becomes the column offset).
//
// Column layout within each row (per the source spec):
//   0-2  stance   3-11 hop/jump   12-27 attack   28-33 hit   34-39 knocked
// Goblins do NOT walk — they HOP, so the jump anim drives the locomotion slot
// (Walking is what setCreaturePose plays while a creature is moving).
const GOBLIN_DIR_STRIDE = 40;

const STANCE_COL = 0;
const HOP_COL = 3;
const ATTACK_COL = 12;
const HIT_COL = 28;
const KNOCKED_COL = 34;

function at(
	col: number,
	framesPerDir: number,
	frameRate: number,
	loop: boolean,
): CreatureAnim {
	return {
		sheet: 'goblin',
		cardinalBase: col,
		diagonalBase: col,
		framesPerDir,
		dirStride: GOBLIN_DIR_STRIDE,
		frameRate,
		loop,
	};
}

export const GOBLIN: CreatureDef = {
	id: 'goblin',
	assetPath: '/assets/arcade/arpg/creatures/goblin',
	ext: 'webp',
	frameSize: 128,
	// Small humanoid: body fills ~33px of the 128 frame, feet ~0.79 down. Eyeball
	// against the codex if it floats or clips the tile.
	displaySize: 128,
	originY: 0.79,
	// Goblins bound tile-to-tile rather than walk; the body arcs up ~14px each
	// hop. Shadow is baked into the frame, so it rides along — kept modest.
	hopHeight: 14,
	dirBlocks: NAIVE_DIR_BLOCKS,
	dirRows: { W: 0, SW: 1, S: 2, SE: 3, E: 4, NE: 5, N: 6, NW: 7 },
	sheetCols: GOBLIN_DIR_STRIDE,
	anims: {
		Idle: at(STANCE_COL, 3, 5, true),
		// Hop/jump — the goblin's only locomotion; played whenever it moves.
		Walking: at(HOP_COL, 9, 12, true),
		Attack1: at(ATTACK_COL, 16, 16, false),
		GetHit: at(HIT_COL, 6, 14, false),
		Dead: at(KNOCKED_COL, 6, 10, false),
	},
};
