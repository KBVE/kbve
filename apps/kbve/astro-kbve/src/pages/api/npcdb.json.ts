import { getCollection } from 'astro:content';
import type { INpc } from '@/data/schema';
import {
	NpcTypeFlags,
	NpcRarities,
	NpcRanks,
	Personalities,
	Elements,
	CreatureFamilies,
	MovementTypes,
	DifficultyModes,
	EquipSlots,
} from '../../../../../../packages/data/codegen/generated/npcdb-schema';

/**
 * Field-name → enum array mapping for proto integer conversion.
 * Every enum field in the proto Npc graph that prost expects as i32
 * must be listed here so recursive conversion catches nested objects.
 */
const ENUM_FIELDS: Record<string, readonly string[]> = {
	type_flags: NpcTypeFlags,
	rarity: NpcRarities,
	rank: NpcRanks,
	personality: Personalities,
	element: Elements,
	family: CreatureFamilies,
	movement_type: MovementTypes,
	mode: DifficultyModes,
	slot: EquipSlots,
};

/** Recursively walk an object, converting any string enum field to its proto integer index. */
function convertEnums(obj: unknown): unknown {
	if (Array.isArray(obj)) return obj.map(convertEnums);
	if (obj !== null && typeof obj === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(
			obj as Record<string, unknown>,
		)) {
			const arr = ENUM_FIELDS[key];
			if (arr && typeof val === 'string') {
				const idx = arr.indexOf(val);
				out[key] = idx >= 0 ? idx : 0;
			} else {
				out[key] = convertEnums(val);
			}
		}
		return out;
	}
	return obj;
}

/**
 * Default values for all repeated/optional proto fields on the Npc message.
 * Prost serde expects these to be present even when empty.
 */
const NPC_DEFAULTS: Record<string, unknown> = {
	tags: [],
	abilities: [],
	weaknesses: [],
	resistances: [],
	status_immunities: [],
	intent_weights: [],
	spawn_rules: [],
	phase_rules: [],
	difficulty_overrides: [],
	dialogue: [],
	quest_refs: [],
	extensions: [],
	flavor_text: [],
};

export const GET = async () => {
	const npcEntries = (await getCollection('npcdb')).filter(
		(entry: { id: string; data: Record<string, unknown> }) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const npcs: INpc[] = [];
	const index: Record<string, number> = {};

	for (const entry of npcEntries) {
		const { id, ref, name } = entry.data;
		if (!id || !ref || !name) continue;

		const npc = { ...NPC_DEFAULTS, ...convertEnums(entry.data) } as INpc;

		const idx = npcs.length;
		npcs.push(npc);

		index[id] = idx;
		index[ref] = idx;
		index[name] = idx;
	}

	validateNpcUniqueness(npcs);

	return new Response(JSON.stringify(npcs, null, '\t'), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};

function validateNpcUniqueness(npcs: INpc[]) {
	const seenIds = new Set<string>();
	const seenRefs = new Set<string>();
	const seenNames = new Set<string>();

	for (const npc of npcs) {
		if (seenIds.has(npc.id)) {
			throw new Error(`Duplicate NPC id detected: ${npc.id}`);
		}
		if (seenRefs.has(npc.ref)) {
			throw new Error(`Duplicate NPC ref detected: ${npc.ref}`);
		}
		if (seenNames.has(npc.name)) {
			throw new Error(`Duplicate NPC name detected: ${npc.name}`);
		}
		seenIds.add(npc.id);
		seenRefs.add(npc.ref);
		seenNames.add(npc.name);
	}
}
