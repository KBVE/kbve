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

export type ClassState =
	| 'Idle'
	| 'Run'
	| 'WalkForward'
	| 'Attack'
	| 'Draw'
	| 'Hit'
	| 'Jump'
	| 'Death';
export type ClassWeapon = 'Bow' | 'Sword' | 'Unarmed';

// Each stance ships two frame-aligned layers: the character Body and a baked
// Shadow that already sits at the correct foot pivot for every angle/frame. We
// stack Shadow under Body and drive both in lockstep — no hand-tuned blob.
export type ClassLayer = 'Body' | 'Shadow';
export const CLASS_LAYERS: ClassLayer[] = ['Body', 'Shadow'];

// States that don't loop — they play once then the caller settles back to a
// looping locomotion state (Idle/Run/WalkForward).
export const ONE_SHOT_STATES: ClassState[] = [
	'Attack',
	'Draw',
	'Hit',
	'Jump',
	'Death',
];
// Looping locomotion states eligible for the Idle<->move crossfade blend.
export const LOCOMOTION_STATES: ClassState[] = ['Idle', 'Run', 'WalkForward'];

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
		WalkForward: { frames: 24, frameRate: 16, loop: true },
		Attack: { frames: 24, frameRate: 24, loop: false },
		Draw: { frames: 20, frameRate: 22, loop: false },
		Hit: { frames: 20, frameRate: 22, loop: false },
		Jump: { frames: 24, frameRate: 20, loop: false },
		Death: { frames: 30, frameRate: 20, loop: false },
	},
};

const CLASS_REGISTRY: Record<string, ClassDef> = {
	ranger: RANGER_CLASS,
};

export const DEFAULT_CLASS_ID = 'ranger';
export const CLASS_STATES: ClassState[] = [
	'Idle',
	'Run',
	'WalkForward',
	'Attack',
	'Draw',
	'Hit',
	'Jump',
	'Death',
];

/** Resolve a player's class. Hardcoded to ranger until class-select lands. */
export function resolvePlayerClass(_ref: string | null): ClassDef {
	return CLASS_REGISTRY[DEFAULT_CLASS_ID];
}

/** Texture (spritesheet) key for one layer+state+angle of a class. */
export function classSheetKey(
	def: ClassDef,
	state: ClassState,
	angle: string,
	layer: ClassLayer = 'Body',
): string {
	return `cls:${def.id}:${state}_${def.weapon}_${layer}:${angle}`;
}

/** Phaser animation key for one layer+state+angle of a class. */
export function classAnimKey(
	def: ClassDef,
	state: ClassState,
	angle: string,
	layer: ClassLayer = 'Body',
): string {
	return `anim:${def.id}:${state}:${angle}:${layer}`;
}

function classFile(
	def: ClassDef,
	state: ClassState,
	angle: string,
	layer: ClassLayer,
): string {
	return `${def.assetPath}/${state}_${def.weapon}/${state}_${def.weapon}_${layer}_${angle}.png`;
}

export function preloadClass(scene: Phaser.Scene, def: ClassDef): void {
	for (const layer of CLASS_LAYERS) {
		for (const state of CLASS_STATES) {
			for (const angle of CLASS_ANGLES) {
				scene.load.spritesheet(
					classSheetKey(def, state, angle, layer),
					classFile(def, state, angle, layer),
					{ frameWidth: def.frameSize, frameHeight: def.frameSize },
				);
			}
		}
	}
}

/** Register every layer+state+angle animation once the sheets are loaded. */
export function registerClassAnims(scene: Phaser.Scene, def: ClassDef): void {
	for (const layer of CLASS_LAYERS) {
		for (const state of CLASS_STATES) {
			const spec = def.anims[state];
			for (const angle of CLASS_ANGLES) {
				const key = classAnimKey(def, state, angle, layer);
				if (scene.anims.exists(key)) continue;
				scene.anims.create({
					key,
					frames: scene.anims.generateFrameNumbers(
						classSheetKey(def, state, angle, layer),
						{ start: 0, end: spec.frames - 1 },
					),
					frameRate: spec.frameRate,
					repeat: spec.loop ? -1 : 0,
				});
			}
		}
	}
}

// South — the rest pose / default facing.
export const SOUTH_DEG = 180;

/**
 * Screen-space facing degrees [0,360) for a tile-space movement delta. The iso
 * projection rotates world axes 45°, so the delta is mapped through the same
 * skew (sx/sy) before atan2. 0°=N (up-screen), increasing clockwise.
 */
export function facingDegFromDelta(dx: number, dy: number): number {
	if (dx === 0 && dy === 0) return SOUTH_DEG;
	const sx = (dx - dy) * 0.5;
	const sy = (dx + dy) * 0.5;
	let deg = (Math.atan2(sx, -sy) * 180) / Math.PI;
	if (deg < 0) deg += 360;
	return deg;
}

/** Snap continuous facing degrees to the nearest of the 16 sheet angles. */
export function angleFromDeg(deg: number): string {
	const idx = Math.round(deg / 22.5) % 16;
	return CLASS_ANGLES[(idx + 16) % 16];
}

/** Map a tile-space movement delta straight to the nearest sheet angle. */
export function nearestClassAngle(dx: number, dy: number): string {
	return angleFromDeg(facingDegFromDelta(dx, dy));
}

/**
 * Lerp `from` degrees toward `to` by `t`, taking the shortest way around the
 * circle so a turn from 350°→10° crosses 0 instead of unwinding 340°. Drives
 * the smooth facing curve instead of snapping direction on every step.
 */
export function lerpAngleDeg(from: number, to: number, t: number): number {
	let diff = ((to - from + 540) % 360) - 180;
	let next = from + diff * t;
	next %= 360;
	if (next < 0) next += 360;
	return next;
}
