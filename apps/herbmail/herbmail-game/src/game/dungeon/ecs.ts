import {
	createWorld,
	addEntity,
	addComponent,
	removeEntity,
	type World,
} from '@kbve/laser/ecs';
import {
	genRoom,
	CELL,
	DOOR_N,
	DOOR_S,
	DOOR_W,
	DOOR_E,
	type RoomDesc,
} from './generate';

export const MAX_ROOMS = 4096;

export const RoomCell = {
	cx: new Int32Array(MAX_ROOMS),
	cy: new Int32Array(MAX_ROOMS),
};
export const RoomDoors = { bits: new Uint8Array(MAX_ROOMS) };
export const RoomPhase = { value: new Uint8Array(MAX_ROOMS) };
export const RoomTag: Record<string, never> = {};

export const PHASE_SEED = 0;
export const PHASE_GENERATED = 1;
export const PHASE_MOUNTED = 2;

function cellKey(cx: number, cy: number): string {
	return `${cx}|${cy}`;
}

const DOOR_STEPS: { bit: number; dc: number; dr: number }[] = [
	{ bit: DOOR_N, dc: 0, dr: -1 },
	{ bit: DOOR_S, dc: 0, dr: 1 },
	{ bit: DOOR_W, dc: -1, dr: 0 },
	{ bit: DOOR_E, dc: 1, dr: 0 },
];

export class DungeonWorld {
	readonly world: World = createWorld();
	readonly seed: number;
	private byCell = new Map<string, number>();
	private descs = new Map<number, RoomDesc>();

	constructor(seed: number) {
		this.seed = seed | 0;
	}

	roomAtCell(cx: number, cy: number): number | undefined {
		return this.byCell.get(cellKey(cx, cy));
	}

	desc(eid: number): RoomDesc | undefined {
		return this.descs.get(eid);
	}

	phase(eid: number): number {
		return RoomPhase.value[eid];
	}

	setPhase(eid: number, value: number): void {
		RoomPhase.value[eid] = value;
	}

	cellOf(eid: number): { cx: number; cy: number } {
		return { cx: RoomCell.cx[eid], cy: RoomCell.cy[eid] };
	}

	/** Idempotent: create the room entity at a cell (PHASE_GENERATED) if absent. */
	ensureRoom(cx: number, cy: number): number {
		const key = cellKey(cx, cy);
		const existing = this.byCell.get(key);
		if (existing !== undefined) return existing;

		const eid = addEntity(this.world);
		addComponent(this.world, eid, RoomCell);
		addComponent(this.world, eid, RoomDoors);
		addComponent(this.world, eid, RoomPhase);
		addComponent(this.world, eid, RoomTag);

		const desc = genRoom(this.seed, cx, cy);
		RoomCell.cx[eid] = cx;
		RoomCell.cy[eid] = cy;
		RoomDoors.bits[eid] = desc.doors;
		RoomPhase.value[eid] = PHASE_GENERATED;

		this.byCell.set(key, eid);
		this.descs.set(eid, desc);
		return eid;
	}

	/** Cells reachable from this room through open doors. */
	neighborCells(eid: number): { cx: number; cy: number }[] {
		const cx = RoomCell.cx[eid];
		const cy = RoomCell.cy[eid];
		const bits = RoomDoors.bits[eid];
		const out: { cx: number; cy: number }[] = [];
		for (const step of DOOR_STEPS) {
			if (bits & step.bit) out.push({ cx: cx + step.dc, cy: cy + step.dr });
		}
		return out;
	}

	remove(eid: number): void {
		const cx = RoomCell.cx[eid];
		const cy = RoomCell.cy[eid];
		this.byCell.delete(cellKey(cx, cy));
		this.descs.delete(eid);
		removeEntity(this.world, eid);
	}

	all(): number[] {
		return [...this.byCell.values()];
	}
}

/** World cell coordinate for a world-space position. */
export function cellAtWorld(x: number, z: number, tileSize: number): {
	cx: number;
	cy: number;
} {
	const span = CELL * tileSize;
	return { cx: Math.floor(x / span), cy: Math.floor(z / span) };
}
