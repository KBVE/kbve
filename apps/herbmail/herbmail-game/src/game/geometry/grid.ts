export const FLOOR = 0;
export const WALL = 1;
export const ARCH = 2;
export const COLUMN = 3;

export interface Grid {
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
	tileAt(col: number, row: number): number;
}

export function isSolidTile(t: number): boolean {
	return t === WALL;
}

export function gridSolid(grid: Grid, col: number, row: number): boolean {
	if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return true;
	return grid.tileAt(col, row) === WALL;
}

export function gridTile(grid: Grid, col: number, row: number): number {
	if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return WALL;
	return grid.tileAt(col, row);
}
