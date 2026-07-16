import { createSabWorld, sabBytes, type SabWorld } from '@kbve/laser/mecs';
import { makeBuffer } from '../sab/isolation';
import { PROPS_SCHEMA, PROPS_CAP } from './propsSchema';

// The dungeon's main-thread ECS world: rooms, props (torches, crates, stones,
// fireflies), doors — everything that used to ride a bitecs world. One process
// singleton (never reallocated, so the component accessors below stay valid); the
// main thread is its sole structural writer. A thin bitecs-shaped shim
// (addEntity/addComponent/query/…) lets the existing prop/room/door code migrate by
// swapping only its import path. Query-based, layermask-ready, and — because it's a
// mecs world over a shared buffer — the sim worker attaches a read-only view of it
// (getPropsBuffer) to collide dynamic bodies against static prop footprints.
const SCHEMA = PROPS_SCHEMA;

export type World = SabWorld<typeof SCHEMA>;
export const MAX_ENTITIES = PROPS_CAP;

const buffer = makeBuffer(sabBytes(SCHEMA, MAX_ENTITIES));
const world: World = createSabWorld(buffer, SCHEMA, MAX_ENTITIES);

// The backing buffer (SharedArrayBuffer when cross-origin isolated), handed to the
// sim worker so it can attach a reader over the same memory.
export function getPropsBuffer(): ArrayBufferLike {
	return buffer;
}

// Component accessors — SoA typed-array stores, same `.field[eid]` shape the old
// bitecs components exposed. Stable because `world` is a singleton.
export const Transform3 = world.stores.Transform3;
export const Prop = world.stores.Prop;
export const MeshRef = world.stores.MeshRef;
export const Collider = world.stores.Collider;
export const LightEmitter = world.stores.LightEmitter;
export const Health = world.stores.Health;
export const Mana = world.stores.Mana;
export const Energy = world.stores.Energy;
export const Stamina = world.stores.Stamina;
export const Combat = world.stores.Combat;
export const Burn = world.stores.Burn;
export const Stone = world.stores.Stone;
export const FlameFx = world.stores.FlameFx;
export const FireflyFx = world.stores.FireflyFx;
export const RoomCell = world.stores.RoomCell;
export const RoomDoors = world.stores.RoomDoors;
export const RoomPhase = world.stores.RoomPhase;
export const RoomTag = world.stores.RoomTag;
export const Door = world.stores.Door;
export const Npc = world.stores.Npc;
export const Wander = world.stores.Wander;
export const Targetable = world.stores.Targetable;
export const CharState = world.stores.CharState;
export const HeldItems = world.stores.HeldItems;
export const Caster = world.stores.Caster;
export const Cooldowns = world.stores.Cooldowns;
export const Oasis = world.stores.Oasis;

// Reverse map: component accessor object -> its schema name, so the bitecs-shaped
// shim can translate `addComponent(world, eid, Transform3)` into `add(eid,'Transform3')`.
type Comp = object;
const NAME = new Map<Comp, keyof typeof SCHEMA>();
for (const key of Object.keys(SCHEMA) as (keyof typeof SCHEMA)[]) {
	NAME.set(world.stores[key] as Comp, key);
}
function nameOf(comp: Comp): keyof typeof SCHEMA {
	const n = NAME.get(comp);
	if (!n) throw new Error('mecs/props: unknown component passed to shim');
	return n;
}

// --- bitecs-shaped shim (all bound to the singleton world) ---

export function createWorld(): World {
	return world;
}
export function addEntity(_w: World): number {
	const eid = world.spawn();
	if (eid < 0) throw new Error('mecs/props: entity capacity exhausted');
	return eid;
}
export function addComponent(_w: World, eid: number, comp: Comp): void {
	world.add(eid, nameOf(comp));
}
export function removeEntity(_w: World, eid: number): void {
	unregisterOwner(eid);
	world.despawn(eid);
}

// Sector-scoped membership: every prop registers under its owning sector eid at
// spawn, so per-frame systems iterate only mounted sectors' buckets instead of
// scanning the whole world.
const ownerIndex = new Map<number, Set<number>>();
const NO_MEMBERS: ReadonlySet<number> = new Set();

export function registerOwner(eid: number, ownerEid: number): void {
	let set = ownerIndex.get(ownerEid);
	if (!set) {
		set = new Set();
		ownerIndex.set(ownerEid, set);
	}
	set.add(eid);
}

function unregisterOwner(eid: number): void {
	if (!world.has(eid, 'Prop')) return;
	const set = ownerIndex.get(Prop.ownerEid[eid]);
	if (!set) return;
	set.delete(eid);
	if (set.size === 0) ownerIndex.delete(Prop.ownerEid[eid]);
}

export function membersOf(ownerEid: number): ReadonlySet<number> {
	return ownerIndex.get(ownerEid) ?? NO_MEMBERS;
}

export function eachOwned(
	ownerEid: number,
	terms: readonly Comp[],
	fn: (eid: number) => void,
): void {
	const set = ownerIndex.get(ownerEid);
	if (!set) return;
	let names = namesCache.get(terms);
	if (!names) {
		names = terms.map(nameOf);
		namesCache.set(terms, names);
	}
	outer: for (const eid of set) {
		for (const n of names) if (!world.has(eid, n)) continue outer;
		fn(eid);
	}
}
export function removeComponent(_w: World, eid: number, comp: Comp): void {
	world.remove(eid, nameOf(comp));
}
export function isAlive(_w: World, eid: number): boolean {
	return world.isAlive(eid);
}
export function hasComponent(_w: World, eid: number, comp: Comp): boolean {
	return world.has(eid, nameOf(comp));
}
export function query(_w: World, terms: readonly Comp[]): number[] {
	return world.query(terms.map(nameOf));
}

// Zero-allocation iteration for per-frame systems. Pass a HOISTED terms array (stable
// identity) so its name mapping is cached and the hot path allocates nothing.
const namesCache = new WeakMap<readonly Comp[], (keyof typeof SCHEMA)[]>();
export function each(
	_w: World,
	terms: readonly Comp[],
	fn: (eid: number) => void,
): void {
	let names = namesCache.get(terms);
	if (!names) {
		names = terms.map(nameOf);
		namesCache.set(terms, names);
	}
	world.each(names, fn);
}

// Remove every entity carrying `comp` whose `field` equals `value` (e.g. all props
// owned by a room that just unmounted). Collect-then-despawn.
export function despawnWhere(
	_w: World,
	comp: Comp,
	field: string,
	value: number,
): number {
	const name = nameOf(comp);
	const store = world.stores[name] as Record<string, { [i: number]: number }>;
	const arr = store[field];
	const doomed: number[] = [];
	for (const eid of world.query([name])) {
		if (arr[eid] === value) doomed.push(eid);
	}
	for (const eid of doomed) {
		unregisterOwner(eid);
		world.despawn(eid);
	}
	return doomed.length;
}

// Minimal Health-only stat seeding (props carry only HP). Mirrors the laser
// applyStats surface the prop/stone spawners call.
interface StatBlock {
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
	power?: number;
	defense?: number;
}
export function applyStats(_w: World, eid: number, s: StatBlock): void {
	if (s.maxHp !== undefined || s.hp !== undefined) {
		world.add(eid, 'Health');
		const m = s.maxHp ?? s.hp ?? 0;
		Health.hp[eid] = s.hp ?? m;
		Health.maxHp[eid] = m;
		Health.regen[eid] = s.hpRegen ?? 0;
	}
	if (s.maxMp !== undefined || s.mp !== undefined) {
		world.add(eid, 'Mana');
		const m = s.maxMp ?? s.mp ?? 0;
		Mana.value[eid] = s.mp ?? m;
		Mana.max[eid] = m;
		Mana.regen[eid] = s.mpRegen ?? 0;
	}
	if (s.maxEp !== undefined || s.ep !== undefined) {
		world.add(eid, 'Energy');
		const m = s.maxEp ?? s.ep ?? 0;
		Energy.value[eid] = s.ep ?? m;
		Energy.max[eid] = m;
		Energy.regen[eid] = s.epRegen ?? 0;
	}
	if (s.maxSp !== undefined || s.sp !== undefined) {
		world.add(eid, 'Stamina');
		const m = s.maxSp ?? s.sp ?? 0;
		Stamina.value[eid] = s.sp ?? m;
		Stamina.max[eid] = m;
		Stamina.regen[eid] = s.spRegen ?? 0;
	}
	if (s.power !== undefined || s.defense !== undefined) {
		world.add(eid, 'Combat');
		Combat.power[eid] = s.power ?? 0;
		Combat.defense[eid] = s.defense ?? 0;
	}
}

export function regenVitals(_w: World, eid: number, dt: number): void {
	if (world.has(eid, 'Health') && Health.regen[eid] > 0)
		Health.hp[eid] = Math.min(
			Health.maxHp[eid],
			Health.hp[eid] + Health.regen[eid] * dt,
		);
	for (const name of ['Mana', 'Energy', 'Stamina'] as const) {
		if (!world.has(eid, name)) continue;
		const store = world.stores[name];
		if (store.regen[eid] > 0)
			store.value[eid] = Math.min(
				store.max[eid],
				store.value[eid] + store.regen[eid] * dt,
			);
	}
}

// resetDungeon rebuilds the lattice from a new seed; wipe the shared world instead
// of reallocating it, so the accessor exports above stay bound.
export function resetPropsWorld(): void {
	ownerIndex.clear();
	world.clear();
}
