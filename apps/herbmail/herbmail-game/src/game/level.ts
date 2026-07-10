import * as THREE from 'three';
import { TILE } from './config';
import { jitter } from './geometry/rng';
import type { Grid } from './geometry/grid';

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

export const levelGrid: Grid = {
	cols: COLS,
	rows: ROWS,
	originCol: 0,
	originRow: 0,
	tileAt,
};

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

interface Opening {
	axis: ArchAxis;
	openHW: number;
}

let openingMap: Map<number, Opening> | null = null;

function openings(): Map<number, Opening> {
	if (openingMap) return openingMap;
	openingMap = new Map();
	for (const a of archTiles()) {
		openingMap.set(a.row * COLS + a.col, {
			axis: a.axis,
			openHW: jitter(a.col, a.row, 1, TILE * 0.28, TILE * 0.38),
		});
	}
	return openingMap;
}

export function solidAt(x: number, z: number): boolean {
	const col = Math.floor(x / TILE);
	const row = Math.floor(z / TILE);
	const t = tileAt(col, row);
	if (t === WALL) return true;
	if (t === ARCH) {
		const o = openings().get(row * COLS + col);
		if (!o) return true;
		const cx = col * TILE + TILE / 2;
		const cz = row * TILE + TILE / 2;
		const off = o.axis === 'x' ? z - cz : x - cx;
		return Math.abs(off) > o.openHW;
	}
	return false;
}

export function spawnPoint(): [number, number, number] {
	const [x, z] = tileToWorld(2, 2);
	return [x, TILE / 2, z];
}

let roomMap: Int16Array | null = null;

function buildRooms(): Int16Array {
	const ids = new Int16Array(ROWS * COLS).fill(-1);
	let room = 0;
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			if (tileAt(c, r) !== FLOOR || ids[r * COLS + c] !== -1) continue;
			const stack: [number, number][] = [[c, r]];
			ids[r * COLS + c] = room;
			while (stack.length) {
				const [cc, rr] = stack.pop() as [number, number];
				for (const [dc, dr] of [
					[0, -1],
					[0, 1],
					[-1, 0],
					[1, 0],
				]) {
					const nc = cc + dc;
					const nr = rr + dr;
					if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
					const k = nr * COLS + nc;
					if (tileAt(nc, nr) !== FLOOR || ids[k] !== -1) continue;
					ids[k] = room;
					stack.push([nc, nr]);
				}
			}
			room++;
		}
	}
	return ids;
}

let mapTex: THREE.DataTexture | null = null;

export function mapTexture(): THREE.DataTexture {
	if (mapTex) return mapTex;
	const data = new Uint8Array(ROWS * COLS);
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const t = MAP[r][c];
			data[r * COLS + c] = t === WALL ? 254 : t === ARCH ? 127 : 0;
		}
	}
	mapTex = new THREE.DataTexture(data, COLS, ROWS, THREE.RedFormat);
	mapTex.magFilter = THREE.NearestFilter;
	mapTex.minFilter = THREE.NearestFilter;
	mapTex.wrapS = THREE.ClampToEdgeWrapping;
	mapTex.wrapT = THREE.ClampToEdgeWrapping;
	mapTex.needsUpdate = true;
	return mapTex;
}

export function roomAt(x: number, z: number): number {
	if (!roomMap) roomMap = buildRooms();
	const col = Math.floor(x / TILE);
	const row = Math.floor(z / TILE);
	if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return -1;
	return roomMap[row * COLS + col];
}
