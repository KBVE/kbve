import Phaser from 'phaser';
import { arpgAsset } from '../config';
import { facingDegFromDelta, SOUTH_DEG } from './classes';

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

const DIAGONAL_DIRS: ReadonlySet<CreatureDir> = new Set([
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
		frameSize: 256,
		displaySize: 112,
		// Flyer: anchor high in the frame so the body hovers above the tile instead
		// of standing on it. Eyeball against the debug overlay like apex's 0.82.
		originY: 0.6,
		sheetCols: 56,
		dirBlocks: NAIVE_DIR_BLOCKS,
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

export const WYVERN_AIR = wyvernDef('wyvern_air', 'wyvern_air');
export const WYVERN_WATER = wyvernDef('wyvern_water', 'wyvern_water');
export const WYVERN_FIRE = wyvernDef('wyvern_fire', 'wyvern_fire');
export const WYVERN_SHADOW = wyvernDef('wyvern_shadow', 'wyvern_shadow');

const CREATURE_REGISTRY: Record<string, CreatureDef> = {
	apex_predator: APEX_PREDATOR,
	wyvern_air: WYVERN_AIR,
	wyvern_water: WYVERN_WATER,
	wyvern_fire: WYVERN_FIRE,
	wyvern_shadow: WYVERN_SHADOW,
};

/** Look up a creature def by its kind ref, or null if the ref isn't a creature. */
export function resolveCreature(ref: string | null): CreatureDef | null {
	return ref ? (CREATURE_REGISTRY[ref] ?? null) : null;
}

/** Texture key for a creature's packed sheet (one texture per Sprite_N). */
function sheetKey(def: CreatureDef, sheet: string): string {
	return `creature:${def.id}:${sheet}`;
}

/** Phaser animation key for one state+direction of a creature. */
export function creatureAnimKey(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): string {
	const anim = def.anims[state];
	if (anim?.dirless) return `canim:${def.id}:${state}`;
	return `canim:${def.id}:${state}:${dir}`;
}

/** Inclusive [start,end] frame range for a state+direction within its sheet. */
function frameRange(
	anim: CreatureAnim,
	dir: CreatureDir,
	dirBlocks: DirBlocks,
): { start: number; end: number } {
	if (anim.dirless) {
		return {
			start: anim.cardinalBase,
			end: anim.cardinalBase + anim.framesPerDir - 1,
		};
	}
	const base = DIAGONAL_DIRS.has(dir) ? anim.diagonalBase : anim.cardinalBase;
	const stride = anim.dirStride ?? anim.framesPerDir;
	const start = base + dirBlocks[dir] * stride;
	return { start, end: start + anim.framesPerDir - 1 };
}

/** Load every packed sheet a creature uses (deduped across states). */
export function preloadCreature(scene: Phaser.Scene, def: CreatureDef): void {
	const seen = new Set<string>();
	for (const anim of Object.values(def.anims)) {
		if (!anim || seen.has(anim.sheet)) continue;
		seen.add(anim.sheet);
		scene.load.spritesheet(
			sheetKey(def, anim.sheet),
			arpgAsset(`${def.assetPath}/${anim.sheet}.png`),
			{ frameWidth: def.frameSize, frameHeight: def.frameSize },
		);
	}
}

/** Register every state+direction animation once the sheets are loaded. */
export function registerCreatureAnims(
	scene: Phaser.Scene,
	def: CreatureDef,
): void {
	for (const state of Object.keys(def.anims) as CreatureState[]) {
		const anim = def.anims[state];
		if (!anim) continue;
		const dirs: CreatureDir[] = anim.dirless ? ['N'] : [...CREATURE_DIRS];
		for (const dir of dirs) {
			const key = creatureAnimKey(def, state, dir);
			if (scene.anims.exists(key)) continue;
			const { start, end } = frameRange(anim, dir, def.dirBlocks);
			scene.anims.create({
				key,
				frames: scene.anims.generateFrameNumbers(
					sheetKey(def, anim.sheet),
					{
						start,
						end,
					},
				),
				frameRate: anim.frameRate,
				repeat: anim.loop ? -1 : 0,
			});
		}
	}
}

// --- Codex / audit metadata (DOM-renderable, no Phaser) -------------------

/** Sheets are an 8x8 grid (4096px / 512px frame). */
export const CREATURE_SHEET_COLS = 8;

/** Every registered creature, for the in-game bestiary/codex. */
export const CREATURES: CreatureDef[] = [
	APEX_PREDATOR,
	WYVERN_AIR,
	WYVERN_WATER,
	WYVERN_FIRE,
	WYVERN_SHADOW,
];

/** States a creature actually ships, in declaration order. */
export function creatureStates(def: CreatureDef): CreatureState[] {
	return Object.keys(def.anims) as CreatureState[];
}

/** Public frame range for a state+direction (honors the creature's dirBlocks). */
export function creatureFrameRange(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): { start: number; end: number } | null {
	const anim = def.anims[state];
	return anim ? frameRange(anim, dir, def.dirBlocks) : null;
}

/** Resolved URL of the sheet a state lives on. */
export function creatureSheetUrl(
	def: CreatureDef,
	state: CreatureState,
): string | null {
	const anim = def.anims[state];
	return anim ? arpgAsset(`${def.assetPath}/${anim.sheet}.png`) : null;
}

/** First-frame texture key + frame for a state+direction (initial sprite). */
export function creatureFirstFrame(
	def: CreatureDef,
	state: CreatureState,
	dir: CreatureDir,
): { key: string; frame: number } {
	const anim = def.anims[state] ?? def.anims.Idle!;
	return {
		key: sheetKey(def, anim.sheet),
		frame: frameRange(anim, dir, def.dirBlocks).start,
	};
}

/** Snap continuous screen-facing degrees to one of the 8 creature directions. */
export function dirFromDeg(deg: number): CreatureDir {
	const idx = ((Math.round(deg / 45) % 8) + 8) % 8;
	// 0=N,45=NE,90=E,135=SE,180=S,225=SW,270=W,315=NW
	return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[idx];
}

/** Map a tile-space movement delta straight to the nearest creature direction. */
export function nearestCreatureDir(dx: number, dy: number): CreatureDir {
	return dirFromDeg(facingDegFromDelta(dx, dy));
}

export const CREATURE_SOUTH = SOUTH_DEG;
