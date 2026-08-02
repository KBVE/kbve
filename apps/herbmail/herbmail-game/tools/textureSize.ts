export interface Size {
	width: number;
	height: number;
}

// Longest edge is clamped to max, aspect preserved, and the result is rounded
// to whole pixels. Returns null when the image is already within budget so the
// caller can skip re-encoding it.
export function plannedSize(src: Size, max: number): Size | null {
	const longest = Math.max(src.width, src.height);
	if (longest <= max) return null;
	const scale = max / longest;
	return {
		width: Math.max(1, Math.round(src.width * scale)),
		height: Math.max(1, Math.round(src.height * scale)),
	};
}

// Tiling art has to stay power-of-two or the wrap seams stop lining up, so a
// power-of-two source must land on a power-of-two target.
export function isPowerOfTwo(n: number): boolean {
	return n > 0 && (n & (n - 1)) === 0;
}

export function preservesPowerOfTwo(src: Size, out: Size): boolean {
	const srcPot = isPowerOfTwo(src.width) && isPowerOfTwo(src.height);
	if (!srcPot) return true;
	return isPowerOfTwo(out.width) && isPowerOfTwo(out.height);
}
