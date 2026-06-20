export const MAX_ENTITIES = 4096;

export const Position = {
	x: new Int32Array(MAX_ENTITIES),
	y: new Int32Array(MAX_ENTITIES),
};

export const Health = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
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

export const PlayerTag: Record<string, never> = {};
export const NpcTag: Record<string, never> = {};
export const ItemTag: Record<string, never> = {};
export const MonsterTag: Record<string, never> = {};
