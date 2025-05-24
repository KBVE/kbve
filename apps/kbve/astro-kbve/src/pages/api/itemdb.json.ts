import { getCollection } from 'astro:content';

import { validateItemUniqueness } from 'src/content/config';


export const GET = async () => {
	const itemEntries = await getCollection('itemdb');

	const key: Record<string, number> = {};
	const items: any[] = [];

	for (const entry of itemEntries) {
		const { id, name, key: indexKey, ref } = entry.data;
		if (!id || !name || indexKey === undefined || !ref) continue;

		const item = {
			...entry.data,
			slug: `/itemdb/${entry.id}`,
		};

		const index = items.length;
		items.push(item);

		key[id] = index;
		key[name] = index;
		key[String(indexKey)] = index;
		key[ref] = index;
	}

	validateItemUniqueness(items);

	return new Response(JSON.stringify({ items, key }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};