import {
	createSabWorld,
	sabBytes,
	type SabWorld,
	type Schema,
} from '@kbve/laser/mecs';
import { makeBuffer } from '../sab/isolation';

// The dungeon's main-thread ECS world: rooms, props (torches, crates, stones,
// fireflies), doors — everything that used to ride a bitecs world. One process
// singleton (never reallocated, so the component accessors below stay valid); the
// main thread is its sole structural writer. A thin bitecs-shaped shim
// (addEntity/addComponent/query/…) lets the existing prop/room/door code migrate by
// swapping only its import path. Query-based, layermask-ready, and — because it's a
// mecs world over a shared buffer — reads can later be handed to the sim worker.
const SCHEMA = {
	Transform3: {
		px: 'f32',
		py: 'f32',
		pz: 'f32',
		dx: 'f32',
		dy: 'f32',
		dz: 'f32',
	},
	Prop: { kind: 'u8', ownerEid: 'i32' },
	MeshRef: { modelId: 'u8' },
	Collider: { hx: 'f32', hz: 'f32' },
	LightEmitter: {
		r: 'f32',
		g: 'f32',
		b: 'f32',
		baseIntensity: 'f32',
		range: 'f32',
		flickerPhase: 'f32',
		flickerAmp: 'f32',
	},
	Health: { hp: 'f32', maxHp: 'f32', regen: 'f32' },
	Stone: { seed: 'f32', size: 'f32', hardness: 'f32', ore: 'u8' },
	FlameFx: { seed: 'f32' },
	FireflyFx: {
		homeX: 'f32',
		homeY: 'f32',
		homeZ: 'f32',
		seed: 'f32',
		vx: 'f32',
		vy: 'f32',
		vz: 'f32',
	},
	RoomCell: { cx: 'i32', cy: 'i32' },
	RoomDoors: { bits: 'u8' },
	RoomPhase: { value: 'u8' },
	RoomTag: {},
	Door: {
		locked: 'u8',
		open: 'f32',
		lc: 'u8',
		lr: 'u8',
		variant: 'u8',
		axis: 'u8',
	},
} satisfies Schema;

export type World = SabWorld<typeof SCHEMA>;
export const MAX_ENTITIES = 8192;

const world: World = createSabWorld(
	makeBuffer(sabBytes(SCHEMA, MAX_ENTITIES)),
	SCHEMA,
	MAX_ENTITIES,
);

// Component accessors — SoA typed-array stores, same `.field[eid]` shape the old
// bitecs components exposed. Stable because `world` is a singleton.
export const Transform3 = world.stores.Transform3;
export const Prop = world.stores.Prop;
export const MeshRef = world.stores.MeshRef;
export const Collider = world.stores.Collider;
export const LightEmitter = world.stores.LightEmitter;
export const Health = world.stores.Health;
export const Stone = world.stores.Stone;
export const FlameFx = world.stores.FlameFx;
export const FireflyFx = world.stores.FireflyFx;
export const RoomCell = world.stores.RoomCell;
export const RoomDoors = world.stores.RoomDoors;
export const RoomPhase = world.stores.RoomPhase;
export const RoomTag = world.stores.RoomTag;
export const Door = world.stores.Door;

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
	world.despawn(eid);
}
export function hasComponent(_w: World, eid: number, comp: Comp): boolean {
	return world.has(eid, nameOf(comp));
}
export function query(_w: World, terms: readonly Comp[]): number[] {
	return world.query(terms.map(nameOf));
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
	for (const eid of doomed) world.despawn(eid);
	return doomed.length;
}

// Minimal Health-only stat seeding (props carry only HP). Mirrors the laser
// applyStats surface the prop/stone spawners call.
export interface StatBlock {
	hp?: number;
	maxHp?: number;
	hpRegen?: number;
}
export function applyStats(_w: World, eid: number, s: StatBlock): void {
	if (s.maxHp === undefined && s.hp === undefined) return;
	world.add(eid, 'Health');
	const m = s.maxHp ?? s.hp ?? 0;
	Health.hp[eid] = s.hp ?? m;
	Health.maxHp[eid] = m;
	Health.regen[eid] = s.hpRegen ?? 0;
}

// resetDungeon rebuilds the lattice from a new seed; wipe the shared world instead
// of reallocating it, so the accessor exports above stay bound.
export function resetPropsWorld(): void {
	world.clear();
}
