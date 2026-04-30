import type { Extractor } from '@kbve/astro';

function nameToSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Extracts cross-references from OSRS frontmatter:
 *   - related_items[] (relationship signal)
 *   - recipes[].product (product link)
 *   - recipes[].materials[] (component link)
 *   - drop_table sources (drop-source link)
 *
 * Edges win in registration order, so this should run after the generic
 * markdown / MDX extractors when an OSRS page also has body links.
 */
export const osrsExtractor: Extractor = (entry, currentSlug) => {
	const osrs = (entry.data as Record<string, any>).osrs;
	if (!osrs) return { links: [] };

	const links = new Set<string>();
	const edges: Record<string, string> = {};

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

	if (Array.isArray(osrs.recipes)) {
		for (const recipe of osrs.recipes) {
			if (recipe.product) {
				const target = `osrs/${nameToSlug(recipe.product)}`;
				if (target !== currentSlug) {
					links.add(target);
					edges[target] = edges[target] || 'product';
				}
			}
			if (Array.isArray(recipe.materials)) {
				for (const mat of recipe.materials) {
					if (mat.item_name) {
						const target = `osrs/${nameToSlug(mat.item_name)}`;
						if (target !== currentSlug) {
							links.add(target);
							edges[target] = edges[target] || 'component';
						}
					}
				}
			}
		}
	}

	if (osrs.drop_table) {
		const sources = Array.isArray(osrs.drop_table)
			? osrs.drop_table
			: osrs.drop_table.sources || [];
		for (const src of sources) {
			if (src.source) {
				const target = `osrs/${nameToSlug(src.source)}`;
				if (target !== currentSlug) {
					links.add(target);
					edges[target] = edges[target] || 'drop-source';
				}
			}
		}
	}

	return { links: [...links], edges };
};

/** OSRS relationship → stroke color, passed to `<SiteGraph edgeColors={...}>`. */
export const osrsEdgeColors: Record<string, string> = {
	upgrade: '#22c55e',
	downgrade: '#ef4444',
	product: '#3b82f6',
	component: '#f97316',
	variant: '#a855f7',
	'set-piece': '#eab308',
	alternative: '#64748b',
	'drop-source': '#ec4899',
};

/**
 * OSRS relationship → stroke-dasharray. Color-blind redundancy on top of
 * `osrsEdgeColors`: relationships that share a hue lane (red/green) get
 * distinct dash patterns so they remain distinguishable.
 */
export const osrsEdgeDashes: Record<string, string> = {
	upgrade: '0',
	downgrade: '4 2',
	product: '0',
	component: '2 2',
	variant: '6 2 2 2',
	'set-piece': '0',
	alternative: '1 2',
	'drop-source': '0',
};

/** Pretty labels used in the cluster legend / tooltips. */
export const osrsEdgeLabels: Record<string, string> = {
	upgrade: 'Upgrade',
	downgrade: 'Downgrade',
	product: 'Crafted from',
	component: 'Component',
	variant: 'Variant',
	'set-piece': 'Set piece',
	alternative: 'Alternative',
	'drop-source': 'Drop source',
};

export const osrsTagLabels: Record<string, string> = {
	osrs: 'OSRS item',
};

/** Tag function: marks any slug under `osrs/` as the `'osrs'` tag. */
export const osrsTagOf = (slug: string): string | null =>
	slug.startsWith('osrs/') ? 'osrs' : null;

/**
 * Style for the `'osrs'` tag. Fill/stroke read from CSS custom properties
 * (`--sg-osrs-fill`, `--sg-osrs-stroke`) so light/dark themes stay in sync
 * with the Starlight color scheme. Token definitions live in
 * `src/styles/global.css`.
 */
export const osrsTagStyles = {
	osrs: {
		fill: 'var(--sg-osrs-fill, #eab308)',
		stroke: 'var(--sg-osrs-stroke, #a16207)',
		radius: 4.5,
	},
};
