export interface BuildingPalette {
	outline: string;
	shadow: string;
	mid: string;
	base: string;
	highlight: string;
}

function hexToRgb(hex: number): [number, number, number] {
	return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
	const ri = Math.max(0, Math.min(255, Math.round(r)));
	const gi = Math.max(0, Math.min(255, Math.round(g)));
	const bi = Math.max(0, Math.min(255, Math.round(b)));
	return `#${((ri << 16) | (gi << 8) | bi).toString(16).padStart(6, '0')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;
	const d = max - min;
	if (d > 0) {
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rn:
				h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
				break;
			case gn:
				h = ((bn - rn) / d + 2) * 60;
				break;
			case bn:
				h = ((rn - gn) / d + 4) * 60;
				break;
		}
	}
	return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
	let tt = t;
	if (tt < 0) tt += 1;
	if (tt > 1) tt -= 1;
	if (tt < 1 / 6) return p + (q - p) * 6 * tt;
	if (tt < 1 / 2) return q;
	if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
	return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const hh = h / 360;
	if (s === 0) return [l * 255, l * 255, l * 255];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [
		hueToRgb(p, q, hh + 1 / 3) * 255,
		hueToRgb(p, q, hh) * 255,
		hueToRgb(p, q, hh - 1 / 3) * 255,
	];
}

function shift(hex: number, lDelta: number, sScale = 1): string {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const newL = Math.max(0, Math.min(1, l + lDelta));
	const newS = Math.max(0, Math.min(1, s * sScale));
	const [nr, ng, nb] = hslToRgb(h, newS, newL);
	return rgbToHex(nr, ng, nb);
}

export function derivePalette(baseHex: number): BuildingPalette {
	return {
		outline: shift(baseHex, -0.4, 1.1),
		shadow: shift(baseHex, -0.22, 1.05),
		mid: shift(baseHex, -0.08, 1.0),
		base: shift(baseHex, 0, 1.0),
		highlight: shift(baseHex, 0.22, 0.7),
	};
}

export const NEUTRAL_DARK = '#0d1117';
