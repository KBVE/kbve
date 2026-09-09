import {
	Collider,
	Health,
	Prop,
	Stone,
	Transform3,
	query,
} from '../mecs/props';
import { PROP_STONE } from '../prop/kinds';
import { breakCrate, getDungeon } from '../dungeon/store';
import { dungeonSpawn } from '../dungeon/collision';
import { getSimBridge } from '../sab/simBridge';
import { addLoot } from '../inventory/store';
import { hash01 } from '../geometry/rng';
import { isHeld } from '../viewmodel/store';
import { actionOf, type ProfessionAction } from '../data/professiondb';
import { MINING, nodeForStone } from '../prop/stoneNode';
import { grantXp, levelOf } from '../profession/store';

export type MineRefusal = 'tool' | 'level' | null;

const MELEE_REACH = 1.2;

/** Nearest live rock in swing range, or -1. Shared by the [F] prompt provider
 * and the click path so both channel the same target. */
export function nearestStone(px: number, pz: number): number {
	const world = getDungeon().world;
	let best = -1;
	let bestD = Infinity;
	for (const eid of query(world, [Prop, Transform3, Health])) {
		if (Prop.kind[eid] !== PROP_STONE || Health.hp[eid] <= 0) continue;
		const dx = Transform3.px[eid] - px;
		const dz = Transform3.pz[eid] - pz;
		const dd = dx * dx + dz * dz;
		const reach = MELEE_REACH + Collider.hx[eid];
		if (dd <= reach * reach && dd < bestD) {
			bestD = dd;
			best = eid;
		}
	}
	return best;
}

export function stoneDist2(eid: number, px: number, pz: number): number {
	const dx = Transform3.px[eid] - px;
	const dz = Transform3.pz[eid] - pz;
	return dx * dx + dz * dz;
}

/** Depth is the rock's own distance from the entrance, not the player's, so a
 * given rock always resolves to the same node however you approached it. */
function depthOf(eid: number): number {
	const [sx, , sz] = dungeonSpawn();
	return Math.hypot(Transform3.px[eid] - sx, Transform3.pz[eid] - sz);
}

export function actionForStone(eid: number): ProfessionAction | undefined {
	const node = nodeForStone(Stone.seed[eid], depthOf(eid));
	return actionOf(MINING, node.professionActionRef);
}

/** Why this rock cannot be mined right now, or null when it can. */
export function mineRefusal(eid: number): MineRefusal {
	const action = actionForStone(eid);
	if (!action) return null;
	const tools = action.toolRefs ?? [];
	if (tools.length > 0 && !tools.some((t) => isHeld(t))) return 'tool';
	if (levelOf(MINING) < action.requiredLevel) return 'level';
	return null;
}

export function mineHit(eid: number): void {
	const action = actionForStone(eid);
	if (!action || mineRefusal(eid) !== null) return;

	const px = Transform3.px[eid];
	const py = Transform3.py[eid];
	const pz = Transform3.pz[eid];
	Health.hp[eid] = Math.max(0, Health.hp[eid] - 1);
	getSimBridge().shatter(px, py, pz);
	if (Health.hp[eid] > 0) return;

	// Outputs roll independently: chance-less entries are the guaranteed yield,
	// the rest are the gem table. Salt the hash per output so one roll per rock
	// doesn't correlate every drop.
	const seed = Stone.seed[eid];
	for (let i = 0; i < action.outputs.length; i++) {
		const out = action.outputs[i];
		const chance = out.chance ?? 1;
		if (chance < 1 && hash01(seed, 0x10a7 + i * 0x3f, i + 1) >= chance)
			continue;
		for (let q = 0; q < out.quantity; q++) addLoot(out.itemRef);
	}

	grantXp(MINING, action.xpReward);
	breakCrate(eid);
}
