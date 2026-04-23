/**
 * Core helpers for the icon browse flow. Loaded by the Astro wrapper at build
 * time; the TSX island receives already-shaped summaries so payloads stay small.
 */
import type { CollectionEntry } from 'astro:content';
import type { Icon } from '@/data/schema';

export interface TermSummary {
	ref: string;
	slug: string;
	name: string;
	description?: string;
	primary_category?: string;
	categories: string[];
	tags: string[];
	/** Distinct styles across all variants (for chip filtering). */
	styles: string[];
	/** Distinct themes across all variants. */
	themes: string[];
	/** Distinct variant-tag strings across all variants. */
	variantTags: string[];
	/** Variant count (shown on card). */
	variantCount: number;
	/** Inline SVG body of the first non-drafted variant for thumbnail. */
	previewSvg?: string;
	featured?: boolean;
	order?: number;
}

/**
 * Shape a single docs-collection entry into a `TermSummary` when it is an
 * icon term. Returns `undefined` for non-icon docs (guides, game, auth).
 */
export function toTermSummary(
	entry: CollectionEntry<'docs'>,
): TermSummary | undefined {
	const data = entry.data as CollectionEntry<'docs'>['data'] & {
		ref?: string;
		name?: string;
		primary_category?: string;
		categories?: string[];
		tags?: string[];
		icons?: Icon[];
		featured?: boolean;
		order?: number;
	};

	if (!data.ref || !data.icons || data.icons.length === 0) return undefined;

	const icons = data.icons;
	const styles = unique(
		icons.map((v) => v.style).filter(Boolean) as string[],
	);
	const themes = unique(icons.flatMap((v) => v.themes ?? []));
	const variantTags = unique(icons.flatMap((v) => v.tags ?? []));
	const preview = icons.find((v) => !v.drafted && v.svg_body)?.svg_body;

	return {
		ref: data.ref,
		slug: entry.id.replace(/\.mdx?$/, ''),
		name: data.name ?? data.title,
		description: data.description,
		primary_category: data.primary_category,
		categories: data.categories ?? [],
		tags: data.tags ?? [],
		styles,
		themes,
		variantTags,
		variantCount: icons.length,
		previewSvg: preview,
		featured: data.featured,
		order: data.order,
	};
}

/**
 * Collect every icon-term summary from the docs collection, sorted by
 * (featured desc, order asc, name asc).
 */
export function collectTermSummaries(
	entries: CollectionEntry<'docs'>[],
): TermSummary[] {
	const out: TermSummary[] = [];
	for (const entry of entries) {
		const summary = toTermSummary(entry);
		if (summary) out.push(summary);
	}
	return out.sort(compareTerms);
}

function compareTerms(a: TermSummary, b: TermSummary): number {
	const featuredDiff =
		Number(Boolean(b.featured)) - Number(Boolean(a.featured));
	if (featuredDiff !== 0) return featuredDiff;
	const orderDiff = (a.order ?? 999) - (b.order ?? 999);
	if (orderDiff !== 0) return orderDiff;
	return a.name.localeCompare(b.name);
}

export function collectFacet(
	terms: TermSummary[],
	pick: (t: TermSummary) => string[],
): string[] {
	return unique(terms.flatMap(pick));
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean))).sort();
}
