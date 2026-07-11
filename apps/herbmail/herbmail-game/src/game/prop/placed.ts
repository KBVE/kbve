import { cellAtWorld } from '../dungeon/ecs';
import { TILE } from '../config';

// Player-placed props persisted per cell, so they survive room streaming: a room
// mount re-spawns any records for its cell. Bounded ring across all cells.
export interface PlacedRecord {
	id: number;
	cx: number;
	cy: number;
	pos: [number, number, number];
	dir: [number, number, number];
}

const CAP = 24;

let records: PlacedRecord[] = [];
let nextId = 1;

export function recordPlaced(
	pos: [number, number, number],
	dir: [number, number, number],
): PlacedRecord {
	const { cx, cy } = cellAtWorld(pos[0], pos[2], TILE);
	const rec: PlacedRecord = { id: nextId++, cx, cy, pos, dir };
	records.push(rec);
	if (records.length > CAP) records = records.slice(records.length - CAP);
	return rec;
}

export function placedForCell(cx: number, cy: number): PlacedRecord[] {
	return records.filter((r) => r.cx === cx && r.cy === cy);
}

export function clearPlaced(): void {
	records = [];
}
