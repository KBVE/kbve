import { getCollection } from 'astro:content';
import type { IMapObject } from '@/data/schema';

export const GET = async () => {
	const mapEntries = await getCollection(
		'mapdb',
		(entry) =>
			entry.data.max_health !== undefined && entry.data.drafted !== true,
	);

	const structures: IMapObject[] = [];
	const index: Record<string, number> = {};

	for (const entry of mapEntries) {
		const { id, slug, name } = entry.data;
		if (!id || !slug || !name) continue;

		const idx = structures.length;
		structures.push(entry.data as IMapObject);

		index[id] = idx;
		index[slug] = idx;
		index[name] = idx;
	}

	return new Response(JSON.stringify({ structures, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
