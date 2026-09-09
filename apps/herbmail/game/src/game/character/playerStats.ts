import { useSyncExternalStore } from 'react';
import {
	applyStats,
	createWorld,
	Energy,
	Health,
	Mana,
	regenVitals,
	Stamina,
	type World,
} from '../mecs/props';
import { playerEid } from './playerEntity';

const world: World = createWorld();
const eid = playerEid();

applyStats(world, eid, {
	hp: 100,
	maxHp: 100,
	hpRegen: 1,
	mp: 30,
	maxMp: 50,
	mpRegen: 3,
	ep: 55,
	maxEp: 100,
	epRegen: 5,
	sp: 40,
	maxSp: 100,
	spRegen: 8,
});

export type PoolStore = { value: { [i: number]: number } };

export const PlayerStats = {
	world,
	eid,
	mp: Mana,
	ep: Energy,
	sp: Stamina,
};

export interface PoolSnapshot {
	hp: number;
	maxHp: number;
	mp: number;
	maxMp: number;
	ep: number;
	maxEp: number;
	sp: number;
	maxSp: number;
}

function read(): PoolSnapshot {
	return {
		hp: Health.hp[eid],
		maxHp: Health.maxHp[eid],
		mp: Mana.value[eid],
		maxMp: Mana.max[eid],
		ep: Energy.value[eid],
		maxEp: Energy.max[eid],
		sp: Stamina.value[eid],
		maxSp: Stamina.max[eid],
	};
}

let snap: PoolSnapshot = read();
const listeners = new Set<() => void>();
const EMIT_INTERVAL = 1 / 12;
let accum = 0;

function changed(a: PoolSnapshot, b: PoolSnapshot): boolean {
	return (
		a.hp !== b.hp ||
		a.mp !== b.mp ||
		a.ep !== b.ep ||
		a.sp !== b.sp ||
		a.maxHp !== b.maxHp ||
		a.maxMp !== b.maxMp ||
		a.maxEp !== b.maxEp ||
		a.maxSp !== b.maxSp
	);
}

export function tickPlayerStats(dt: number): void {
	regenVitals(world, eid, dt);
	accum += dt;
	if (accum < EMIT_INTERVAL) return;
	accum = 0;
	const next = read();
	if (!changed(snap, next)) return;
	snap = next;
	for (const l of listeners) l();
}

export function spend(pool: PoolStore, amount: number): number {
	const taken = Math.min(pool.value[eid], amount);
	pool.value[eid] -= taken;
	return taken;
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function usePlayerStats(): PoolSnapshot {
	return useSyncExternalStore(
		subscribe,
		() => snap,
		() => snap,
	);
}
