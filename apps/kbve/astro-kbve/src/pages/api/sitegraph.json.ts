/**
 * Site Graph API — /api/sitegraph.json
 *
 * Build-time endpoint that extracts internal links from all docs content
 * and produces a JSON adjacency map with backlinks. Consumed by the
 * SiteGraph React component in the right sidebar.
 *
 * Link sources:
 *   1. Markdown body links [text](url)
 *   2. OSRS frontmatter: related_items[].slug, recipes[].product slug,
 *      recipes[].materials[].item_id → slug lookup
 */
import { getCollection } from 'astro:content';

interface SiteGraphNode {
	title: string;
	links: string[];
	backlinks: string[];
	/** OSRS relationship metadata for graph edges (x-kbve-graph-data) */
	osrsEdges?: Record<string, string>;
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

/** Convert an item name to a slug (same logic as generator) */
function nameToSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Extract links + relationship metadata from OSRS frontmatter.
 * Returns { links: string[], edges: Record<slug, relationship> }
 */
function extractOsrsLinks(
	osrs: any,
	currentSlug: string,
): { links: string[]; edges: Record<string, string> } {
	const links = new Set<string>();
	const edges: Record<string, string> = {};

	if (!osrs) return { links: [], edges };

	// related_items — strongest signal for graph connections
	if (Array.isArray(osrs.related_items)) {
		for (const rel of osrs.related_items) {
			const slug =
				rel.slug || (rel.item_name ? nameToSlug(rel.item_name) : null);
			if (slug) {
				const target = `osrs/${slug}`;
				if (target !== currentSlug) {
					links.add(target);
					edges[target] = rel.relationship || 'related';
				}
			}
		}
	}

	// recipes — link to products
	if (Array.isArray(osrs.recipes)) {
		for (const recipe of osrs.recipes) {
			if (recipe.product) {
				const slug = nameToSlug(recipe.product);
				const target = `osrs/${slug}`;
				if (target !== currentSlug) {
					links.add(target);
					edges[target] = edges[target] || 'product';
				}
			}
			// materials — link to ingredients
			if (Array.isArray(recipe.materials)) {
				for (const mat of recipe.materials) {
					if (mat.item_name) {
						const slug = nameToSlug(mat.item_name);
						const target = `osrs/${slug}`;
						if (target !== currentSlug) {
							links.add(target);
							edges[target] = edges[target] || 'component';
						}
					}
				}
			}
		}
	}

	// drop_table — link to drop sources (if they have pages)
	if (osrs.drop_table) {
		const sources = Array.isArray(osrs.drop_table)
			? osrs.drop_table
			: osrs.drop_table.sources || [];
		for (const src of sources) {
			if (src.source) {
				const slug = nameToSlug(src.source);
				const target = `osrs/${slug}`;
				if (target !== currentSlug) {
					links.add(target);
					edges[target] = edges[target] || 'drop-source';
				}
			}
		}
	}

	return { links: [...links], edges };
}

export const GET = async () => {
	const entries = await getCollection('docs');

	const graph: SiteGraph = {};

	// Pass 1: build nodes with outgoing links from body + OSRS frontmatter
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

		// Body links (markdown)
		const bodyLinks = extractLinks(entry.body, slug);

		// OSRS frontmatter links
		const osrs = (entry.data as any).osrs;
		const { links: osrsLinks, edges: osrsEdges } = extractOsrsLinks(
			osrs,
			slug,
		);

		// Merge — deduplicate, OSRS edges override body-derived ones
		const allLinks = [...new Set([...bodyLinks, ...osrsLinks])];

		graph[slug] = {
			title,
			links: allLinks,
			backlinks: [],
			...(Object.keys(osrsEdges).length > 0 ? { osrsEdges } : {}),
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
		headers: {
			'Content-Type': 'application/json',
			'x-kbve-graph-data': 'v2',
		},
	});
};
