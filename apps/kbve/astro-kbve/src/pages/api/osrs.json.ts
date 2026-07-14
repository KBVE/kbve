import { getCollection } from 'astro:content';
import type { OSRSExtended } from '@/data/schema';
import { buildOsrsTags } from '@/data/osrs/tags';

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
			tags: buildOsrsTags(o),
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
