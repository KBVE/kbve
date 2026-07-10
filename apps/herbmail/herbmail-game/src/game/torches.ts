import { useSyncExternalStore } from 'react';
import { COLS, ROWS, isWall, roomAt, tileAt, WALL } from './level';
import { TILE } from './config';

export interface Torch {
	id: number;
	pos: [number, number, number];
	dir: [number, number, number];
	room: number;
}

function torchRoom(
	pos: [number, number, number],
	dir: [number, number, number],
): number {
	const len = Math.hypot(dir[0], dir[2]) || 1;
	const nx = dir[0] / len;
	const nz = dir[2] / len;
	return roomAt(pos[0] + nx * 0.9, pos[2] + nz * 0.9);
}

const MOUNT_H = 2.6;
const PITCH = 0.5;
const OFF = 0.08;

const DIRS: [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
];

function headDir(nx: number, nz: number): [number, number, number] {
	const c = Math.cos(PITCH);
	return [nx * c, Math.sin(PITCH), nz * c];
}

function keep(col: number, row: number, d: number): boolean {
	return (col * 7 + row * 13 + d * 5) % 11 === 0;
}

function seed(): Torch[] {
	const out: Torch[] = [];
	let id = 0;
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (tileAt(col, row) !== WALL) continue;
			continueScan(col, row, out, () => id++);
		}
	}
	return out;
}

function continueScan(
	col: number,
	row: number,
	out: Torch[],
	nextId: () => number,
): void {
	for (let d = 0; d < DIRS.length; d++) {
		const [dc, dr] = DIRS[d];
		const nc = col + dc;
		const nr = row + dr;
		if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
		if (isWall(nc, nr) || tileAt(nc, nr) !== 0) continue;
		if (!keep(col, row, d)) continue;
		const nx = dc;
		const nz = dr;
		const fx = (col + 0.5) * TILE + nx * (TILE / 2 - OFF);
		const fz = (row + 0.5) * TILE + nz * (TILE / 2 - OFF);
		const pos: [number, number, number] = [fx, MOUNT_H, fz];
		const dir = headDir(nx, nz);
		out.push({ id: nextId(), pos, dir, room: torchRoom(pos, dir) });
	}
}

const MAX_PLACED = 12;

const decor: Torch[] = seed();
let placed: Torch[] = [];
let torches: Torch[] = decor;
let nextId = decor.length;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function addTorch(
	pos: [number, number, number],
	dir: [number, number, number],
): void {
	const next = [
		...placed,
		{ id: nextId++, pos, dir, room: torchRoom(pos, dir) },
	];
	placed =
		next.length > MAX_PLACED ? next.slice(next.length - MAX_PLACED) : next;
	torches = [...decor, ...placed];
	emit();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function getTorches(): Torch[] {
	return torches;
}

export function useTorches(): Torch[] {
	return useSyncExternalStore(subscribe, getTorches, getTorches);
}
