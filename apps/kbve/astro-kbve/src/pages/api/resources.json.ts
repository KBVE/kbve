import { getCollection } from 'astro:content';
import type { IResource } from '@/data/schema';

export const GET = async () => {
	const mapEntries = await getCollection(
		'mapdb',
		(entry) =>
			entry.data.type === 'resource' && entry.data.drafted !== true,
	);

	const resources: IResource[] = [];
	const index: Record<string, number> = {}; // For lookups by id, guid, or name

	for (const entry of mapEntries) {
		const { id, guid, name } = entry.data;
		if (!id || !guid || !name) continue;

		const resource = {
			...entry.data,
			slug: `/mapdb/${entry.id}`,
		};

		const idx = resources.length;
		resources.push(resource as IResource);

		// Create lookup indices
		index[id] = idx; // By ULID
		index[guid] = idx; // By GUID
		index[name] = idx; // By name
	}

	return new Response(JSON.stringify({ resources, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
