import {
	COLS,
	HUD_ROWS_BOTTOM,
	HUD_ROWS_TOP,
	ROWS,
	type BuildId,
} from './config';

export interface KitItem {
	id: BuildId;
	col: number;
	row: number;
}

const LAYOUT: Array<{ id: BuildId; dc: number; dr: number }> = [
	{ id: 'basic', dc: 0, dr: -1 },
	{ id: 'basic', dc: 1, dr: -1 },
	{ id: 'repair', dc: 2, dr: -1 },
	{ id: 'solar', dc: 0, dr: 0 },
	{ id: 'battery', dc: 1, dr: 0 },
	{ id: 'diesel', dc: 2, dr: 0 },
	{ id: 'armoury', dc: 3, dr: 0 },
];

const key = (c: number, r: number) => `${c},${r}`;
const minRow = HUD_ROWS_TOP + 1;
const maxRow = ROWS - HUD_ROWS_BOTTOM - 2;

function layoutFits(
	pathCells: Set<string>,
	originCol: number,
	originRow: number,
): boolean {
	for (const item of LAYOUT) {
		const cc = originCol + item.dc;
		const rr = originRow + item.dr;
		if (cc < 0 || cc >= COLS) return false;
		if (rr < minRow || rr > maxRow) return false;
		if (pathCells.has(key(cc, rr))) return false;
	}
	return true;
}

export function planStarterKit(
	pathCells: Set<string>,
	pathStartRow: number,
): KitItem[] {
	const desiredCols = [3, 4, 2, 5, 1, 6];
	const rowOffsets = [0, -1, 1, -2, 2, -3, 3];
	for (const dc of desiredCols) {
		for (const dr of rowOffsets) {
			const c = dc;
			const r = pathStartRow + dr;
			if (r < minRow || r > maxRow) continue;
			if (!layoutFits(pathCells, c, r)) continue;
			return LAYOUT.map((item) => ({
				id: item.id,
				col: c + item.dc,
				row: r + item.dr,
			}));
		}
	}
	for (let r = minRow + 1; r <= maxRow; r++) {
		for (let c = 1; c < COLS - 4; c++) {
			if (!layoutFits(pathCells, c, r)) continue;
			return LAYOUT.map((item) => ({
				id: item.id,
				col: c + item.dc,
				row: r + item.dr,
			}));
		}
	}
	return [];
}
