import { addComponent, LightEmitter, type World } from '../mecs/props';
import { spawnPropBase } from './base';

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
		r: 0.42,
		g: 1.0,
		b: 0.5,
		intensity: 0.55,
		range: 6,
		flickerAmp: 1.4,
	},
};

export function applyLight(eid: number, preset: LightPreset, id: number): void {
	LightEmitter.r[eid] = preset.r;
	LightEmitter.g[eid] = preset.g;
	LightEmitter.b[eid] = preset.b;
	LightEmitter.baseIntensity[eid] = preset.intensity;
	LightEmitter.range[eid] = preset.range;
	LightEmitter.flickerPhase[eid] = (id * 12.9898) % (Math.PI * 2);
	LightEmitter.flickerAmp[eid] = preset.flickerAmp;
}

export function spawnLight(
	world: World,
	ownerEid: number,
	kind: number,
	pos: [number, number, number],
	dir: [number, number, number],
	preset: LightPreset,
	id: number,
): number {
	const eid = spawnPropBase(world, kind, ownerEid, pos, dir);
	applyLight(eid, preset, id);
	addComponent(world, eid, LightEmitter);
	return eid;
}
