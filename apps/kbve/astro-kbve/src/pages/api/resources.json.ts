import { getCollection } from 'astro:content';
import type { IMapObject } from '@/data/schema';

export const GET = async () => {
	const mapEntries = await getCollection(
		'mapdb',
		(entry) =>
			entry.data.harvest_yield !== undefined &&
			entry.data.drafted !== true,
	);

	const resources: IMapObject[] = [];
	const index: Record<string, number> = {};

	for (const entry of mapEntries) {
		const { id, ref, name } = entry.data;
		if (!id || !ref || !name) continue;

		const idx = resources.length;
		resources.push(entry.data as IMapObject);

		index[id] = idx;
		index[ref] = idx;
		index[name] = idx;
	}

	return new Response(JSON.stringify({ resources, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
