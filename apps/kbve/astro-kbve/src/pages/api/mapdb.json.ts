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
		const { id, slug, name, type } = entry.data;
		if (!id || !slug || !name || !type) continue;

		const mapObject = {
			...entry.data,
		};

		const idx = mapObjects.length;
		mapObjects.push(mapObject as IMapObject);

		index[id] = idx;
		index[slug] = idx;
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
	const seenSlugs = new Set<string>();
	const seenNames = new Set<string>();

	for (const obj of objects) {
		if (seenIds.has(obj.id)) {
			throw new Error(`Duplicate ULID detected: ${obj.id}`);
		}
		if (seenSlugs.has(obj.slug)) {
			throw new Error(`Duplicate slug detected: ${obj.slug}`);
		}
		if (seenNames.has(obj.name)) {
			throw new Error(`Duplicate name detected: ${obj.name}`);
		}
		seenIds.add(obj.id);
		seenSlugs.add(obj.slug);
		seenNames.add(obj.name);
	}
}
