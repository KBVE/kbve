import type { Extractor, ExtractorResult } from '../../types';

export interface FrontmatterLinksOptions {
	/** Frontmatter field to read; defaults to `links`. */
	field?: string;
	/**
	 * Optional relationship label assigned to every link from this field
	 * (lands in `node.edges`). Useful when tagging manual references.
	 */
	relationship?: string;
}

/**
 * Reads an array of slugs from `entry.data[field]` and treats each as an
 * outgoing link. Tolerates string entries (`'docs/foo'`) and object entries
 * with a `slug` field (`{ slug: 'docs/foo', relationship?: '...' }`).
 *
 * Lets authors hand-curate connections that link extractors can't infer
 * from body content (cross-section "see also" pointers, etc.).
 */
export function frontmatterLinksExtractor(
	options: FrontmatterLinksOptions = {},
): Extractor {
	const field = options.field ?? 'links';
	const defaultRelationship = options.relationship;

	return (entry, currentSlug): ExtractorResult => {
		const raw = (entry.data as Record<string, unknown>)[field];
		if (!Array.isArray(raw) || raw.length === 0) return { links: [] };

		const links = new Set<string>();
		const edges: Record<string, string> = {};

		for (const item of raw) {
			let slug: string | null = null;
			let relationship: string | undefined = defaultRelationship;

			if (typeof item === 'string') {
				slug = item;
			} else if (item && typeof item === 'object') {
				const obj = item as { slug?: string; relationship?: string };
				if (typeof obj.slug === 'string') slug = obj.slug;
				if (typeof obj.relationship === 'string')
					relationship = obj.relationship;
			}

			if (!slug) continue;
			const normalized = slug
				.replace(/^\/docs\//, '')
				.replace(/^\//, '')
				.replace(/\/$/, '');
			if (!normalized || normalized === currentSlug) continue;

			links.add(normalized);
			if (relationship) edges[normalized] = relationship;
		}

		return Object.keys(edges).length > 0
			? { links: [...links], edges }
			: { links: [...links] };
	};
}
