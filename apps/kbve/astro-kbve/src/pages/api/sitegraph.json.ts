/**
 * Site Graph API — /api/sitegraph.json
 *
 * Build-time endpoint that extracts internal links from all docs content
 * and produces a JSON adjacency map with backlinks. Consumed by the
 * SiteGraph React component in the right sidebar.
 */
import { getCollection } from 'astro:content';

interface SiteGraphNode {
	title: string;
	links: string[];
	backlinks: string[];
}

type SiteGraph = Record<string, SiteGraphNode>;

/** Extract internal markdown/MDX links from raw body text. */
function extractLinks(body: string | undefined, currentSlug: string): string[] {
	if (!body) return [];

	const links = new Set<string>();

	// Match markdown links: [text](url)
	const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
	let match;
	while ((match = mdLinkRe.exec(body)) !== null) {
		const href = match[2].trim();
		// Skip external, anchor-only, and asset links
		if (
			href.startsWith('http') ||
			href.startsWith('#') ||
			href.startsWith('mailto:') ||
			/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip)$/i.test(href)
		) {
			continue;
		}
		// Normalize: strip leading /docs/, leading /, trailing /
		let slug = href
			.replace(/^\/docs\//, '')
			.replace(/^\//, '')
			.replace(/\/$/, '')
			.replace(/\.mdx?$/, '')
			.replace(/#.*$/, '');
		if (slug && slug !== currentSlug) {
			links.add(slug);
		}
	}

	return [...links];
}

export const GET = async () => {
	const entries = await getCollection('docs');

	const graph: SiteGraph = {};

	// Pass 1: build nodes with outgoing links
	for (const entry of entries) {
		const slug = entry.id.replace(/\/index$/, '').replace(/\.mdx?$/, '');
		const title =
			(entry.data as any).title ||
			slug
				.split('/')
				.pop()
				?.replace(/-/g, ' ')
				.replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
			slug;
		const links = extractLinks(entry.body, slug);

		graph[slug] = {
			title,
			links,
			backlinks: [],
		};
	}

	// Pass 2: compute backlinks by reversing outgoing links
	for (const [slug, node] of Object.entries(graph)) {
		for (const target of node.links) {
			if (graph[target]) {
				graph[target].backlinks.push(slug);
			}
		}
	}

	// Deduplicate backlinks
	for (const node of Object.values(graph)) {
		node.backlinks = [...new Set(node.backlinks)];
	}

	return new Response(JSON.stringify(graph), {
		headers: { 'Content-Type': 'application/json' },
	});
};
