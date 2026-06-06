export const MAX_ENTITIES = 1024;

export const Position = {
	x: [] as number[],
	y: [] as number[],
};

export const Health = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
};

export const Active = {
	value: new Uint8Array(MAX_ENTITIES),
};

export const PlayerTag: Record<string, never> = {};
export const NpcTag: Record<string, never> = {};
export const MonsterTag: Record<string, never> = {};
