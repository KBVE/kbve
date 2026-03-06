import { getCollection } from 'astro:content';

export const GET = async () => {
	const allDocs = await getCollection('docs');

	const docs: Record<
		string,
		{
			title: string;
			description: string;
			path: string;
			img: string | null;
			tags: string[];
			category: string;
		}
	> = {};

	for (const entry of allDocs) {
		const { title, description } = entry.data;
		if (!title) continue;

		const slug = entry.id;
		const path = `/${slug}/`;

		const segments = slug.split('/');
		const category = segments[0] ?? '';

		const img =
			((entry.data as Record<string, unknown>).img as string | null) ??
			null;
		const rawTags = (entry.data as Record<string, unknown>).tags ?? [];
		const tags = Array.isArray(rawTags) ? rawTags.map(String) : [];

		docs[slug] = {
			title: typeof title === 'string' ? title : '',
			description:
				typeof description === 'string' ? description.trim() : '',
			path,
			img: typeof img === 'string' ? img : null,
			tags,
			category,
		};
	}

	return new Response(JSON.stringify({ docs }), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
