export function hashInt(x: number, y: number, z = 0): number {
	let h =
		Math.imul(x | 0, 374761393) +
		Math.imul(y | 0, 668265263) +
		Math.imul(z | 0, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return (h ^ (h >>> 16)) >>> 0;
}

export function hash01(x: number, y: number, z = 0): number {
	return hashInt(x, y, z) / 4294967295;
}

export function jitter(
	x: number,
	y: number,
	z: number,
	min: number,
	max: number,
): number {
	return min + hash01(x, y, z) * (max - min);
}
