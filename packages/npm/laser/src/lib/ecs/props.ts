import { query, removeEntity, type World } from './bitecs';
import { MAX_ENTITIES } from './components';

// Generic 3D placed-object kit: transform, light emission, mesh reference, and a
// Prop link tying an object to the container entity (room / chunk / zone) that
// owns its lifecycle. Render-agnostic — no three/Phaser here — so the lean
// `@kbve/laser/ecs` subpath stays free of rendering deps.

export const Transform3 = {
	px: new Float32Array(MAX_ENTITIES),
	py: new Float32Array(MAX_ENTITIES),
	pz: new Float32Array(MAX_ENTITIES),
	dx: new Float32Array(MAX_ENTITIES),
	dy: new Float32Array(MAX_ENTITIES),
	dz: new Float32Array(MAX_ENTITIES),
};

export const LightEmitter = {
	r: new Float32Array(MAX_ENTITIES),
	g: new Float32Array(MAX_ENTITIES),
	b: new Float32Array(MAX_ENTITIES),
	baseIntensity: new Float32Array(MAX_ENTITIES),
	range: new Float32Array(MAX_ENTITIES),
	flickerPhase: new Float32Array(MAX_ENTITIES),
	flickerAmp: new Float32Array(MAX_ENTITIES),
};

export const MeshRef = {
	modelId: new Uint8Array(MAX_ENTITIES),
};

// Axis-aligned box footprint for movement collision, half-extents on the X/Z
// ground plane about the entity's Transform3 centre. Props that carry it are
// solid; those without pass through. Physics reads this off the entity rather
// than special-casing prop kinds.
export const Collider = {
	hx: new Float32Array(MAX_ENTITIES),
	hz: new Float32Array(MAX_ENTITIES),
};

// Procedural rock prop: seed drives deterministic shape, size is base radius in
// metres, hardness scales hits-per-stage tuning, ore is a future drop type
// (0 = none).
export const Stone = {
	seed: new Float32Array(MAX_ENTITIES),
	size: new Float32Array(MAX_ENTITIES),
	hardness: new Float32Array(MAX_ENTITIES),
	ore: new Uint8Array(MAX_ENTITIES),
};

export const Prop = {
	kind: new Uint8Array(MAX_ENTITIES),
	ownerEid: new Int32Array(MAX_ENTITIES),
};

type NumStore = { [index: number]: number };

// Remove every entity carrying `comp` whose `field` equals `value` — e.g. all
// props owned by a room that just unmounted. Collects first, then removes, so the
// live query array isn't mutated mid-iteration.
export function despawnWhere<C extends Record<string, NumStore>>(
	world: World,
	comp: C,
	field: keyof C,
	value: number,
): number {
	const doomed: number[] = [];
	const store = comp[field];
	for (const eid of query(world, [comp])) {
		if (store[eid] === value) doomed.push(eid);
	}
	for (const eid of doomed) removeEntity(world, eid);
	return doomed.length;
}
