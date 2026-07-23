import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
	buildSiteGraph,
	markdownExtractor,
	mdxAnchorExtractor,
} from '@kbve/astro';
import { osrsExtractor } from '../../../lib/sitegraph/osrs-extractor';
import {
	buildGraphIndex,
	type NxGraphInput,
	type GraphifyOverviewInput,
	type SiteGraphInput,
} from '../../../lib/graph/buildGraphIndex';
import nxGraph from '../../../../public/data/nx/nx-graph.json';
import graphifyOverview from '../../../../public/graphify/overview.json';

/**
 * Unified graph index for the `/graph/` hub — fuses NX project dependencies,
 * the Graphify directory graph, and the docs site graph at build time. Static
 * output prerenders this to a file; each feed is optional and failures degrade
 * to an empty-but-valid index rather than a 500.
 *
 * @endpoint GET /api/graph/index.json
 */
export const GET: APIRoute = async () => {
	let site: SiteGraphInput | null = null;
	try {
		const entries = await getCollection('docs');
		site = buildSiteGraph(
			entries.map((e: (typeof entries)[number]) => ({
				id: e.id,
				body: e.body,
				data: e.data as Record<string, unknown>,
			})),
			{
				extractors: [
					markdownExtractor,
					mdxAnchorExtractor,
					osrsExtractor,
				],
			},
		) as SiteGraphInput;
	} catch {
		site = null;
	}

	const index = buildGraphIndex({
		nx: nxGraph as unknown as NxGraphInput,
		graphify: graphifyOverview as unknown as GraphifyOverviewInput,
		site,
	});

	return new Response(
		JSON.stringify({
			metadata: {
				source: 'graph-hub',
				type: 'unified-monorepo-graph',
				feeds: ['nx', 'graphify', 'site'],
				gaps: index.meta.gaps,
				counts: index.meta.counts,
			},
			entities: index.entities,
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600',
				'X-Graph-Type': 'unified-hub',
			},
		},
	);
};
