export const MAX_ENTITIES = 4096;

// Tile position (grid coords), mirrored from the authoritative server snapshot.
export const Position = {
	x: new Int32Array(MAX_ENTITIES),
	y: new Int32Array(MAX_ENTITIES),
};

export const Health = {
	hp: new Float32Array(MAX_ENTITIES),
	maxHp: new Float32Array(MAX_ENTITIES),
};

// Server kind id (indexes the welcome KindEntry registry → ref / category).
export const Kind = {
	value: new Int32Array(MAX_ENTITIES),
};

// Owning player slot (players only; SLOT_NONE for NPCs/items).
export const Owner = {
	slot: new Int32Array(MAX_ENTITIES),
};

// Interest flag for culling far entities (sprite/sim pause).
export const Active = {
	value: new Uint8Array(MAX_ENTITIES),
};

// Category tags — an entity carries exactly one of these; hostile NPCs also
// carry MonsterTag so the proximity/cull queries can target them.
export const PlayerTag: Record<string, never> = {};
export const NpcTag: Record<string, never> = {};
export const ItemTag: Record<string, never> = {};
export const MonsterTag: Record<string, never> = {};
