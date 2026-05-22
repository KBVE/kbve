export type Rand = () => number;

export function mulberry32(seed: number): Rand {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function randomSeed(): number {
	return (Math.random() * 0xffffffff) >>> 0;
}

export function parseSeed(s: string | null | undefined): number | null {
	if (!s) return null;
	const trimmed = s.trim();
	if (!trimmed) return null;
	const num = Number(trimmed);
	if (Number.isFinite(num) && num >= 0) return num >>> 0;
	let h = 0;
	for (let i = 0; i < trimmed.length; i++) {
		h = Math.imul(31, h) + trimmed.charCodeAt(i);
		h |= 0;
	}
	return h >>> 0;
}
