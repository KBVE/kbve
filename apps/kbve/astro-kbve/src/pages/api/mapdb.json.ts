import { getCollection } from 'astro:content';
import type { IMapObject } from '@/data/schema';

export const GET = async () => {
	const mapEntries = (await getCollection('mapdb')).filter(
		(entry) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const mapObjects: IMapObject[] = [];
	const index: Record<string, number> = {}; // For lookups by id, guid, or name

	for (const entry of mapEntries) {
		const { id, guid, name, type } = entry.data;
		if (!id || !guid || !name || !type) continue;

		const mapObject = {
			...entry.data,
			slug: `/mapdb/${entry.id}`,
		};

		const idx = mapObjects.length;
		mapObjects.push(mapObject as IMapObject);

		// Create lookup indices
		index[id] = idx; // By ULID
		index[guid] = idx; // By GUID
		index[name] = idx; // By name
	}

	// Optional: Validate uniqueness
	validateMapObjectUniqueness(mapObjects);

	return new Response(JSON.stringify({ mapObjects, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};

// Optional validation function
function validateMapObjectUniqueness(objects: IMapObject[]) {
	const seenIds = new Set<string>();
	const seenGuids = new Set<string>();
	const seenNames = new Set<string>();

	for (const obj of objects) {
		if (seenIds.has(obj.id)) {
			throw new Error(`Duplicate ULID detected: ${obj.id}`);
		}
		if (seenGuids.has(obj.guid)) {
			throw new Error(`Duplicate GUID detected: ${obj.guid}`);
		}
		if (seenNames.has(obj.name)) {
			throw new Error(`Duplicate name detected: ${obj.name}`);
		}
		seenIds.add(obj.id);
		seenGuids.add(obj.guid);
		seenNames.add(obj.name);
	}
}
