import { getCollection } from 'astro:content';

export const GET = async () => {
	const projectEntries = (await getCollection('project')).filter(
		(entry: { id: string; data: { title: string } }) =>
			!entry.id.endsWith('index.mdx') && entry.data.title !== '',
	);

	const key: Record<string, number> = {};
	const projects: any[] = [];

	for (const entry of projectEntries) {
		const { title } = entry.data;
		if (!title) continue;

		const project = {
			...entry.data,
			slug: `/project/${entry.id}`,
		};

		const index = projects.length;
		projects.push(project);

		key[entry.id] = index;
		key[title] = index;
		if (entry.data.sidebar?.label) {
			key[entry.data.sidebar.label] = index;
		}
	}

	return new Response(JSON.stringify({ projects, key }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
