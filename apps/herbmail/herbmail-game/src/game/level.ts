export const TILE = 2;

export const MAP: number[][] = [
	[1, 1, 1, 1, 1, 1, 1, 1],
	[1, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 1, 0, 0, 1, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 1, 1, 0, 0, 1],
	[1, 0, 1, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 1, 0, 1],
	[1, 1, 1, 1, 1, 1, 1, 1],
];

export const ROWS = MAP.length;
export const COLS = MAP[0].length;

export function isWall(col: number, row: number): boolean {
	if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
	return MAP[row][col] === 1;
}

export function wallTiles(): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (MAP[row][col] === 1) out.push([col, row]);
		}
	}
	return out;
}

export function tileToWorld(col: number, row: number): [number, number] {
	return [col * TILE + TILE / 2, row * TILE + TILE / 2];
}

export function spawnPoint(): [number, number, number] {
	const [x, z] = tileToWorld(1, 1);
	return [x, TILE / 2, z];
}
