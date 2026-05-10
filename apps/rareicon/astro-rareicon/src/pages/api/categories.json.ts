import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { collectTermSummaries } from '@/lib/icons/terms';

export const prerender = true;

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const terms = collectTermSummaries(docs);

	const counts = new Map<string, number>();
	for (const t of terms) {
		if (!t.primary_category) continue;
		counts.set(
			t.primary_category,
			(counts.get(t.primary_category) ?? 0) + 1,
		);
	}

	const categories = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([name, count]) => ({
			name,
			count,
			url: `https://rareicon.com/icons/category/${name}/`,
		}));

	const body = {
		generatedAt: new Date().toISOString(),
		count: categories.length,
		categories,
	};

	return new Response(JSON.stringify(body, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
};
