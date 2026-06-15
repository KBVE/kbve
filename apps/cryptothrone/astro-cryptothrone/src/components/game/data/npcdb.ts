import npcdbRaw from '@kbve/npcdb-data';
import type {
	NpcEntry,
	NpcStats,
	NpcAbility,
	NpcFamily,
	NpcMovement,
	NpcRarity,
} from '../types';

// Typed adapter over the shared @kbve/npcdb-data pool. Mirrors the itemdb
// adapter: the codegen JSON is camelCase with prefixed enum values
// (NPC_RARITY_COMMON, MOVEMENT_TYPE_PATROL, …); we normalize each entry into a
// flat, game-ready NpcEntry once at module load and index it by ref + id.

interface RawNpcStats {
	hp?: number;
	maxHp?: number;
	attack?: number;
	defense?: number;
	speed?: number;
	armor?: number;
}

interface RawNpcAbility {
	id?: string;
	name?: string;
	damage?: number;
}

interface RawNpc {
	ref: string;
	id: string;
	name: string;
	description?: string;
	typeFlags?: number;
	rarity?: string;
	personality?: string;
	rank?: string;
	family?: string;
	level?: number;
	stats?: RawNpcStats;
	behavior?: { movementType?: string; firstStrike?: boolean };
	abilities?: RawNpcAbility[];
	faction?: { factionId?: string };
}

const FAMILIES: readonly NpcFamily[] = [
	'humanoid',
	'undead',
	'beast',
	'construct',
	'elemental',
	'demon',
	'plant',
	'aberration',
	'spirit',
];

const MOVEMENTS: readonly NpcMovement[] = [
	'stationary',
	'random_wander',
	'patrol',
	'scripted',
	'aggressive',
];

const RARITIES: readonly NpcRarity[] = [
	'common',
	'uncommon',
	'rare',
	'epic',
	'legendary',
	'mythic',
];

/** Strip a `PREFIX_` enum prefix and lowercase, e.g. `NPC_RARITY_EPIC` → `epic`. */
function unprefix(raw: string | undefined, prefix: string): string {
	return (raw ?? '').replace(prefix, '').toLowerCase();
}

function resolveRarity(raw?: string): NpcRarity {
	const r = unprefix(raw, 'NPC_RARITY_') as NpcRarity;
	return RARITIES.includes(r) ? r : 'common';
}

function resolveFamily(raw?: string): NpcFamily {
	const f = (raw ?? '').toLowerCase() as NpcFamily;
	return FAMILIES.includes(f) ? f : 'unknown';
}

function resolveMovement(raw?: string): NpcMovement {
	const m = unprefix(raw, 'MOVEMENT_TYPE_') as NpcMovement;
	return MOVEMENTS.includes(m) ? m : 'stationary';
}

function resolveStats(raw?: RawNpcStats): NpcStats {
	const hp = raw?.hp ?? 30;
	return {
		hp,
		maxHp: raw?.maxHp ?? hp,
		attack: raw?.attack ?? 1,
		defense: raw?.defense ?? 0,
		speed: raw?.speed ?? 1,
		armor: raw?.armor ?? 0,
	};
}

function resolveAbilities(raw?: RawNpcAbility[]): NpcAbility[] {
	return (raw ?? [])
		.filter((a) => a && a.id)
		.map((a) => ({
			id: a.id as string,
			name: a.name ?? (a.id as string),
			damage: a.damage ?? 0,
		}));
}

function adapt(raw: RawNpc): NpcEntry {
	const factionId = raw.faction?.factionId ?? 'neutral';
	return {
		ref: raw.ref,
		id: raw.id,
		name: raw.name,
		description: (raw.description ?? '').trim(),
		family: resolveFamily(raw.family),
		rarity: resolveRarity(raw.rarity),
		rank: unprefix(raw.rank, 'NPC_RANK_') || 'normal',
		level: raw.level ?? 1,
		movement: resolveMovement(raw.behavior?.movementType),
		firstStrike: raw.behavior?.firstStrike ?? false,
		stats: resolveStats(raw.stats),
		abilities: resolveAbilities(raw.abilities),
		factionId,
		hostile: factionId === 'hostile',
	};
}

const pool = (npcdbRaw as { npcs?: RawNpc[] }).npcs ?? [];
const npcs: NpcEntry[] = pool.filter((r) => r && r.ref && r.name).map(adapt);

const byRef = new Map(npcs.map((n) => [n.ref, n]));

export function getNpcEntry(ref: string): NpcEntry | undefined {
	return byRef.get(ref);
}

export function getAllNpcEntries(): NpcEntry[] {
	return npcs;
}

export function getNpcStats(ref: string): NpcStats | undefined {
	return byRef.get(ref)?.stats;
}

export function isHostileRef(ref: string): boolean {
	return byRef.get(ref)?.hostile ?? false;
}
