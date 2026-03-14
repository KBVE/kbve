import { getCollection } from 'astro:content';

import { validateItemUniqueness } from '@/content.config';

export const GET = async () => {
	const itemEntries = (await getCollection('itemdb')).filter(
		(entry: { id: string; data: { key: number } }) =>
			!entry.id.endsWith('index.mdx') && entry.data.key !== 0,
	);

	const index: Record<string, number> = {};
	const items: any[] = [];

	for (const entry of itemEntries) {
		const { id, name, key, slug } = entry.data;
		if (!id || !name || key === undefined || !slug) continue;

		const item = {
			...entry.data,
		};

		const idx = items.length;
		items.push(item);

		index[id] = idx;
		index[name] = idx;
		index[String(key)] = idx;
		index[slug] = idx;
	}

	validateItemUniqueness(items);

	return new Response(JSON.stringify({ items, index }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
