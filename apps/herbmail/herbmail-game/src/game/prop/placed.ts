import { cellAtWorld } from '../dungeon/ecs';
import { SECTOR, floorDiv } from '../dungeon/sector';
import { TILE } from '../config';
import { PROP_TORCH } from './kinds';

// Player-placed props persisted per cell, so they survive room streaming: a room
// mount re-spawns any records for its cell. Bounded ring across all cells. `kind`
// discriminates what to re-spawn (torch on a wall, crate on the floor, ...).
export interface PlacedRecord {
	id: number;
	kind: number;
	cx: number;
	cy: number;
	pos: [number, number, number];
	dir: [number, number, number];
}

const CAP = 24;

let records: PlacedRecord[] = [];
let nextId = 1;

// Removed-prop positions, so a despawned torch/crate/stone does not respawn when its
// room streams back in. Keyed by rounded world position. FIFO-capped: on an endless
// traverse the oldest entries (far-behind sectors you won't revisit soon) drop, so
// this stays bounded — those sectors just reset their prop state if you return.
const suppressed = new Set<string>();
const SUPPRESS_CAP = 4096;

function posKey(pos: [number, number, number]): string {
	return `${Math.round(pos[0] * 10)}|${Math.round(pos[1] * 10)}|${Math.round(pos[2] * 10)}`;
}

export function suppressAt(pos: [number, number, number]): void {
	const key = posKey(pos);
	suppressed.delete(key);
	suppressed.add(key);
	if (suppressed.size > SUPPRESS_CAP)
		suppressed.delete(suppressed.values().next().value as string);
}

export function unsuppressAt(pos: [number, number, number]): void {
	suppressed.delete(posKey(pos));
}

export function isSuppressed(pos: [number, number, number]): boolean {
	return suppressed.has(posKey(pos));
}

export function removePlacedNear(pos: [number, number, number]): void {
	const k = posKey(pos);
	records = records.filter((r) => posKey(r.pos) !== k);
}

export function recordPlaced(
	pos: [number, number, number],
	dir: [number, number, number],
	kind: number = PROP_TORCH,
): PlacedRecord {
	const { cx, cy } = cellAtWorld(pos[0], pos[2], TILE);
	const rec: PlacedRecord = { id: nextId++, kind, cx, cy, pos, dir };
	records.push(rec);
	if (records.length > CAP) records = records.slice(records.length - CAP);
	return rec;
}

export function placedForCell(cx: number, cy: number): PlacedRecord[] {
	return records.filter((r) => r.cx === cx && r.cy === cy);
}

export function placedForSector(sx: number, sy: number): PlacedRecord[] {
	return records.filter(
		(r) => floorDiv(r.cx, SECTOR) === sx && floorDiv(r.cy, SECTOR) === sy,
	);
}

export function clearPlaced(): void {
	records = [];
	suppressed.clear();
}
