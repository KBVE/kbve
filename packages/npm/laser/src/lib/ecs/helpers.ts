import { query } from 'bitecs';
import type { QueryTerm, World } from 'bitecs';

/**
 * Pack two signed tile coordinates into one non-negative 32-bit integer key for
 * use as a Map/Set key — avoids the per-lookup `${x},${y}` string allocation in
 * hot paths (spatial lookups, walkability checks). Unique for each (x, y) with
 * both in the signed 16-bit range [-32768, 32767]; the low 16 bits hold y, the
 * next 16 hold x (masked, so negatives wrap cleanly and still collide-free).
 */
export function packTile(x: number, y: number): number {
	return (x & 0xffff) * 0x10000 + (y & 0xffff);
}

// Read-only indexed access — satisfied by both plain number[] and the typed
// arrays (Int32Array/Float32Array) bitECS components use as SoA storage.
export interface PositionLike {
	x: ArrayLike<number>;
	y: ArrayLike<number>;
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
