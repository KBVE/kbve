import { MAX_ENTITIES } from '@kbve/laser/ecs';

// Flame VFX is herbmail-specific (tied to the flame shader), so it stays local.
// Everything else — Transform3, LightEmitter, MeshRef, Prop — comes from
// @kbve/laser/ecs.
export const FlameFx = {
	seed: new Float32Array(MAX_ENTITIES),
};
