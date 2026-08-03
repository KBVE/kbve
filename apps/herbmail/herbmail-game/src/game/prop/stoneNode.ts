import { hash01 } from '../geometry/rng';
import { actionOf, nodesOf, type ResourceNode } from '../data/professiondb';

export const MINING = 'mining';

// Tier gate: a node is eligible once the player has roamed far enough for its
// action's requiredLevel to be plausible. Distance rather than level so the
// dungeon reveals copper/iron/crystal by depth, while requiredLevel still gates
// whether a swing actually lands (see canMine).
const DIST_PER_LEVEL = 4;

let cache: ResourceNode[] | null = null;

function miningNodes(): ResourceNode[] {
	if (!cache) cache = nodesOf(MINING);
	return cache;
}

function tierOf(node: ResourceNode): number {
	return actionOf(MINING, node.professionActionRef)?.requiredLevel ?? 0;
}

/** Picks the resource node a rock represents: weighted by the DB's spawnWeight
 * across every tier the given depth has unlocked. Pure in (seed, depth), so the
 * same rock always resolves to the same node. */
export function nodeForStone(seed: number, depth: number): ResourceNode {
	const nodes = miningNodes();
	const unlocked = Math.floor(Math.max(0, depth) / DIST_PER_LEVEL);
	const pool = nodes.filter((n) => tierOf(n) <= unlocked);
	const usable = pool.length > 0 ? pool : nodes;

	let total = 0;
	for (const n of usable) total += n.spawnWeight;
	if (total <= 0) return usable[0];

	let roll = hash01(seed, 0x5709, 0x31) * total;
	for (const n of usable) {
		roll -= n.spawnWeight;
		if (roll <= 0) return n;
	}
	return usable[usable.length - 1];
}

export function nodeByRef(ref: string): ResourceNode | undefined {
	return miningNodes().find((n) => n.ref === ref);
}
