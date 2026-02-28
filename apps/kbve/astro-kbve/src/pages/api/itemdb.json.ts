import { getCollection } from 'astro:content';

import { validateItemUniqueness } from '@/content.config';

export const GET = async () => {
	const itemEntries = (await getCollection('itemdb')).filter(
		(entry: { id: string; data: { key: number } }) =>
			!entry.id.endsWith('index.mdx') && entry.data.key !== 0,
	);

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
