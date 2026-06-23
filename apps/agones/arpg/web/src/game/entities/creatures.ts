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
}

export interface CreatureDef {
	id: string;
	assetPath: string;
	frameSize: number;
	displaySize: number;
	originY: number;
	/** Facing -> in-half block index for this creature's sheet packing. */
	dirBlocks: DirBlocks;
	anims: Partial<Record<CreatureState, CreatureAnim>>;
}

// Apex Predator — rendered isometric reptilian creature. Sheets Sprite_1..8.
export const APEX_PREDATOR: CreatureDef = {
	id: 'apex_predator',
	assetPath: '/assets/arcade/arpg/creatures/apex_predator',
	frameSize: 512,
	displaySize: 160,
	originY: 0.86,
	// Calibrated in-game vs the debug overlay: side profiles read L/R-swapped
	// (block 1 = head-LEFT/W, block 2 = head-RIGHT/E) and the NE/SW diagonal
	// pair is swapped from a naive read.
	dirBlocks: {
		N: 0,
		W: 1,
		E: 2,
		S: 3,
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
			frameRate: 16,
			loop: false,
		},
		Attack2: {
			sheet: 'Sprite_4',
			cardinalBase: 24,
			diagonalBase: 36,
			framesPerDir: 3,
			frameRate: 16,
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

const CREATURE_REGISTRY: Record<string, CreatureDef> = {
	apex_predator: APEX_PREDATOR,
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
	const start = base + dirBlocks[dir] * anim.framesPerDir;
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
