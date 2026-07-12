import {
	addComponent,
	addEntity,
	LightEmitter,
	Prop,
	Transform3,
	type World,
} from '../mecs/props';

// A light source is pure ECS: any entity with LightEmitter + Transform3 is picked
// up by LightSystem, regardless of what it is. Presets are just data, so torches,
// candles, fireflies, etc. differ only by these numbers — no per-source code.
export interface LightPreset {
	r: number;
	g: number;
	b: number;
	intensity: number;
	range: number;
	flickerAmp: number;
}

export const LIGHT_PRESETS: Record<string, LightPreset> = {
	torch: {
		r: 1.0,
		g: 0.42,
		b: 0.13,
		intensity: 2.25,
		range: 15,
		flickerAmp: 1.0,
	},
	candle: {
		r: 1.0,
		g: 0.6,
		b: 0.28,
		intensity: 1.9,
		range: 9,
		flickerAmp: 1.4,
	},
	firefly: {
		r: 0.55,
		g: 1.0,
		b: 0.45,
		intensity: 0.5,
		range: 4,
		flickerAmp: 1.9,
	},
};

// Write LightEmitter fields from a preset. `id` seeds the deterministic flicker.
export function applyLight(eid: number, preset: LightPreset, id: number): void {
	LightEmitter.r[eid] = preset.r;
	LightEmitter.g[eid] = preset.g;
	LightEmitter.b[eid] = preset.b;
	LightEmitter.baseIntensity[eid] = preset.intensity;
	LightEmitter.range[eid] = preset.range;
	LightEmitter.flickerPhase[eid] = (id * 12.9898) % (Math.PI * 2);
	LightEmitter.flickerAmp[eid] = preset.flickerAmp;
}

// Spawn a bare light entity (no mesh) — a candle, firefly, etc. Owned by a room
// so it despawns with it. `dir` offsets the emitted point toward the room.
export function spawnLight(
	world: World,
	ownerEid: number,
	kind: number,
	pos: [number, number, number],
	dir: [number, number, number],
	preset: LightPreset,
	id: number,
): number {
	const eid = addEntity(world);
	addComponent(world, eid, Prop);
	addComponent(world, eid, Transform3);
	addComponent(world, eid, LightEmitter);
	Prop.kind[eid] = kind;
	Prop.ownerEid[eid] = ownerEid;
	Transform3.px[eid] = pos[0];
	Transform3.py[eid] = pos[1];
	Transform3.pz[eid] = pos[2];
	Transform3.dx[eid] = dir[0];
	Transform3.dy[eid] = dir[1];
	Transform3.dz[eid] = dir[2];
	applyLight(eid, preset, id);
	return eid;
}
