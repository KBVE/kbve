import { getCollection } from 'astro:content';
import type { IMapObject } from '@/data/schema';

export const GET = async () => {
	const mapEntries = (await getCollection('mapdb')).filter(
		(entry) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const mapObjects: IMapObject[] = [];
	const index: Record<string, number> = {};

	for (const entry of mapEntries) {
		const { id, ref, name, type } = entry.data;
		if (!id || !ref || !name || !type) continue;

		const mapObject = {
			...entry.data,
		};

		const idx = mapObjects.length;
		mapObjects.push(mapObject as IMapObject);

		index[id] = idx;
		index[ref] = idx;
		index[name] = idx;
	}

	validateMapObjectUniqueness(mapObjects);

	return new Response(JSON.stringify({ mapObjects, index }, null, 2), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};

function validateMapObjectUniqueness(objects: IMapObject[]) {
	const seenIds = new Set<string>();
	const seenRefs = new Set<string>();
	const seenNames = new Set<string>();

	for (const obj of objects) {
		if (seenIds.has(obj.id)) {
			throw new Error(`Duplicate ULID detected: ${obj.id}`);
		}
		if (seenRefs.has(obj.ref)) {
			throw new Error(`Duplicate ref detected: ${obj.ref}`);
		}
		if (seenNames.has(obj.name)) {
			throw new Error(`Duplicate name detected: ${obj.name}`);
		}
		seenIds.add(obj.id);
		seenRefs.add(obj.ref);
		seenNames.add(obj.name);
	}
}
