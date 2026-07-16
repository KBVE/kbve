import {
	addComponent,
	addEntity,
	removeEntity,
	Transform3,
} from '../mecs/props';
import { TILE } from '../config';
import { Door } from './components';
import { type RoomDesc } from '../dungeon/generate';
import { getDungeon } from '../dungeon/store';
import { registerInteract, resetInteract } from '../interact/registry';

const HALF = TILE / 2;
const DOOR_REACH = 2.8;

export interface DoorInfo {
	key: string;
	wc: number;
	wr: number;
	lc: number;
	lr: number;
	axis: 'x' | 'z';
	variant: number;
}

export function doorKey(wc: number, wr: number): string {
	return `${wc}|${wr}`;
}

// Doorways are decided at generation time (genDoorways carves the 1-wide arch and
// records the gap); here we just lift each into a DoorInfo with world + local tile
// coords. Sector-local, so no cross-sector ownership dance is needed.
export function roomDoors(desc: RoomDesc): DoorInfo[] {
	const out: DoorInfo[] = [];
	for (const d of desc.doorways) {
		const wc = desc.originCol + d.lc;
		const wr = desc.originRow + d.lr;
		out.push({
			key: doorKey(wc, wr),
			wc,
			wr,
			lc: d.lc,
			lr: d.lr,
			axis: d.axis,
			variant: desc.variant,
		});
	}
	return out;
}

// ECS registry: doorKey -> entity, plus per-room keys for despawn. State lives on
// the Door component; `unlocked` persists across room streaming so a door you
// opened stays open when its room re-mounts.
const byKey = new Map<string, number>();
const roomKeys = new Map<number, string[]>();
// Opened doors persist across streaming so they stay open on re-mount. FIFO-capped
// like prop suppression: far-behind doors drop and re-lock if you return much later.
const unlocked = new Set<string>();
const UNLOCK_CAP = 2048;

export function spawnRoomDoors(roomEid: number): void {
	const dw = getDungeon();
	const desc = dw.desc(roomEid);
	if (!desc) return;
	const world = dw.world;
	const keys: string[] = [];
	for (const d of roomDoors(desc)) {
		const eid = addEntity(world);
		addComponent(world, eid, Transform3);
		addComponent(world, eid, Door);
		Transform3.px[eid] = d.wc * TILE + HALF;
		Transform3.py[eid] = 0;
		Transform3.pz[eid] = d.wr * TILE + HALF;
		const isLocked = unlocked.has(d.key) ? 0 : 1;
		Door.locked[eid] = isLocked;
		Door.open[eid] = isLocked ? 0 : 1;
		Door.lc[eid] = d.lc;
		Door.lr[eid] = d.lr;
		Door.variant[eid] = d.variant;
		Door.axis[eid] = d.axis === 'x' ? 1 : 0;
		byKey.set(d.key, eid);
		keys.push(d.key);
	}
	roomKeys.set(roomEid, keys);
}

export function despawnRoomDoors(roomEid: number): void {
	const world = getDungeon().world;
	const keys = roomKeys.get(roomEid);
	if (!keys) return;
	for (const key of keys) {
		const eid = byKey.get(key);
		if (eid !== undefined) removeEntity(world, eid);
		byKey.delete(key);
	}
	roomKeys.delete(roomEid);
}

export function doorEid(key: string): number | undefined {
	return byKey.get(key);
}

// True only when a spawned, still-locked door sits on this tile — collision blocks
// it. No door (open arch, connector gate) or an unlocked one reads as passable.
export function doorClosedAt(wc: number, wr: number): boolean {
	const eid = byKey.get(doorKey(wc, wr));
	return eid !== undefined && Door.locked[eid] === 1;
}

export function resetDoors(): void {
	byKey.clear();
	roomKeys.clear();
	unlocked.clear();
	resetInteract();
}

function unlockDoor(key: string): void {
	const eid = byKey.get(key);
	if (eid !== undefined) Door.locked[eid] = 0;
	unlocked.delete(key);
	unlocked.add(key);
	if (unlocked.size > UNLOCK_CAP)
		unlocked.delete(unlocked.values().next().value as string);
}

// Doors expose themselves to the generic [F] prompt: nearest locked door within
// reach becomes a candidate target that unlocks on interact.
registerInteract((px, pz) => {
	let best: string | null = null;
	let bestD = DOOR_REACH * DOOR_REACH;
	for (const [key, eid] of byKey) {
		if (Door.locked[eid] !== 1) continue;
		const dx = Transform3.px[eid] - px;
		const dz = Transform3.pz[eid] - pz;
		const dd = dx * dx + dz * dz;
		if (dd < bestD) {
			bestD = dd;
			best = key;
		}
	}
	if (best === null) return null;
	const key = best;
	return {
		target: {
			id: key,
			verb: 'unlock the door',
			interact: () => unlockDoor(key),
		},
		dist2: bestD,
	};
});
