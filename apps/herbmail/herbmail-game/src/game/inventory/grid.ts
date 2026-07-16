export const COLS = 12;
export const ROWS = 10;

export type Rot = 0 | 1;

export interface Footprint {
	w: number;
	h: number;
}

// A footprint already resolved to grid cells, anchored at its top-left cell.
export interface Rect {
	uid: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

// rot=1 turns a WxH footprint on its side (1x3 <-> 3x1).
export function rotate(fp: Footprint, rot: Rot): Footprint {
	return rot === 1 ? { w: fp.h, h: fp.w } : { w: fp.w, h: fp.h };
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
	return x >= 0 && y >= 0 && x + w <= COLS && y + h <= ROWS;
}

// Occupancy bitmap of every placed rect except `ignoreUid` (the one being moved).
function occupancy(placed: Rect[], ignoreUid?: number): Uint8Array {
	const grid = new Uint8Array(COLS * ROWS);
	for (const r of placed) {
		if (r.uid === ignoreUid) continue;
		for (let dy = 0; dy < r.h; dy++)
			for (let dx = 0; dx < r.w; dx++)
				grid[(r.y + dy) * COLS + (r.x + dx)] = 1;
	}
	return grid;
}

// True when a wxh footprint at (x,y) is inside the grid and clear of every other
// occupant. `ignoreUid` lets a moving item ignore its own current cells.
export function canPlace(
	placed: Rect[],
	x: number,
	y: number,
	w: number,
	h: number,
	ignoreUid?: number,
): boolean {
	if (!inBounds(x, y, w, h)) return false;
	const grid = occupancy(placed, ignoreUid);
	for (let dy = 0; dy < h; dy++)
		for (let dx = 0; dx < w; dx++)
			if (grid[(y + dy) * COLS + (x + dx)] === 1) return false;
	return true;
}

// First free cell (left->right, top->bottom) that fits a wxh footprint.
export function firstFit(
	placed: Rect[],
	w: number,
	h: number,
): { x: number; y: number } | null {
	for (let y = 0; y + h <= ROWS; y++)
		for (let x = 0; x + w <= COLS; x++)
			if (canPlace(placed, x, y, w, h)) return { x, y };
	return null;
}

export interface SortItem {
	uid: number;
	fp: Footprint;
}

export interface Placement {
	uid: number;
	x: number;
	y: number;
	rot: Rot;
	w: number;
	h: number;
}

// Repack from scratch: largest footprints first, each into the first free fit,
// trying the upright orientation then rotated. Items that no longer fit are
// dropped from the result (caller decides what to do — v1 never overflows on sort
// since everything already fit before).
export function autoSort(items: SortItem[]): Placement[] {
	const order = [...items].sort((a, b) => b.fp.w * b.fp.h - a.fp.w * a.fp.h);
	const out: Placement[] = [];
	for (const it of order) {
		let done = false;
		for (const rot of [0, 1] as Rot[]) {
			const { w, h } = rotate(it.fp, rot);
			const spot = firstFit(out, w, h);
			if (spot) {
				out.push({ uid: it.uid, x: spot.x, y: spot.y, rot, w, h });
				done = true;
				break;
			}
		}
		if (!done) continue;
	}
	return out;
}
