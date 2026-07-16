import {
	createWorld,
	addEntity,
	addComponent,
	removeEntity,
	RoomCell,
	RoomDoors,
	RoomPhase,
	RoomTag,
	type World,
} from '../mecs/props';
import { genSectorDesc, CELL, type RoomDesc } from './generate';
import { SECTOR, floorDiv } from './sector';

export { RoomCell, RoomDoors, RoomPhase, RoomTag };

export const PHASE_GENERATED = 1;
export const PHASE_MOUNTED = 2;

function sectorKey(sx: number, sy: number): string {
	return `${sx}|${sy}`;
}

export class DungeonWorld {
	readonly world: World = createWorld();
	readonly seed: number;
	private byKey = new Map<string, number>();
	private descs = new Map<number, RoomDesc>();

	constructor(seed: number) {
		this.seed = seed | 0;
	}

	sectorEidAt(sx: number, sy: number): number | undefined {
		return this.byKey.get(sectorKey(sx, sy));
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

	ensureSector(sx: number, sy: number): number {
		const key = sectorKey(sx, sy);
		const existing = this.byKey.get(key);
		if (existing !== undefined) return existing;

		const eid = addEntity(this.world);
		addComponent(this.world, eid, RoomCell);
		addComponent(this.world, eid, RoomDoors);
		addComponent(this.world, eid, RoomPhase);
		addComponent(this.world, eid, RoomTag);

		this.descs.set(eid, genSectorDesc(this.seed, sx, sy));
		RoomCell.cx[eid] = sx;
		RoomCell.cy[eid] = sy;
		RoomDoors.bits[eid] = 0;
		RoomPhase.value[eid] = PHASE_GENERATED;

		this.byKey.set(key, eid);
		return eid;
	}

	ensureSectorAtCell(cx: number, cy: number): number {
		return this.ensureSector(floorDiv(cx, SECTOR), floorDiv(cy, SECTOR));
	}

	remove(eid: number): void {
		const sx = RoomCell.cx[eid];
		const sy = RoomCell.cy[eid];
		this.byKey.delete(sectorKey(sx, sy));
		this.descs.delete(eid);
		removeEntity(this.world, eid);
	}

	all(): number[] {
		return [...this.byKey.values()];
	}
}

export function cellAtWorld(
	x: number,
	z: number,
	tileSize: number,
): { cx: number; cy: number } {
	const span = CELL * tileSize;
	return { cx: Math.floor(x / span), cy: Math.floor(z / span) };
}

export function sectorAtWorld(
	x: number,
	z: number,
	tileSize: number,
): { sx: number; sy: number } {
	const { cx, cy } = cellAtWorld(x, z, tileSize);
	return { sx: floorDiv(cx, SECTOR), sy: floorDiv(cy, SECTOR) };
}
