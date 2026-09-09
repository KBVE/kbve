// Live-tunable torchlight response. Baked and dynamic share `all` so the
// near/far split stays energy-matched while it is being dialled in.
//
// The attenuation curve is the real shape control: att = 1/(k0 + k1*d + k2*d^2),
// clamped to `cap`. The quadratic term dominates past a few metres, so lowering
// k2 is what lights a whole room rather than just the torch's own pool.
let all = 1;
let bake = 1;
let ambientAdd = 0;
const att = { k0: 0.35, k1: 0.09, k2: 0.02, cap: 1.6 };

export function lightGain(): number {
	return all;
}

export function bakeGain(): number {
	return bake;
}

export function ambientBoost(): number {
	return ambientAdd;
}

export function attParams(): { k0: number; k1: number; k2: number; cap: number } {
	return att;
}

export function setLightGain(v: number): void {
	all = v;
}

export function setBakeGain(v: number): void {
	bake = v;
}

export function setAmbientBoost(v: number): void {
	ambientAdd = v;
}

export function setAtt(k0: number, k1: number, k2: number, cap: number): void {
	att.k0 = k0;
	att.k1 = k1;
	att.k2 = k2;
	att.cap = cap;
}

if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__light = {
		gain: (v?: number) => (v === undefined ? all : ((all = v), all)),
		bake: (v?: number) => (v === undefined ? bake : ((bake = v), bake)),
		ambient: (v?: number) =>
			v === undefined ? ambientAdd : ((ambientAdd = v), ambientAdd),
		att: (k0?: number, k1?: number, k2?: number, cap?: number) => {
			if (k0 !== undefined)
				setAtt(k0, k1 ?? att.k1, k2 ?? att.k2, cap ?? att.cap);
			return { ...att };
		},
		// Reference points, for dialling: brighter rooms want a smaller k2.
		presets: {
			stock: () => setAtt(0.4, 0.15, 0.12, 1.1),
			default: () => setAtt(0.35, 0.09, 0.02, 1.6),
			roomy: () => setAtt(0.4, 0.12, 0.045, 1.3),
			bright: () => setAtt(0.35, 0.09, 0.02, 1.6),
		},
	};
}
