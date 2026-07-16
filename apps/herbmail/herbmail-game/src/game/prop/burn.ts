import {
	Burn,
	FlameFx,
	Health,
	Transform3,
	addComponent,
	hasComponent,
	isAlive,
	query,
	removeComponent,
	removeEntity,
	type World,
} from '../mecs/props';
import { spawnPropBase } from './base';
import { PROP_CANDLE } from './kinds';
import { getDungeon } from '../dungeon/store';
import { breakCrate } from '../dungeon/store';
import { getDebrisPool } from '../render/DebrisPool';
import { getSimBridge } from '../sab/simBridge';
import { addLoot } from '../inventory/store';

export const BURN_DPS = 1.5;
export const BURN_SECONDS = 5;
const BURN_TICK = 0.5;

const BURN_FLAME_DROP = 0.82;
const HIT_PUFF = 2;

const BURN_TERMS = [Burn, Health] as const;

const burnFlames = new Map<number, number>();
let dirty = false;

function spawnBurnFlame(world: World, eid: number): number {
	const fe = spawnPropBase(
		world,
		PROP_CANDLE,
		eid,
		[
			Transform3.px[eid],
			Transform3.py[eid] - BURN_FLAME_DROP,
			Transform3.pz[eid],
		],
		[0, 1, 0],
	);
	addComponent(world, fe, FlameFx);
	FlameFx.seed[fe] = (eid % 997) * 0.131;
	burnFlames.set(fe, eid);
	dirty = true;
	return fe;
}

export function applyBurn(
	eid: number,
	dps = BURN_DPS,
	seconds = BURN_SECONDS,
): void {
	const world = getDungeon().world;
	if (!hasComponent(world, eid, Health)) return;
	if (!hasComponent(world, eid, Burn)) {
		addComponent(world, eid, Burn);
		Burn.dps[eid] = dps;
		Burn.acc[eid] = 0;
		Burn.flameEid[eid] = spawnBurnFlame(world, eid);
	} else if (dps > Burn.dps[eid]) {
		Burn.dps[eid] = dps;
	}
	Burn.remaining[eid] = Math.max(Burn.remaining[eid], seconds);
}

function killByBurn(world: World, eid: number): void {
	const px = Transform3.px[eid];
	const py = Transform3.py[eid];
	const pz = Transform3.pz[eid];
	getDebrisPool().burst([px, py, pz]);
	getSimBridge().shatter(px, py, pz);
	addLoot('wood');
	breakCrate(eid);
}

export function burnTick(delta: number): boolean {
	const world = getDungeon().world;
	const wasDirty = dirty;
	dirty = false;

	for (const eid of query(world, BURN_TERMS)) {
		Burn.remaining[eid] -= delta;
		Burn.acc[eid] += delta;
		while (Burn.acc[eid] >= BURN_TICK) {
			Burn.acc[eid] -= BURN_TICK;
			Health.hp[eid] -= Burn.dps[eid] * BURN_TICK;
			getDebrisPool().burst(
				[Transform3.px[eid], Transform3.py[eid], Transform3.pz[eid]],
				HIT_PUFF,
			);
		}
		if (Health.hp[eid] <= 0) killByBurn(world, eid);
		else if (Burn.remaining[eid] <= 0) removeComponent(world, eid, Burn);
	}

	for (const [fe, owner] of burnFlames) {
		if (isAlive(world, owner) && hasComponent(world, owner, Burn)) continue;
		if (isAlive(world, fe)) removeEntity(world, fe);
		burnFlames.delete(fe);
		dirty = true;
	}

	return wasDirty || dirty;
}

export function resetBurn(): void {
	burnFlames.clear();
	dirty = false;
}
