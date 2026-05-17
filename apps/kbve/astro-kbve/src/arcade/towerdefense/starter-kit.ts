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

export function planStarterKit(pathCells: Set<string>): KitItem[] {
	const key = (c: number, r: number) => `${c},${r}`;
	const minRow = HUD_ROWS_TOP + 1;
	const maxRow = ROWS - HUD_ROWS_BOTTOM - 2;

	const layout: Array<{ id: BuildId; dc: number; dr: number }> = [
		{ id: 'solar', dc: 0, dr: 0 },
		{ id: 'battery', dc: 1, dr: 0 },
		{ id: 'basic', dc: 0, dr: -1 },
		{ id: 'basic', dc: 1, dr: -1 },
	];

	for (let r = minRow + 1; r <= maxRow; r++) {
		for (let c = 1; c < COLS - 2; c++) {
			let ok = true;
			for (const item of layout) {
				const cc = c + item.dc;
				const rr = r + item.dr;
				if (cc < 0 || cc >= COLS || rr < minRow || rr > maxRow) {
					ok = false;
					break;
				}
				if (pathCells.has(key(cc, rr))) {
					ok = false;
					break;
				}
			}
			if (!ok) continue;
			return layout.map((item) => ({
				id: item.id,
				col: c + item.dc,
				row: r + item.dr,
			}));
		}
	}
	return [];
}
