import type { Extractor, ExtractorResult } from '../../types';

export interface CollectionRefField {
	/** Frontmatter field name (supports dot-paths like `meta.related`). */
	path: string;
	/**
	 * Prefix prepended to the referenced id when forming the target slug.
	 * Use this when refs point at a different collection than the current
	 * entry (e.g. `npc/` for items referencing NPCs).
	 */
	prefix?: string;
	/** Relationship label written to `node.edges`. */
	relationship?: string;
	/**
	 * Custom slug derivation; receives the raw ref value and returns the
	 * canonical slug. Defaults to `String(ref).toLowerCase()`.
	 */
	slugify?: (raw: unknown) => string | null;
}

export interface CollectionRefsOptions {
	fields: CollectionRefField[];
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, key) => {
		if (acc && typeof acc === 'object' && key in (acc as object)) {
			return (acc as Record<string, unknown>)[key];
		}
		return undefined;
	}, obj);
}

function defaultSlugify(raw: unknown): string | null {
	if (typeof raw === 'string' && raw.length > 0) return raw;
	if (raw && typeof raw === 'object') {
		const obj = raw as { id?: string; slug?: string };
		if (typeof obj.id === 'string') return obj.id;
		if (typeof obj.slug === 'string') return obj.slug;
	}
	return null;
}

/**
 * Walks frontmatter for declared collection-reference fields (typically
 * Astro `reference()` schema entries) and emits links to the referenced
 * slugs. Each field can carry its own prefix, relationship label, and
 * slug derivation strategy.
 *
 * Example wiring:
 *   collectionRefsExtractor({
 *     fields: [
 *       { path: 'related_npcs', prefix: 'npc/', relationship: 'npc' },
 *       { path: 'spawns_in', prefix: 'location/', relationship: 'location' },
 *     ],
 *   })
 */
export function collectionRefsExtractor(
	options: CollectionRefsOptions,
): Extractor {
	const fields = options.fields;

	return (entry, currentSlug): ExtractorResult => {
		const links = new Set<string>();
		const edges: Record<string, string> = {};

		for (const field of fields) {
			const value = readPath(
				entry.data as Record<string, unknown>,
				field.path,
			);
			if (value === undefined || value === null) continue;

			const slugify = field.slugify ?? defaultSlugify;
			const refs = Array.isArray(value) ? value : [value];

			for (const ref of refs) {
				const raw = slugify(ref);
				if (!raw) continue;
				const slug = `${field.prefix ?? ''}${raw}`
					.replace(/^\/docs\//, '')
					.replace(/^\//, '')
					.replace(/\/$/, '');
				if (!slug || slug === currentSlug) continue;

				links.add(slug);
				if (field.relationship) {
					edges[slug] = field.relationship;
				}
			}
		}

		return Object.keys(edges).length > 0
			? { links: [...links], edges }
			: { links: [...links] };
	};
}
