import { TILE } from '../config';
import { dungeonSpawn, solidAtWorld, pitAtWorld } from '../dungeon/collision';

// Enemies spawn at least MIN_RING tiles out from the entrance room so their
// flow-field path cost to the player starts above AGGRO_COST (7) — they wander
// in rather than dogpiling the moment the dungeon loads.
const MIN_RING = 8;
const MAX_RING = 20;
const ANGLES = 16;

export function farSpawnPoints(
	count: number,
	minRing: number = MIN_RING,
): [number, number][] {
	const [cx, , cz] = dungeonSpawn();
	const out: [number, number][] = [];
	for (let ring = minRing; ring <= MAX_RING && out.length < count; ring++) {
		for (let i = 0; i < ANGLES && out.length < count; i++) {
			const a = (i / ANGLES) * Math.PI * 2 + ring * 0.7;
			const x = cx + Math.cos(a) * TILE * ring;
			const z = cz + Math.sin(a) * TILE * ring;
			if (!solidAtWorld(x, z) && !pitAtWorld(x, z)) out.push([x, z]);
		}
	}
	return out;
}

// Basic depth budget: the farther the player has ever roamed from the entrance,
// the more common enemies the encounter sustains. Tracks the max distance
// reached (monotonic) so backtracking doesn't thin the dungeon out.
const STEP = 24;
const BASE = 2;
const MAX = 14;
const progress = { maxDist: 0 };

export function noteProgress(x: number, z: number): void {
	const [sx, , sz] = dungeonSpawn();
	const d = Math.hypot(x - sx, z - sz);
	if (d > progress.maxDist) progress.maxDist = d;
}

export function enemyBudget(): number {
	return Math.min(MAX, BASE + Math.floor(progress.maxDist / STEP));
}

export function resetProgress(): void {
	progress.maxDist = 0;
}
