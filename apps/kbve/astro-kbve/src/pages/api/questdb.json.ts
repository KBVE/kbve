import { getCollection } from 'astro:content';

export const GET = async () => {
	const questEntries = (await getCollection('questdb')).filter(
		(entry) => !(entry.data as any).drafted,
	);

	const key: Record<string, number> = {};
	const quests: any[] = [];

	for (const entry of questEntries) {
		const { id, guid } = entry.data as any;
		if (!id || !guid) continue;

		const quest = {
			...entry.data,
			slug: `/questdb/${entry.id}`,
		};

		const index = quests.length;
		quests.push(quest);

		key[id] = index;
		key[guid] = index;
	}

	return new Response(JSON.stringify({ quests, key }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
