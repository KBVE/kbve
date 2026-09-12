import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { collectTermSummaries } from '@/lib/icons/terms';

export const prerender = true;

export const GET: APIRoute = async () => {
	const docs = await getCollection('docs');
	const terms = collectTermSummaries(docs).map((t) => ({
		ref: t.ref,
		name: t.name,
		description: t.description,
		primary_category: t.primary_category,
		categories: t.categories,
		tags: t.tags,
		styles: t.styles,
		sourcePacks: t.sourcePacks,
		multiSource: t.multiSource,
		attributionRequired: t.attributionRequired,
		variantCount: t.variantCount,
		featured: t.featured ?? false,
		url: `https://rareicon.com/icons/${t.ref}/`,
	}));

	const body = {
		generatedAt: new Date().toISOString(),
		count: terms.length,
		terms,
	};

	return new Response(JSON.stringify(body, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
};
