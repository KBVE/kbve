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

// NPC combat stats, seeded from the npcdb entry at spawn.
export const Combat = {
	attack: new Float32Array(MAX_ENTITIES),
	defense: new Float32Array(MAX_ENTITIES),
};

// Back-reference to the npcdb entry: index into the npcdb ref table, or
// NPC_REF_NONE when the entity is not npcdb-backed.
export const NpcRef = {
	index: new Int32Array(MAX_ENTITIES),
};

export const NPC_REF_NONE = -1;

// Category tags — an entity carries exactly one of these; hostile NPCs also
// carry MonsterTag so the proximity/cull queries can target them.
export const PlayerTag: Record<string, never> = {};
export const NpcTag: Record<string, never> = {};
export const ItemTag: Record<string, never> = {};
export const MonsterTag: Record<string, never> = {};
