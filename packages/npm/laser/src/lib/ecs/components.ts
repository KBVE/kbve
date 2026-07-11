export const MAX_ENTITIES = 4096;

export const Position = {
	x: new Int32Array(MAX_ENTITIES),
	y: new Int32Array(MAX_ENTITIES),
};

// Four regenerating resource pools: Health (HP), Mana (MP), Energy (EP), Stamina
// (SP). Health keeps its hp/maxHp names for existing consumers; the others use
// uniform value/max so the generic pool ops in ./stats can treat all four alike.
// Every pool carries a per-second regen (0 = static, e.g. a crate's HP).
export const Health = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
	regen: new Float32Array(MAX_ENTITIES),
};

export const Mana = {
	value: new Float32Array(MAX_ENTITIES),
	max: new Float32Array(MAX_ENTITIES),
	regen: new Float32Array(MAX_ENTITIES),
};

export const Energy = {
	value: new Float32Array(MAX_ENTITIES),
	max: new Float32Array(MAX_ENTITIES),
	regen: new Float32Array(MAX_ENTITIES),
};

export const Stamina = {
	value: new Float32Array(MAX_ENTITIES),
	max: new Float32Array(MAX_ENTITIES),
	regen: new Float32Array(MAX_ENTITIES),
};

export const Kind = {
	value: new Int32Array(MAX_ENTITIES),
};

export const Owner = {
	slot: new Int32Array(MAX_ENTITIES),
};

export const Active = {
	value: new Uint8Array(MAX_ENTITIES),
};

// Possession/attachment link: the entity that currently REPRESENTS this one — a
// ship while piloting, a mount while riding, etc. `host` is its server eid (0 =
// none, i.e. the entity represents itself / on foot); `kind` discriminates what
// it's attached to so render + camera + input can resolve the right host sprite.
// Generic on purpose: ships today, mounts/objects later with zero new plumbing.
export const Possession = {
	host: new Int32Array(MAX_ENTITIES), // server eid of representing entity, 0 = none
	kind: new Uint8Array(MAX_ENTITIES), // 0 none, 1 ship, (2 mount, 3 object — future)
};

export const PlayerTag: Record<string, never> = {};
export const NpcTag: Record<string, never> = {};
export const ItemTag: Record<string, never> = {};
export const EnvTag: Record<string, never> = {};
export const MonsterTag: Record<string, never> = {};
