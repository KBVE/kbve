import { query } from 'bitecs';
import type { QueryTerm, World } from 'bitecs';

export interface PositionLike {
	x: number[];
	y: number[];
}

export function* queryInRange(
	world: World,
	terms: QueryTerm[],
	pos: PositionLike,
	cx: number,
	cy: number,
	radius: number,
): Generator<number> {
	const r2 = radius * radius;
	for (const eid of query(world, terms)) {
		const dx = pos.x[eid] - cx;
		const dy = pos.y[eid] - cy;
		if (dx * dx + dy * dy <= r2) yield eid;
	}
}

export function nearestInRange(
	world: World,
	terms: QueryTerm[],
	pos: PositionLike,
	cx: number,
	cy: number,
	radius: number,
): number | null {
	const r2 = radius * radius;
	let best = -1;
	let bestDist = r2;
	for (const eid of query(world, terms)) {
		const dx = pos.x[eid] - cx;
		const dy = pos.y[eid] - cy;
		const d2 = dx * dx + dy * dy;
		if (d2 <= bestDist) {
			bestDist = d2;
			best = eid;
		}
	}
	return best >= 0 ? best : null;
}

export class SideMap<T> {
	private map = new Map<number, T>();

	set(eid: number, value: T): void {
		this.map.set(eid, value);
	}

	get(eid: number): T | undefined {
		return this.map.get(eid);
	}

	delete(eid: number): T | undefined {
		const v = this.map.get(eid);
		this.map.delete(eid);
		return v;
	}

	has(eid: number): boolean {
		return this.map.has(eid);
	}

	values(): IterableIterator<T> {
		return this.map.values();
	}

	entries(): IterableIterator<[number, T]> {
		return this.map.entries();
	}

	clear(): void {
		this.map.clear();
	}

	get size(): number {
		return this.map.size;
	}
}
