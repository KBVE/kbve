import {
	BASE_WIDTH,
	COLS,
	HUD_ROWS_BOTTOM,
	HUD_ROWS_TOP,
	ROWS,
	TILE,
} from './config';

export interface Waypoint {
	x: number;
	y: number;
}

export interface PathSegment {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	dx: number;
	dy: number;
	len: number;
	invLen: number;
}

export interface GeneratedPath {
	waypoints: Waypoint[];
	segments: PathSegment[];
	cells: Set<string>;
	startRow: number;
	endRow: number;
}

export function buildPathSegments(waypoints: Waypoint[]): PathSegment[] {
	const out: PathSegment[] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		const a = waypoints[i];
		const b = waypoints[i + 1];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		out.push({
			startX: a.x,
			startY: a.y,
			endX: b.x,
			endY: b.y,
			dx,
			dy,
			len,
			invLen: len > 0 ? 1 / len : 0,
		});
	}
	return out;
}

const cellKey = (c: number, r: number) => `${c},${r}`;
const cellCenterX = (c: number) => c * TILE + TILE / 2;
const cellCenterY = (r: number) => r * TILE + TILE / 2;

const minRow = HUD_ROWS_TOP + 1;
const maxRow = ROWS - HUD_ROWS_BOTTOM - 2;

function randInt(lo: number, hi: number): number {
	return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function generatePath(): GeneratedPath {
	for (let attempt = 0; attempt < 40; attempt++) {
		const result = tryGenerate();
		if (result) return result;
	}
	return fallbackPath();
}

function tryGenerate(): GeneratedPath | null {
	const startRow = randInt(minRow, maxRow);
	let col = 0;
	let row = startRow;
	const cells = new Set<string>();
	const order: Array<[number, number]> = [];
	cells.add(cellKey(col, row));
	order.push([col, row]);

	const maxSteps = COLS * 4;
	let consecutiveNonRight = 0;
	const consecutiveCap = 4;

	while (col < COLS - 1) {
		if (order.length > maxSteps) return null;
		const choices: Array<{ c: number; r: number; weight: number }> = [];
		const tryAdd = (c: number, r: number, baseWeight: number) => {
			if (c < 0 || c >= COLS) return;
			if (r < minRow || r > maxRow) return;
			if (cells.has(cellKey(c, r))) return;
			choices.push({ c, r, weight: baseWeight });
		};

		const rightWeight = consecutiveNonRight >= consecutiveCap ? 12 : 4;
		tryAdd(col + 1, row, rightWeight);
		tryAdd(col, row - 1, consecutiveNonRight >= consecutiveCap ? 0.2 : 1.5);
		tryAdd(col, row + 1, consecutiveNonRight >= consecutiveCap ? 0.2 : 1.5);

		if (choices.length === 0) return null;
		const total = choices.reduce((s, c) => s + c.weight, 0);
		let pick = Math.random() * total;
		let chosen = choices[0];
		for (const ch of choices) {
			pick -= ch.weight;
			if (pick <= 0) {
				chosen = ch;
				break;
			}
		}
		if (chosen.c > col) consecutiveNonRight = 0;
		else consecutiveNonRight += 1;
		col = chosen.c;
		row = chosen.r;
		cells.add(cellKey(col, row));
		order.push([col, row]);
	}

	const waypoints = compressToCorners(order);
	const segments = buildPathSegments(waypoints);
	return { waypoints, segments, cells, startRow, endRow: row };
}

function compressToCorners(order: Array<[number, number]>): Waypoint[] {
	const out: Waypoint[] = [];
	out.push({ x: -TILE, y: cellCenterY(order[0][1]) });
	out.push({ x: cellCenterX(order[0][0]), y: cellCenterY(order[0][1]) });
	for (let i = 1; i < order.length - 1; i++) {
		const [pc, pr] = order[i - 1];
		const [c, r] = order[i];
		const [nc, nr] = order[i + 1];
		const prevDx = c - pc;
		const prevDy = r - pr;
		const nextDx = nc - c;
		const nextDy = nr - r;
		if (prevDx !== nextDx || prevDy !== nextDy) {
			out.push({ x: cellCenterX(c), y: cellCenterY(r) });
		}
	}
	const last = order[order.length - 1];
	out.push({ x: cellCenterX(last[0]), y: cellCenterY(last[1]) });
	out.push({ x: BASE_WIDTH + TILE, y: cellCenterY(last[1]) });
	return out;
}

function fallbackPath(): GeneratedPath {
	const row = Math.floor((minRow + maxRow) / 2);
	const cells = new Set<string>();
	const order: Array<[number, number]> = [];
	for (let c = 0; c < COLS; c++) {
		cells.add(cellKey(c, row));
		order.push([c, row]);
	}
	const waypoints = compressToCorners(order);
	return {
		waypoints,
		segments: buildPathSegments(waypoints),
		cells,
		startRow: row,
		endRow: row,
	};
}
