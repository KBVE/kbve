import { TILE } from '../config';

// Bounds of the occluder march in world units, carried over verbatim from the
// fixed 0.32-step loop the cell walk replaced: its first sample sat at 0.5 and
// its last at 0.5 + 33*0.32. LIGHT_RANGE is 18, so a distant light's ray was
// never tested past OCC_REACH and still is not — keeping these exact is what
// stops the change from pulling far-off walls into shadow.
export const OCC_NEAR = 0.5;
export const OCC_REACH = 0.5 + 33 * 0.32;

// Cells a ray can enter across the span. A ray crossing n tiles on each axis
// touches at most 2n+1 of them, plus headroom for the exact-diagonal case where
// both boundaries fall on the same parameter.
const SPAN_TILES = Math.ceil((OCC_REACH - OCC_NEAR) / TILE);
export const OCC_CELLS = SPAN_TILES * 2 + 4;

export interface Cell {
	x: number;
	y: number;
}

// The cells the old fixed-step loop actually sampled. Kept so the walk below can
// be checked against it rather than against a restatement of itself.
export function fixedStepCells(
	fx: number,
	fy: number,
	lx: number,
	ly: number,
	originX: number,
	originY: number,
): Cell[] {
	const dx = lx - fx;
	const dy = ly - fy;
	const len = Math.hypot(dx, dy);
	if (len < 0.6) return [];
	const ux = dx / len;
	const uy = dy / len;
	const end = len - 0.45;
	const out: Cell[] = [];
	for (let k = 0; k < 34; k++) {
		const s = OCC_NEAR + k * 0.32;
		if (s >= end) break;
		out.push({
			x: Math.floor((fx + ux * s - originX) / TILE),
			y: Math.floor((fy + uy * s - originY) / TILE),
		});
	}
	return out;
}

// Amanatides-Woo grid traversal, mirroring the GLSL in PsxMaterial's
// visibility(). Every cell the segment passes through, each visited once.
export function marchCells(
	fx: number,
	fy: number,
	lx: number,
	ly: number,
	originX: number,
	originY: number,
): Cell[] {
	const dx = lx - fx;
	const dy = ly - fy;
	const len = Math.hypot(dx, dy);
	if (len < 0.6) return [];
	const ux = dx / len;
	const uy = dy / len;
	const travel = Math.min(len - 0.45, OCC_REACH) - OCC_NEAR;
	if (travel <= 0) return [];

	const gx = (fx + ux * OCC_NEAR - originX) / TILE;
	const gy = (fy + uy * OCC_NEAR - originY) / TILE;
	const gdx = ux / TILE;
	const gdy = uy / TILE;
	let cx = Math.floor(gx);
	let cy = Math.floor(gy);
	const sx = Math.sign(gdx);
	const sy = Math.sign(gdy);
	const FAR = 1e9;
	const tdx = gdx !== 0 ? Math.abs(1 / gdx) : FAR;
	const tdy = gdy !== 0 ? Math.abs(1 / gdy) : FAR;
	let tmx = gdx > 0 ? (cx + 1 - gx) / gdx : gdx < 0 ? (cx - gx) / gdx : FAR;
	let tmy = gdy > 0 ? (cy + 1 - gy) / gdy : gdy < 0 ? (cy - gy) / gdy : FAR;

	const out: Cell[] = [];
	for (let k = 0; k < OCC_CELLS; k++) {
		out.push({ x: cx, y: cy });
		if (Math.min(tmx, tmy) >= travel) break;
		if (tmx < tmy) {
			cx += sx;
			tmx += tdx;
		} else {
			cy += sy;
			tmy += tdy;
		}
	}
	return out;
}
