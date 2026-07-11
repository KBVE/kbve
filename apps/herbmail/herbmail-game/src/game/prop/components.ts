import { MAX_ENTITIES } from '@kbve/laser/ecs';

// Flame VFX is herbmail-specific (tied to the flame shader), so it stays local.
// Everything else — Transform3, LightEmitter, MeshRef, Prop — comes from
// @kbve/laser/ecs.
export const FlameFx = {
	seed: new Float32Array(MAX_ENTITIES),
};

// Firefly wander/flee state. home* is the drift anchor placed at spawn; seed
// phases the idle bob; v* is the integrated velocity (smooth flee + spring back).
export const FireflyFx = {
	homeX: new Float32Array(MAX_ENTITIES),
	homeY: new Float32Array(MAX_ENTITIES),
	homeZ: new Float32Array(MAX_ENTITIES),
	seed: new Float32Array(MAX_ENTITIES),
	vx: new Float32Array(MAX_ENTITIES),
	vy: new Float32Array(MAX_ENTITIES),
	vz: new Float32Array(MAX_ENTITIES),
};
