// Temporary: draws each creature's code-believed direction + a movement arrow so
// the 8-way sheet mapping can be eyeballed against actual facing. Flip off (or
// delete the dbg* plumbing) once the mapping is locked.
export const DEBUG_CREATURE_DIRS = true;

/**
 * Creatures differ from player classes: instead of one PNG per facing angle,
 * the art ships as packed sprite sheets. Each sheet is a 4096x4096 image laid
 * out as an 8x8 grid of 512px frames (row-major index 0..63), and one or two
 * animation states share a sheet. Every state is split into a CARDINAL half
 * (N/E/W/S) and a DIAGONAL half (NW/NE/SW/SE); each direction occupies a
 * contiguous run of `framesPerDir` frames inside its half.
 *
 * See the asset readme for the canonical sheet->state->frame-range table.
 */

// 8-way facing, in the order each half packs its directions.
export const CREATURE_DIRS = [
	'N',
	'E',
	'W',
	'S',
	'NW',
	'NE',
	'SW',
	'SE',
] as const;
export type CreatureDir = (typeof CREATURE_DIRS)[number];

export const DIAGONAL_DIRS: ReadonlySet<CreatureDir> = new Set([
	'NW',
	'NE',
	'SW',
	'SE',
]);

/**
 * Maps each facing to its block index (0..3) WITHIN its half (cardinal or
 * diagonal) — the multiplier into that half's frame run. Sheets from different
 * art packs order their 8 renders differently, so this lives per-creature on
 * `CreatureDef.dirBlocks` rather than as one global table.
 */
export type DirBlocks = Record<CreatureDir, number>;

// The order a naive left-to-right read of a sheet would assume. Handy starting
// point; most packs need a tweak or two against the in-game debug overlay.
export const NAIVE_DIR_BLOCKS: DirBlocks = {
	N: 0,
	E: 1,
	W: 2,
	S: 3,
	NW: 0,
	NE: 1,
	SW: 2,
	SE: 3,
};

export type CreatureState =
	| 'Idle'
	| 'Resting'
	| 'Walking'
	| 'Running'
	| 'Attack1'
	| 'Attack2'
	| 'UseSkill'
	| 'Block'
	| 'Evade'
	| 'GetHit'
	| 'CriticalHP'
	| 'Woozy'
	| 'Behavior'
	| 'Dead';

export const CREATURE_LOCOMOTION: CreatureState[] = [
	'Idle',
	'Walking',
	'Running',
];

/**
 * One animation packed in a sheet. `cardinalBase`/`diagonalBase` are the frame
 * index where each half's first direction begins; `framesPerDir` is the run
 * length per direction. `dirless` states (e.g. Dead) ignore direction and play
 * the single run starting at `cardinalBase`.
 */
export interface CreatureAnim {
	sheet: string;
	cardinalBase: number;
	diagonalBase: number;
	framesPerDir: number;
	frameRate: number;
	loop: boolean;
	dirless?: boolean;
	/**
	 * Frames between one direction's run and the next WITHIN a half. Defaults to
	 * `framesPerDir` (apex packs directions back-to-back). Row-major sheets that
	 * give each direction a full row of multiple anims set this to the row width
	 * (e.g. wyvern: 56-frame rows, 8 frames per anim → dirStride 56).
	 */
	dirStride?: number;
}

export interface CreatureDef {
	id: string;
	assetPath: string;
	frameSize: number;
	displaySize: number;
	originY: number;
	/** Facing -> in-half block index for this creature's sheet packing. */
	dirBlocks: DirBlocks;
	/** Sheet width in frames; the codex grid uses it. Defaults to 8 (apex grid). */
	sheetCols?: number;
	anims: Partial<Record<CreatureState, CreatureAnim>>;
}

/** Sheets are an 8x8 grid (4096px / 512px frame). */
export const CREATURE_SHEET_COLS = 8;
