import type { TileXY } from '../iso';

export type IsFloor = (x: number, y: number) => boolean;

/**
 * A* over the dungeon floor grid, used for click-to-move so the body routes
 * THROUGH corridors instead of charging straight into a wall. 8-directional
 * with corner-cutting disallowed (a diagonal needs both orthogonal neighbours
 * open) so the path never clips a wall corner. Bounded by maxNodes so a click
 * into unreachable/void space fails fast instead of hanging.
 */

const key = (x: number, y: number): string => `${x},${y}`;

interface Node {
	x: number;
	y: number;
	g: number;
	f: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

function octile(ax: number, ay: number, bx: number, by: number): number {
	const dx = Math.abs(ax - bx);
	const dy = Math.abs(ay - by);
	return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Find a tile path from `start` to `goal` over floor tiles. Returns the path
 * (start excluded, goal included) or null if unreachable within the node
 * budget. If `goal` is a wall, the search retargets the nearest floor tile to
 * it so a click on a wall still walks the player up to the wall.
 */
export function findPath(
	start: TileXY,
	goal: TileXY,
	isFloor: IsFloor,
	maxNodes = 4000,
): TileXY[] | null {
	if (!isFloor(start.x, start.y)) return null;
	let gx = goal.x;
	let gy = goal.y;
	if (!isFloor(gx, gy)) {
		const near = nearestFloor(goal, isFloor);
		if (!near) return null;
		gx = near.x;
		gy = near.y;
	}
	if (gx === start.x && gy === start.y) return [];

	const open: Node[] = [{ x: start.x, y: start.y, g: 0, f: 0 }];
	const came = new Map<string, string>();
	const gScore = new Map<string, number>([[key(start.x, start.y), 0]]);
	const closed = new Set<string>();
	let expanded = 0;

	while (open.length > 0 && expanded < maxNodes) {
		// Pop lowest f (linear scan — paths here are short, a heap isn't worth it).
		let bi = 0;
		for (let i = 1; i < open.length; i++)
			if (open[i].f < open[bi].f) bi = i;
		const cur = open.splice(bi, 1)[0];
		const ck = key(cur.x, cur.y);
		if (closed.has(ck)) continue;
		closed.add(ck);
		expanded++;

		if (cur.x === gx && cur.y === gy) {
			return reconstruct(came, ck, start);
		}

		for (const [dx, dy] of NEIGHBORS) {
			const nx = cur.x + dx;
			const ny = cur.y + dy;
			if (!isFloor(nx, ny)) continue;
			// No corner cutting: a diagonal step requires both orthogonal cells.
			if (dx !== 0 && dy !== 0) {
				if (
					!isFloor(cur.x + dx, cur.y) ||
					!isFloor(cur.x, cur.y + dy)
				) {
					continue;
				}
			}
			const nk = key(nx, ny);
			if (closed.has(nk)) continue;
			const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
			const tentative = cur.g + step;
			if (tentative < (gScore.get(nk) ?? Infinity)) {
				came.set(nk, ck);
				gScore.set(nk, tentative);
				const f = tentative + octile(nx, ny, gx, gy);
				open.push({ x: nx, y: ny, g: tentative, f });
			}
		}
	}
	return null;
}

function reconstruct(
	came: Map<string, string>,
	endKey: string,
	start: TileXY,
): TileXY[] {
	const path: TileXY[] = [];
	let k: string | undefined = endKey;
	const startKey = key(start.x, start.y);
	while (k && k !== startKey) {
		const i = k.indexOf(',');
		path.push({ x: Number(k.slice(0, i)), y: Number(k.slice(i + 1)) });
		k = came.get(k);
	}
	path.reverse();
	return path;
}

/** Spiral-search the nearest floor tile to a target (for wall clicks). */
function nearestFloor(
	target: TileXY,
	isFloor: IsFloor,
	maxR = 8,
): TileXY | null {
	for (let r = 1; r <= maxR; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
				const x = target.x + dx;
				const y = target.y + dy;
				if (isFloor(x, y)) return { x, y };
			}
		}
	}
	return null;
}

/**
 * String-pull a tile path: drop intermediate waypoints that have clear
 * line-of-sight from the last kept point, so the body cuts straight diagonals
 * across open rooms instead of stair-stepping the grid. LOS is sampled against
 * floor tiles. Keeps the path short and the motion natural.
 */
export function smoothPath(
	start: TileXY,
	path: TileXY[],
	isFloor: IsFloor,
): TileXY[] {
	if (path.length <= 1) return path;
	const out: TileXY[] = [];
	let anchor = start;
	let i = 0;
	while (i < path.length) {
		// Extend as far as line-of-sight allows from the current anchor.
		let j = path.length - 1;
		while (j > i) {
			if (lineClear(anchor, path[j], isFloor)) break;
			j--;
		}
		out.push(path[j]);
		anchor = path[j];
		i = j + 1;
	}
	return out;
}

/** Supercover-ish LOS: walk the segment, fail if any sampled tile is a wall. */
function lineClear(a: TileXY, b: TileXY, isFloor: IsFloor): boolean {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
	if (steps === 0) return true;
	for (let s = 0; s <= steps; s++) {
		const t = s / steps;
		const x = Math.round(a.x + dx * t);
		const y = Math.round(a.y + dy * t);
		if (!isFloor(x, y)) return false;
	}
	return true;
}
