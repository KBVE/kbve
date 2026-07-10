import { TILE } from './config';

export const WALL = 1;
export const FLOOR = 0;
export const ARCH = 2;

export const MAP: number[][] = [
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
	[1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const ROWS = MAP.length;
export const COLS = MAP[0].length;

export function tileAt(col: number, row: number): number {
	if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return WALL;
	return MAP[row][col];
}

export function isWall(col: number, row: number): boolean {
	return tileAt(col, row) === WALL;
}

export type ArchAxis = 'x' | 'z';

export interface Arch {
	col: number;
	row: number;
	axis: ArchAxis;
}

export function archTiles(): Arch[] {
	const out: Arch[] = [];
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (MAP[row][col] !== ARCH) continue;
			const nsWall = isWall(col, row - 1) && isWall(col, row + 1);
			out.push({ col, row, axis: nsWall ? 'x' : 'z' });
		}
	}
	return out;
}

export function tileToWorld(col: number, row: number): [number, number] {
	return [col * TILE + TILE / 2, row * TILE + TILE / 2];
}

export function spawnPoint(): [number, number, number] {
	const [x, z] = tileToWorld(2, 2);
	return [x, TILE / 2, z];
}
