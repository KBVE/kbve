import { addComponent, query, type World } from './bitecs';
import { Energy, Health, Mana, Stamina } from './components';

// Uniform view over a resource pool's three arrays, so drain/restore/regen work
// the same on Health, Mana, Energy and Stamina despite Health's legacy hp/maxHp
// field names.
export interface Pool {
	value: Float32Array;
	max: Float32Array;
	regen: Float32Array;
}

export const HealthPool: Pool = {
	value: Health.hp,
	max: Health.maxHp,
	regen: Health.regen,
};
export const ManaPool: Pool = Mana;
export const EnergyPool: Pool = Energy;
export const StaminaPool: Pool = Stamina;

// Component + Pool paired, so a regen tick can query the component and mutate
// through the uniform view in one table.
const POOLS: { comp: Record<string, Float32Array>; pool: Pool }[] = [
	{ comp: Health, pool: HealthPool },
	{ comp: Mana, pool: ManaPool },
	{ comp: Energy, pool: EnergyPool },
	{ comp: Stamina, pool: StaminaPool },
];

export function setPool(
	p: Pool,
	eid: number,
	value: number,
	max: number,
	regen = 0,
): void {
	p.max[eid] = max;
	p.value[eid] = value;
	p.regen[eid] = regen;
}

export function frac(p: Pool, eid: number): number {
	const m = p.max[eid];
	return m > 0 ? p.value[eid] / m : 0;
}

export function canAfford(p: Pool, eid: number, amount: number): boolean {
	return p.value[eid] >= amount;
}

// Remove up to `amount`, clamped at 0; returns how much was actually taken.
export function drain(p: Pool, eid: number, amount: number): number {
	const taken = Math.min(p.value[eid], amount);
	p.value[eid] -= taken;
	return taken;
}

// Add `amount`, clamped at max.
export function restore(p: Pool, eid: number, amount: number): void {
	p.value[eid] = Math.min(p.max[eid], p.value[eid] + amount);
}

// Regenerate every pooled entity toward its max by regen*dt. Cheap: one query per
// pool, skips entities already full or with zero regen.
export function regenPools(world: World, dt: number): void {
	for (const { comp, pool } of POOLS) {
		for (const eid of query(world, [comp])) {
			const r = pool.regen[eid];
			if (r === 0) continue;
			const m = pool.max[eid];
			if (pool.value[eid] >= m) continue;
			pool.value[eid] = Math.min(m, pool.value[eid] + r * dt);
		}
	}
}

// Static stat block sourced from data (npcdb / itemdb) or spawn defaults. Each
// pool is optional so an entity can carry only the pools it needs. `*Regen`
// default to 0 when omitted.
export interface StatBlock {
	hp?: number;
	maxHp?: number;
	hpRegen?: number;
	mp?: number;
	maxMp?: number;
	mpRegen?: number;
	ep?: number;
	maxEp?: number;
	epRegen?: number;
	sp?: number;
	maxSp?: number;
	spRegen?: number;
}

function applyPool(
	world: World,
	eid: number,
	comp: Record<string, Float32Array>,
	pool: Pool,
	max: number | undefined,
	value: number | undefined,
	regen: number | undefined,
): void {
	if (max === undefined && value === undefined) return;
	addComponent(world, eid, comp);
	const m = max ?? value ?? 0;
	setPool(pool, eid, value ?? m, m, regen ?? 0);
}

// Attach only the pools the block specifies and seed their values. A missing
// current value fills to max (spawns start full); a missing max falls back to the
// current value. The seam npcdb/itemdb-derived stats flow through.
export function applyStats(world: World, eid: number, s: StatBlock): void {
	applyPool(world, eid, Health, HealthPool, s.maxHp, s.hp, s.hpRegen);
	applyPool(world, eid, Mana, ManaPool, s.maxMp, s.mp, s.mpRegen);
	applyPool(world, eid, Energy, EnergyPool, s.maxEp, s.ep, s.epRegen);
	applyPool(world, eid, Stamina, StaminaPool, s.maxSp, s.sp, s.spRegen);
}
