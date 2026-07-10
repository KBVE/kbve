import { DungeonWorld } from './ecs';

// BFS over the door graph from a start cell. Returns eid -> hop distance for
// every room reachable within `depth` hops, generating rooms on demand
// (generate-ahead). Rooms with hop <= mountHops are the ones to mount.
export function bfsRooms(
	dw: DungeonWorld,
	cx: number,
	cy: number,
	depth: number,
): Map<number, number> {
	const dist = new Map<number, number>();
	const start = dw.ensureRoom(cx, cy);
	dist.set(start, 0);
	let frontier = [start];
	for (let h = 0; h < depth; h++) {
		const next: number[] = [];
		for (const eid of frontier) {
			for (const nc of dw.neighborCells(eid)) {
				const neid = dw.ensureRoom(nc.cx, nc.cy);
				if (!dist.has(neid)) {
					dist.set(neid, h + 1);
					next.push(neid);
				}
			}
		}
		frontier = next;
	}
	return dist;
}

export interface StreamResult {
	mounted: number[];
	dist: Map<number, number>;
}

// Generate rooms within mountHops + 1 (so a neighbour exists the instant a door
// is crossed); mount only those within mountHops.
export function streamAround(
	dw: DungeonWorld,
	cx: number,
	cy: number,
	mountHops: number,
): StreamResult {
	const dist = bfsRooms(dw, cx, cy, mountHops + 1);
	const mounted: number[] = [];
	for (const [eid, d] of dist) {
		if (d <= mountHops) mounted.push(eid);
	}
	return { mounted, dist };
}
