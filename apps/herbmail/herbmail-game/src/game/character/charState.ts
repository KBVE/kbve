import { type StrafeBin } from './strafe';

export const CS = {
	MOVING: 1 << 0,
	RUNNING: 1 << 1,
	AIRBORNE: 1 << 2,
	RISING: 1 << 3,
	LANDING: 1 << 4,
	EXHAUSTED: 1 << 5,
	BLOCKING: 1 << 6,
	ATTACKING: 1 << 7,
	COMBAT_LOCK: 1 << 8,
	HARD_LOCK: 1 << 9,
	DEAD: 1 << 10,
	HAS_WEAPON: 1 << 11,
	HAS_SHIELD: 1 << 12,
	HAS_LIGHT: 1 << 13,
	SWIMMING: 1 << 14,
	CLIMBING: 1 << 15,
} as const;

export interface ResolveParams {
	runBlend: number;
	walkTs: number;
	strafeBin: StrafeBin;
	landSpeed: number;
	loco: { idle: string; walk: string; run: string };
}

export type BaseDecision =
	| {
			kind: 'play';
			clip: string;
			loop?: boolean;
			timeScale?: number;
			fade?: number;
	  }
	| { kind: 'blend'; a: string; b: string; alpha: number };

const WALK_STRAFE: Record<StrafeBin, string> = {
	Fwd: 'Walk_Loop',
	FwdL: 'Walk_Fwd_L_Loop',
	FwdR: 'Walk_Fwd_R_Loop',
	L: 'Walk_L_Loop',
	R: 'Walk_R_Loop',
	BwdL: 'Walk_Bwd_L_Loop',
	BwdR: 'Walk_Bwd_R_Loop',
	Bwd: 'Walk_Bwd_Loop',
};
const JOG_STRAFE: Record<StrafeBin, string> = {
	Fwd: 'Jog_Fwd_Loop',
	FwdL: 'Jog_Fwd_L_Loop',
	FwdR: 'Jog_Fwd_R_Loop',
	L: 'Jog_Left_Loop',
	R: 'Jog_Right_Loop',
	BwdL: 'Jog_Bwd_L_Loop',
	BwdR: 'Jog_Bwd_R_Loop',
	Bwd: 'Jog_Bwd_Loop',
};

export function resolveBase(bits: number, p: ResolveParams): BaseDecision {
	if (bits & CS.DEAD) return { kind: 'play', clip: 'Death01', loop: false };
	if (bits & CS.CLIMBING)
		return { kind: 'play', clip: 'Swim_Idle_Loop', fade: 0.2 };
	if (bits & CS.SWIMMING)
		return bits & CS.MOVING
			? { kind: 'play', clip: 'Swim_Fwd_Loop', fade: 0.25 }
			: { kind: 'play', clip: 'Swim_Idle_Loop', fade: 0.3 };
	if (bits & CS.AIRBORNE)
		return bits & CS.RISING
			? { kind: 'play', clip: 'Jump_Start', loop: false, fade: 0.1 }
			: { kind: 'play', clip: 'Jump_Loop', fade: 0.12 };
	if (bits & CS.LANDING)
		return {
			kind: 'play',
			clip: 'Jump_Land',
			loop: false,
			timeScale: p.landSpeed,
		};
	if (!(bits & CS.MOVING)) return { kind: 'play', clip: p.loco.idle };
	if (bits & CS.COMBAT_LOCK) {
		const tier = p.runBlend > 0.5 ? JOG_STRAFE : WALK_STRAFE;
		return { kind: 'play', clip: tier[p.strafeBin] };
	}
	if (bits & CS.RUNNING && p.runBlend > 0.001 && p.loco.walk !== p.loco.run)
		return {
			kind: 'blend',
			a: p.loco.walk,
			b: p.loco.run,
			alpha: p.runBlend,
		};
	return { kind: 'play', clip: p.loco.walk, timeScale: p.walkTs };
}

export interface OverlayDecision {
	block: boolean;
}

export function resolveOverlays(bits: number): OverlayDecision {
	return { block: (bits & CS.BLOCKING) !== 0 };
}

export function canBlockBits(bits: number): boolean {
	return (bits & (CS.HAS_WEAPON | CS.HAS_SHIELD)) !== 0;
}
