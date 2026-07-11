import { MAX_ENTITIES } from '@kbve/laser/ecs';

// A door is an ECS entity: `locked` is the authoritative gameplay state (systems
// query it, collision reads it, F-to-unlock writes it); `open` is the 0..1 swing
// animation driven toward !locked. lc/lr/variant/axis rebuild its geometry.
export const Door = {
	locked: new Uint8Array(MAX_ENTITIES),
	open: new Float32Array(MAX_ENTITIES),
	lc: new Uint8Array(MAX_ENTITIES),
	lr: new Uint8Array(MAX_ENTITIES),
	variant: new Uint8Array(MAX_ENTITIES),
	axis: new Uint8Array(MAX_ENTITIES),
};
