import { getCollection } from 'astro:content';
import type { IStructure } from '@/data/schema';

export const GET = async () => {
	const mapEntries = await getCollection(
		'mapdb',
		(entry) =>
			entry.data.type === 'structure' && entry.data.drafted !== true,
	);

	const structures: IStructure[] = [];
	const index: Record<string, number> = {}; // For lookups by id, guid, or name

	for (const entry of mapEntries) {
		const { id, guid, name } = entry.data;
		if (!id || !guid || !name) continue;

		const structure = {
			...entry.data,
			slug: `/mapdb/${entry.id}`,
		};

		const idx = structures.length;
		structures.push(structure as IStructure);

		// Create lookup indices
		index[id] = idx; // By ULID
		index[guid] = idx; // By GUID
		index[name] = idx; // By name
	}

	return new Response(JSON.stringify({ structures, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
