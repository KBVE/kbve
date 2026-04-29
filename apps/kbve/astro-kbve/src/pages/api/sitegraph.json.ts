import { getCollection } from 'astro:content';
import {
	buildSiteGraph,
	markdownExtractor,
	mdxAnchorExtractor,
} from '@kbve/astro';
import { osrsExtractor } from '../../lib/sitegraph/osrs-extractor';

export const GET = async () => {
	const entries = await getCollection('docs');

	const graph = buildSiteGraph(
		entries.map((e: (typeof entries)[number]) => ({
			id: e.id,
			body: e.body,
			data: e.data as Record<string, unknown>,
		})),
		{
			extractors: [markdownExtractor, mdxAnchorExtractor, osrsExtractor],
		},
	);

	return new Response(JSON.stringify(graph), {
		headers: {
			'Content-Type': 'application/json',
			'x-kbve-graph-data': 'v2',
		},
	});
};
