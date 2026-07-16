import {
	createSabWorld,
	sabBytes,
	type SabWorld,
	type Schema,
} from '@kbve/laser/mecs';

// The game's shared-memory ECS schema. Both the sim worker (writer) and the main
// thread (reader/renderer) build a world over the SAME buffer with this exact
// schema, so membership + component data line up byte-for-byte across threads.
// Transform carries a quaternion (the bitecs Transform3 only had position + facing)
// because Rapier bodies rotate freely.
export const GAME_SCHEMA = {
	Transform: {
		px: 'f32',
		py: 'f32',
		pz: 'f32',
		qx: 'f32',
		qy: 'f32',
		qz: 'f32',
		qw: 'f32',
	},
	Body: { kind: 'u8' },
	Health: { hp: 'f32', max: 'f32' },
	Flags: { mask: 'u32' },
	Lifetime: { age: 'f32', ttl: 'f32' },
} satisfies Schema;

export type GameWorld = SabWorld<typeof GAME_SCHEMA>;

export const GAME_CAP = 4096;

// Body.kind discriminates the simulated archetype (0 = free slot).
export const BODY_PANEL = 1;

// Flags.mask layers — the query bitmask for combat/targeting/render selection.
export const F_RENDER = 1 << 0;
export const F_DYNAMIC = 1 << 1;
export const F_BREAKABLE = 1 << 2;

export function gameWorldBytes(): number {
	return sabBytes(GAME_SCHEMA, GAME_CAP);
}

export function createGameWorld(buffer: ArrayBufferLike): GameWorld {
	return createSabWorld(buffer, GAME_SCHEMA, GAME_CAP);
}

// Tier-2 instance buffer: dense AoS mat4 rows the renderer binds straight into an
// InstancedMesh.instanceMatrix (zero-copy GPU upload). The worker compacts every
// renderable entity into rows 0..count-1 each frame; slot 0 (Int32) holds count.
export const MAX_INSTANCES = 4096;
const INST_HEADER_I32 = 4;
const INST_FLOATS_PER = 16;

export function instanceBytes(): number {
	return INST_HEADER_I32 * 4 + MAX_INSTANCES * INST_FLOATS_PER * 4;
}

export interface InstanceView {
	header: Int32Array;
	matrices: Float32Array;
}

export function createInstanceView(buffer: ArrayBufferLike): InstanceView {
	return {
		header: new Int32Array(buffer, 0, INST_HEADER_I32),
		matrices: new Float32Array(
			buffer,
			INST_HEADER_I32 * 4,
			MAX_INSTANCES * INST_FLOATS_PER,
		),
	};
}

export const INST_COUNT = 0;
export const FLOATS_PER_INSTANCE = INST_FLOATS_PER;
