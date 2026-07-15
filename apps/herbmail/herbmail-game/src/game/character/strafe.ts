export const LEG_TWIST_MAX = (55 * Math.PI) / 180;
const BACKPEDAL_FROM = Math.PI / 2;

export interface StrafeState {
	reverse: boolean;

	legTwist: number;
}

function wrapPi(a: number): number {
	let d = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}

export type StrafeBin =
	| 'Fwd'
	| 'FwdL'
	| 'FwdR'
	| 'L'
	| 'R'
	| 'BwdL'
	| 'BwdR'
	| 'Bwd';

const BINS: StrafeBin[] = ['Fwd', 'FwdL', 'L', 'BwdL', 'Bwd'];

export function strafeBin(travelOffset: number): StrafeBin {
	const off = wrapPi(travelOffset);
	const idx = Math.min(
		4,
		Math.floor((Math.abs(off) + Math.PI / 8) / (Math.PI / 4)),
	);
	const bin = BINS[idx];
	if (off < 0 && bin !== 'Fwd' && bin !== 'Bwd')
		return bin.replace('L', 'R') as StrafeBin;
	return bin;
}

export function classifyStrafe(travelOffset: number): StrafeState {
	const off = wrapPi(travelOffset);
	const reverse = Math.abs(off) > BACKPEDAL_FROM;
	const base = reverse ? wrapPi(off - Math.PI) : off;
	return {
		reverse,
		legTwist: Math.max(-LEG_TWIST_MAX, Math.min(LEG_TWIST_MAX, base)),
	};
}
