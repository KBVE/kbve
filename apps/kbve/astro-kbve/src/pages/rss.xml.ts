import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

const SITE = 'https://kbve.com';
const MAX_ITEMS = 50;

export async function GET(context: APIContext) {
	const posts = await getCollection(
		'docs',
		(entry) =>
			entry.id.startsWith('journal/') && entry.data.date instanceof Date,
	);

	const items = posts
		.sort(
			(a, b) =>
				(b.data.date as Date).getTime() -
				(a.data.date as Date).getTime(),
		)
		.slice(0, MAX_ITEMS)
		.map((entry) => ({
			title: entry.data.title,
			description: entry.data.description ?? '',
			pubDate: entry.data.date as Date,
			link: `/${entry.id}/`,
			categories:
				entry.data.tags ??
				(entry.data.category ? [entry.data.category] : []),
		}));

	return rss({
		title: 'KBVE Journal',
		description: 'The dev log and daily journal of KBVE — h0lythoughts.',
		site: context.site?.toString() ?? SITE,
		items,
		customData: '<language>en-us</language>',
	});
}
