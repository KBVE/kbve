import { useSyncExternalStore } from 'react';
import { TILE } from './config';
import { cellAtWorld } from './dungeon/ecs';

export interface Torch {
	id: number;
	pos: [number, number, number];
	dir: [number, number, number];
	cx: number;
	cy: number;
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

export function headDir(nx: number, nz: number): [number, number, number] {
	const c = Math.cos(PITCH);
	return [nx * c, Math.sin(PITCH), nz * c];
}

// World tile (col,row) + wall-direction index -> mounted torch transform.
export function torchTransform(
	worldCol: number,
	worldRow: number,
	di: number,
): { pos: [number, number, number]; dir: [number, number, number] } {
	const [nx, nz] = DIRS[di];
	const fx = (worldCol + 0.5) * TILE + nx * (TILE / 2 - OFF);
	const fz = (worldRow + 0.5) * TILE + nz * (TILE / 2 - OFF);
	return { pos: [fx, MOUNT_H, fz], dir: headDir(nx, nz) };
}

const MAX_PLACED = 12;

let placed: Torch[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function addTorch(
	pos: [number, number, number],
	dir: [number, number, number],
): void {
	const { cx, cy } = cellAtWorld(pos[0], pos[2], TILE);
	const next = [...placed, { id: nextId++, pos, dir, cx, cy }];
	placed =
		next.length > MAX_PLACED ? next.slice(next.length - MAX_PLACED) : next;
	emit();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function getPlaced(): Torch[] {
	return placed;
}

export function usePlacedTorches(): Torch[] {
	return useSyncExternalStore(subscribe, getPlaced, getPlaced);
}
