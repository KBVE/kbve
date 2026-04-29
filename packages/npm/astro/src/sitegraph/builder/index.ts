import type {
	Extractor,
	SiteGraphData,
	SiteGraphEntry,
	SiteGraphNode,
} from '../types';

export { markdownExtractor } from './extractors/markdown';
export { mdxAnchorExtractor } from './extractors/mdx-anchor';
export { frontmatterLinksExtractor } from './extractors/frontmatter-links';
export type { FrontmatterLinksOptions } from './extractors/frontmatter-links';
export { collectionRefsExtractor } from './extractors/collection-refs';
export type {
	CollectionRefField,
	CollectionRefsOptions,
} from './extractors/collection-refs';

export interface BuildSiteGraphOptions {
	extractors: Extractor[];
	/**
	 * Strips trailing `/index` and `.md`/`.mdx` from `entry.id` before using
	 * it as the canonical slug. Override to customize slug derivation.
	 */
	slugifyId?: (id: string) => string;
	/**
	 * Falls back to a humanized slug when `entry.data.title` is missing.
	 * Override to plug in a custom title resolver.
	 */
	titleOf?: (entry: SiteGraphEntry, slug: string) => string;
}

const DEFAULT_SLUGIFY = (id: string): string =>
	id.replace(/\/index$/, '').replace(/\.mdx?$/, '');

const DEFAULT_TITLE = (entry: SiteGraphEntry, slug: string): string => {
	const title = (entry.data as Record<string, unknown>).title;
	if (typeof title === 'string' && title.length > 0) return title;
	const last = slug.split('/').pop() ?? slug;
	return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Builds a `SiteGraphData` adjacency map from a content collection.
 *
 * Two-pass:
 *   1. Run every extractor on each entry, merge into outgoing links + edges.
 *   2. Reverse the adjacency map to populate `backlinks` on each node.
 *
 * Extractors compose: links are deduplicated, edge maps merge with later
 * extractors winning on key collision.
 */
export function buildSiteGraph(
	entries: SiteGraphEntry[],
	options: BuildSiteGraphOptions,
): SiteGraphData {
	const slugify = options.slugifyId ?? DEFAULT_SLUGIFY;
	const titleOf = options.titleOf ?? DEFAULT_TITLE;
	const graph: SiteGraphData = {};

	for (const entry of entries) {
		const slug = slugify(entry.id);
		const title = titleOf(entry, slug);

		const linkSet = new Set<string>();
		let edges: Record<string, string> | undefined;

		for (const extract of options.extractors) {
			const result = extract(entry, slug);
			for (const link of result.links) linkSet.add(link);
			if (result.edges) {
				edges = { ...(edges ?? {}), ...result.edges };
			}
		}

		const node: SiteGraphNode = {
			title,
			links: [...linkSet],
			backlinks: [],
		};
		if (edges && Object.keys(edges).length > 0) node.edges = edges;
		graph[slug] = node;
	}

	for (const [slug, node] of Object.entries(graph)) {
		for (const target of node.links) {
			if (graph[target]) graph[target].backlinks.push(slug);
		}
	}

	for (const node of Object.values(graph)) {
		node.backlinks = [...new Set(node.backlinks)];
	}

	return graph;
}
