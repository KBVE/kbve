import { getCollection, type CollectionKey, type CollectionEntry } from 'astro:content';
import type { APIRoute } from 'astro';

// Languages and namespaces you support
const LANGUAGES = ['en', 'es'];
const COLLECTIONS = ['sidebar'] as const;
type KnownCollections = typeof COLLECTIONS[number];

async function getTypedEntries<K extends CollectionKey>(namespace: K): Promise<CollectionEntry<K>[]> {
	return await getCollection(namespace);
}

export const GET: APIRoute = async () => {
	const result: Record<string, string> = {};

	for (const namespace of COLLECTIONS) {
		const entries = await getTypedEntries(namespace);

		for (const entry of entries) {
			const lang = entry.slug;
			Object.entries(entry.data).forEach(([key, value]) => {
				if (typeof value === 'string') {
					result[`${lang}:${namespace}:${key}`] = value;
				}
			});
		}
	}

	return new Response(JSON.stringify(result), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
