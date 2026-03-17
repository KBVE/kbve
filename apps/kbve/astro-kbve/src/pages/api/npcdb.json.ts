import { getCollection } from 'astro:content';
import type { INpc } from '@/data/schema';
import {
	NpcTypeFlags,
	NpcRarities,
	NpcRanks,
	Personalities,
	Elements,
	CreatureFamilies,
} from '../../../../../../packages/data/codegen/generated/npcdb-schema';

/** Map a string enum value to its proto integer index. */
function toProtoInt(arr: readonly string[], value: unknown): number {
	if (typeof value === 'number') return value;
	const idx = arr.indexOf(value as string);
	return idx >= 0 ? idx : 0;
}

export const GET = async () => {
	const npcEntries = (await getCollection('npcdb')).filter(
		(entry) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const npcs: INpc[] = [];
	const index: Record<string, number> = {};

	for (const entry of npcEntries) {
		const { id, ref, name } = entry.data;
		if (!id || !ref || !name) continue;

		const npc = {
			...entry.data,
			type_flags: toProtoInt(NpcTypeFlags, entry.data.type_flags),
			rarity: toProtoInt(NpcRarities, entry.data.rarity),
			rank: toProtoInt(NpcRanks, entry.data.rank),
			personality: toProtoInt(Personalities, entry.data.personality),
			element: toProtoInt(Elements, entry.data.element),
			family: toProtoInt(CreatureFamilies, entry.data.family),
		};

		const idx = npcs.length;
		npcs.push(npc as INpc);

		index[id] = idx;
		index[ref] = idx;
		index[name] = idx;
	}

	validateNpcUniqueness(npcs);

	return new Response(JSON.stringify({ npcs, index }, null, '\t'), {
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
