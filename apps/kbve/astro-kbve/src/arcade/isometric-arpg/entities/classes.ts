import Phaser from 'phaser';

// 8 facing angles (the sheet ships 16 at 22.5°; we use the even ones).
export const CLASS_ANGLES = [
	'000',
	'045',
	'090',
	'135',
	'180',
	'225',
	'270',
	'315',
] as const;

export type ClassState = 'Idle' | 'Run' | 'Attack' | 'Death';
export type ClassWeapon = 'Bow' | 'Sword' | 'Unarmed';

/**
 * A playable character class: where its sheet lives + which poses to load. The
 * sheet layout is the engvee isometric-hero convention —
 * `<State>_<Weapon>/<State>_<Weapon>_Body_<angle>.png`, one static pose per
 * angle. Add a class = add an entry here; nothing else in the scene changes.
 */
export interface ClassDef {
	id: string;
	assetPath: string;
	weapon: ClassWeapon;
	states: ClassState[];
	displaySize: number;
	originY: number;
}

export const RANGER_CLASS: ClassDef = {
	id: 'ranger',
	assetPath: '/assets/arcade/arpg/characters/ranger',
	weapon: 'Bow',
	states: ['Idle', 'Run', 'Attack', 'Death'],
	displaySize: 96,
	originY: 0.85,
};

const CLASS_REGISTRY: Record<string, ClassDef> = {
	ranger: RANGER_CLASS,
};

export const DEFAULT_CLASS_ID = 'ranger';

/** Resolve a player's class. Hardcoded to ranger until class-select lands. */
export function resolvePlayerClass(_ref: string | null): ClassDef {
	return CLASS_REGISTRY[DEFAULT_CLASS_ID];
}

export function classTextureKey(
	def: ClassDef,
	state: ClassState,
	angle: string,
): string {
	return `cls:${def.id}:${state}_${def.weapon}:${angle}`;
}

function classFile(def: ClassDef, state: ClassState, angle: string): string {
	return `${def.assetPath}/${state}_${def.weapon}/${state}_${def.weapon}_Body_${angle}.png`;
}

export function preloadClass(scene: Phaser.Scene, def: ClassDef): void {
	for (const state of def.states) {
		for (const angle of CLASS_ANGLES) {
			scene.load.image(
				classTextureKey(def, state, angle),
				classFile(def, state, angle),
			);
		}
	}
}

/** Map a tile-space movement delta to the nearest of the 8 sheet angles. */
export function nearestClassAngle(dx: number, dy: number): string {
	if (dx === 0 && dy === 0) return CLASS_ANGLES[4]; // south
	const sx = (dx - dy) * 0.5;
	const sy = (dx + dy) * 0.5;
	let deg = (Math.atan2(sx, -sy) * 180) / Math.PI;
	if (deg < 0) deg += 360;
	const idx = Math.round(deg / 45) % 8;
	return CLASS_ANGLES[idx];
}
