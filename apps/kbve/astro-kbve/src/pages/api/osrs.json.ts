import { getCollection } from 'astro:content';
import type { OSRSExtended } from '@/data/schema';
import { hasDropSources } from '@/data/schema/osrs/generated';

interface OSRSIndexEntry {
	id: number;
	name: string;
	slug: string;
	icon: string;
	value: number;
	highalch: number | null;
	limit: number | null;
	members: boolean;
	slot?: string;
	weapon?: string;
	tags: string[];
}

const TAG_FOOD = 'food';
const TAG_POTION = 'potion';
const TAG_EQUIPMENT = 'equipment';
const TAG_QUEST = 'quest';
const TAG_DROP = 'drop';
const TAG_FARM = 'farm';
const TAG_GATHER = 'gather';
const TAG_TELEPORT = 'teleport';
const TAG_AMMO = 'ammo';
const TAG_PRAYER = 'prayer';

function buildTags(o: OSRSExtended): string[] {
	const tags: string[] = [];
	if (o.food) tags.push(TAG_FOOD);
	if (o.potion) tags.push(TAG_POTION);
	if (o.equipment) tags.push(TAG_EQUIPMENT);
	if (o.quest_data) tags.push(TAG_QUEST);
	if (hasDropSources(o)) tags.push(TAG_DROP);
	if (o.farming) tags.push(TAG_FARM);
	if (o.gathering || o.woodcutting || o.mining || o.fishing)
		tags.push(TAG_GATHER);
	if (o.teleport) tags.push(TAG_TELEPORT);
	if (o.ammunition) tags.push(TAG_AMMO);
	if (o.prayer) tags.push(TAG_PRAYER);
	return tags;
}

export const GET = async () => {
	const docs = await getCollection('docs');
	const items: OSRSIndexEntry[] = [];

	for (const entry of docs) {
		const data = entry.data as { osrs?: OSRSExtended };
		const o = data.osrs;
		if (!o || !o.id || !o.slug || !o.name) continue;

		items.push({
			id: o.id,
			name: o.name,
			slug: o.slug,
			icon: o.icon,
			value: o.value ?? 0,
			highalch: o.highalch ?? null,
			limit: o.limit ?? null,
			members: !!o.members,
			slot: o.equipment?.slot ?? undefined,
			weapon: o.equipment?.weapon_type ?? undefined,
			tags: buildTags(o),
		});
	}

	items.sort((a, b) => a.name.localeCompare(b.name));

	return new Response(JSON.stringify({ count: items.length, items }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
