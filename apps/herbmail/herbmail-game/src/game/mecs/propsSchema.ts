import type { Schema } from '@kbve/laser/mecs';

// The dungeon world's component layout, pure (no singleton side-effect) so both the
// main thread (mecs/props.ts, the authoritative writer) and the sim worker (a
// read-only attacher over the same SharedArrayBuffer) can build a matching world.
export const PROPS_SCHEMA = {
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
	Mana: { value: 'f32', max: 'f32', regen: 'f32' },
	Energy: { value: 'f32', max: 'f32', regen: 'f32' },
	Stamina: { value: 'f32', max: 'f32', regen: 'f32' },
	Combat: { power: 'f32', defense: 'f32' },
	Burn: { dps: 'f32', remaining: 'f32', acc: 'f32', flameEid: 'i32' },
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
	Npc: { kind: 'u8', radius: 'f32' },
	Wander: { vx: 'f32', vz: 'f32', until: 'f32' },
	Targetable: { radius: 'f32', priority: 'u8' },
	CharState: { bits: 'u32' },
	HeldItems: { right: 'u16', left: 'u16' },
	// Ability cast state (player and, later, NPCs). ability = active ability id,
	// phase = CastPhase, t = seconds elapsed in the whole cast, target = locked
	// victim eid (-1 none), hasHit = damage already applied this cast.
	Caster: {
		ability: 'i32',
		phase: 'u8',
		t: 'f32',
		target: 'i32',
		hasHit: 'u8',
	},
	// Per-slot cooldown remaining (seconds) for the four special abilities.
	Cooldowns: { s1: 'f32', s2: 'f32', s3: 'f32', s4: 'f32' },
	// Water basin volume: center rides Transform3, extents/surface here.
	Oasis: { halfW: 'f32', halfL: 'f32', surfaceY: 'f32', ownerEid: 'i32' },
} satisfies Schema;

export const PROPS_CAP = 8192;
