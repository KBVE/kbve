import { getCollection } from 'astro:content';

export const GET = async () => {
	const applicationEntries = (await getCollection('application')).filter(
		(entry: { id: string; data: { title: string } }) =>
			!entry.id.endsWith('index.mdx') && entry.data.title !== '',
	);

	const key: Record<string, number> = {};
	const applications: any[] = [];

	for (const entry of applicationEntries) {
		const { title } = entry.data;
		if (!title) continue;

		const application = {
			...entry.data,
			slug: `/application/${entry.id}`,
		};

		const index = applications.length;
		applications.push(application);

		key[entry.id] = index;
		key[title] = index;
		if (entry.data.sidebar?.label) {
			key[entry.data.sidebar.label] = index;
		}
	}

	return new Response(JSON.stringify({ applications, key }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
