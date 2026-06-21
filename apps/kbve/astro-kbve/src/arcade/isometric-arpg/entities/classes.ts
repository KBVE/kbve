import Phaser from 'phaser';

// Full 16-direction facing — the engvee sheet ships rotations at 22.5° steps.
// More angles = smoother turn blending than the 8-way subset.
export const CLASS_ANGLES = [
	'000',
	'022',
	'045',
	'067',
	'090',
	'112',
	'135',
	'157',
	'180',
	'202',
	'225',
	'247',
	'270',
	'292',
	'315',
	'337',
] as const;

export type ClassState = 'Idle' | 'Run' | 'Attack' | 'Death';
export type ClassWeapon = 'Bow' | 'Sword' | 'Unarmed';

// Each <State>_<Weapon>_Body_<angle>.png is a uniform-grid animation sheet of
// 180px cells; frame count varies per state (cols*rows of the 180px grid).
export interface StateAnim {
	frames: number;
	frameRate: number;
	loop: boolean;
}

/**
 * A playable character class. Sheets are per-angle flipbooks loaded as Phaser
 * spritesheets (frameSize px); anims play the state's frames. Add a class =
 * add an entry; the scene loader is class-agnostic.
 */
export interface ClassDef {
	id: string;
	assetPath: string;
	weapon: ClassWeapon;
	frameSize: number;
	displaySize: number;
	originY: number;
	anims: Record<ClassState, StateAnim>;
}

export const RANGER_CLASS: ClassDef = {
	id: 'ranger',
	assetPath: '/assets/arcade/arpg/characters/ranger',
	weapon: 'Bow',
	frameSize: 180,
	displaySize: 128,
	originY: 0.82,
	anims: {
		Idle: { frames: 16, frameRate: 12, loop: true },
		Run: { frames: 20, frameRate: 18, loop: true },
		Attack: { frames: 24, frameRate: 24, loop: false },
		Death: { frames: 30, frameRate: 20, loop: false },
	},
};

const CLASS_REGISTRY: Record<string, ClassDef> = {
	ranger: RANGER_CLASS,
};

export const DEFAULT_CLASS_ID = 'ranger';
export const CLASS_STATES: ClassState[] = ['Idle', 'Run', 'Attack', 'Death'];

/** Resolve a player's class. Hardcoded to ranger until class-select lands. */
export function resolvePlayerClass(_ref: string | null): ClassDef {
	return CLASS_REGISTRY[DEFAULT_CLASS_ID];
}

/** Texture (spritesheet) key for one state+angle of a class. */
export function classSheetKey(
	def: ClassDef,
	state: ClassState,
	angle: string,
): string {
	return `cls:${def.id}:${state}_${def.weapon}:${angle}`;
}

/** Phaser animation key for one state+angle of a class. */
export function classAnimKey(
	def: ClassDef,
	state: ClassState,
	angle: string,
): string {
	return `anim:${def.id}:${state}:${angle}`;
}

function classFile(def: ClassDef, state: ClassState, angle: string): string {
	return `${def.assetPath}/${state}_${def.weapon}/${state}_${def.weapon}_Body_${angle}.png`;
}

export function preloadClass(scene: Phaser.Scene, def: ClassDef): void {
	for (const state of CLASS_STATES) {
		for (const angle of CLASS_ANGLES) {
			scene.load.spritesheet(
				classSheetKey(def, state, angle),
				classFile(def, state, angle),
				{ frameWidth: def.frameSize, frameHeight: def.frameSize },
			);
		}
	}
}

/** Register every state+angle animation once the sheets are loaded. */
export function registerClassAnims(scene: Phaser.Scene, def: ClassDef): void {
	for (const state of CLASS_STATES) {
		const spec = def.anims[state];
		for (const angle of CLASS_ANGLES) {
			const key = classAnimKey(def, state, angle);
			if (scene.anims.exists(key)) continue;
			scene.anims.create({
				key,
				frames: scene.anims.generateFrameNumbers(
					classSheetKey(def, state, angle),
					{ start: 0, end: spec.frames - 1 },
				),
				frameRate: spec.frameRate,
				repeat: spec.loop ? -1 : 0,
			});
		}
	}
}

/** Map a tile-space movement delta to the nearest of the 16 sheet angles. */
export function nearestClassAngle(dx: number, dy: number): string {
	if (dx === 0 && dy === 0) return CLASS_ANGLES[8]; // south
	const sx = (dx - dy) * 0.5;
	const sy = (dx + dy) * 0.5;
	let deg = (Math.atan2(sx, -sy) * 180) / Math.PI;
	if (deg < 0) deg += 360;
	const idx = Math.round(deg / 22.5) % 16;
	return CLASS_ANGLES[idx];
}
