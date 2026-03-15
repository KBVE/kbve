import { getCollection } from 'astro:content';
import type { INpc } from '@/data/schema';

export const GET = async () => {
	const npcEntries = (await getCollection('npcdb')).filter(
		(entry) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const npcs: INpc[] = [];
	const index: Record<string, number> = {};

	for (const entry of npcEntries) {
		const { id, slug, name } = entry.data;
		if (!id || !slug || !name) continue;

		const npc = {
			...entry.data,
		};

		const idx = npcs.length;
		npcs.push(npc as INpc);

		index[id] = idx;
		index[slug] = idx;
		index[name] = idx;
	}

	validateNpcUniqueness(npcs);

	return new Response(JSON.stringify({ npcs, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};

function validateNpcUniqueness(npcs: INpc[]) {
	const seenIds = new Set<string>();
	const seenSlugs = new Set<string>();
	const seenNames = new Set<string>();

	for (const npc of npcs) {
		if (seenIds.has(npc.id)) {
			throw new Error(`Duplicate NPC id detected: ${npc.id}`);
		}
		if (seenSlugs.has(npc.slug)) {
			throw new Error(`Duplicate NPC slug detected: ${npc.slug}`);
		}
		if (seenNames.has(npc.name)) {
			throw new Error(`Duplicate NPC name detected: ${npc.name}`);
		}
		seenIds.add(npc.id);
		seenSlugs.add(npc.slug);
		seenNames.add(npc.name);
	}
}
