import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export const prerender = true;

export async function getStaticPaths() {
	const docs = await getCollection('docs');
	const iconEntries = docs.filter((entry: CollectionEntry<'docs'>) => {
		const id = entry.id.replace(/\.mdx?$/, '');
		if (!id.startsWith('icons/')) return false;
		if (id === 'icons/index') return false;
		if (id.startsWith('icons/category/')) return false;
		const data = entry.data as { ref?: string; icons?: unknown[] };
		return Boolean(data.ref) && Array.isArray(data.icons);
	});
	return iconEntries.map((entry: CollectionEntry<'docs'>) => {
		const data = entry.data as { ref: string };
		return { params: { ref: data.ref }, props: { entry } };
	});
}

export const GET: APIRoute = async ({ props }) => {
	const entry = props.entry as CollectionEntry<'docs'>;
	const data = entry.data as Record<string, unknown>;
	const ref = data.ref as string;

	const body = {
		ref,
		name: data.name ?? data.title,
		title: data.title,
		description: data.description,
		primary_category: data.primary_category,
		categories: data.categories ?? [],
		tags: data.tags ?? [],
		default_license: data.default_license,
		icons: data.icons ?? [],
		featured: data.featured ?? false,
		url: `https://rareicon.com/icons/${ref}/`,
	};

	return new Response(JSON.stringify(body, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
};
